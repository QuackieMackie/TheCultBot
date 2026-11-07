import { bot } from '$lib/server/bot';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals }) => {
    const { games, activeGroups } = await bot.games(params.guildId);
    return {
        guild: locals.guild!,
        counts: {
            alerts: locals.guild!.alerts ?? 0,
            games:  games.length,
            groups: activeGroups.length
        }
    };
};
