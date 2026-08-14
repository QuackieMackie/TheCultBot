/**
 * The guild dashboard's form actions and config helpers, shared by every route under
 * `/g/[guildId]`. Each route re-exports the subset its components post to.
 */

import { error, fail } from '@sveltejs/kit';
import { getConfig } from '@thecult/shared';
import { bot } from '$lib/server/bot';
import type { Action } from '@sveltejs/kit';

export const CONFIG_KEYS = [
    'poll_size',
    'poll_channel_id',
    'manager_role_id',
    'poll_hour_utc',
    'poll_duration_hours',
    'poll_auto_enabled',
    'poll_message',
    'role_board_channel_id',
    'role_board_message_id'
] as const;

/** Every config key for a guild, with unset keys as empty strings. */
export function configSnapshot(guildId: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of CONFIG_KEYS) out[k] = getConfig(guildId, k);
    return out;
}

/**
 * Returns the signed-in user's id.
 *
 * @throws 401 if nobody is signed in.
 */
function actingUser(locals: App.Locals): string {
    if (!locals.user) throw error(401, 'Not signed in.');
    return locals.user.id;
}

export const setConfig: Action = async ({ request, params, locals }) => {
    const uid   = actingUser(locals);
    const data  = await request.formData();
    const key   = String(data.get('key') ?? '');
    const value = String(data.get('value') ?? '');
    try {
        const res = await bot.setConfig(params.guildId!, uid, key, value);
        return { ok: true, message: res.message };
    } catch (err) {
        return fail(400, { message: err instanceof Error ? err.message : 'Update failed.' });
    }
};

export const dismissAlert: Action = async ({ request, params, locals }) => {
    const uid  = actingUser(locals);
    const data = await request.formData();
    const id   = String(data.get('id') ?? '');
    try {
        await bot.dismissAlert(params.guildId!, uid, id);
        return { ok: true, message: 'Notice dismissed.' };
    } catch (err) {
        return fail(400, { message: err instanceof Error ? err.message : 'Could not dismiss the notice.' });
    }
};

export const addGame: Action = async ({ request, params, locals }) => {
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
        const res = await bot.addGame(params.guildId!, uid, payload);
        return { ok: true, message: res.message };
    } catch (err) {
        return fail(400, { message: err instanceof Error ? err.message : 'Could not add the game.' });
    }
};

export const importGame: Action = async ({ request, params, locals }) => {
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
        const res = await bot.importGame(params.guildId!, uid, payload);
        return { ok: true, message: res.message };
    } catch (err) {
        return fail(400, { message: err instanceof Error ? err.message : 'Could not import the game.' });
    }
};

export const editGame: Action = async ({ request, params, locals }) => {
    const uid         = actingUser(locals);
    const data        = await request.formData();
    const name        = String(data.get('name') ?? '');
    const renamed     = String(data.get('newName') ?? '').trim();
    const group       = String(data.get('group') ?? '').trim();
    const playerCount = Number(data.get('playerCount') ?? 1);
    try {
        await bot.editGame(params.guildId!, uid, name, {
            name:  renamed || undefined,
            group: group || undefined,
            playerCount
        });
        return { ok: true, message: `${renamed || name} updated.` };
    } catch (err) {
        return fail(400, { message: err instanceof Error ? err.message : 'Could not update the game.' });
    }
};

export const editGroup: Action = async ({ request, params, locals }) => {
    const uid  = actingUser(locals);
    const data = await request.formData();
    const name = String(data.get('name') ?? '');
    try {
        const res = await bot.editGroup(params.guildId!, uid, name, {
            name:       String(data.get('newName') ?? '').trim() || undefined,
            roleName:   String(data.get('roleName') ?? '').trim() || undefined,
            roleColour: String(data.get('roleColour') ?? '').trim() || undefined
        });
        return { ok: true, message: res.message };
    } catch (err) {
        return fail(400, { message: err instanceof Error ? err.message : 'Could not update the group.' });
    }
};

export const removeGame: Action = async ({ request, params, locals }) => {
    const uid  = actingUser(locals);
    const data = await request.formData();
    const name = String(data.get('name') ?? '');
    try {
        const res  = await bot.removeGame(params.guildId!, uid, name);
        const note = res.cleanupFailed
            ? ` The ${res.cleanupFailed} group was emptied and archived, but its channels could not be tidied up in Discord. See the omens.`
            : !res.quarantined
                ? ''
                : res.adopted
                    ? ` The ${res.quarantined} group was emptied and archived, but its imported channels and role were left untouched.`
                    : ` The ${res.quarantined} group was emptied and archived.`;
        return { ok: true, message: `${res.removed} removed.${note}` };
    } catch (err) {
        return fail(400, { message: err instanceof Error ? err.message : 'Could not remove the game.' });
    }
};

export const runPoll: Action = async ({ request, params, locals }) => {
    const uid       = actingUser(locals);
    const data      = await request.formData();
    const mode      = String(data.get('mode') ?? 'random');
    const gameNames = data.getAll('gameNames').map(String).filter(Boolean);
    try {
        const res = await bot.runPoll(params.guildId!, uid, mode, gameNames);
        return { ok: true, message: res.message };
    } catch (err) {
        return fail(400, { message: err instanceof Error ? err.message : 'Could not post the poll.' });
    }
};
