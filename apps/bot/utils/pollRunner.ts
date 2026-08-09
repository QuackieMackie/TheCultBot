import { Client, Guild, Message } from 'discord.js';
import {
    getConfig,
    getRandomGames,
    gameCount,
    getActiveGames,
    getGameByName,
    getGroupByName,
    pickWeightedGames,
    savePollRun,
    updateGame,
    MAX_GAME_NAME_LENGTH,
    type Game,
} from '@thecult/shared';
import { describeDiscordError } from 'utils/alerts';
import { logger } from 'utils/logger';

const log = logger('pollRunner');

interface PollOptions {
    gameNames?: string[];
    weighted?:  boolean;
}

export async function runWeeklyPoll(client: Client, guildId: string, opts: PollOptions = {}): Promise<void> {
    const channelId = getConfig(guildId, 'poll_channel_id');
    if (!channelId) {
        throw new Error('No poll channel configured. Use `/config poll-channel` to set one.');
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
        throw new Error('Could not find the configured poll channel. Has it been deleted?');
    }
    if (!channel.isTextBased() || channel.isDMBased()) {
        throw new Error('The configured poll channel is not a guild text channel.');
    }

    const size    = Math.max(parseInt(getConfig(guildId, 'poll_size'), 10) || 5, 1);
    const message = getConfig(guildId, 'poll_message');

    let games:    Game[];
    let recording = false;

    if (opts.gameNames && opts.gameNames.length > 0) {
        games = resolveNames(guildId, opts.gameNames);
        if (games.length === 0) throw new Error('No valid games were provided for the poll.');
    } else if (opts.weighted) {
        games     = await selectWeighted(guildId, channel.guild, size);
        recording = true;
        if (games.length === 0) throw new Error('No games currently qualify for the poll: not enough interested members.');
    } else {
        const total = gameCount(guildId);
        if (total === 0) throw new Error('No games in the roster. Add some with `/game add`.');
        games = getRandomGames(guildId, Math.min(size, total)).filter(g => g.name?.trim());
        if (games.length === 0) throw new Error('No valid games found in the roster.');
    }

    let sent: Message;
    try {
        sent = await channel.send({
            // Cleared message means the poll posts on its own, and Discord rejects empty content.
            ...(message ? { content: message } : {}),
            poll: {
                question:         { text: 'Which game should we play this week?' },
                answers:          games.map(g => ({ text: answerText(g) })),
                duration:         parseInt(getConfig(guildId, 'poll_duration_hours'), 10),
                allowMultiselect: true,
            },
            // The message is manager-authored free text: roles and @everyone are the point, but
            // a stray @user must never notify an individual.
            allowedMentions: { parse: ['everyone', 'roles'] },
        });
    } catch (err) {
        log.error('Poll post failed', { guild: guildId, channel: channelId, err });
        throw new Error(describeDiscordError(err, channel.name, 'The poll could not be posted to the poll channel.'));
    }

    if (recording) {
        const now = new Date().toISOString();
        for (const g of games) {
            updateGame(guildId, g.name, { lastPolledAt: now, pollAppearances: g.pollAppearances + 1 });
        }
        trackPollRun(guildId, sent, games, now);
    }

    log.info('Weekly poll posted', { guild: guildId, channel: channelId, games: games.length, recording });
}

// Records the posted poll so the sweep can read its results back once it closes. The poll is
// already live by this point, so a failure here is logged and swallowed rather than reported
// to the caller as a failed poll.
function trackPollRun(guildId: string, sent: Message, games: Game[], postedAt: string): void {
    try {
        const poll = sent.poll;
        if (!poll) {
            log.warn('Poll posted without a poll object, results will not be tracked', { guild: guildId, message: sent.id });
            return;
        }

        // Discord assigns answer ids in the order the answers were sent, so position maps a
        // game to its id.
        const answerIds = [...poll.answers.keys()];

        savePollRun(guildId, {
            messageId: sent.id,
            channelId: sent.channelId,
            postedAt,
            closesAt:  (poll.expiresAt ?? new Date()).toISOString(),
            answers:   games.map((g, i) => ({ game: g.name, answerId: answerIds[i], votes: 0, voters: [] })),
            winners:   [],
        });
    } catch (err) {
        log.error('Could not record the poll for result tracking', { guild: guildId, message: sent.id, err });
    }
}

function resolveNames(guildId: string, names: string[]): Game[] {
    const seen = new Set<string>();
    const out:  Game[] = [];
    for (const raw of names) {
        const name = raw?.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(getGameByName(guildId, name) ?? shimGame(name));
    }
    return out.slice(0, 10);
}

function shimGame(name: string): Game {
    return { name, addedBy: '', addedAt: '', group: '', playerCount: 0, pollAppearances: 0, pollWins: 0 };
}

async function selectWeighted(guildId: string, guild: Guild, size: number): Promise<Game[]> {
    await guild.members.fetch();
    const active    = getActiveGames(guildId);
    const qualified = active.filter(game => {
        const group = getGroupByName(guildId, game.group);
        if (!group || !group.roleId) {
            log.debug('Game skipped, group has no role', { guild: guildId, game: game.name, group: game.group });
            return false;
        }
        const role    = guild.roles.cache.get(group.roleId);
        const members = role?.members.size ?? 0;
        log.debug('Game weighed', { guild: guildId, game: game.name, members, needed: game.playerCount });
        return members >= game.playerCount;
    });

    log.info('Weighted selection', { guild: guildId, active: active.length, qualified: qualified.length, picking: size });
    return pickWeightedGames(qualified, size);
}

function answerText(game: Game): string {
    const suffix = game.playerCount > 0 ? ` (${game.playerCount})` : '';
    return `${game.name.slice(0, MAX_GAME_NAME_LENGTH - suffix.length)}${suffix}`;
}
