import {
    Client,
    Interaction,
    GuildMember,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    type MessageActionRowComponentBuilder,
} from 'discord.js';
import { getConfig, setConfig, getActiveGroups } from '@thecult/shared';
import { ALERT_ROLE_BOARD, describeDiscordError, raiseAlert, resolveAlert } from 'utils/alerts';
import { logger } from 'utils/logger';

const GROUPS_PER_PAGE = 25;
const log             = logger('roleBoard');

// Refreshes the persistent board message for every guild the bot is in. Safe to
// call repeatedly (e.g. on ready).
export async function ensureBoardMessage(client: Client): Promise<void> {
    for (const guildId of client.guilds.cache.keys()) {
        await ensureBoardMessageForGuild(client, guildId).catch(err =>
            log.error('Role board refresh failed', { guild: guildId, err }));
    }
}

/**
 * Posts (or updates) one guild's persistent board message: a single button that opens each
 * member's private, paginated group menu. Safe to call repeatedly.
 *
 * @throws When the board cannot be posted, with wording aimed at a server admin. The same
 *         wording is recorded as a guild alert, so the boot-time refresh (which has no caller
 *         to report to) still reaches the dashboard.
 */
export async function ensureBoardMessageForGuild(client: Client, guildId: string): Promise<void> {
    const channelId = getConfig(guildId, 'role_board_channel_id');
    if (!channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.isDMBased() || !channel.isTextBased()) {
        const message = 'The role board channel no longer exists or I can no longer see it. Pick a channel again on the dashboard.';
        raiseAlert(guildId, ALERT_ROLE_BOARD, 'roleBoard', message);
        throw new Error(message);
    }

    const button = new ButtonBuilder()
        .setCustomId('roleboard:open')
        .setLabel('Manage my game roles')
        .setStyle(ButtonStyle.Primary);
    const row     = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    const content = 'Click below to join or leave game groups and get access to their channels.';

    const existingId = getConfig(guildId, 'role_board_message_id');

    try {
        if (existingId) {
            const existing = await channel.messages.fetch(existingId).catch(() => null);
            if (existing) {
                await existing.edit({ content, components: [row] });
                resolveAlert(guildId, ALERT_ROLE_BOARD);
                return;
            }
        }

        const sent = await channel.send({ content, components: [row] });
        setConfig(guildId, 'role_board_message_id', sent.id);
        resolveAlert(guildId, ALERT_ROLE_BOARD);
    } catch (err) {
        const message = describeDiscordError(err, channel.name, 'The role board message could not be posted.');
        raiseAlert(guildId, ALERT_ROLE_BOARD, 'roleBoard', message, err);
        log.error('Role board post failed', { guild: guildId, channel: channelId, err });
        throw new Error(message);
    }
}

interface Menu {
    content:    string;
    components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

function buildGroupMenu(member: GuildMember, page: number): Menu {
    const groups = getActiveGroups(member.guild.id);
    if (groups.length === 0) {
        return { content: 'No game groups are available to join yet.', components: [] };
    }

    const totalPages = Math.ceil(groups.length / GROUPS_PER_PAGE);
    const p          = Math.min(Math.max(page, 0), totalPages - 1);
    const pageGroups = groups.slice(p * GROUPS_PER_PAGE, p * GROUPS_PER_PAGE + GROUPS_PER_PAGE);

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`roleboard:select:${p}`)
        .setPlaceholder('Select the groups you want to be in...')
        .setMinValues(0)
        .setMaxValues(pageGroups.length)
        .addOptions(pageGroups.map(g => ({
            label:   g.name.slice(0, 100),
            value:   g.name.slice(0, 100),
            default: !!g.roleId && member.roles.cache.has(g.roleId),
        })));

    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu),
    ];

    if (totalPages > 1) {
        const prev = new ButtonBuilder().setCustomId(`roleboard:page:${p - 1}`).setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(p === 0);
        const next = new ButtonBuilder().setCustomId(`roleboard:page:${p + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(p === totalPages - 1);
        rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(prev, next));
    }

    const pageNote = totalPages > 1 ? ` (Page ${p + 1}/${totalPages})` : '';
    return { content: `Select the groups you'd like to be in. Changes apply as you select.${pageNote}`, components: rows };
}

export async function handleRoleBoardInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith('roleboard:')) return;

    if (!interaction.guild) {
        if (interaction.isRepliable()) {
            await interaction.reply({ content: 'The role board only works inside the server.', flags: MessageFlags.Ephemeral });
        }
        return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return;

    if (interaction.isButton() && interaction.customId === 'roleboard:open') {
        const menu = buildGroupMenu(member, 0);
        await interaction.reply({ content: menu.content, components: menu.components, flags: MessageFlags.Ephemeral });
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('roleboard:page:')) {
        const page = parseInt(interaction.customId.split(':')[2], 10) || 0;
        const menu = buildGroupMenu(member, page);
        await interaction.update({ content: menu.content, components: menu.components });
        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('roleboard:select:')) {
        const page       = parseInt(interaction.customId.split(':')[2], 10) || 0;
        const groups     = getActiveGroups(interaction.guild.id);
        const pageGroups = groups.slice(page * GROUPS_PER_PAGE, page * GROUPS_PER_PAGE + GROUPS_PER_PAGE);
        const selected   = new Set(interaction.values);

        const toAdd:    string[] = [];
        const toRemove: string[] = [];
        for (const g of pageGroups) {
            if (!g.roleId) continue;
            const has  = member.roles.cache.has(g.roleId);
            const want = selected.has(g.name);
            if (want && !has)  toAdd.push(g.roleId);
            if (!want && has)  toRemove.push(g.roleId);
        }

        try {
            if (toAdd.length)    await member.roles.add(toAdd, 'Role board self-assign');
            if (toRemove.length) await member.roles.remove(toRemove, 'Role board self-assign');
            log.info('Roles updated from board', { guild: interaction.guild.id, user: member.user.username, added: toAdd.length, removed: toRemove.length });
        } catch (err) {
            log.error('Role board assign failed', { guild: interaction.guild.id, user: member.user.username, err });
            await interaction.update({ content: 'I could not update your roles. Check that my role is above the game roles and that I have Manage Roles.', components: [] });
            return;
        }

        const refreshed = await member.fetch();
        const menu      = buildGroupMenu(refreshed, page);
        await interaction.update({ content: menu.content, components: menu.components });
        return;
    }
}
