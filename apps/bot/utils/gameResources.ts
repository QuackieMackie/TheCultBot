import {
    Guild,
    ChannelType,
    PermissionFlagsBits,
    type ColorResolvable,
    type OverwriteResolvable,
} from 'discord.js';
import type { Group } from '@thecult/shared';
import { getConfig } from '@thecult/shared';
import { slugify, formatGroupName, colourToHex } from 'utils/format';

const ARCHIVE_PREFIX = '🗄️';

interface CreateSpec {
    groupName: string;
    roleName:  string;
    colour:    number;
    textName:  string;
    voiceName: string;
}

// Creates the role, category, text and voice channels for a new group.
export async function createGroupResources(guild: Guild, spec: CreateSpec): Promise<Group> {
    const created = { roleId: '', categoryId: '', textChannelId: '', voiceChannelId: '' };

    try {
        const role = await guild.roles.create({
            name:   spec.roleName,
            colors: { primaryColor: spec.colour },
            reason: `Game group "${spec.groupName}"`,
        });
        created.roleId = role.id;

        const category = await guild.channels.create({
            name: formatGroupName(spec.groupName),
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny:  [PermissionFlagsBits.ViewChannel] },
                { id: role.id,                 allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
            ],
        });
        created.categoryId = category.id;

        const text = await guild.channels.create({
            name:   slugify(spec.textName) || 'general',
            type:   ChannelType.GuildText,
            parent: category.id,
        });
        created.textChannelId = text.id;

        const voice = await guild.channels.create({
            name:   slugify(spec.voiceName) || 'voice',
            type:   ChannelType.GuildVoice,
            parent: category.id,
        });
        created.voiceChannelId = voice.id;

        return {
            name:           formatGroupName(spec.groupName),
            roleId:         role.id,
            roleName:       spec.roleName,
            roleColour:     colourToHex(spec.colour),
            categoryId:     category.id,
            textChannelId:  text.id,
            voiceChannelId: voice.id,
            quarantined:    false,
        };
    } catch (err) {
        await rollback(guild, created);
        throw err;
    }
}

async function rollback(guild: Guild, created: { roleId: string; categoryId: string; textChannelId: string; voiceChannelId: string }): Promise<void> {
    for (const id of [created.textChannelId, created.voiceChannelId, created.categoryId]) {
        if (id) await guild.channels.delete(id, 'Rolling back failed group creation').catch(() => null);
    }
    if (created.roleId) await guild.roles.delete(created.roleId, 'Rolling back failed group creation').catch(() => null);
}

// Hides the group's channels from everyone but managers, then deletes the access role.
// Channel/category IDs stay on the record so the group can be revived later.
export async function quarantineGroupResources(guild: Guild, group: Group): Promise<void> {
    const managerRoleId = getConfig(guild.id, 'manager_role_id');

    const category = await guild.channels.fetch(group.categoryId).catch(() => null);
    if (category && category.type === ChannelType.GuildCategory) {
        const overwrites: OverwriteResolvable[] = [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ];
        if (managerRoleId) {
            overwrites.push({ id: managerRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] });
        }
        await category.permissionOverwrites.set(overwrites, 'Group quarantined');

        if (!category.name.startsWith(ARCHIVE_PREFIX)) {
            await category.setName(`${ARCHIVE_PREFIX} ${category.name}`.slice(0, 100));
        }
    }

    if (group.roleId) {
        const role = await guild.roles.fetch(group.roleId).catch(() => null);
        if (role) await role.delete('Group quarantined').catch(() => null);
    }
}

// Re-creates the access role and restores channel visibility for a quarantined group.
// Returns the new role id to persist on the group record.
export async function reviveGroupResources(guild: Guild, group: Group): Promise<string> {
    const role = await guild.roles.create({
        name:   group.roleName,
        colors: { primaryColor: (group.roleColour || '#5865F2') as ColorResolvable },
        reason: `Group "${group.name}" revived`,
    });

    const category = await guild.channels.fetch(group.categoryId).catch(() => null);
    if (category && category.type === ChannelType.GuildCategory) {
        await category.permissionOverwrites.set([
            { id: guild.roles.everyone.id, deny:  [PermissionFlagsBits.ViewChannel] },
            { id: role.id,                 allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        ], 'Group revived');

        const stripped = category.name.replace(new RegExp(`^${ARCHIVE_PREFIX}\\s*`), '');
        if (stripped !== category.name) await category.setName(stripped.slice(0, 100));
    }

    return role.id;
}
