import { Client } from 'discord.js';
import { getConfig, getRandomGames, gameCount } from 'utils/storage';

export async function runWeeklyPoll(client: Client): Promise<void> {
    const channelId = getConfig('poll_channel_id');
    if (!channelId) {
        throw new Error('No poll channel configured. Use `/config poll-channel` to set one.');
    }

    const total = gameCount();
    if (total === 0) {
        throw new Error('No games in the roster. Add some with `/game add`.');
    }

    const count = Math.min(parseInt(getConfig('poll_size'), 10), total);
    const games = getRandomGames(count).filter(g => g.name?.trim());

    if (games.length === 0) {
        throw new Error('No valid games found in the roster.');
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
            answers:          games.map(g => ({ text: g.name })),
            duration:         parseInt(getConfig('poll_duration_hours'), 10),
            allowMultiselect: true,
        },
    });

    console.log(`Weekly poll posted in channel ${channelId} with ${games.length} game(s).`);
}
