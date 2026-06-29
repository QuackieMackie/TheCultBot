import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import fs   from 'fs';
import path from 'path';
import { initStorage } from 'utils/storage';
import { startScheduler } from 'utils/scheduler';
import type { CommandModule, EventModule } from 'types';

declare module 'discord.js' {
    interface Client {
        commands: Collection<string, CommandModule>;
    }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const command: CommandModule = require(path.join(commandsPath, file)).default;
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
    const event: EventModule = require(path.join(eventsPath, file)).default;
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args).catch(console.error));
    } else {
        client.on(event.name, (...args) => event.execute(...args).catch(console.error));
    }
}

initStorage();
startScheduler(client);
client.login(process.env.DISCORD_TOKEN).catch(console.error);
