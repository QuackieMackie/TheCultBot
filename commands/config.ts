import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction, Client, GuildMember, ChannelType } from 'discord.js';
import { getConfig, setConfig } from 'utils/storage';
import { hasManagerAccess } from 'utils/permissions';
import { restartScheduler } from 'utils/scheduler';
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
            .setName('manager-role')
            .setDescription('Set the role that can manage the game roster')
            .addRoleOption(opt => opt
                .setName('role')
                .setDescription('Manager role')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('show')
            .setDescription('Show the current configuration')),

    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        if (!hasManagerAccess(interaction.member as GuildMember)) {
            return interaction.reply({ content: 'You need the manager role (or admin) to do that.', flags: MessageFlags.Ephemeral });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'show') {
            const channelId = getConfig('poll_channel_id');
            const roleId    = getConfig('manager_role_id');
            const size      = getConfig('poll_size');
            const hour      = getConfig('poll_hour_utc');
            const duration  = getConfig('poll_duration_hours');
            return interaction.reply({
                content: [
                    '**Current Config**',
                    `Poll channel: ${channelId ? `<#${channelId}>` : '_not set_'}`,
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
            setConfig('poll_channel_id', channel.id);
            return interaction.reply({ content: `Poll channel set to ${channel}.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'poll-size') {
            const count = interaction.options.getInteger('count', true);
            setConfig('poll_size', count);
            return interaction.reply({ content: `Poll size set to **${count}** games.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'poll-time') {
            const hour = interaction.options.getInteger('hour', true);
            setConfig('poll_hour_utc', hour);
            restartScheduler(client);
            return interaction.reply({ content: `Poll time set to **${hour}:00 UTC** every Monday. Scheduler restarted.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'poll-duration') {
            const hours = interaction.options.getInteger('hours', true);
            setConfig('poll_duration_hours', hours);
            return interaction.reply({ content: `Poll duration set to **${hours}** hours.`, flags: MessageFlags.Ephemeral });
        }

        if (sub === 'manager-role') {
            const role = interaction.options.getRole('role', true);
            setConfig('manager_role_id', role.id);
            return interaction.reply({ content: `Manager role set to ${role}.`, flags: MessageFlags.Ephemeral });
        }
    },
};

export default command;
