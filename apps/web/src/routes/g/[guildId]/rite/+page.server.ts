import { bot } from '$lib/server/bot';
import { runPoll, setConfig } from '$lib/server/guild';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const [config, { games }, channels, roles] = await Promise.all([
        bot.config(params.guildId),
        bot.games(params.guildId),
        bot.channels(params.guildId).catch(() => []),
        bot.roles(params.guildId).catch(() => [])
    ]);
    return { config, games, channels, roles };
};

export const actions: Actions = { setConfig, runPoll };
