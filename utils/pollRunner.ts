import { Client } from 'discord.js';
import { getConfig, getRandomGames, gameCount, MAX_GAME_NAME_LENGTH } from 'utils/storage';

export async function runWeeklyPoll(client: Client, gameNames?: string[]): Promise<void> {
    const channelId = getConfig('poll_channel_id');
    if (!channelId) {
        throw new Error('No poll channel configured. Use `/config poll-channel` to set one.');
    }

    let games: { name: string }[];

    if (gameNames && gameNames.length > 0) {
        const seen = new Set<string>();
        games = [];
        for (const raw of gameNames) {
            const name = raw?.trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            games.push({ name });
        }
        games = games.slice(0, 10);
        if (games.length === 0) {
            throw new Error('No valid games were provided for the poll.');
        }
    } else {
        const total = gameCount();
        if (total === 0) {
            throw new Error('No games in the roster. Add some with `/game add`.');
        }
        const count = Math.min(parseInt(getConfig('poll_size'), 10), total);
        games = getRandomGames(count).filter(g => g.name?.trim());
        if (games.length === 0) {
            throw new Error('No valid games found in the roster.');
        }
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
        throw new Error('Could not find the configured poll channel. Has it been deleted?');
    }

    if (!channel.isTextBased() || channel.isDMBased()) {
        throw new Error('The configured poll channel is not a guild text channel.');
    }

    await channel.send({
        content: 'Weekly Game Vote -- pick what we\'re playing this week!',
        poll: {
            question:         { text: 'Which game should we play this week?' },
            answers:          games.map(g => ({ text: g.name.slice(0, MAX_GAME_NAME_LENGTH) })),
            duration:         parseInt(getConfig('poll_duration_hours'), 10),
            allowMultiselect: true,
        },
    });

    console.log(`Weekly poll posted in channel ${channelId} with ${games.length} game(s).`);
}
