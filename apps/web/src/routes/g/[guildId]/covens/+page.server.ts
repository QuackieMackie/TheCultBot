import { bot } from '$lib/server/bot';
import { editGroup } from '$lib/server/guild';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const [{ games, activeGroups }, channels] = await Promise.all([
        bot.games(params.guildId),
        bot.channels(params.guildId).catch(() => [])
    ]);
    return { groups: activeGroups, games, channels };
};

export const actions: Actions = { editGroup };
