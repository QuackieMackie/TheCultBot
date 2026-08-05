import { bot } from '$lib/server/bot';
import { configSnapshot, setConfig } from '$lib/server/guild';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const [channels, roles] = await Promise.all([
        bot.channels(params.guildId).catch(() => []),
        bot.roles(params.guildId).catch(() => [])
    ]);
    return { config: configSnapshot(params.guildId), channels, roles };
};

export const actions: Actions = { setConfig };
