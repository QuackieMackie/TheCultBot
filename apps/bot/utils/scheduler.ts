import cron, { ScheduledTask } from 'node-cron';
import { Client } from 'discord.js';
import { getConfig } from '@thecult/shared';
import { runWeeklyPoll } from 'utils/pollRunner';

let task: ScheduledTask | null = null;

export function startScheduler(client: Client): void {
    task = cron.schedule('0 * * * 1', () => {
        const hour = new Date().getUTCHours();
        for (const guildId of client.guilds.cache.keys()) {
            if (getConfig(guildId, 'poll_auto_enabled') !== 'true') continue;
            if ((parseInt(getConfig(guildId, 'poll_hour_utc'), 10) || 9) !== hour) continue;
            console.log(`Cron fired: running weekly poll for guild ${guildId}...`);
            runWeeklyPoll(client, guildId, { weighted: true }).catch(console.error);
        }
    }, { timezone: 'UTC' });

    console.log('Scheduler started, checking hourly on Mondays (UTC) for guilds due a poll.');
}

export function stopScheduler(): void {
    if (task) task.stop();
    task = null;
}
