import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import fs   from 'fs';
import path from 'path';
import { closeAllDatabases, initStorage } from '@thecult/shared';
import { startScheduler } from 'utils/scheduler';
import { startHeartbeat } from 'utils/health';
import { startInternalApi } from 'utils/internalApi';
import { logger } from 'utils/logger';
import type { CommandModule, EventModule } from 'types';

const log = logger('bot');

declare module 'discord.js' {
    interface Client {
        commands: Collection<string, CommandModule>;
    }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const command: CommandModule = require(path.join(commandsPath, file)).default;
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
    const event: EventModule = require(path.join(eventsPath, file)).default;
    const onError = (err: unknown) => log.error('Event handler failed', { event: event.name, err });
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args).catch(onError));
    } else {
        client.on(event.name, (...args) => event.execute(...args).catch(onError));
    }
}

log.info('Starting', { commands: client.commands.size, logLevel: process.env.LOG_LEVEL || 'info' });

initStorage();
startScheduler(client);
startHeartbeat(client);
startInternalApi(client).catch(err => log.error('Internal API failed to start', { err }));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        log.info('Shutting down', { signal });
        client.destroy();
        closeAllDatabases();
        process.exit(0);
    });
}

process.on('unhandledRejection', err => log.error('Unhandled rejection', { err }));
process.on('uncaughtException',  err => log.error('Uncaught exception',  { err }));

client.login(process.env.DISCORD_TOKEN).catch(err => log.error('Login failed', { err }));
