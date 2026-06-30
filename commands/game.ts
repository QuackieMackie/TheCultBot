import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { addGame, removeGame, listGames } from 'utils/storage';
import { hasManagerAccess } from 'utils/permissions';
import type { CommandModule } from 'types';

const command: CommandModule = {
    data: new SlashCommandBuilder()
        .setName('game')
        .setDescription('Manage the game roster')
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a game to the roster')
            .addStringOption(opt => opt
                .setName('name')
                .setDescription('Game name')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove a game from the roster')
            .addStringOption(opt => opt
                .setName('name')
                .setDescription('Game name')
                .setRequired(true)
                .setAutocomplete(true)))
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('List all games in the roster')),

    async autocomplete(interaction: AutocompleteInteraction) {
        const sub     = interaction.options.getSubcommand();
        const focused = interaction.options.getFocused().toLowerCase();

        if (sub === 'remove') {
            const matches = listGames()
                .filter(g => g.name.toLowerCase().includes(focused))
                .slice(0, 25)
                .map(g => ({ name: g.name, value: g.name }));
            await interaction.respond(matches);
        }
    },

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            const games = listGames();
            if (games.length === 0) {
                return interaction.reply({ content: 'The roster is empty. Add some games with `/game add`.', flags: MessageFlags.Ephemeral });
            }
            const lines     = games.map((g, i) => `${i + 1}. ${g.name}`);
            const body      = lines.join('\n');
            const truncated = body.length > 1800;
            const content   = `**Game Roster (${games.length})**\n${truncated ? body.slice(0, 1800) + '\n...and more' : body}`;
            return interaction.reply({ content, flags: MessageFlags.Ephemeral });
        }

        if (!hasManagerAccess(interaction.member as import('discord.js').GuildMember)) {
            return interaction.reply({ content: 'You need the manager role (or admin) to do that.', flags: MessageFlags.Ephemeral });
        }

        const name = interaction.options.getString('name', true).trim();

        if (sub === 'add') {
            try {
                addGame(name, interaction.user.username);
                return interaction.reply({ content: `**${name}** added to the roster.` });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'An error occurred.';
                return interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
            }
        }

        if (sub === 'remove') {
            const removed = removeGame(name);
            if (removed === 0) {
                return interaction.reply({ content: `No game called **${name}** found in the roster.`, flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ content: `**${name}** removed from the roster.` });
        }
    },
};

export default command;
