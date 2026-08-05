import cron, { ScheduledTask } from 'node-cron';
import { Client } from 'discord.js';
import { getConfig } from '@thecult/shared';
import { runWeeklyPoll } from 'utils/pollRunner';
import { ALERT_WEEKLY_POLL, raiseAlert, resolveAlert } from 'utils/alerts';
import { logger } from 'utils/logger';

const log = logger('scheduler');

let task: ScheduledTask | null = null;

export function startScheduler(client: Client): void {
    task = cron.schedule('0 * * * 1', () => {
        const hour = new Date().getUTCHours();
        for (const guildId of client.guilds.cache.keys()) {
            if (getConfig(guildId, 'poll_auto_enabled') !== 'true') continue;
            if ((parseInt(getConfig(guildId, 'poll_hour_utc'), 10) || 9) !== hour) continue;
            log.info('Cron fired, running weekly poll', { guild: guildId, hour });
            runWeeklyPoll(client, guildId, { weighted: true })
                .then(() => resolveAlert(guildId, ALERT_WEEKLY_POLL))
                .catch(err => {
                    log.error('Weekly poll failed', { guild: guildId, err });
                    const reason = err instanceof Error ? err.message : 'The poll could not be posted.';
                    raiseAlert(guildId, ALERT_WEEKLY_POLL, 'poll', `This week's poll was not posted. ${reason}`, err);
                });
        }
    }, { timezone: 'UTC' });

    log.info('Scheduler started, checking hourly on Mondays (UTC) for guilds due a poll.');
}

export function stopScheduler(): void {
    if (task) task.stop();
    task = null;
}
