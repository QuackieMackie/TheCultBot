import cron, { ScheduledTask } from 'node-cron';
import { Client } from 'discord.js';
import { getConfig } from 'utils/storage';
import { runWeeklyPoll } from 'utils/pollRunner';

let task: ScheduledTask | null = null;

export function startScheduler(client: Client): void {
    const hour       = getConfig('poll_hour_utc') || '9';
    const expression = `0 ${hour} * * 1`;

    task = cron.schedule(expression, () => {
        if (getConfig('poll_auto_enabled') !== 'true') {
            console.log('Cron fired but automatic polls are disabled. Skipping.');
            return;
        }
        console.log('Cron fired: running weekly poll...');
        runWeeklyPoll(client).catch(console.error);
    }, { timezone: 'UTC' });

    const state = getConfig('poll_auto_enabled') === 'true' ? 'enabled' : 'disabled';
    console.log(`Scheduler started, weekly poll at ${hour}:00 UTC every Monday (automatic polls ${state}).`);
}

export function restartScheduler(client: Client): void {
    if (task) task.stop();
    startScheduler(client);
}
