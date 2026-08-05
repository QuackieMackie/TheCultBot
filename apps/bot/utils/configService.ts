import { Client, ChannelType, PermissionFlagsBits } from 'discord.js';
import { getConfig, setConfig, MAX_POLL_MESSAGE_LENGTH } from '@thecult/shared';
import { ensureBoardMessageForGuild } from 'utils/roleBoard';

const TEXT_CHANNEL_TYPES: ChannelType[] = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

const EDITABLE_KEYS = new Set([
    'poll_size',
    'poll_channel_id',
    'manager_role_id',
    'poll_hour_utc',
    'poll_duration_hours',
    'poll_auto_enabled',
    'poll_message',
    'role_board_channel_id',
]);

const EVERYONE_OR_HERE = /@(everyone|here)/;
const ROLE_MENTION     = /<@&(\d+)>/g;

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

/**
 * Describes the pings in a poll message that would post as plain text.
 *
 * @returns A sentence to append to a success message, or an empty string when every ping will
 *          fire. Checked against the poll channel, since Mention Everyone is granted per
 *          channel; an unset or unreachable channel yields no warning rather than a guess.
 */
async function describeUndeliverableMentions(client: Client, guildId: string, message: string): Promise<string> {
    const roleIds = [...message.matchAll(ROLE_MENTION)].map(m => m[1]);
    const wide    = EVERYONE_OR_HERE.test(message);
    if (!wide && roleIds.length === 0) return '';

    const channelId = getConfig(guildId, 'poll_channel_id');
    if (!channelId) return '';

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.isDMBased() || !channel.isTextBased()) return '';

    const me = channel.guild.members.me ?? await channel.guild.members.fetchMe().catch(() => null);
    if (!me || channel.permissionsFor(me)?.has(PermissionFlagsBits.MentionEveryone)) return '';

    const blocked: string[] = [];
    if (wide) blocked.push('@everyone or @here');
    for (const id of roleIds) {
        // A role flagged mentionable pings without the permission, so only the rest are a problem.
        const role = await channel.guild.roles.fetch(id).catch(() => null);
        if (role && !role.mentionable) blocked.push(`@${role.name}`);
    }
    if (blocked.length === 0) return '';

    return ` I cannot ping ${blocked.join(', ')} in #${channel.name}, so that will post as plain text.`
        + ' Give my role "Mention @everyone, @here and All Roles" there to fix it.';
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
        case 'poll_message': {
            if (rawValue.length > MAX_POLL_MESSAGE_LENGTH) {
                throw new Error(`The poll message must be ${MAX_POLL_MESSAGE_LENGTH} characters or fewer.`);
            }
            setConfig(guildId, key, rawValue);
            if (!rawValue) return 'Poll message cleared. Polls will post on their own.';
            return `Poll message updated.${await describeUndeliverableMentions(client, guildId, rawValue)}`;
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
        poll_message:          getConfig(guildId, 'poll_message'),
        role_board_channel_id: getConfig(guildId, 'role_board_channel_id'),
        role_board_message_id: getConfig(guildId, 'role_board_message_id'),
    };
}
