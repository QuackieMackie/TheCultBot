import { Client, ChannelType, PermissionFlagsBits } from 'discord.js';
import { getConfig, setConfig } from '@thecult/shared';
import { ensureBoardMessageForGuild } from 'utils/roleBoard';

const TEXT_CHANNEL_TYPES: ChannelType[] = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

const EDITABLE_KEYS = new Set([
    'poll_size',
    'poll_channel_id',
    'manager_role_id',
    'poll_hour_utc',
    'poll_duration_hours',
    'poll_auto_enabled',
    'role_board_channel_id',
]);

function intInRange(value: string, min: number, max: number, label: string): string {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new Error(`${label} must be a whole number between ${min} and ${max}.`);
    }
    return String(n);
}

// Both channel settings are places the bot has to post later, often with nobody watching, so
// the permission is checked while there is still someone to tell.
async function assertGuildTextChannel(client: Client, guildId: string, channelId: string): Promise<void> {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.isDMBased() || !channel.isTextBased() || channel.guild.id !== guildId) {
        throw new Error('That channel could not be found in this server.');
    }
    if (!TEXT_CHANNEL_TYPES.includes(channel.type)) {
        throw new Error('Please choose a standard text channel.');
    }

    const me    = channel.guild.members.me ?? await channel.guild.members.fetchMe().catch(() => null);
    const perms = me && channel.permissionsFor(me);
    if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages)) {
        throw new Error(`I cannot post in #${channel.name}. Give my role View Channel and Send Messages there, then try again.`);
    }
}

async function assertGuildRole(client: Client, guildId: string, roleId: string): Promise<void> {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) throw new Error('Server not found.');
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) throw new Error('That role could not be found in this server.');
}

export async function applyConfigChange(client: Client, guildId: string, key: string, rawValue: string): Promise<string> {
    if (!EDITABLE_KEYS.has(key)) {
        throw new Error(`"${key}" is not an editable setting.`);
    }

    switch (key) {
        case 'poll_size': {
            const v = intInRange(rawValue, 1, 10, 'Poll size');
            setConfig(guildId, key, v);
            return `Poll size set to ${v} games.`;
        }
        case 'poll_hour_utc': {
            const v = intInRange(rawValue, 0, 23, 'Poll time');
            setConfig(guildId, key, v);
            return `Poll time set to ${v}:00 UTC every Monday.`;
        }
        case 'poll_duration_hours': {
            const v = intInRange(rawValue, 1, 168, 'Poll duration');
            setConfig(guildId, key, v);
            return `Poll duration set to ${v} hours.`;
        }
        case 'poll_auto_enabled': {
            const on = rawValue === 'true';
            setConfig(guildId, key, on ? 'true' : 'false');
            return on ? 'Automatic weekly polls enabled.' : 'Automatic weekly polls disabled.';
        }
        case 'manager_role_id': {
            await assertGuildRole(client, guildId, rawValue);
            setConfig(guildId, key, rawValue);
            return 'Manager role updated.';
        }
        case 'poll_channel_id': {
            await assertGuildTextChannel(client, guildId, rawValue);
            setConfig(guildId, key, rawValue);
            return 'Poll channel updated.';
        }
        case 'role_board_channel_id': {
            await assertGuildTextChannel(client, guildId, rawValue);
            const previousChannel = getConfig(guildId, key);
            const previousMessage = getConfig(guildId, 'role_board_message_id');
            setConfig(guildId, key, rawValue);
            setConfig(guildId, 'role_board_message_id', '');
            try {
                // The board reads its channel back out of config, so the new value has to be in
                // place before the attempt. Put the old one back if the post fails.
                await ensureBoardMessageForGuild(client, guildId);
            } catch (err) {
                setConfig(guildId, key, previousChannel);
                setConfig(guildId, 'role_board_message_id', previousMessage);
                throw err;
            }
            return 'Role board channel updated and board message posted.';
        }
        default:
            throw new Error(`"${key}" is not an editable setting.`);
    }
}

export function readConfigSnapshot(guildId: string) {
    return {
        poll_size:             getConfig(guildId, 'poll_size'),
        poll_channel_id:       getConfig(guildId, 'poll_channel_id'),
        manager_role_id:       getConfig(guildId, 'manager_role_id'),
        poll_hour_utc:         getConfig(guildId, 'poll_hour_utc'),
        poll_duration_hours:   getConfig(guildId, 'poll_duration_hours'),
        poll_auto_enabled:     getConfig(guildId, 'poll_auto_enabled'),
        role_board_channel_id: getConfig(guildId, 'role_board_channel_id'),
        role_board_message_id: getConfig(guildId, 'role_board_message_id'),
    };
}
