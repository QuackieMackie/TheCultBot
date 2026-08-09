/**
 * Guild alerts: failures the bot hit while working unattended, surfaced on the dashboard.
 *
 * A slash command or a dashboard request can report its own failure to whoever triggered it.
 * Scheduled polls and the boot-time role board refresh have nobody watching, so they record
 * an alert instead and the guild's managers see it next time they open the dashboard.
 */

import { DiscordAPIError } from 'discord.js';
import { saveAlert, clearAlert } from '@thecult/shared';
import { logger } from 'utils/logger';

const log = logger('alerts');

export const ALERT_ROLE_BOARD   = 'role_board_post';
export const ALERT_WEEKLY_POLL  = 'weekly_poll';
export const ALERT_POLL_RESULTS = 'poll_results';

// Suffixed with the group name, so two groups failing to archive stay two separate alerts.
export const ALERT_GROUP_QUARANTINE = 'group_quarantine';

/**
 * Turns a Discord rejection into wording a server admin can act on.
 *
 * @param err     The caught error.
 * @param channel Channel name the failed call was aimed at, used in the message.
 * @returns The fallback text for anything that is not a recognised permission or access error.
 */
export function describeDiscordError(err: unknown, channel: string, fallback: string): string {
    if (err instanceof DiscordAPIError) {
        if (err.code === 50013) return `I do not have permission to post in #${channel}. Give my role View Channel and Send Messages there, then try again.`;
        if (err.code === 50001) return `I cannot see #${channel} any more. Check my role still has View Channel there.`;
        if (err.code === 10003) return `#${channel} no longer exists. Pick a different channel.`;
    }
    return fallback;
}

/**
 * Records an alert against a guild and logs it.
 *
 * @param key     Identifies the recurring condition; re-raising refreshes the existing alert.
 * @param message Admin-facing wording, shown verbatim on the dashboard.
 * @param err     Underlying error, stored as detail for diagnosis.
 */
export function raiseAlert(guildId: string, key: string, scope: string, message: string, err?: unknown): void {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : err === undefined ? '' : String(err);
    log.warn('Alert raised', { guild: guildId, key, message });
    saveAlert(guildId, { key, scope, message, detail });
}

// Clears an alert once its condition works again. No-op when nothing was raised.
export function resolveAlert(guildId: string, key: string): void {
    clearAlert(guildId, key);
}
