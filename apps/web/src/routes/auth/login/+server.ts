import { redirect } from '@sveltejs/kit';
import crypto from 'node:crypto';
import { authorizeUrl } from '$lib/server/discord';
import { cookieSecure } from '$lib/server/session';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies }) => {
    const state = crypto.randomBytes(16).toString('hex');
    cookies.set('oauth_state', state, {
        path:     '/',
        httpOnly: true,
        sameSite: 'lax',
        secure:   cookieSecure(),
        maxAge:   600
    });
    throw redirect(302, authorizeUrl(state));
};
