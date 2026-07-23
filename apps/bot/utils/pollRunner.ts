import { Client, Guild } from 'discord.js';
import {
    getConfig,
    getRandomGames,
    gameCount,
    getActiveGames,
    getGameByName,
    getGroupByName,
    pickWeightedGames,
    updateGame,
    MAX_GAME_NAME_LENGTH,
    type Game,
} from '@thecult/shared';

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

    const size = Math.max(parseInt(getConfig(guildId, 'poll_size'), 10) || 5, 1);

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

    await channel.send({
        content: 'Weekly Game Vote -- pick what we\'re playing this week!',
        poll: {
            question:         { text: 'Which game should we play this week?' },
            answers:          games.map(g => ({ text: answerText(g) })),
            duration:         parseInt(getConfig(guildId, 'poll_duration_hours'), 10),
            allowMultiselect: true,
        },
    });

    if (recording) {
        const now = new Date().toISOString();
        for (const g of games) {
            updateGame(guildId, g.name, { lastPolledAt: now, pollAppearances: g.pollAppearances + 1 });
        }
    }

    console.log(`Weekly poll posted in channel ${channelId} with ${games.length} game(s).`);
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
    return { name, addedBy: '', addedAt: '', group: '', playerCount: 0, pollAppearances: 0 };
}

async function selectWeighted(guildId: string, guild: Guild, size: number): Promise<Game[]> {
    await guild.members.fetch();
    const qualified = getActiveGames(guildId).filter(game => {
        const group = getGroupByName(guildId, game.group);
        if (!group || !group.roleId) return false;
        const role  = guild.roles.cache.get(group.roleId);
        return (role?.members.size ?? 0) >= game.playerCount;
    });
    return pickWeightedGames(qualified, size);
}

function answerText(game: Game): string {
    const suffix = game.playerCount > 0 ? ` (${game.playerCount})` : '';
    return `${game.name.slice(0, MAX_GAME_NAME_LENGTH - suffix.length)}${suffix}`;
}
