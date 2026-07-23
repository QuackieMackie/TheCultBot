import Fastify, { FastifyReply } from 'fastify';
import { Client, ChannelType, Guild, GuildMember } from 'discord.js';
import { listGames, getActiveGroups } from '@thecult/shared';
import { hasManagerAccess } from 'utils/permissions';
import { applyConfigChange, readConfigSnapshot } from 'utils/configService';
import { addGame, editGame, removeGame } from 'utils/gameService';
import { runWeeklyPoll } from 'utils/pollRunner';

class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

async function fetchGuild(client: Client, guildId: string): Promise<Guild> {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) throw new ApiError(404, 'The bot is not in that server.');
    return guild;
}

// Re-derives authorization for every mutation: the web proves who the user is, the bot
// decides what they may do. Never trust a permission claim coming from the browser.
async function requireManager(client: Client, guildId: string, userId: string | undefined): Promise<{ guild: Guild; member: GuildMember }> {
    if (!userId) throw new ApiError(400, 'Missing actingUserId.');
    const guild  = await fetchGuild(client, guildId);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || !hasManagerAccess(member)) {
        throw new ApiError(403, 'You do not have permission to manage this server.');
    }
    return { guild, member };
}

function fail(reply: FastifyReply, err: unknown): FastifyReply {
    if (err instanceof ApiError) {
        return reply.code(err.status).send({ error: err.message });
    }
    console.error('Internal API error:', err);
    const message = err instanceof Error ? err.message : 'Internal error.';
    return reply.code(400).send({ error: message });
}

export async function startInternalApi(client: Client): Promise<void> {
    const secret = process.env.INTERNAL_API_SECRET;
    const port   = parseInt(process.env.INTERNAL_API_PORT || '8081', 10);

    if (!secret) {
        console.warn('INTERNAL_API_SECRET not set -- internal API disabled.');
        return;
    }

    const app = Fastify({ logger: false });

    app.addHook('onRequest', async (req, reply) => {
        const header = req.headers['authorization'];
        if (header !== `Bearer ${secret}`) {
            return reply.code(401).send({ error: 'Unauthorized.' });
        }
    });

    app.get('/internal/health', async () => ({ ok: true }));

    app.get('/internal/guilds', async () =>
        [...client.guilds.cache.values()].map(g => ({
            id:   g.id,
            name: g.name,
            icon: g.iconURL({ size: 128 }),
        })));

    app.post('/internal/manageable-guilds', async (req, reply) => {
        const { userId } = (req.body ?? {}) as { userId?: string };
        if (!userId) return fail(reply, new ApiError(400, 'Missing userId.'));

        const out: { id: string; name: string; icon: string | null }[] = [];
        for (const guild of client.guilds.cache.values()) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member && hasManagerAccess(member)) {
                out.push({ id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }) });
            }
        }
        return out;
    });

    app.get('/internal/guilds/:id/channels', async (req, reply) => {
        const { id } = req.params as { id: string };
        try {
            const guild    = await fetchGuild(client, id);
            const channels = await guild.channels.fetch();
            return [...channels.values()]
                .filter((c): c is NonNullable<typeof c> => !!c && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement))
                .map(c => ({ id: c.id, name: c.name, type: c.type }));
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.get('/internal/guilds/:id/roles', async (req, reply) => {
        const { id } = req.params as { id: string };
        try {
            const guild = await fetchGuild(client, id);
            const roles = await guild.roles.fetch();
            return [...roles.values()]
                .filter(r => r.id !== guild.id) // drop @everyone
                .map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.get('/internal/guilds/:id/config', async (req, reply) => {
        const { id } = req.params as { id: string };
        try {
            await fetchGuild(client, id);
            return readConfigSnapshot(id);
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.get('/internal/guilds/:id/games', async (req, reply) => {
        const { id } = req.params as { id: string };
        try {
            await fetchGuild(client, id);
            return { games: listGames(id), activeGroups: getActiveGroups(id) };
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.patch('/internal/guilds/:id/config', async (req, reply) => {
        const { id } = req.params as { id: string };
        const body   = (req.body ?? {}) as { actingUserId?: string; key?: string; value?: unknown };
        try {
            await requireManager(client, id, body.actingUserId);
            if (!body.key) throw new ApiError(400, 'Missing config key.');
            const message = await applyConfigChange(client, id, body.key, String(body.value ?? ''));
            return { ok: true, message };
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.post('/internal/guilds/:id/games', async (req, reply) => {
        const { id } = req.params as { id: string };
        const body   = (req.body ?? {}) as {
            actingUserId?: string; name?: string; group?: string; playerCount?: number;
            roleName?: string; roleColour?: string; textChannel?: string; voiceChannel?: string;
        };
        try {
            const { guild, member } = await requireManager(client, id, body.actingUserId);
            if (!body.name || !body.group) throw new ApiError(400, 'Name and group are required.');
            const result = await addGame(guild, {
                name:         body.name,
                group:        body.group,
                playerCount:  Number(body.playerCount) || 1,
                addedBy:      member.user.username,
                roleName:     body.roleName,
                roleColour:   body.roleColour,
                textChannel:  body.textChannel,
                voiceChannel: body.voiceChannel,
            });
            return { ok: true, ...result };
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.patch('/internal/guilds/:id/games/:name', async (req, reply) => {
        const { id, name } = req.params as { id: string; name: string };
        const body         = (req.body ?? {}) as { actingUserId?: string; playerCount?: number; group?: string };
        try {
            await requireManager(client, id, body.actingUserId);
            const game = editGame(id, decodeURIComponent(name), {
                playerCount: body.playerCount !== undefined ? Number(body.playerCount) : undefined,
                group:       body.group,
            });
            return { ok: true, game };
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.delete('/internal/guilds/:id/games/:name', async (req, reply) => {
        const { id, name } = req.params as { id: string; name: string };
        const body         = (req.body ?? {}) as { actingUserId?: string };
        try {
            const { guild } = await requireManager(client, id, body.actingUserId);
            const result    = await removeGame(guild, decodeURIComponent(name));
            return { ok: true, ...result };
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.post('/internal/guilds/:id/poll/run', async (req, reply) => {
        const { id } = req.params as { id: string };
        const body   = (req.body ?? {}) as { actingUserId?: string; mode?: string; gameNames?: string[] };
        try {
            await requireManager(client, id, body.actingUserId);

            if (body.mode === 'pick') {
                if (!body.gameNames?.length) throw new ApiError(400, 'Pick a game or more for the poll.');
                await runWeeklyPoll(client, id, { gameNames: body.gameNames });
            } else if (body.mode === 'weighted') {
                await runWeeklyPoll(client, id, { weighted: true });
            } else {
                await runWeeklyPoll(client, id, {});
            }
            return { ok: true, message: 'Poll posted.' };
        } catch (err) {
            return fail(reply, err);
        }
    });

    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Internal API listening on :${port}.`);
}
