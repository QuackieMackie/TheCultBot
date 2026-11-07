import type { GuildDb } from './db';
import type { Alert, AuditEntry, Game, Group, PollKind, PollRun, PollRunAnswer } from './types';

// The import uses OR IGNORE so one duplicate cannot fail the whole transaction.
export type Conflict = '' | 'OR IGNORE';

export interface GameRow {
    name:             string;
    added_by:         string;
    added_at:         string;
    group_name:       string;
    player_count:     number;
    last_polled_at:   string | null;
    poll_appearances: number;
    poll_wins:        number;
}

export interface GroupRow {
    name:             string;
    role_id:          string;
    role_name:        string;
    role_colour:      string;
    category_id:      string;
    text_channel_id:  string;
    voice_channel_id: string;
    quarantined:      number;
    quarantined_at:   string | null;
    adopted:          number;
}

export interface AlertRow {
    id:       string;
    key:      string;
    scope:    string;
    message:  string;
    detail:   string;
    first_at: string;
    last_at:  string;
    count:    number;
}

export interface AuditRow {
    id:       string;
    at:       string;
    actor_id: string;
    actor:    string;
    action:   string;
    target:   string;
    detail:   string;
    source:   string;
}

export interface PollRow {
    id:          string;
    message_id:  string;
    channel_id:  string;
    kind:        string;
    posted_at:   string;
    closes_at:   string;
    recorded_at: string | null;
    abandoned:   number;
}

export function toGame(row: GameRow): Game {
    return {
        name:            row.name,
        addedBy:         row.added_by,
        addedAt:         row.added_at,
        group:           row.group_name,
        playerCount:     row.player_count,
        lastPolledAt:    row.last_polled_at ?? undefined,
        pollAppearances: row.poll_appearances,
        pollWins:        row.poll_wins,
    };
}

export function toGroup(row: GroupRow): Group {
    return {
        name:           row.name,
        roleId:         row.role_id,
        roleName:       row.role_name,
        roleColour:     row.role_colour,
        categoryId:     row.category_id,
        textChannelId:  row.text_channel_id,
        voiceChannelId: row.voice_channel_id,
        quarantined:    row.quarantined === 1,
        quarantinedAt:  row.quarantined_at ?? undefined,
        adopted:        row.adopted === 1,
    };
}

export function toAlert(row: AlertRow): Alert {
    return {
        id:      row.id,
        key:     row.key,
        scope:   row.scope,
        message: row.message,
        detail:  row.detail,
        firstAt: row.first_at,
        lastAt:  row.last_at,
        count:   row.count,
    };
}

export function toAudit(row: AuditRow): AuditEntry {
    return {
        id:      row.id,
        at:      row.at,
        actorId: row.actor_id,
        actor:   row.actor,
        action:  row.action,
        target:  row.target,
        detail:  row.detail,
        source:  row.source === 'command' ? 'command' : 'dashboard',
    };
}

export function insertGame(db: GuildDb, game: Game, conflict: Conflict = ''): void {
    db.prepare(`
        INSERT ${conflict} INTO games (name, added_by, added_at, group_name, player_count, last_polled_at, poll_appearances, poll_wins)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(game.name, game.addedBy, game.addedAt, game.group, game.playerCount, game.lastPolledAt ?? null, game.pollAppearances, game.pollWins);
}

export function groupParams(group: Group): unknown[] {
    return [
        group.name,
        group.roleId,
        group.roleName,
        group.roleColour,
        group.categoryId,
        group.textChannelId,
        group.voiceChannelId,
        group.quarantined ? 1 : 0,
        group.quarantinedAt ?? null,
        group.adopted ? 1 : 0,
    ];
}

export function insertGroup(db: GuildDb, group: Group, conflict: Conflict = ''): void {
    db.prepare(`
        INSERT ${conflict} INTO game_groups (name, role_id, role_name, role_colour, category_id, text_channel_id, voice_channel_id, quarantined, quarantined_at, adopted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...groupParams(group));
}

export function insertAlert(db: GuildDb, alert: Alert, conflict: Conflict = ''): void {
    db.prepare(`
        INSERT ${conflict} INTO alerts (id, key, scope, message, detail, first_at, last_at, count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(alert.id, alert.key, alert.scope, alert.message, alert.detail, alert.firstAt, alert.lastAt, alert.count);
}

export function insertAudit(db: GuildDb, entry: AuditEntry, conflict: Conflict = ''): void {
    db.prepare(`
        INSERT ${conflict} INTO audit (id, at, actor_id, actor, action, target, detail, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.at, entry.actorId, entry.actor, entry.action, entry.target, entry.detail, entry.source);
}

export function replacePollAnswers(db: GuildDb, pollId: string, answers: PollRunAnswer[], winners: string[]): void {
    db.prepare('DELETE FROM poll_answers WHERE poll_id = ?').run(pollId);

    const addAnswer = db.prepare('INSERT OR IGNORE INTO poll_answers (poll_id, answer_id, game, votes, is_winner) VALUES (?, ?, ?, ?, ?)');
    const addVote   = db.prepare('INSERT OR IGNORE INTO poll_votes (poll_id, answer_id, user_id) VALUES (?, ?, ?)');
    for (const answer of answers) {
        addAnswer.run(pollId, answer.answerId, answer.game, answer.votes, winners.includes(answer.game) ? 1 : 0);
        for (const voter of answer.voters) addVote.run(pollId, answer.answerId, voter);
    }
}

export function insertPollRun(db: GuildDb, run: PollRun): void {
    const result = db.prepare(`
        INSERT OR IGNORE INTO polls (id, message_id, channel_id, kind, posted_at, closes_at, recorded_at, abandoned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(run.id, run.messageId, run.channelId, run.kind, run.postedAt, run.closesAt, run.recordedAt ?? null, run.abandoned ? 1 : 0);
    if (result.changes > 0) replacePollAnswers(db, run.id, run.answers, run.winners);
}

export function toPollRuns(db: GuildDb, rows: PollRow[]): PollRun[] {
    const answers = db.prepare('SELECT answer_id, game, votes, is_winner FROM poll_answers WHERE poll_id = ? ORDER BY answer_id');
    const votes   = db.prepare('SELECT user_id FROM poll_votes WHERE poll_id = ? AND answer_id = ? ORDER BY rowid');

    return rows.map(row => {
        const answerRows = answers.all(row.id) as { answer_id: number; game: string; votes: number; is_winner: number }[];
        return {
            id:         row.id,
            messageId:  row.message_id,
            channelId:  row.channel_id,
            kind:       row.kind as PollKind,
            postedAt:   row.posted_at,
            closesAt:   row.closes_at,
            recordedAt: row.recorded_at ?? undefined,
            abandoned:  row.abandoned === 1,
            answers:    answerRows.map(a => ({
                game:     a.game,
                answerId: a.answer_id,
                votes:    a.votes,
                voters:   (votes.all(row.id, a.answer_id) as { user_id: string }[]).map(v => v.user_id),
            })),
            winners: answerRows.filter(a => a.is_winner === 1).map(a => a.game),
        };
    });
}
