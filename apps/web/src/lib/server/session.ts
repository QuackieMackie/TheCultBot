import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';

export interface SessionUser {
    id:       string;
    username: string;
    avatar:   string | null;
}

const COOKIE = 'cult_session';

function secret(): string {
    const s = env.SESSION_SECRET;
    if (!s) throw new Error('SESSION_SECRET is not set.');
    return s;
}

function mac(payload: string): string {
    return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function sign(user: SessionUser): string {
    const payload = Buffer.from(JSON.stringify(user)).toString('base64url');
    return `${payload}.${mac(payload)}`;
}

export function verify(token: string | undefined): SessionUser | null {
    if (!token) return null;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;

    const expected = mac(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch {
        return null;
    }
}

export const SESSION_COOKIE = COOKIE;

export function cookieSecure(): boolean {
    return (env.BASE_URL || '').startsWith('https://');
}
