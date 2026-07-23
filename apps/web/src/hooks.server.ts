import type { Handle } from '@sveltejs/kit';
import { verify, SESSION_COOKIE } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
    event.locals.user = verify(event.cookies.get(SESSION_COOKIE));
    return resolve(event);
};
