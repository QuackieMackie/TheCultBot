import { ChannelType, Guild } from 'discord.js';
import {
    validateGameName,
    saveNewGame,
    updateGame,
    deleteGame,
    getGameByName,
    getGamesInGroup,
    getGroupByName,
    findGroupByChannel,
    renameGroup,
    saveGroup,
    updateGroup,
    type Game,
    type Group,
} from '@thecult/shared';
import { adoptGroupResources, createGroupResources, quarantineGroupResources, reviveGroupResources } from 'utils/gameResources';
import { ALERT_GROUP_QUARANTINE, raiseAlert } from 'utils/alerts';
import { colourToHex, formatGroupName, resolveGameColour } from 'utils/format';
import { logger } from 'utils/logger';

const log = logger('gameService');

interface AddGameInput {
    name:        string;
    group:       string;
    playerCount: number;
    addedBy:     string;
    // Only used when the group does not exist yet and must be created.
    roleName?:     string;
    roleColour?:   string;
    textChannel?:  string;
    voiceChannel?: string;
}

interface AddGameResult {
    game:    Game;
    group:   Group;
    outcome: 'joined' | 'revived' | 'created' | 'imported';
    message: string;
}

// Full equivalent of `/game add`: joins an existing group, revives a quarantined one, or
// creates a brand-new group (role + category + text/voice channels). The new-group path
// requires the live guild, so this always runs on the bot. Both the slash command and the
// internal API route through here, so the group lifecycle lives in one place.
export async function addGame(guild: Guild, input: AddGameInput): Promise<AddGameResult> {
    const guildId   = guild.id;
    const name      = input.name.trim();
    const groupName = input.group.trim();

    if (!groupName) throw new Error('A group is required.');
    validateGameName(guildId, name);

    const record: Game = {
        name,
        addedBy:         input.addedBy,
        addedAt:         new Date().toISOString(),
        group:           groupName,
        playerCount:     input.playerCount,
        pollAppearances: 0,
    };

    const existing = getGroupByName(guildId, groupName);

    log.debug('Adding game', { guild: guildId, game: name, group: groupName, by: input.addedBy, groupExists: !!existing, quarantined: existing?.quarantined });

    if (existing && !existing.quarantined) {
        record.group = existing.name;
        saveNewGame(guildId, record);
        log.info('Game added', { guild: guildId, game: name, group: existing.name, outcome: 'joined', by: input.addedBy });
        return { game: record, group: existing, outcome: 'joined', message: `${name} added to the existing ${existing.name} group.` };
    }

    if (existing && existing.quarantined) {
        // An adopted group keeps its role through quarantine, so reviving it is storage-only.
        const roleId = existing.adopted ? existing.roleId : await reviveGroupResources(guild, existing);
        updateGroup(guildId, existing.name, { roleId, quarantined: false, quarantinedAt: undefined });
        record.group = existing.name;
        saveNewGame(guildId, record);
        const revived: Group = { ...existing, roleId, quarantined: false, quarantinedAt: undefined };
        log.info('Game added', { guild: guildId, game: name, group: existing.name, outcome: 'revived', adopted: !!existing.adopted, role: roleId, by: input.addedBy });
        return { game: record, group: revived, outcome: 'revived', message: `${name} added and the ${existing.name} group was revived.` };
    }

    const roleName  = input.roleName?.trim();
    const textName  = input.textChannel?.trim();
    const voiceName = input.voiceChannel?.trim();
    if (!roleName || !textName || !voiceName) {
        throw new Error(`The group "${groupName}" doesn't exist yet, so a role name, text channel and voice channel are required to create it.`);
    }

    const colour = resolveGameColour(input.roleColour?.trim() || 'blurple');
    const group  = await createGroupResources(guild, { groupName, roleName, colour, textName, voiceName });
    saveGroup(guildId, group);
    record.group = group.name;
    saveNewGame(guildId, record);
    log.info('Game added', { guild: guildId, game: name, group: group.name, outcome: 'created', role: group.roleId, by: input.addedBy });
    return { game: record, group, outcome: 'created', message: `${name} added. Created the ${group.name} group with its role and channels.` };
}

