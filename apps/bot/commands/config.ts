import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction, Client, GuildMember } from 'discord.js';
import { getConfig } from '@thecult/shared';
import { hasManagerAccess } from 'utils/permissions';
import { applyConfigChange } from 'utils/configService';
import { actorOf, recordAudit } from 'utils/audit';
import { logger } from 'utils/logger';
import type { CommandModule } from 'types';

const log = logger('config');

const command: CommandModule = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Bot configuration (managers/admins only)')
        .addSubcommand(sub => sub
            .setName('poll-channel')
            .setDescription('Set the channel where weekly polls are posted')
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('Target channel')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('poll-size')
            .setDescription('How many games appear in each poll')
            .addIntegerOption(opt => opt
                .setName('count')
                .setDescription('Number of games (1-10)')
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('poll-time')
            .setDescription('Hour (UTC) the Monday poll fires')
            .addIntegerOption(opt => opt
                .setName('hour')
                .setDescription('Hour in 24h UTC (0-23)')
                .setMinValue(0)
                .setMaxValue(23)
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('poll-duration')
            .setDescription('How long the poll stays open')
            .addIntegerOption(opt => opt
                .setName('hours')
                .setDescription('Duration in hours (1-168)')
                .setMinValue(1)
                .setMaxValue(168)
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('poll-auto')
            .setDescription('Turn the automatic weekly poll on or off')
            .addBooleanOption(opt => opt
                .setName('enabled')
                .setDescription('Whether the poll fires automatically each Monday')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('manager-role')
            .setDescription('Set the role that can manage the game roster')
            .addRoleOption(opt => opt
                .setName('role')
                .setDescription('Manager role')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('role-board-channel')
            .setDescription('Set the channel where members self-assign game group roles')
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('Target channel')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('show')
            .setDescription('Show the current configuration')),

    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        if (!interaction.guildId) {
            return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        }
        if (!hasManagerAccess(interaction.member as GuildMember)) {
            return interaction.reply({ content: 'You need the manager role (or admin) to do that.', flags: MessageFlags.Ephemeral });
        }

        const guildId = interaction.guildId;
        const sub     = interaction.options.getSubcommand();

        if (sub === 'show') {
            const channelId  = getConfig(guildId, 'poll_channel_id');
            const roleId     = getConfig(guildId, 'manager_role_id');
            const size       = getConfig(guildId, 'poll_size');
            const hour       = getConfig(guildId, 'poll_hour_utc');
            const duration   = getConfig(guildId, 'poll_duration_hours');
            const boardId    = getConfig(guildId, 'role_board_channel_id');
            const autoOn     = getConfig(guildId, 'poll_auto_enabled') === 'true';
            return interaction.reply({
                content: [
                    '**Current Config**',
                    `Automatic polls: ${autoOn ? 'Enabled' : 'Disabled'}`,
                    `Poll channel: ${channelId ? `<#${channelId}>` : '_not set_'}`,
                    `Role board channel: ${boardId ? `<#${boardId}>` : '_not set_'}`,
                    `Manager role: ${roleId ? `<@&${roleId}>` : '_not set_'}`,
                    `Poll size: ${size} games`,
                    `Poll time: ${hour}:00 UTC every Monday`,
                    `Poll duration: ${duration} hours`,
                ].join('\n'),
                flags: MessageFlags.Ephemeral,
            });
        }

        const change = resolveChange(sub, interaction);
        if (!change) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const message = await applyConfigChange(client, guildId, change.key, change.value);
            log.info('Config changed', { guild: guildId, key: change.key, value: change.value, by: interaction.user.username });
            recordAudit(guildId, actorOf(interaction), 'config.set', change.key, change.value || '(cleared)', 'command');
            return interaction.editReply({ content: message });
        } catch (err) {
            log.error('Config change failed', { guild: guildId, key: change.key, err });
            const message = err instanceof Error ? err.message : 'An error occurred.';
            return interaction.editReply({ content: message });
        }
    },
};

function resolveChange(sub: string, interaction: ChatInputCommandInteraction): { key: string; value: string } | null {
    switch (sub) {
        case 'poll-channel':       return { key: 'poll_channel_id',       value: interaction.options.getChannel('channel', true).id };
        case 'poll-size':          return { key: 'poll_size',             value: String(interaction.options.getInteger('count', true)) };
        case 'poll-time':          return { key: 'poll_hour_utc',         value: String(interaction.options.getInteger('hour', true)) };
        case 'poll-duration':      return { key: 'poll_duration_hours',   value: String(interaction.options.getInteger('hours', true)) };
        case 'poll-auto':          return { key: 'poll_auto_enabled',     value: interaction.options.getBoolean('enabled', true) ? 'true' : 'false' };
        case 'manager-role':       return { key: 'manager_role_id',       value: interaction.options.getRole('role', true).id };
        case 'role-board-channel': return { key: 'role_board_channel_id', value: interaction.options.getChannel('channel', true).id };
        default:                   return null;
    }
}

export default command;
