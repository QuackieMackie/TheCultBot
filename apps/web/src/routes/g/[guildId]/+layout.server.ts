import { listGames, getActiveGroups, listAlerts } from '@thecult/shared';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals }) => ({
    guild: locals.guild!,
    counts: {
        alerts: listAlerts(params.guildId).length,
        games:  listGames(params.guildId).length,
        groups: getActiveGroups(params.guildId).length
    }
});
