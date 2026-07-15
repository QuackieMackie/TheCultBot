import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction, AutocompleteInteraction, GuildMember } from 'discord.js';
import {
    validateGameName,
    saveNewGame,
    deleteGame,
    getGameByName,
    getGamesInGroup,
    getActiveGames,
    getGroupByName,
    saveGroup,
    updateGroup,
} from 'utils/storage';
import { createGroupResources, quarantineGroupResources, reviveGroupResources } from 'utils/gameResources';
import { resolveGameColour } from 'utils/format';
import { hasManagerAccess } from 'utils/permissions';
import type { CommandModule, Game } from 'types';

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
        const focused = interaction.options.getFocused().toLowerCase();
        const matches = getActiveGames()
            .filter(g => g.name.toLowerCase().includes(focused))
            .slice(0, 25)
            .map(g => ({ name: g.name, value: g.name }));
        await interaction.respond(matches);
    },

    async execute(interaction: ChatInputCommandInteraction) {
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
    const games = getActiveGames();
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
    const name        = interaction.options.getString('name', true).trim();
    const groupName   = interaction.options.getString('group', true).trim();
    const playerCount = interaction.options.getInteger('player-count', true);

    try {
        validateGameName(name);
    } catch (err) {
        return interaction.reply({ content: err instanceof Error ? err.message : 'An error occurred.', flags: MessageFlags.Ephemeral });
    }

    const guild = interaction.guild;
    if (!guild) {
        return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    const record: Game = { name, addedBy: interaction.user.username, addedAt: new Date().toISOString(), group: groupName, playerCount, pollAppearances: 0 };
    const existing     = getGroupByName(groupName);

    if (existing && !existing.quarantined) {
        record.group = existing.name;
        saveNewGame(record);
        return interaction.reply({ content: `**${name}** added to the existing **${existing.name}** group (joins <@&${existing.roleId}>). Resource options were ignored.` });
    }

    await interaction.deferReply();

    try {
        if (existing && existing.quarantined) {
            const roleId = await reviveGroupResources(guild, existing);
            updateGroup(existing.name, { roleId, quarantined: false, quarantinedAt: undefined });
            record.group = existing.name;
            saveNewGame(record);
            return interaction.editReply({ content: `**${name}** added and the **${existing.name}** group was revived (role <@&${roleId}> re-created, channels restored).` });
        }

        const roleName  = interaction.options.getString('role')?.trim();
        const textName   = interaction.options.getString('text-channel')?.trim();
        const voiceName  = interaction.options.getString('voice-channel')?.trim();
        const colourInput = interaction.options.getString('role-colour')?.trim() || 'blurple';

        if (!roleName || !textName || !voiceName) {
            return interaction.editReply({ content: `The group **${groupName}** doesn't exist yet, so \`role\`, \`text-channel\` and \`voice-channel\` are required to create it.` });
        }

        let colour: number;
        try {
            colour = resolveGameColour(colourInput);
        } catch (err) {
            return interaction.editReply({ content: err instanceof Error ? err.message : 'Invalid colour.' });
        }

        const group = await createGroupResources(guild, { groupName, roleName, colour, textName, voiceName });
        saveGroup(group);
        record.group = group.name;
        saveNewGame(record);

        return interaction.editReply({
            content: `**${name}** added. Created group **${group.name}** with role <@&${group.roleId}>, <#${group.textChannelId}> and voice channel.`,
        });
    } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : 'An error occurred.';
        return interaction.editReply({ content: `Failed to add the game: ${message}` });
    }
}

async function handleRemove(interaction: ChatInputCommandInteraction) {
    const name = interaction.options.getString('name', true).trim();
    const game = getGameByName(name);

    if (!game) {
        return interaction.reply({ content: `No game called **${name}** found in the roster.`, flags: MessageFlags.Ephemeral });
    }

    const guild = interaction.guild;
    if (!guild) {
        return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();
    deleteGame(game.name);

    const remaining = getGamesInGroup(game.group);
    if (remaining.length > 0) {
        return interaction.editReply({ content: `**${game.name}** removed. The **${game.group}** group stays active (${remaining.length} game(s) left).` });
    }

    const group = getGroupByName(game.group);
    if (group && !group.quarantined) {
        try {
            await quarantineGroupResources(guild, group);
            updateGroup(group.name, { quarantined: true, quarantinedAt: new Date().toISOString(), roleId: '' });
            return interaction.editReply({ content: `**${game.name}** removed. The **${group.name}** group had no games left, so its channels were quarantined and the role deleted.` });
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : 'An error occurred.';
            return interaction.editReply({ content: `**${game.name}** removed, but quarantining the **${group.name}** group failed: ${message}` });
        }
    }

    return interaction.editReply({ content: `**${game.name}** removed.` });
}

export default command;
