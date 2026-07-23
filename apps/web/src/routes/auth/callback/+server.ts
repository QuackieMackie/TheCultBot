import { redirect } from '@sveltejs/kit';
import { exchangeCode, fetchUser } from '$lib/server/discord';
import { sign, cookieSecure, SESSION_COOKIE } from '$lib/server/session';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
    const code  = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const saved = cookies.get('oauth_state');

    if (!code || !state || state !== saved) {
        throw redirect(302, '/?error=auth');
    }
    cookies.delete('oauth_state', { path: '/' });

    const token = await exchangeCode(code);
    const u     = await fetchUser(token.access_token);

    cookies.set(
        SESSION_COOKIE,
        sign({ id: u.id, username: u.global_name || u.username, avatar: u.avatar }),
        {
            path:     '/',
            httpOnly: true,
            sameSite: 'lax',
            secure:   cookieSecure(),
            maxAge:   60 * 60 * 24 * 7
        }
    );

    throw redirect(302, '/');
};
