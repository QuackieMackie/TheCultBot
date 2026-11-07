/**
 * Reads the results of weekly polls back off Discord once they close.
 *
 * The bot posts a native Discord poll and cannot be told when it ends, so every open run is
 * re-checked on a timer until its vote counts are readable.
 */

import { Client, DiscordAPIError, Message, type PollAnswer, type PartialPollAnswer } from 'discord.js';
import { abandonPollRun, listOpenPollRuns, recordPollOutcome, type PollRun } from '@thecult/shared';
import { ALERT_POLL_RESULTS, raiseAlert, resolveAlert } from 'utils/alerts';
import { logger } from 'utils/logger';

const log = logger('pollResults');

// Discord finalises vote counts shortly after a poll expires rather than at the instant it
// does, so an unfinalised poll is left open and retried until this much time has passed.
const FINALISE_GRACE_MS = 60 * 60 * 1000;

// A run still unreadable this long after closing is given up on rather than retried forever.
const GIVE_UP_MS = 7 * 24 * 60 * 60 * 1000;

// Discord's per-request maximum for a poll answer's voters.
const VOTERS_PAGE = 100;

// Far above any realistic turnout, so in practice every voter is kept.
const MAX_VOTERS_PER_ANSWER = 1000;

// Settles every poll that has closed since the last sweep, across all guilds. Safe to re-run:
// a run that is already settled is skipped, so a win is never counted twice.
export async function sweepClosedPolls(client: Client): Promise<void> {
    for (const guildId of client.guilds.cache.keys()) {
        await sweepGuild(client, guildId).catch(err => log.error('Poll sweep failed', { guild: guildId, err }));
    }
}

async function sweepGuild(client: Client, guildId: string): Promise<void> {
    const now = Date.now();
    const due = listOpenPollRuns(guildId).filter(run => new Date(run.closesAt).getTime() <= now);
    if (due.length === 0) return;

    log.debug('Polls due settling', { guild: guildId, due: due.length });

    for (const run of due) {
        const overdue = now - new Date(run.closesAt).getTime();
        try {
            const settled = await settleRun(client, guildId, run, overdue);
            if (settled) resolveAlert(guildId, ALERT_POLL_RESULTS);
        } catch (err) {
            log.error('Could not settle poll', { guild: guildId, run: run.id, err });
            if (overdue > GIVE_UP_MS) {
                abandonPollRun(guildId, run.id);
                raiseAlert(
                    guildId,
                    ALERT_POLL_RESULTS,
                    'poll',
                    'I could not read the results of a weekly poll, so its votes were not recorded. Check I can still see the poll channel.',
                    err,
                );
            }
        }
    }
}

/**
 * Settles one run against its poll message.
 *
 * @param overdue Milliseconds since the poll closed, used to decide whether to keep waiting.
 * @returns True once the run leaves the open set, false while it is still worth retrying.
 * @throws On any Discord failure other than the poll having been deleted, so the caller can
 *         retry on the next sweep.
 */
async function settleRun(client: Client, guildId: string, run: PollRun, overdue: number): Promise<boolean> {
    const message = await fetchPollMessage(client, run);
    if (!message?.poll) {
        log.info('Poll message is gone, abandoning run', { guild: guildId, run: run.id });
        abandonPollRun(guildId, run.id);
        return true;
    }

    const poll = message.poll;
    if (!poll.resultsFinalized && overdue < FINALISE_GRACE_MS) {
        log.debug('Poll results not final yet, will retry', { guild: guildId, run: run.id });
        return false;
    }

    const answers = [];
    for (const stored of run.answers) {
        const answer = poll.answers.get(stored.answerId);
        answers.push({
            ...stored,
            votes:  answer?.voteCount ?? 0,
            voters: answer ? await fetchVoters(guildId, run, answer) : [],
        });
    }

    const top     = Math.max(0, ...answers.map(a => a.votes));
    const winners = top > 0 ? answers.filter(a => a.votes === top).map(a => a.game) : [];

    recordPollOutcome(guildId, run.id, answers, winners);
    log.info('Poll settled', { guild: guildId, run: run.id, winners, top, finalised: poll.resultsFinalized });
    return true;
}

/**
 * Reads the ids of everyone who picked one answer, following Discord's pagination.
 *
 * @returns An empty list if the voters could not be read. The vote count is already known from
 *          the poll itself, so losing the names must not cost us the result.
 */
async function fetchVoters(guildId: string, run: PollRun, answer: PollAnswer | PartialPollAnswer): Promise<string[]> {
    const voters: string[] = [];
    try {
        let after: string | undefined;
        while (voters.length < MAX_VOTERS_PER_ANSWER) {
            const page = await answer.voters.fetch({ limit: VOTERS_PAGE, after });
            if (page.size === 0) break;
            voters.push(...page.keys());
            if (page.size < VOTERS_PAGE) break;
            after = page.lastKey();
        }
    } catch (err) {
        log.warn('Could not read voters for an answer', { guild: guildId, run: run.id, answer: answer.id, err });
        return [];
    }
    return voters.slice(0, MAX_VOTERS_PER_ANSWER);
}

// Null means the channel or message no longer exists. Every other failure is rethrown, so a
// transient outage leaves the run open for the next sweep instead of discarding its votes.
async function fetchPollMessage(client: Client, run: PollRun): Promise<Message | null> {
    const channel = await client.channels.fetch(run.channelId).catch(swallowMissing);
    if (!channel || channel.isDMBased() || !channel.isTextBased()) return null;
    // Forced because the cached copy never updates without the GuildMessages intent.
    return channel.messages.fetch({ message: run.messageId, force: true }).catch(swallowMissing);
}

// Missing Access (50001) is left out because lost permissions can be restored.
function swallowMissing(err: unknown): null {
    if (err instanceof DiscordAPIError && (err.code === 10003 || err.code === 10008)) {
        return null;
    }
    throw err;
}
