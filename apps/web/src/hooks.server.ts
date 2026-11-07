import { error, redirect, type Handle, type RequestEvent } from '@sveltejs/kit';
import { bot } from '$lib/server/bot';
import { verify, SESSION_COOKIE } from '$lib/server/session';
import type { GuildSummary } from '$lib/types';

const GUILD_ROUTE = '/g/[guildId]';

async function requireManagedGuild(event: RequestEvent): Promise<GuildSummary> {
    if (!event.locals.user) throw redirect(302, '/auth/login');

    const manageable = await bot.manageableGuilds(event.locals.user.id).catch(() => []);
    const guild      = manageable.find((g) => g.id === event.params.guildId);
    if (!guild) throw error(403, 'You do not manage this server.');
    return guild;
}

export const handle: Handle = async ({ event, resolve }) => {
    event.locals.user  = verify(event.cookies.get(SESSION_COOKIE));
    event.locals.guild = null;

    // Not in the layout load: a data request can skip layouts.
    if (event.route.id?.startsWith(GUILD_ROUTE)) {
        event.locals.guild = await requireManagedGuild(event);
    }

    return resolve(event);
};
