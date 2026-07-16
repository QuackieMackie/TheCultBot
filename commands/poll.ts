import {
    SlashCommandBuilder,
    MessageFlags,
    ChatInputCommandInteraction,
    Client,
    GuildMember,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType,
} from 'discord.js';
import { hasManagerAccess } from 'utils/permissions';
import { runWeeklyPoll } from 'utils/pollRunner';
import { listGames } from 'utils/storage';
import type { CommandModule } from 'types';

const command: CommandModule = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Poll commands')
        .addSubcommand(sub => sub
            .setName('now')
            .setDescription('Manually trigger the weekly game poll right now')
            .addBooleanOption(opt => opt
                .setName('pick')
                .setDescription('Choose specific games from a menu instead of a random selection'))),

    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        if (!interaction.guildId) {
            return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        }
        if (!hasManagerAccess(interaction.member as GuildMember)) {
            return interaction.reply({ content: 'You need the manager role (or admin) to do that.', flags: MessageFlags.Ephemeral });
        }

        const guildId = interaction.guildId;
        const pick    = interaction.options.getBoolean('pick') ?? false;

        if (!pick) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                await runWeeklyPoll(client, guildId);
                await interaction.editReply({ content: 'Poll posted!' });
            } catch (err) {
                console.error(err);
                const message = err instanceof Error ? err.message : 'An error occurred.';
                await interaction.editReply({ content: `Failed to post poll: ${message}` });
            }
            return;
        }

        const roster = listGames(guildId).filter(g => g.name?.trim());
        if (roster.length === 0) {
            return interaction.reply({ content: 'The roster is empty. Add some games with `/game add` first.', flags: MessageFlags.Ephemeral });
        }

        const options   = roster.slice(0, 25).map(g => ({ label: g.name.slice(0, 100), value: g.name.slice(0, 100) }));
        const maxValues = Math.min(options.length, 10);

        const menu = new StringSelectMenuBuilder()
            .setCustomId('poll_pick')
            .setPlaceholder('Select the games for this poll...')
            .setMinValues(1)
            .setMaxValues(maxValues);
        menu.addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

        const note = roster.length > 25 ? `\n_Showing the first 25 of ${roster.length} games._` : '';
        await interaction.reply({
            content: `Select up to **${maxValues}** game(s) for the poll, then it will be posted:${note}`,
            components: [row],
            flags: MessageFlags.Ephemeral,
        });
        const reply = await interaction.fetchReply();

        let selection;
        try {
            selection = await reply.awaitMessageComponent({
                componentType: ComponentType.StringSelect,
                filter: i => i.user.id === interaction.user.id,
                time: 60_000,
            });
        } catch {
            return interaction.editReply({ content: 'Timed out! No games were selected, so no poll was posted.', components: [] });
        }

        try {
            await selection.update({ content: 'Posting poll...', components: [] });
            await runWeeklyPoll(client, guildId, { gameNames: selection.values });
            await interaction.editReply({
                content: `Poll posted with ${selection.values.length} game(s): ${selection.values.join(', ')}`,
            });
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : 'An error occurred.';
            await interaction.editReply({ content: `Failed to post poll: ${message}`, components: [] });
        }
    },
};

export default command;
