import { Events, Interaction, MessageFlags } from 'discord.js';
import type { EventModule, CommandModule } from 'types';
import { handleRoleBoardInteraction } from 'utils/roleBoard';
import { logger } from 'utils/logger';

const log = logger('interaction');

const event: EventModule = {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction) {
        const commands = interaction.client.commands as import('discord.js').Collection<string, CommandModule>;

        if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('roleboard:')) {
            await handleRoleBoardInteraction(interaction)
                .catch(err => log.error('Role board interaction failed', { guild: interaction.guildId, user: interaction.user.id, err }));
            return;
        }

        if (interaction.isAutocomplete()) {
            const command = commands.get(interaction.commandName);
            if (command?.autocomplete) {
                await command.autocomplete(interaction)
                    .catch(err => log.error('Autocomplete failed', { command: interaction.commandName, err }));
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = commands.get(interaction.commandName);
        if (!command) return;

        const sub = interaction.options.getSubcommand(false);
        log.info('Command', {
            command: sub ? `${interaction.commandName} ${sub}` : interaction.commandName,
            guild:   interaction.guildId,
            user:    interaction.user.username,
        });

        try {
            await command.execute(interaction, interaction.client);
        } catch (err) {
            log.error('Command failed', { command: interaction.commandName, guild: interaction.guildId, err });
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'Something went wrong running that command.', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: 'Something went wrong running that command.', flags: MessageFlags.Ephemeral });
            }
        }
    },
};

export default event;
