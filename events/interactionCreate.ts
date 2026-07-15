import { Events, Interaction, MessageFlags } from 'discord.js';
import type { EventModule, CommandModule } from 'types';
import { handleRoleBoardInteraction } from 'utils/roleBoard';

const event: EventModule = {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction) {
        const commands = interaction.client.commands as import('discord.js').Collection<string, CommandModule>;

        if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('roleboard:')) {
            await handleRoleBoardInteraction(interaction).catch(console.error);
            return;
        }

        if (interaction.isAutocomplete()) {
            const command = commands.get(interaction.commandName);
            if (command?.autocomplete) {
                await command.autocomplete(interaction).catch(console.error);
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = commands.get(interaction.commandName);
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
