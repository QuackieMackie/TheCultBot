import {
    Guild,
    ChannelType,
    PermissionFlagsBits,
    type ColorResolvable,
    type GuildBasedChannel,
    type OverwriteResolvable,
} from 'discord.js';
import type { Group } from '@thecult/shared';
import { getConfig } from '@thecult/shared';
import { slugify, formatGroupName, colourToHex } from 'utils/format';
import { logger } from 'utils/logger';

const ARCHIVE_PREFIX = '🗄️';
const log            = logger('gameResources');

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

    log.info('Creating group resources', { guild: guild.id, group: spec.groupName, role: spec.roleName });

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

        log.info('Created group resources', {
            guild:    guild.id,
            group:    spec.groupName,
            role:     role.id,
            category: category.id,
            text:     text.id,
            voice:    voice.id,
        });

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
        log.error('Group creation failed, rolling back', { guild: guild.id, group: spec.groupName, err });
        await rollback(guild, created);
        throw err;
    }
}

interface AdoptSpec {
    groupName:      string;
    textChannelId:  string;
    voiceChannelId: string;
    roleId?:        string;
    roleName?:      string;
    colour:         number;
}

// Builds a group record around channels that already exist, adopting the role when one is given
// and creating it otherwise. Nothing about the channels or the category is modified.
// Throws if either channel is missing, is the wrong type, or the two sit under different categories.
export async function adoptGroupResources(guild: Guild, spec: AdoptSpec): Promise<Group> {
    const text  = await fetchGuildChannel(guild, spec.textChannelId,  ChannelType.GuildText,  'text');
    const voice = await fetchGuildChannel(guild, spec.voiceChannelId, ChannelType.GuildVoice, 'voice');

    if (!text.parentId || !voice.parentId) {
        throw new Error('Both channels need to sit under a category before they can be imported.');
    }
    if (text.parentId !== voice.parentId) {
        throw new Error('The text and voice channels are under different categories. Move them under one category first.');
    }

    let role = spec.roleId ? await guild.roles.fetch(spec.roleId).catch(() => null) : null;
    if (spec.roleId) {
        if (!role) throw new Error('That role could not be found in this server.');
        if (role.managed) throw new Error(`"${role.name}" is managed by an integration, so it cannot be handed out. Pick another role.`);

        const highest = guild.members.me?.roles.highest;
        if (!highest || role.comparePositionTo(highest) >= 0) {
            throw new Error(`"${role.name}" sits above my highest role, so I cannot assign it. Move my role higher or pick another role.`);
        }
    } else {
        // Validation is done, so this is the only write and needs no rollback.
        role = await guild.roles.create({
            name:   spec.roleName || spec.groupName,
            colors: { primaryColor: spec.colour },
            reason: `Imported game group "${spec.groupName}"`,
        });
    }

    log.info('Adopted existing resources', {
        guild:       guild.id,
        group:       spec.groupName,
        category:    text.parentId,
        text:        text.id,
        voice:       voice.id,
        role:        role.id,
        roleCreated: !spec.roleId,
    });

    return {
        name:           formatGroupName(spec.groupName),
        roleId:         role.id,
        roleName:       role.name,
        roleColour:     colourToHex(role.color),
        categoryId:     text.parentId,
        textChannelId:  text.id,
        voiceChannelId: voice.id,
        quarantined:    false,
        adopted:        true,
    };
}

async function fetchGuildChannel<T extends ChannelType.GuildText | ChannelType.GuildVoice>(
    guild: Guild,
    channelId: string,
    type: T,
    label: string,
): Promise<Extract<GuildBasedChannel, { type: T }>> {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) throw new Error(`That ${label} channel could not be found in this server.`);
    if (channel.type !== type) throw new Error(`<#${channel.id}> is not a ${label} channel.`);
    return channel as Extract<GuildBasedChannel, { type: T }>;
}

async function rollback(guild: Guild, created: { roleId: string; categoryId: string; textChannelId: string; voiceChannelId: string }): Promise<void> {
    for (const id of [created.textChannelId, created.voiceChannelId, created.categoryId]) {
        if (id) await guild.channels.delete(id, 'Rolling back failed group creation').catch(() => null);
    }
    if (created.roleId) await guild.roles.delete(created.roleId, 'Rolling back failed group creation').catch(() => null);
}

// Hides the group's channels from everyone but managers, then deletes the access role.
// Channel/category IDs stay on the record so the group can be revived later.
// Adopted groups are left alone entirely, so quarantining one is a storage-only change.
export async function quarantineGroupResources(guild: Guild, group: Group): Promise<void> {
    // The server owns these channels and this role, so the bot must not rename or delete them.
    if (group.adopted) {
        log.info('Group is adopted, leaving its channels and role untouched', {
            guild:    guild.id,
            group:    group.name,
            category: group.categoryId,
            role:     group.roleId,
        });
        return;
    }

    const managerRoleId = getConfig(guild.id, 'manager_role_id');

    const category = await guild.channels.fetch(group.categoryId).catch(() => null);
    if (!category) {
        log.warn('Category not found, cannot archive it', { guild: guild.id, group: group.name, category: group.categoryId });
    }
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
        log.info('Archived category', { guild: guild.id, group: group.name, category: category.id, managerRole: managerRoleId || 'none' });
    }

    if (group.roleId) {
        const role = await guild.roles.fetch(group.roleId).catch(() => null);
        // Allowed to throw so the caller keeps the role id.
        if (role) await role.delete('Group quarantined');
    }

    log.info('Quarantined group resources', { guild: guild.id, group: group.name, role: group.roleId || 'none' });
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

    log.info('Revived group resources', { guild: guild.id, group: group.name, role: role.id, category: group.categoryId });
    return role.id;
}
