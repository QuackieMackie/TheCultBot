import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { getConfig } from 'utils/storage';

export function hasManagerAccess(member: GuildMember): boolean {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    const roleId = getConfig(member.guild.id, 'manager_role_id');
    return !!(roleId && member.roles.cache.has(roleId));
}
