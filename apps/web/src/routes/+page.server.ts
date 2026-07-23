import { bot, type GuildSummary } from '$lib/server/bot';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) return { guilds: null as GuildSummary[] | null, botDown: false };

    try {
        const guilds = await bot.manageableGuilds(locals.user.id);
        return { guilds, botDown: false };
    } catch {
        return { guilds: [] as GuildSummary[], botDown: true };
    }
};
