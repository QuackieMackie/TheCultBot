import { Guild } from 'discord.js';
import {
    validateGameName,
    saveNewGame,
    updateGame,
    deleteGame,
    getGameByName,
    getGamesInGroup,
    getGroupByName,
    saveGroup,
    updateGroup,
    type Game,
    type Group,
} from '@thecult/shared';
import { createGroupResources, quarantineGroupResources, reviveGroupResources } from 'utils/gameResources';
import { resolveGameColour } from 'utils/format';

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
    outcome: 'joined' | 'revived' | 'created';
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

    if (existing && !existing.quarantined) {
        record.group = existing.name;
        saveNewGame(guildId, record);
        return { game: record, group: existing, outcome: 'joined', message: `${name} added to the existing ${existing.name} group.` };
    }

    if (existing && existing.quarantined) {
        const roleId = await reviveGroupResources(guild, existing);
        updateGroup(guildId, existing.name, { roleId, quarantined: false, quarantinedAt: undefined });
        record.group = existing.name;
        saveNewGame(guildId, record);
        const revived: Group = { ...existing, roleId, quarantined: false, quarantinedAt: undefined };
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
    return { game: record, group, outcome: 'created', message: `${name} added. Created the ${group.name} group with its role and channels.` };
}

interface EditGamePatch {
    playerCount?: number;
    group?:       string;
}

export function editGame(guildId: string, name: string, patch: EditGamePatch): Game {
    const game = getGameByName(guildId, name);
    if (!game) throw new Error(`No game called "${name}" found in the roster.`);

    const clean: EditGamePatch = {};
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
    return { ...game, ...clean };
}

interface RemoveResult {
    removed:     string;
    group:       string;
    remaining:   number;
    quarantined: string | null;
}

// Removes a game. If it was the last game in its group, the group's channels are quarantined
// and its role deleted. Needs the live guild for the Discord side-effect, which is why removal
// is routed through the bot. Both the slash command and the internal API call this.
export async function removeGame(guild: Guild, name: string): Promise<RemoveResult> {
    const guildId = guild.id;
    const game    = getGameByName(guildId, name);
    if (!game) throw new Error(`No game called "${name}" found in the roster.`);

    deleteGame(guildId, game.name);

    const remaining = getGamesInGroup(guildId, game.group);
    if (remaining.length > 0) {
        return { removed: game.name, group: game.group, remaining: remaining.length, quarantined: null };
    }

    const group = getGroupByName(guildId, game.group);
    if (group && !group.quarantined) {
        await quarantineGroupResources(guild, group);
        updateGroup(guildId, group.name, { quarantined: true, quarantinedAt: new Date().toISOString(), roleId: '' });
        return { removed: game.name, group: game.group, remaining: 0, quarantined: group.name };
    }

    return { removed: game.name, group: game.group, remaining: 0, quarantined: null };
}
