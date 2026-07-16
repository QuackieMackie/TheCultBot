import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction, Client, GuildMember, ChannelType } from 'discord.js';
import { getConfig, setConfig } from 'utils/storage';
import { hasManagerAccess } from 'utils/permissions';
import { ensureBoardMessageForGuild } from 'utils/roleBoard';
import type { CommandModule } from 'types';

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

        if (sub === 'poll-channel') {
            const channel = interaction.options.getChannel('channel', true);
            const allowed = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
            if (!allowed.includes(channel.type as ChannelType.GuildText)) {
                return interaction.reply({ content: 'Please select a standard text channel.', flags: MessageFlags.Ephemeral });
            }
            setConfig(guildId, 'poll_channel_id', channel.id);
            return interaction.reply({ content: `Poll channel set to ${channel}.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'poll-size') {
            const count = interaction.options.getInteger('count', true);
            setConfig(guildId, 'poll_size', count);
            return interaction.reply({ content: `Poll size set to **${count}** games.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'poll-time') {
            const hour = interaction.options.getInteger('hour', true);
            setConfig(guildId, 'poll_hour_utc', hour);
            return interaction.reply({ content: `Poll time set to **${hour}:00 UTC** every Monday.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'poll-duration') {
            const hours = interaction.options.getInteger('hours', true);
            setConfig(guildId, 'poll_duration_hours', hours);
            return interaction.reply({ content: `Poll duration set to **${hours}** hours.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'poll-auto') {
            const enabled = interaction.options.getBoolean('enabled', true);
            setConfig(guildId, 'poll_auto_enabled', enabled ? 'true' : 'false');
            return interaction.reply({
                content: enabled
                    ? 'Automatic weekly polls are now **enabled**.'
                    : 'Automatic weekly polls are now **disabled**. Use `/poll now` to post one manually.',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (sub === 'manager-role') {
            const role = interaction.options.getRole('role', true);
            setConfig(guildId, 'manager_role_id', role.id);
            return interaction.reply({ content: `Manager role set to ${role}.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'role-board-channel') {
            const channel = interaction.options.getChannel('channel', true);
            const allowed = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
            if (!allowed.includes(channel.type as ChannelType.GuildText)) {
                return interaction.reply({ content: 'Please select a standard text channel.', flags: MessageFlags.Ephemeral });
            }
            setConfig(guildId, 'role_board_channel_id', channel.id);
            setConfig(guildId, 'role_board_message_id', '');
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                await ensureBoardMessageForGuild(client, guildId);
                return interaction.editReply({ content: `Role board channel set to ${channel}. Board message posted.` });
            } catch (err) {
                console.error(err);
                const message = err instanceof Error ? err.message : 'An error occurred.';
                return interaction.editReply({ content: `Channel set, but posting the board message failed: ${message}` });
            }
        }
    },
};

export default command;
