/**
 * Guild audit trail: who changed what, surfaced on the dashboard.
 *
 * The bot is the sole writer of guild data, so every mutation passes through here whether it
 * came from a slash command or the dashboard. Entries are a recent history for managers, not
 * a security log: storage caps the list and drops the oldest.
 */

import { saveAudit } from '@thecult/shared';
import { logger } from 'utils/logger';

const log = logger('audit');

export type AuditAction =
    | 'game.added'
    | 'game.imported'
    | 'game.edited'
    | 'game.removed'
    | 'group.edited'
    | 'config.set'
    | 'poll.run';

export interface AuditActor {
    id:   string;
    name: string;
}

// Takes anything carrying a Discord user, so a GuildMember and an interaction both fit.
export function actorOf(source: { user: { id: string; username: string } }): AuditActor {
    return { id: source.user.id, name: source.user.username };
}

/**
 * Records one change against a guild. Call it only after the change has actually landed.
 *
 * @param target What the change was about: a game name, a group name, or a config key.
 * @param detail Short human-readable summary shown under the entry. Empty is fine.
 * @returns Nothing, and it never throws: a failed write must not undo a change that worked.
 */
export function recordAudit(
    guildId: string,
    actor:   AuditActor,
    action:  AuditAction,
    target:  string,
    detail:  string,
    source:  'dashboard' | 'command',
): void {
    try {
        saveAudit(guildId, { actorId: actor.id, actor: actor.name, action, target, detail, source });
        log.debug('Change recorded', { guild: guildId, action, target, by: actor.name, source });
    } catch (err) {
        log.error('Could not record the change', { guild: guildId, action, target, err });
    }
}
