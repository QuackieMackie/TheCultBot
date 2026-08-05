import { error, redirect } from '@sveltejs/kit';
import { listGames, getActiveGroups, listAlerts } from '@thecult/shared';
import { bot } from '$lib/server/bot';
import type { LayoutServerLoad } from './$types';

/**
 * Resolves the guild once for every route beneath it, and counts the sidebar badges.
 *
 * @throws 302 to the login route when nobody is signed in, or 403 when the user does not
 * manage this guild.
 */
export const load: LayoutServerLoad = async ({ params, locals }) => {
    if (!locals.user) throw redirect(302, '/auth/login');

    const manageable = await bot.manageableGuilds(locals.user.id).catch(() => []);
    const guild      = manageable.find((g) => g.id === params.guildId);
    if (!guild) throw error(403, 'You do not manage this server.');

    return {
        guild,
        counts: {
            alerts: listAlerts(params.guildId).length,
            games:  listGames(params.guildId).length,
            groups: getActiveGroups(params.guildId).length
        }
    };
};
