import cron, { ScheduledTask } from 'node-cron';
import { Client } from 'discord.js';
import { getConfig } from 'utils/storage';
import { runWeeklyPoll } from 'utils/pollRunner';

let task: ScheduledTask | null = null;

export function startScheduler(client: Client): void {
    const hour       = getConfig('poll_hour_utc') || '9';
    const expression = `0 ${hour} * * 1`;

    task = cron.schedule(expression, () => {
        console.log('Cron fired: running weekly poll...');
        runWeeklyPoll(client).catch(console.error);
    }, { timezone: 'UTC' });

    console.log(`Scheduler started, weekly poll at ${hour}:00 UTC every Monday.`);
}

export function restartScheduler(client: Client): void {
    if (task) task.stop();
    startScheduler(client);
}
