import { env } from '$env/dynamic/private';

export interface GuildSummary { id: string; name: string; icon: string | null; }
export interface ChannelSummary { id: string; name: string; type: number; }
export interface RoleSummary { id: string; name: string; color: string; }

function base(): string {
    return env.INTERNAL_API_URL || 'http://localhost:8081';
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${base()}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${env.INTERNAL_API_SECRET}`,
            ...(init.headers ?? {})
        }
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(data?.error || `Bot is unreachable (${res.status}).`);
    return data as T;
}

// Thin client over the bot's internal API. All Discord side-effects and every write live
// behind these calls; the bot re-checks the acting user's permission on each one.
export const bot = {
    manageableGuilds: (userId: string) =>
        call<GuildSummary[]>('/internal/manageable-guilds', { method: 'POST', body: JSON.stringify({ userId }) }),

    channels: (guildId: string) =>
        call<ChannelSummary[]>(`/internal/guilds/${guildId}/channels`),

    roles: (guildId: string) =>
        call<RoleSummary[]>(`/internal/guilds/${guildId}/roles`),

    setConfig: (guildId: string, actingUserId: string, key: string, value: string) =>
        call<{ message: string }>(`/internal/guilds/${guildId}/config`, {
            method: 'PATCH',
            body:   JSON.stringify({ actingUserId, key, value })
        }),

    addGame: (
        guildId: string,
        actingUserId: string,
        game: {
            name: string;
            group: string;
            playerCount: number;
            roleName?: string;
            roleColour?: string;
            textChannel?: string;
            voiceChannel?: string;
        }
    ) => call<{ message: string }>(`/internal/guilds/${guildId}/games`, { method: 'POST', body: JSON.stringify({ actingUserId, ...game }) }),

    editGame: (guildId: string, actingUserId: string, name: string, patch: { playerCount?: number; group?: string }) =>
        call(`/internal/guilds/${guildId}/games/${encodeURIComponent(name)}`, {
            method: 'PATCH',
            body:   JSON.stringify({ actingUserId, ...patch })
        }),

    removeGame: (guildId: string, actingUserId: string, name: string) =>
        call<{ removed: string; quarantined: string | null }>(`/internal/guilds/${guildId}/games/${encodeURIComponent(name)}`, {
            method: 'DELETE',
            body:   JSON.stringify({ actingUserId })
        }),

    runPoll: (guildId: string, actingUserId: string, mode: string, gameNames?: string[]) =>
        call<{ message: string }>(`/internal/guilds/${guildId}/poll/run`, {
            method: 'POST',
            body:   JSON.stringify({ actingUserId, mode, gameNames })
        })
};
