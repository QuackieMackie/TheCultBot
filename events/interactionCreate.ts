import { Events, Interaction, MessageFlags } from 'discord.js';
import type { EventModule, CommandModule } from 'types';

const event: EventModule = {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction) {
        if (!interaction.isChatInputCommand()) return;

        const commands = interaction.client.commands as import('discord.js').Collection<string, CommandModule>;
        const command  = commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction, interaction.client);
        } catch (err) {
            console.error(err);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'Something went wrong running that command.', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: 'Something went wrong running that command.', flags: MessageFlags.Ephemeral });
            }
        }
    },
};

export default event;
