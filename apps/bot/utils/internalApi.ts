import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import { Client, ChannelType, DiscordAPIError, Guild, GuildMember, HTTPError } from 'discord.js';
import { listGames, getActiveGroups, listAlerts, alertCount, dismissAlert } from '@thecult/shared';
import { hasManagerAccess } from 'utils/permissions';
import { applyConfigChange, readConfigSnapshot } from 'utils/configService';
import { addGame, editGame, editGroup, importGame, removeGame } from 'utils/gameService';
import { actorOf, recordAudit } from 'utils/audit';
import { runWeeklyPoll } from 'utils/pollRunner';
import { logger } from 'utils/logger';

const log = logger('internalApi');

interface Actor {
    id?:   string;
    name?: string;
}

declare module 'fastify' {
    interface FastifyRequest {
        actor:   Actor | null;
        failure: string | null;
    }
}

const CHANNEL_KINDS = new Map<ChannelType, 'text' | 'voice'>([
    [ChannelType.GuildText,         'text'],
    [ChannelType.GuildAnnouncement, 'text'],
    [ChannelType.GuildVoice,        'voice'],
]);

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
async function requireManager(client: Client, req: FastifyRequest): Promise<{ guild: Guild; member: GuildMember }> {
    const { id } = req.params as { id: string };
    const userId = req.actor?.id;

    if (!userId) throw new ApiError(400, 'Missing actingUserId.');
    const guild  = await fetchGuild(client, id);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || !hasManagerAccess(member)) {
        throw new ApiError(403, 'You do not have permission to manage this server.');
    }

    req.actor = { id: userId, name: member.user.username };
    return { guild, member };
}

// discord.js and filesystem errors mean the bot failed, not the caller. Only the service
// layer's own Errors describe something the user can fix, so those stay a 400.
function statusOf(err: unknown): number {
    if (err instanceof ApiError)                                    return err.status;
    if (err instanceof DiscordAPIError || err instanceof HTTPError) return 500;
    if (err instanceof Error && typeof (err as NodeJS.ErrnoException).code === 'string') return 500;
    if (err instanceof Error)                                       return 400;
    return 500;
}

function fail(reply: FastifyReply, err: unknown): FastifyReply {
    const status  = statusOf(err);
    const message = err instanceof Error ? err.message : 'Internal error.';

    // The response line carries this, so a failure never needs a second line to explain it.
    reply.request.failure = message;
    if (status >= 500) log.error('Request failed', { err });

    return reply.code(status).send({ error: message });
}

