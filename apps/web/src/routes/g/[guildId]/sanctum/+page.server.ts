import { bot } from '$lib/server/bot';
import { setConfig } from '$lib/server/guild';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const [config, channels, roles] = await Promise.all([
        bot.config(params.guildId),
        bot.channels(params.guildId).catch(() => []),
        bot.roles(params.guildId).catch(() => [])
    ]);
    return { config, channels, roles };
};

export const actions: Actions = { setConfig };
