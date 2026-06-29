import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction, Client, GuildMember } from 'discord.js';
import { hasManagerAccess } from 'utils/permissions';
import { runWeeklyPoll } from 'utils/pollRunner';
import type { CommandModule } from 'types';

const command: CommandModule = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Poll commands')
        .addSubcommand(sub => sub
            .setName('now')
            .setDescription('Manually trigger the weekly game poll right now')),

    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        if (!hasManagerAccess(interaction.member as GuildMember)) {
            return interaction.reply({ content: 'You need the manager role (or admin) to do that.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            await runWeeklyPoll(client);
            await interaction.editReply({ content: '✅ Poll posted!' });
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : 'An error occurred.';
            await interaction.editReply({ content: `Failed to post poll: ${message}` });
        }
    },
};

export default command;
