/**
 * Reads the results of weekly polls back off Discord once they close.
 *
 * The bot posts a native Discord poll and cannot be told when it ends, so every open run is
 * re-checked on a timer until its vote counts are readable.
 */

import {
    Client,
    DiscordAPIError,
    Message,
    escapeMarkdown,
    type Poll,
    type PollAnswer,
    type PartialPollAnswer,
} from 'discord.js';
import {
    abandonPollRun,
    correctPollOutcome,
    getConfig,
    getMeta,
    listOpenPollRuns,
    listPollMessageIds,
    listSettledPollRuns,
    recordPollOutcome,
    savePollRun,
    setMeta,
    type PollRun,
    type PollRunAnswer,
} from '@thecult/shared';
import { ALERT_POLL_ANNOUNCE, ALERT_POLL_RESULTS, raiseAlert, resolveAlert } from 'utils/alerts';
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

const RESYNC_KEY = 'poll_history_resynced';

const HISTORY_PAGE = 100;

// Bounds the scan in case the poll channel is also a busy chat channel.
const MAX_HISTORY_PAGES = 50;

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

    const answers = await readAnswers(guildId, run.id, run.answers, poll);
    const winners = winnersOf(answers);
    const settled = recordPollOutcome(guildId, run.id, answers, winners);
    log.info('Poll settled', { guild: guildId, run: run.id, kind: run.kind, winners, top: topVotes(answers), finalised: poll.resultsFinalized });

    if (settled) await announceResult(guildId, message, answers, winners);
    return true;
}

async function readAnswers(guildId: string, runId: string, stored: PollRunAnswer[], poll: Poll): Promise<PollRunAnswer[]> {
    const answers: PollRunAnswer[] = [];
    for (const answer of stored) {
        const live = poll.answers.get(answer.answerId);
        answers.push({
            ...answer,
            votes:  live?.voteCount ?? 0,
            voters: live ? await fetchVoters(guildId, runId, live) : [],
        });
    }
    return answers;
}

function topVotes(answers: PollRunAnswer[]): number {
    return Math.max(0, ...answers.map(a => a.votes));
}

function winnersOf(answers: PollRunAnswer[]): string[] {
    const top = topVotes(answers);
    return top > 0 ? answers.filter(a => a.votes === top).map(a => a.game) : [];
}

function resultText(answers: PollRunAnswer[], winners: string[]): string {
    if (winners.length === 0) return 'The poll has closed with no votes.';

    const top   = topVotes(answers);
    const votes = `${top} ${top === 1 ? 'vote' : 'votes'}`;
    const names = winners.map(name => `**${escapeMarkdown(name)}**`).join(', ');
    return winners.length === 1
        ? `The poll has closed. ${names} won with ${votes}.`
        : `The poll has closed in a tie at ${votes} each: ${names}.`;
}

// The result is already saved, so a failed post must not throw.
async function announceResult(guildId: string, message: Message, answers: PollRunAnswer[], winners: string[]): Promise<void> {
    try {
        await message.reply({
            content:         resultText(answers, winners),
            allowedMentions: { parse: [], repliedUser: false },
        });
        resolveAlert(guildId, ALERT_POLL_ANNOUNCE);
        log.info('Poll result posted', { guild: guildId, message: message.id, winners });
    } catch (err) {
        raiseAlert(
            guildId,
            ALERT_POLL_ANNOUNCE,
            'poll',
            'A poll closed and its result was saved, but I could not post the winner. Check I can send messages and read history in the poll channel.',
            err,
        );
    }
}

export async function resyncPollHistory(client: Client): Promise<void> {
    for (const guildId of client.guilds.cache.keys()) {
        if (getMeta(guildId, RESYNC_KEY)) continue;
        await resyncGuild(client, guildId).catch(err => log.error('Poll history resync failed', { guild: guildId, err }));
    }
}

