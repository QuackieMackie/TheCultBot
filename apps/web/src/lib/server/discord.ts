import { env } from '$env/dynamic/private';

const AUTHORIZE = 'https://discord.com/api/oauth2/authorize';
const TOKEN     = 'https://discord.com/api/oauth2/token';
const API       = 'https://discord.com/api/v10';

function required(name: string): string {
    const value = env[name];
    if (!value) throw new Error(`${name} is not set.`);
    return value;
}

export function redirectUri(): string {
    return `${required('BASE_URL')}/auth/callback`;
}

export function authorizeUrl(state: string): string {
    const params = new URLSearchParams({
        client_id:     required('DISCORD_CLIENT_ID'),
        response_type: 'code',
        scope:         'identify guilds',
        redirect_uri:  redirectUri(),
        state,
        prompt:        'none'
    });
    return `${AUTHORIZE}?${params}`;
}

export async function exchangeCode(code: string): Promise<{ access_token: string }> {
    const body = new URLSearchParams({
        client_id:     required('DISCORD_CLIENT_ID'),
        client_secret: required('DISCORD_CLIENT_SECRET'),
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri()
    });
    const res = await fetch(TOKEN, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    if (!res.ok) throw new Error('Discord token exchange failed.');
    return res.json();
}

interface DiscordUser {
    id:           string;
    username:     string;
    global_name?: string | null;
    avatar:       string | null;
}

export async function fetchUser(accessToken: string): Promise<DiscordUser> {
    const res = await fetch(`${API}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('Failed to fetch Discord user.');
    return res.json();
}
