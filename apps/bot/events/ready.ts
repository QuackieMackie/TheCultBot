import { Events, Client, REST, Routes } from 'discord.js';
import { ensureBoardMessage } from 'utils/roleBoard';
import { sweepClosedPolls } from 'utils/pollResults';
import { initGuildStorage } from '@thecult/shared';
import { logger } from 'utils/logger';
import type { EventModule, CommandModule } from 'types';

const log = logger('ready');

const event: EventModule = {
    name: Events.ClientReady,
    once: true,
    async execute(client: Client) {
        log.info('Logged in', { user: client.user?.tag, guilds: client.guilds.cache.size });

        for (const guildId of client.guilds.cache.keys()) {
            const { imported, importError } = initGuildStorage(guildId);
            if (imported)    log.info('Imported old JSON data', { guild: guildId, ...imported });
            if (importError) log.error('Could not import old JSON data', { guild: guildId, err: importError });
        }

        await ensureBoardMessage(client).catch(err => log.error('Role board refresh failed', { err }));

        // Catches polls that closed while the bot was down, which the 15 minute tick alone
        // would leave unsettled until it next fired.
        await sweepClosedPolls(client).catch(err => log.error('Poll result sweep failed', { err }));

        if (!process.env.CLIENT_ID) {
            log.warn('Missing CLIENT_ID in env, skipping command sync.');
            return;
        }

        try {
            await syncCommands(client);
        } catch (err) {
            log.error('Command sync failed', { err });
        }
    },
};

async function syncCommands(client: Client): Promise<void> {
    const rest          = new REST().setToken(process.env.DISCORD_TOKEN!);
    const commands      = client.commands as import('discord.js').Collection<string, CommandModule>;
    const localCommands = [...commands.values()].map(c => c.data.toJSON());

    const registered = await rest.get(
        Routes.applicationCommands(process.env.CLIENT_ID!)
    ) as Record<string, unknown>[];

    log.debug('Comparing commands', { registered: registered.length, local: localCommands.length });

    const localSorted      = JSON.stringify(localCommands.map(normalise).sort(byName));
    const registeredSorted = JSON.stringify(registered.map(normalise).sort(byName));

    if (localSorted === registeredSorted) {
        log.info('Commands up to date, no sync needed.', { count: localCommands.length });
        return;
    }

    await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID!),
        { body: localCommands }
    );

    log.info('Commands synced', { count: localCommands.length });
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