async function resyncGuild(client: Client, guildId: string): Promise<void> {
    const summary = { confirmed: 0, changed: 0, kept: 0, failed: 0, recovered: 0 };

    for (const run of listSettledPollRuns(guildId)) {
        try {
            const outcome = await resyncRun(client, guildId, run);
            summary[outcome] += 1;
        } catch (err) {
            log.warn('Could not re-read an old poll, keeping its stored result', { guild: guildId, run: run.id, err });
            summary.failed += 1;
        }
    }

    try {
        summary.recovered = await recoverUntrackedPolls(client, guildId);
    } catch (err) {
        log.warn('Could not scan the poll channel for untracked polls', { guild: guildId, err });
        summary.failed += 1;
    }

    if (summary.failed === 0) setMeta(guildId, RESYNC_KEY, new Date().toISOString());
    log.info('Poll history resynced', { guild: guildId, ...summary });
}

async function resyncRun(client: Client, guildId: string, run: PollRun): Promise<'confirmed' | 'changed' | 'kept'> {
    const message = await fetchPollMessage(client, run);
    if (!message?.poll) {
        log.info('Old poll message is gone, keeping its stored result', { guild: guildId, run: run.id });
        return 'kept';
    }
    if (!message.poll.resultsFinalized) {
        log.info('Old poll is not finalised, keeping its stored result', { guild: guildId, run: run.id });
        return 'kept';
    }

    const fresh = await readAnswers(guildId, run.id, run.answers, message.poll);

    // A closed poll with stored voters cannot have zero votes.
    if (topVotes(fresh) === 0 && run.answers.some(a => a.voters.length > 0)) {
        log.warn('Old poll read back with no votes but has stored voters, keeping its stored result', { guild: guildId, run: run.id });
        return 'kept';
    }

    // An empty list means the voters could not be read.
    const answers = fresh.map((a, i) => (a.voters.length > 0 ? a : { ...a, voters: run.answers[i].voters }));
    return correctPollOutcome(guildId, run.id, answers, winnersOf(answers)) ? 'changed' : 'confirmed';
}

async function recoverUntrackedPolls(client: Client, guildId: string): Promise<number> {
    const channelId = getConfig(guildId, 'poll_channel_id');
    if (!channelId) return 0;

    const channel = await client.channels.fetch(channelId).catch(swallowMissing);
    if (!channel || channel.isDMBased() || !channel.isTextBased()) return 0;

    const known = listPollMessageIds(guildId);
    let recovered = 0;
    let before: string | undefined;

    for (let pageNo = 0; pageNo < MAX_HISTORY_PAGES; pageNo++) {
        const page = await channel.messages.fetch({ limit: HISTORY_PAGE, before, cache: false });
        for (const message of page.values()) {
            if (message.author.id !== client.user?.id || known.has(message.id)) continue;
            if (await recoverPoll(guildId, message)) recovered += 1;
        }
        if (page.size < HISTORY_PAGE) break;
        before = [...page.keys()].at(-1);
    }

    return recovered;
}

async function recoverPoll(guildId: string, message: Message): Promise<boolean> {
    const poll = message.poll;
    if (!poll?.resultsFinalized || !poll.expiresAt || poll.expiresAt.getTime() > Date.now()) return false;

    const runId   = message.id;
    const answers = await Promise.all([...poll.answers.values()].map(async answer => ({
        // Answers are posted as "Name (players needed)".
        game:     (answer.text ?? '').replace(/ \(\d+\)$/, ''),
        answerId: answer.id,
        votes:    answer.voteCount,
        voters:   await fetchVoters(guildId, runId, answer),
    })));

    const id = savePollRun(guildId, {
        messageId: message.id,
        channelId: message.channelId,
        kind:      'recovered',
        postedAt:  message.createdAt.toISOString(),
        closesAt:  poll.expiresAt.toISOString(),
        answers:   answers.map(a => ({ ...a, votes: 0, voters: [] })),
        winners:   [],
    });
    recordPollOutcome(guildId, id, answers, winnersOf(answers));
    log.info('Recovered an untracked poll', { guild: guildId, run: id, message: message.id, winners: winnersOf(answers) });
    return true;
}

/**
 * Reads the ids of everyone who picked one answer, following Discord's pagination.
 *
 * @returns An empty list if the voters could not be read. The vote count is already known from
 *          the poll itself, so losing the names must not cost us the result.
 */
async function fetchVoters(guildId: string, runId: string, answer: PollAnswer | PartialPollAnswer): Promise<string[]> {
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
        log.warn('Could not read voters for an answer', { guild: guildId, run: runId, answer: answer.id, err });
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