export async function startInternalApi(client: Client): Promise<void> {
    const secret = process.env.INTERNAL_API_SECRET;
    const port   = parseInt(process.env.INTERNAL_API_PORT || '8081', 10);

    if (!secret) {
        log.warn('INTERNAL_API_SECRET not set, internal API disabled.');
        return;
    }

    const app = Fastify({ logger: false });

    app.decorateRequest('actor',   null);
    app.decorateRequest('failure', null);

    app.addHook('onRequest', async (req, reply) => {
        const header = req.headers['authorization'];
        if (header !== `Bearer ${secret}`) {
            log.warn('Unauthorized request', { method: req.method, url: req.url, ip: req.ip });
            return reply.code(401).send({ error: 'Unauthorized.' });
        }
    });

    // The acting user rides in the body, which is not parsed yet at onRequest. Seeding the id
    // here means a rejected request still names who tried, even when authorization fails.
    app.addHook('preHandler', async (req) => {
        const body = (req.body ?? {}) as { actingUserId?: string; userId?: string };
        req.actor  = { id: body.actingUserId ?? body.userId };
    });

    // Reads are frequent and dull, so a successful one is only debug. Everything else gets one
    // self-contained info line: who, which guild, and why it failed.
    app.addHook('onResponse', async (req, reply) => {
        const { id } = (req.params ?? {}) as { id?: string };
        const fields = {
            method:  req.method,
            url:     req.url,
            status:  reply.statusCode,
            ms:      Math.round(reply.elapsedTime),
            guild:   id,
            actor:   req.actor?.name,
            actorId: req.actor?.id,
            reason:  req.failure ?? undefined,
        };
        if (req.method === 'GET' && reply.statusCode < 400) log.debug('Request', fields);
        else                                                log.info('Request', fields);
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

        const out: { id: string; name: string; icon: string | null; alerts: number }[] = [];
        for (const guild of client.guilds.cache.values()) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member && hasManagerAccess(member)) {
                out.push({ id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }), alerts: alertCount(guild.id) });
            }
        }
        return out;
    });

    // Returns voice channels alongside text ones, tagged with `kind` and their category, so the
    // dashboard can offer both without knowing discord.js channel type numbers.
    app.get('/internal/guilds/:id/channels', async (req, reply) => {
        const { id } = req.params as { id: string };
        try {
            const guild    = await fetchGuild(client, id);
            const channels = await guild.channels.fetch();
            return [...channels.values()]
                .filter((c): c is NonNullable<typeof c> => !!c && CHANNEL_KINDS.has(c.type))
                .map(c => ({
                    id:         c.id,
                    name:       c.name,
                    kind:       CHANNEL_KINDS.get(c.type)!,
                    parentId:   c.parentId,
                    parentName: c.parent?.name ?? null,
                }));
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

    app.get('/internal/guilds/:id/alerts', async (req, reply) => {
        const { id } = req.params as { id: string };
        try {
            await fetchGuild(client, id);
            return listAlerts(id);
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.delete('/internal/guilds/:id/alerts/:alertId', async (req, reply) => {
        const { id, alertId } = req.params as { id: string; alertId: string };
        try {
            await requireManager(client, req);
            return { ok: true, dismissed: dismissAlert(id, alertId) };
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.patch('/internal/guilds/:id/config', async (req, reply) => {
        const { id } = req.params as { id: string };
        const body   = (req.body ?? {}) as { actingUserId?: string; key?: string; value?: unknown };
        try {
            const { member } = await requireManager(client, req);
            if (!body.key) throw new ApiError(400, 'Missing config key.');
            const value   = String(body.value ?? '');
            const message = await applyConfigChange(client, id, body.key, value);
            recordAudit(id, actorOf(member), 'config.set', body.key, value || '(cleared)', 'dashboard');
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
            const { guild, member } = await requireManager(client, req);
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
            recordAudit(id, actorOf(member), 'game.added', result.game.name, `${result.outcome} the ${result.group.name} group`, 'dashboard');
            return { ok: true, ...result };
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.post('/internal/guilds/:id/games/import', async (req, reply) => {
        const { id } = req.params as { id: string };
        const body   = (req.body ?? {}) as {
            actingUserId?: string; name?: string; group?: string; playerCount?: number;
            textChannelId?: string; voiceChannelId?: string; roleId?: string; roleName?: string; roleColour?: string;
        };
        try {
            const { guild, member } = await requireManager(client, req);
            if (!body.name || !body.group) throw new ApiError(400, 'Name and group are required.');
            if (!body.textChannelId || !body.voiceChannelId) throw new ApiError(400, 'A text channel and a voice channel are required.');
            const result = await importGame(guild, {
                name:           body.name,
                group:          body.group,
                playerCount:    Number(body.playerCount) || 1,
                addedBy:        member.user.username,
                textChannelId:  body.textChannelId,
                voiceChannelId: body.voiceChannelId,
                roleId:         body.roleId,
                roleName:       body.roleName,
                roleColour:     body.roleColour,
            });
            recordAudit(id, actorOf(member), 'game.imported', result.game.name, `adopted channels into the ${result.group.name} group`, 'dashboard');
            return { ok: true, ...result };
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.patch('/internal/guilds/:id/games/:name', async (req, reply) => {
        const { id, name } = req.params as { id: string; name: string };
        const body         = (req.body ?? {}) as { actingUserId?: string; name?: string; playerCount?: number; group?: string };
        try {
            const { member } = await requireManager(client, req);
            const original   = decodeURIComponent(name);
            const game       = editGame(id, original, {
                name:        body.name,
                playerCount: body.playerCount !== undefined ? Number(body.playerCount) : undefined,
                group:       body.group,
            }, member.user.username);
            const detail = game.name !== original ? `renamed to ${game.name}` : `${game.playerCount} players, ${game.group}`;
            recordAudit(id, actorOf(member), 'game.edited', original, detail, 'dashboard');
            return { ok: true, game };
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.patch('/internal/guilds/:id/groups/:name', async (req, reply) => {
        const { id, name } = req.params as { id: string; name: string };
        const body         = (req.body ?? {}) as { actingUserId?: string; name?: string; roleName?: string; roleColour?: string };
        try {
            const { guild, member } = await requireManager(client, req);
            const original          = decodeURIComponent(name);
            const result            = await editGroup(guild, original, {
                name:       body.name,
                roleName:   body.roleName,
                roleColour: body.roleColour,
            }, member.user.username);
            recordAudit(id, actorOf(member), 'group.edited', original, result.message, 'dashboard');
            return { ok: true, ...result };
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.delete('/internal/guilds/:id/games/:name', async (req, reply) => {
        const { id, name } = req.params as { id: string; name: string };
        try {
            const { guild, member } = await requireManager(client, req);
            const result            = await removeGame(guild, decodeURIComponent(name), member.user.username);
            const detail            = result.quarantined ? `the ${result.quarantined} group was archived` : `${result.remaining} left in ${result.group}`;
            recordAudit(id, actorOf(member), 'game.removed', result.removed, detail, 'dashboard');
            return { ok: true, ...result };
        } catch (err) {
            return fail(reply, err);
        }
    });

    app.post('/internal/guilds/:id/poll/run', async (req, reply) => {
        const { id } = req.params as { id: string };
        const body   = (req.body ?? {}) as { actingUserId?: string; mode?: string; gameNames?: string[] };
        try {
            const { member } = await requireManager(client, req);

            if (body.mode === 'pick') {
                if (!body.gameNames?.length) throw new ApiError(400, 'Pick a game or more for the poll.');
                await runWeeklyPoll(client, id, { gameNames: body.gameNames });
            } else if (body.mode === 'weighted') {
                await runWeeklyPoll(client, id, { weighted: true });
            } else {
                await runWeeklyPoll(client, id, {});
            }
            recordAudit(id, actorOf(member), 'poll.run', body.mode ?? 'random', body.gameNames?.join(', ') ?? '', 'dashboard');
            return { ok: true, message: 'Poll posted.' };
        } catch (err) {
            return fail(reply, err);
        }
    });

    await app.listen({ port, host: '0.0.0.0' });
    log.info('Internal API listening', { port });
}