interface ImportGameInput {
    name:           string;
    group:          string;
    playerCount:    number;
    addedBy:        string;
    textChannelId:  string;
    voiceChannelId: string;
    // Adopts this role when given, otherwise a new one is created from roleName/roleColour.
    roleId?:     string;
    roleName?:   string;
    roleColour?: string;
}

// Registers a game against channels that already exist, building a group around them instead of
// creating any. Only ever adds to a brand-new group, so it throws if the group name is taken or
// if either channel already belongs to another group.
export async function importGame(guild: Guild, input: ImportGameInput): Promise<AddGameResult> {
    const guildId   = guild.id;
    const name      = input.name.trim();
    const groupName = input.group.trim();

    if (!groupName) throw new Error('A group is required.');
    validateGameName(guildId, name);

    const existing = getGroupByName(guildId, groupName);
    if (existing) {
        throw new Error(`The group "${existing.name}" already exists. Use /game add to put a game in it.`);
    }

    for (const channelId of [input.textChannelId, input.voiceChannelId]) {
        const claimed = findGroupByChannel(guildId, channelId);
        if (claimed) throw new Error(`<#${channelId}> already belongs to the "${claimed.name}" group.`);
    }

    const colour = resolveGameColour(input.roleColour?.trim() || 'blurple');
    const group  = await adoptGroupResources(guild, {
        groupName,
        textChannelId:  input.textChannelId,
        voiceChannelId: input.voiceChannelId,
        roleId:         input.roleId,
        roleName:       input.roleName?.trim(),
        colour,
    });
    saveGroup(guildId, group);

    const record: Game = {
        name,
        addedBy:         input.addedBy,
        addedAt:         new Date().toISOString(),
        group:           group.name,
        playerCount:     input.playerCount,
        pollAppearances: 0,
    };
    saveNewGame(guildId, record);

    log.info('Game imported', {
        guild:   guildId,
        game:    name,
        group:   group.name,
        text:    group.textChannelId,
        voice:   group.voiceChannelId,
        role:    group.roleId,
        adopted: true,
        by:      input.addedBy,
    });
    return { game: record, group, outcome: 'imported', message: `${name} added. The ${group.name} group now uses your existing channels.` };
}

interface EditGamePatch {
    name?:        string;
    playerCount?: number;
    group?:       string;
}

/**
 * Applies a partial edit to one game. Storage only: a game owns no Discord resources.
 *
 * @param name  Current name of the game, matched case-insensitively.
 * @param patch Only the keys present are changed. A new name is held to the same rules as
 *              adding one, and a new group must exist and not be archived.
 * @param by    Who asked for the edit, for the log line.
 * @throws If the game is unknown, or any supplied value fails validation.
 */
export function editGame(guildId: string, name: string, patch: EditGamePatch, by: string): Game {
    const game = getGameByName(guildId, name);
    if (!game) throw new Error(`No game called "${name}" found in the roster.`);

    const clean: EditGamePatch = {};
    if (patch.name !== undefined) {
        const renamed = patch.name.trim();
        // validateGameName rejects any existing name, so skip it when the name is unchanged.
        if (renamed.toLowerCase() !== game.name.toLowerCase()) validateGameName(guildId, renamed);
        if (renamed !== game.name) clean.name = renamed;
    }
    if (typeof patch.playerCount === 'number') {
        if (patch.playerCount < 1) throw new Error('Player count must be at least 1.');
        clean.playerCount = patch.playerCount;
    }
    if (patch.group !== undefined) {
        const target = getGroupByName(guildId, patch.group.trim());
        if (!target || target.quarantined) {
            throw new Error(`The group "${patch.group}" doesn't exist or is archived.`);
        }
        clean.group = target.name;
    }

    updateGame(guildId, game.name, clean);
    log.info('Game edited', { guild: guildId, game: game.name, renamedTo: clean.name, playerCount: clean.playerCount, group: clean.group, by });
    return { ...game, ...clean };
}

