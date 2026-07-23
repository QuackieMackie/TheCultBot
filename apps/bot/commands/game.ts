import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction, AutocompleteInteraction, GuildMember } from 'discord.js';
import { getActiveGames, type Game } from '@thecult/shared';
import { addGame, removeGame } from 'utils/gameService';
import { hasManagerAccess } from 'utils/permissions';
import type { CommandModule } from 'types';

const command: CommandModule = {
    data: new SlashCommandBuilder()
        .setName('game')
        .setDescription('Manage the game roster')
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a game (creating or joining a group of shared channels)')
            .addStringOption(opt => opt
                .setName('name')
                .setDescription('Game name')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('group')
                .setDescription('Group/category the game belongs to (reused if it already exists)')
                .setRequired(true))
            .addIntegerOption(opt => opt
                .setName('player-count')
                .setDescription('Members of the group role needed for this game to enter the auto poll')
                .setMinValue(1)
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('role')
                .setDescription('Access role name (only used when creating a new group)'))
            .addStringOption(opt => opt
                .setName('role-colour')
                .setDescription('Role colour: a name like "red" or a hex code like #ED4245 (new group only)'))
            .addStringOption(opt => opt
                .setName('text-channel')
                .setDescription('Text channel name (only used when creating a new group)'))
            .addStringOption(opt => opt
                .setName('voice-channel')
                .setDescription('Voice channel name (only used when creating a new group)')))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove a game (its group is quarantined once its last game is gone)')
            .addStringOption(opt => opt
                .setName('name')
                .setDescription('Game name')
                .setRequired(true)
                .setAutocomplete(true)))
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('List all games in the roster')),

    async autocomplete(interaction: AutocompleteInteraction) {
        if (!interaction.guildId) return interaction.respond([]);
        const focused = interaction.options.getFocused().toLowerCase();
        const matches = getActiveGames(interaction.guildId)
            .filter(g => g.name.toLowerCase().includes(focused))
            .slice(0, 25)
            .map(g => ({ name: g.name, value: g.name }));
        await interaction.respond(matches);
    },

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.guildId) {
            return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            return handleList(interaction);
        }

        if (!hasManagerAccess(interaction.member as GuildMember)) {
            return interaction.reply({ content: 'You need the manager role (or admin) to do that.', flags: MessageFlags.Ephemeral });
        }

        if (sub === 'add')    return handleAdd(interaction);
        if (sub === 'remove') return handleRemove(interaction);
    },
};

function handleList(interaction: ChatInputCommandInteraction) {
    const games = getActiveGames(interaction.guildId!);
    if (games.length === 0) {
        return interaction.reply({ content: 'The roster is empty. Add some games with `/game add`.', flags: MessageFlags.Ephemeral });
    }

    const byGroup = new Map<string, Game[]>();
    for (const g of games) {
        const list = byGroup.get(g.group) ?? [];
        list.push(g);
        byGroup.set(g.group, list);
    }

    const sections = [...byGroup.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([group, list]) => {
            const lines = list.map(g => `  • ${g.name} (${g.playerCount})`).join('\n');
            return `**${group}**\n${lines}`;
        });

    const body      = sections.join('\n');
    const truncated = body.length > 1800;
    const content   = `**Game Roster (${games.length})**\n${truncated ? body.slice(0, 1800) + '\n...and more' : body}`;
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function handleAdd(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) {
        return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    try {
        const { game, group, outcome } = await addGame(guild, {
            name:         interaction.options.getString('name', true),
            group:        interaction.options.getString('group', true),
            playerCount:  interaction.options.getInteger('player-count', true),
            addedBy:      interaction.user.username,
            roleName:     interaction.options.getString('role') ?? undefined,
            roleColour:   interaction.options.getString('role-colour') ?? undefined,
            textChannel:  interaction.options.getString('text-channel') ?? undefined,
            voiceChannel: interaction.options.getString('voice-channel') ?? undefined,
        });

        const content =
            outcome === 'joined'  ? `**${game.name}** added to the existing **${group.name}** group (joins <@&${group.roleId}>). Resource options were ignored.`
          : outcome === 'revived' ? `**${game.name}** added and the **${group.name}** group was revived (role <@&${group.roleId}> re-created, channels restored).`
          :                         `**${game.name}** added. Created group **${group.name}** with role <@&${group.roleId}>, <#${group.textChannelId}> and voice channel.`;

        return interaction.editReply({ content });
    } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : 'An error occurred.';
        return interaction.editReply({ content: `Failed to add the game: ${message}` });
    }
}

async function handleRemove(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) {
        return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    try {
        const { removed, group, remaining, quarantined } = await removeGame(guild, interaction.options.getString('name', true));

        const content =
            remaining > 0  ? `**${removed}** removed. The **${group}** group stays active (${remaining} game(s) left).`
          : quarantined    ? `**${removed}** removed. The **${quarantined}** group had no games left, so its channels were quarantined and the role deleted.`
          :                  `**${removed}** removed.`;

        return interaction.editReply({ content });
    } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : 'An error occurred.';
        return interaction.editReply({ content: `Failed to remove the game: ${message}` });
    }
}

export default command;
