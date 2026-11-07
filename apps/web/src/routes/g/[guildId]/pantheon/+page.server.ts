import { bot } from '$lib/server/bot';
import { addGame, editGame, importGame, removeGame } from '$lib/server/guild';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const [{ games, activeGroups }, allGroups, channels, roles] = await Promise.all([
        bot.games(params.guildId),
        bot.groups(params.guildId),
        bot.channels(params.guildId).catch(() => []),
        bot.roles(params.guildId).catch(() => [])
    ]);

    // Quarantined groups still hold their channels, so import has to see them too.
    const claimed: Record<string, string> = {};
    for (const g of allGroups) {
        claimed[g.textChannelId]  = g.name;
        claimed[g.voiceChannelId] = g.name;
    }

    return { games, groups: activeGroups, channels, roles, claimed };
};

export const actions: Actions = { addGame, importGame, editGame, removeGame };
