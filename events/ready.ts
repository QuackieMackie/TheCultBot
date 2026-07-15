import { Events, Client, REST, Routes } from 'discord.js';
import { ensureBoardMessage } from 'utils/roleBoard';
import type { EventModule, CommandModule } from 'types';

const event: EventModule = {
    name: Events.ClientReady,
    once: true,
    async execute(client: Client) {
        console.log(`Ready! Logged in as ${client.user?.tag}`);

        await ensureBoardMessage(client).catch(err => console.error('Role board refresh failed:', err));

        if (!process.env.CLIENT_ID || !process.env.GUILD_ID) {
            console.warn('Missing CLIENT_ID or GUILD_ID in env -- skipping command sync.');
            return;
        }

        try {
            await syncCommands(client);
        } catch (err) {
            console.error('Command sync failed:', err);
        }
    },
};

async function syncCommands(client: Client): Promise<void> {
    const rest          = new REST().setToken(process.env.DISCORD_TOKEN!);
    const commands      = client.commands as import('discord.js').Collection<string, CommandModule>;
    const localCommands = [...commands.values()].map(c => c.data.toJSON());

    const registered = await rest.get(
        Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.GUILD_ID!)
    ) as Record<string, unknown>[];

    console.log(`Discord has ${registered.length} command(s), locally have ${localCommands.length}.`);

    const localSorted      = JSON.stringify(localCommands.map(normalise).sort(byName));
    const registeredSorted = JSON.stringify(registered.map(normalise).sort(byName));

    if (localSorted === registeredSorted) {
        console.log('Commands up to date, no sync needed.');
        return;
    }

    await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.GUILD_ID!),
        { body: localCommands }
    );

    console.log(`Commands synced (${localCommands.length} registered).`);
}

interface NormalisedCommand {
    name:        unknown;
    description: unknown;
    options:     unknown;
}

function normalise(cmd: unknown): NormalisedCommand {
    const c = cmd as { name: unknown; description: unknown; options?: unknown };
    return { name: c.name, description: c.description, options: c.options ?? [] };
}

function byName(a: NormalisedCommand, b: NormalisedCommand) {
    return String(a.name).localeCompare(String(b.name));
}

export default event;