interface EditGroupPatch {
    name?:       string;
    roleName?:   string;
    roleColour?: string;
}

interface EditGroupResult {
    group:   Group;
    message: string;
}

/**
 * Applies a partial edit to one group, including its Discord role.
 *
 * @param name  Current group name, matched case-insensitively.
 * @param patch Only the keys present are changed. A new name must not be taken by another group.
 * @param by    Who asked for the edit, for the log line.
 * @returns The updated record, and a message naming what actually changed in Discord.
 * @throws If the group is unknown or archived, the new name is taken, the colour is unrecognised,
 *         or the role sits above the bot's own.
 */
export async function editGroup(guild: Guild, name: string, patch: EditGroupPatch, by: string): Promise<EditGroupResult> {
    const guildId = guild.id;
    const group   = getGroupByName(guildId, name);
    if (!group)            throw new Error(`No group called "${name}" found.`);
    if (group.quarantined) throw new Error(`The "${group.name}" group is archived. Add a game to it to bring it back first.`);

    const renamed   = patch.name?.trim();
    const roleName  = patch.roleName?.trim();
    const colourRaw = patch.roleColour?.trim();

    if (renamed !== undefined && !renamed) throw new Error('A group name cannot be empty.');
    if (roleName !== undefined && !roleName) throw new Error('A role name cannot be empty.');

    const newName = renamed ? formatGroupName(renamed) : group.name;
    if (newName.toLowerCase() !== group.name.toLowerCase() && getGroupByName(guildId, newName)) {
        throw new Error(`Another group is already called "${newName}".`);
    }

    const colour = colourRaw ? resolveGameColour(colourRaw) : undefined;
    const notes:  string[] = [];
    const record: Partial<Group> = {};

    // The dashboard posts every field on every save, so unchanged ones are dropped here rather
    // than spending a Discord call to set a role to what it already is.
    const nextName   = roleName && roleName !== group.roleName ? roleName : undefined;
    const nextColour = colour !== undefined && colourToHex(colour) !== group.roleColour ? colour : undefined;

    if (nextName || nextColour !== undefined) {
        const role = group.roleId ? await guild.roles.fetch(group.roleId).catch(() => null) : null;
        if (role) {
            if (role.managed) throw new Error(`"${role.name}" is managed by an integration, so I cannot edit it.`);
            const highest = guild.members.me?.roles.highest;
            if (!highest || role.comparePositionTo(highest) >= 0) {
                throw new Error(`"${role.name}" sits above my highest role, so I cannot edit it. Move my role higher and try again.`);
            }
            await role.edit({
                ...(nextName ? { name: nextName } : {}),
                ...(nextColour !== undefined ? { colors: { primaryColor: nextColour } } : {}),
                reason: `Group "${group.name}" edited`,
            });
        } else {
            // A revived group re-creates its role from these fields, so storing them is still worth it.
            notes.push('the role itself is missing, so only the stored values changed');
        }
        if (nextName)                 record.roleName   = nextName;
        if (nextColour !== undefined) record.roleColour = colourToHex(nextColour);
    }

    if (Object.keys(record).length > 0) updateGroup(guildId, group.name, record);

    let moved = 0;
    if (newName !== group.name) {
        if (group.adopted) {
            notes.push('its category was left alone, since the group was imported');
        } else {
            const category = await guild.channels.fetch(group.categoryId).catch(() => null);
            if (category && category.type === ChannelType.GuildCategory) {
                await category.setName(formatGroupName(newName), `Group renamed from "${group.name}"`);
            }
        }
        moved = renameGroup(guildId, group.name, newName);
    }

    const updated = getGroupByName(guildId, newName) ?? { ...group, ...record, name: newName };
    log.info('Group edited', {
        guild:      guildId,
        group:      group.name,
        renamedTo:  newName !== group.name ? newName : undefined,
        roleName:   record.roleName,
        roleColour: record.roleColour,
        gamesMoved: moved,
        by,
    });

    const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';
    return { group: updated, message: `${newName} updated.${suffix}` };
}

