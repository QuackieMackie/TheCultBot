import { error, fail, redirect } from '@sveltejs/kit';
import { getConfig, listGames, getActiveGroups, listGroups, listAlerts, listAudit } from '@thecult/shared';
import { bot } from '$lib/server/bot';
import type { Actions, PageServerLoad } from './$types';

const CONFIG_KEYS = [
    'poll_size',
    'poll_channel_id',
    'manager_role_id',
    'poll_hour_utc',
    'poll_duration_hours',
    'poll_auto_enabled',
    'role_board_channel_id',
    'role_board_message_id'
] as const;

function configSnapshot(guildId: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of CONFIG_KEYS) out[k] = getConfig(guildId, k);
    return out;
}

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.user) throw redirect(302, '/auth/login');

    const guildId    = params.guildId;
    const manageable = await bot.manageableGuilds(locals.user.id).catch(() => []);
    const guild      = manageable.find((g) => g.id === guildId);
    if (!guild) throw error(403, 'You do not manage this server.');

    const [channels, roles] = await Promise.all([
        bot.channels(guildId).catch(() => []),
        bot.roles(guildId).catch(() => [])
    ]);

    // Quarantined groups still hold their channels, so import has to see them too.
    const claimed: Record<string, string> = {};
    for (const g of listGroups(guildId)) {
        claimed[g.textChannelId]  = g.name;
        claimed[g.voiceChannelId] = g.name;
    }

    return {
        guild,
        config:   configSnapshot(guildId),
        games:    listGames(guildId),
        groups:   getActiveGroups(guildId),
        alerts:   listAlerts(guildId),
        audit:    listAudit(guildId, 25),
        channels,
        roles,
        claimed
    };
};

function actingUser(locals: App.Locals): string {
    if (!locals.user) throw error(401, 'Not signed in.');
    return locals.user.id;
}

export const actions: Actions = {
    setConfig: async ({ request, params, locals }) => {
        const uid  = actingUser(locals);
        const data = await request.formData();
        const key  = String(data.get('key') ?? '');
        const value = String(data.get('value') ?? '');
        try {
            const res = await bot.setConfig(params.guildId, uid, key, value);
            return { ok: true, message: res.message };
        } catch (err) {
            return fail(400, { message: err instanceof Error ? err.message : 'Update failed.' });
        }
    },

    dismissAlert: async ({ request, params, locals }) => {
        const uid  = actingUser(locals);
        const data = await request.formData();
        const id   = String(data.get('id') ?? '');
        try {
            await bot.dismissAlert(params.guildId, uid, id);
            return { ok: true, message: 'Notice dismissed.' };
        } catch (err) {
            return fail(400, { message: err instanceof Error ? err.message : 'Could not dismiss the notice.' });
        }
    },

    addGame: async ({ request, params, locals }) => {
        const uid  = actingUser(locals);
        const data = await request.formData();

        // The dropdown carries either an existing group name or the __new__ sentinel, in which
        // case the group is the one typed into "newGroup".
        const choice = String(data.get('groupChoice') ?? '');
        const useNew = choice === '__new__';
        const group  = useNew ? String(data.get('newGroup') ?? '').trim() : choice.trim();

        const payload = {
            name:         String(data.get('name') ?? '').trim(),
            group,
            playerCount:  Number(data.get('playerCount') ?? 1),
            roleName:     useNew ? String(data.get('roleName') ?? '').trim() : undefined,
            roleColour:   useNew ? String(data.get('roleColour') ?? '').trim() : undefined,
            textChannel:  useNew ? String(data.get('textChannel') ?? '').trim() : undefined,
            voiceChannel: useNew ? String(data.get('voiceChannel') ?? '').trim() : undefined
        };

        try {
            const res = await bot.addGame(params.guildId, uid, payload);
            return { ok: true, message: res.message };
        } catch (err) {
            return fail(400, { message: err instanceof Error ? err.message : 'Could not add the game.' });
        }
    },

    importGame: async ({ request, params, locals }) => {
        const uid  = actingUser(locals);
        const data = await request.formData();

        // An empty roleId means "create one", so the name and colour fields come along with it.
        const roleId = String(data.get('roleId') ?? '').trim();

        const payload = {
            name:           String(data.get('name') ?? '').trim(),
            group:          String(data.get('newGroup') ?? '').trim(),
            playerCount:    Number(data.get('playerCount') ?? 1),
            textChannelId:  String(data.get('textChannelId') ?? '').trim(),
            voiceChannelId: String(data.get('voiceChannelId') ?? '').trim(),
            roleId:         roleId || undefined,
            roleName:       roleId ? undefined : String(data.get('roleName') ?? '').trim(),
            roleColour:     roleId ? undefined : String(data.get('roleColour') ?? '').trim()
        };

        try {
            const res = await bot.importGame(params.guildId, uid, payload);
            return { ok: true, message: res.message };
        } catch (err) {
            return fail(400, { message: err instanceof Error ? err.message : 'Could not import the game.' });
        }
    },

    editGame: async ({ request, params, locals }) => {
        const uid     = actingUser(locals);
        const data    = await request.formData();
        const name    = String(data.get('name') ?? '');
        const renamed = String(data.get('newName') ?? '').trim();
        const group   = String(data.get('group') ?? '').trim();
        const playerCount = Number(data.get('playerCount') ?? 1);
        try {
            await bot.editGame(params.guildId, uid, name, {
                name:  renamed || undefined,
                group: group || undefined,
                playerCount
            });
            return { ok: true, message: `${renamed || name} updated.` };
        } catch (err) {
            return fail(400, { message: err instanceof Error ? err.message : 'Could not update the game.' });
        }
    },

    editGroup: async ({ request, params, locals }) => {
        const uid  = actingUser(locals);
        const data = await request.formData();
        const name = String(data.get('name') ?? '');
        try {
            const res = await bot.editGroup(params.guildId, uid, name, {
                name:       String(data.get('newName') ?? '').trim() || undefined,
                roleName:   String(data.get('roleName') ?? '').trim() || undefined,
                roleColour: String(data.get('roleColour') ?? '').trim() || undefined
            });
            return { ok: true, message: res.message };
        } catch (err) {
            return fail(400, { message: err instanceof Error ? err.message : 'Could not update the group.' });
        }
    },

    removeGame: async ({ request, params, locals }) => {
        const uid  = actingUser(locals);
        const data = await request.formData();
        const name = String(data.get('name') ?? '');
        try {
            const res = await bot.removeGame(params.guildId, uid, name);
            const note = res.cleanupFailed
                ? ` The ${res.cleanupFailed} group was emptied and archived, but its channels could not be tidied up in Discord. See the omens above.`
                : !res.quarantined
                    ? ''
                    : res.adopted
                        ? ` The ${res.quarantined} group was emptied and archived, but its imported channels and role were left untouched.`
                        : ` The ${res.quarantined} group was emptied and archived.`;
            return { ok: true, message: `${res.removed} removed.${note}` };
        } catch (err) {
            return fail(400, { message: err instanceof Error ? err.message : 'Could not remove the game.' });
        }
    },

    runPoll: async ({ request, params, locals }) => {
        const uid  = actingUser(locals);
        const data = await request.formData();
        const mode = String(data.get('mode') ?? 'random');
        const gameNames = data.getAll('gameNames').map(String).filter(Boolean);
        try {
            const res = await bot.runPoll(params.guildId, uid, mode, gameNames);
            return { ok: true, message: res.message };
        } catch (err) {
            return fail(400, { message: err instanceof Error ? err.message : 'Could not post the poll.' });
        }
    }
};