interface RemoveResult {
    removed:     string;
    group:       string;
    remaining:   number;
    quarantined: string | null;
    // True when the quarantined group was adopted, so nothing in Discord was changed.
    adopted:     boolean;
    // Names the group whose Discord clean-up did not finish, so the caller can say so.
    cleanupFailed: string | null;
}

/**
 * Removes a game. If it was the last game in its group, the group's channels are archived and
 * its role deleted. Needs the live guild for the Discord side-effect, which is why removal is
 * routed through the bot. Both the slash command and the internal API call this.
 *
 * @param name Matched case-insensitively.
 * @param by   Who asked for the removal, for the log line.
 * @returns `cleanupFailed` names the group when the archiving failed in Discord. Storage is
 *          still updated in that case and an alert is raised, so the roster never disagrees
 *          with what the caller was told.
 * @throws If no game by that name is in the roster.
 */
export async function removeGame(guild: Guild, name: string, by: string): Promise<RemoveResult> {
    const guildId = guild.id;
    const game    = getGameByName(guildId, name);
    if (!game) throw new Error(`No game called "${name}" found in the roster.`);

    deleteGame(guildId, game.name);

    const remaining = getGamesInGroup(guildId, game.group);
    if (remaining.length > 0) {
        log.info('Game removed', { guild: guildId, game: game.name, group: game.group, remaining: remaining.length, action: 'group-kept', by });
        return { removed: game.name, group: game.group, remaining: remaining.length, quarantined: null, adopted: false, cleanupFailed: null };
    }

    const group = getGroupByName(guildId, game.group);
    if (group && !group.quarantined) {
        // The game is already gone from storage, so a Discord failure must not abort the rest:
        // the group is archived in storage either way and the problem is raised as an alert.
        let cleanupFailed: string | null = null;
        try {
            await quarantineGroupResources(guild, group);
        } catch (err) {
            cleanupFailed = group.name;
            log.warn('Group clean-up failed, archiving in storage anyway', { guild: guildId, group: group.name, err });
            raiseAlert(
                guildId,
                `${ALERT_GROUP_QUARANTINE}:${group.name}`,
                `Group "${group.name}"`,
                `The ${group.name} group was emptied, but I could not archive its channels. Check I have Manage Channels and Manage Roles, and that my role sits above the group's role and category.`,
                err,
            );
        }

        // An adopted group's role is never deleted, so its id stays on the record. A failed
        // clean-up keeps it too: the role may well still exist, and forgetting its id would
        // strand it in the server with nothing pointing at it.
        const roleGone = !group.adopted && !cleanupFailed;
        const patch    = { quarantined: true, quarantinedAt: new Date().toISOString(), ...(roleGone ? { roleId: '' } : {}) };
        updateGroup(guildId, group.name, patch);
        log.info('Game removed', {
            guild:   guildId,
            game:    game.name,
            group:   game.group,
            remaining: 0,
            action:  group.adopted ? 'group-quarantined-in-storage-only' : 'group-quarantined',
            adopted: !!group.adopted,
            cleanupFailed: cleanupFailed ?? undefined,
            by,
        });
        return { removed: game.name, group: game.group, remaining: 0, quarantined: group.name, adopted: !!group.adopted, cleanupFailed };
    }

    log.info('Game removed', {
        guild:  guildId,
        game:   game.name,
        group:  game.group,
        remaining: 0,
        action: group ? 'group-already-quarantined' : 'group-missing',
        by,
    });
    return { removed: game.name, group: game.group, remaining: 0, quarantined: null, adopted: !!group?.adopted, cleanupFailed: null };
}
