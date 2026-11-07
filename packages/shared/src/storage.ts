import fs from 'fs';
import { randomUUID } from 'crypto';
import { DATA_DIR, closeGuildDb, guildDir, openGuildDb } from './db';
import { importLegacyJson, type ImportSummary } from './legacyImport';
import {
    groupParams,
    insertAudit,
    insertGame,
    insertGroup,
    insertPollRun,
    replacePollAnswers,
    toAlert,
    toAudit,
    toGame,
    toGroup,
    toPollRuns,
    type AlertRow,
    type AuditRow,
    type GameRow,
    type GroupRow,
    type PollRow,
} from './rows';
import type { Alert, AuditEntry, Game, Group, PollRun, PollRunAnswer, StoredConfig } from './types';

export { DATA_DIR, closeAllDatabases } from './db';

// Discord caps poll answer text at 55 characters, so a longer name could never be polled.
export const MAX_GAME_NAME_LENGTH = 55;

// Discord caps message content at 2000 characters.
export const MAX_POLL_MESSAGE_LENGTH = 2000;

const WEIGHT_CAP = 12;
const REST_POLLS = 2;
const WEEK_MS    = 7 * 24 * 60 * 60 * 1000;

// Oldest alerts are dropped past this, so a guild that ignores its dashboard cannot grow the
// table without bound.
const MAX_ALERTS = 25;

// Oldest entries are dropped past this. The trail is a recent history for the dashboard,
// not a permanent record.
const MAX_AUDIT = 100;

// Config values can run to MAX_POLL_MESSAGE_LENGTH, so an untruncated detail would let a
// hundred entries dwarf the rest of a guild's data.
const MAX_AUDIT_DETAIL = 200;

const ALERT_LEGACY_IMPORT = 'legacy_import';

const CONFIG_DEFAULTS: StoredConfig = {
    poll_size:       '5',
    poll_channel_id: '',
    manager_role_id: '',
    poll_hour_utc:         '9',
    poll_duration_hours:   '24',
    poll_auto_enabled:     'true',
    poll_message:          'Weekly Game Vote -- pick what we\'re playing this week!',
    role_board_channel_id: '',
    role_board_message_id: '',
};

function byName<T extends { name: string }>(a: T, b: T): number {
    return a.name.localeCompare(b.name);
}

function readGames(guildId: string): Game[] {
    const rows = openGuildDb(guildId).prepare('SELECT * FROM games').all() as GameRow[];
    return rows.map(toGame).sort(byName);
}

function readGroups(guildId: string): Group[] {
    const rows = openGuildDb(guildId).prepare('SELECT * FROM game_groups').all() as GroupRow[];
    return rows.map(toGroup).sort(byName);
}

// Call once at boot before init-ing guilds.
export function initStorage(): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface GuildStorageInit {
    imported:     ImportSummary | null;
    importError?: unknown;
}

// Returns import failures rather than throwing, so one guild's bad file cannot stop the others.
export function initGuildStorage(guildId: string): GuildStorageInit {
    const db     = openGuildDb(guildId);
    const result: GuildStorageInit = { imported: null };

    try {
        result.imported = importLegacyJson(guildId);
        clearAlert(guildId, ALERT_LEGACY_IMPORT);
    } catch (err) {
        result.importError = err;
        saveAlert(guildId, {
            key:     ALERT_LEGACY_IMPORT,
            scope:   'storage',
            message: 'I could not import this server\'s old data files, so its games and settings are missing. The files are untouched, and I will try again on my next restart.',
            detail:  err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        });
    }

    const seed = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) seed.run(key, value);
    return result;
}

// Removes a guild's entire data directory, so leaving a server takes its data with it.
export function purgeGuildStorage(guildId: string): void {
    closeGuildDb(guildId);
    fs.rmSync(guildDir(guildId), { recursive: true, force: true });
}

export function getMeta(guildId: string, key: string): string | undefined {
    const row = openGuildDb(guildId).prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
}

export function setMeta(guildId: string, key: string, value: string): void {
    openGuildDb(guildId).prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
}

// Throws if the name is empty, too long, or already taken. Call before touching Discord.
export function validateGameName(guildId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
        throw new Error('Game name cannot be empty.');
    }
    if (trimmed.length > MAX_GAME_NAME_LENGTH) {
        throw new Error(`"${trimmed}" is too long (max ${MAX_GAME_NAME_LENGTH} characters).`);
    }
    if (getGameByName(guildId, trimmed)) {
        throw new Error(`"${trimmed}" is already in the roster.`);
    }
}

export function saveNewGame(guildId: string, game: Game): void {
    insertGame(openGuildDb(guildId), game);
}

export function updateGame(guildId: string, name: string, patch: Partial<Game>): void {
    const game = getGameByName(guildId, name);
    if (!game) return;

    const next = { ...game, ...patch };
    const db   = openGuildDb(guildId);
    db.transaction(() => {
        db.prepare(`
            UPDATE games
            SET name = ?, added_by = ?, added_at = ?, group_name = ?, player_count = ?, last_polled_at = ?, poll_appearances = ?, poll_wins = ?
            WHERE name = ?
        `).run(next.name, next.addedBy, next.addedAt, next.group, next.playerCount, next.lastPolledAt ?? null, next.pollAppearances, next.pollWins, game.name);
        // The draw finds a game's last win by name, so a rename must carry its history along.
        if (next.name !== game.name) db.prepare('UPDATE poll_answers SET game = ? WHERE game = ? COLLATE NOCASE').run(next.name, game.name);
    })();
}

export function deleteGame(guildId: string, name: string): number {
    return openGuildDb(guildId).prepare('DELETE FROM games WHERE name = ?').run(name).changes;
}

export function getGameByName(guildId: string, name: string): Game | undefined {
    const row = openGuildDb(guildId).prepare('SELECT * FROM games WHERE name = ?').get(name) as GameRow | undefined;
    return row && toGame(row);
}

export function getGamesInGroup(guildId: string, groupName: string): Game[] {
    const rows = openGuildDb(guildId).prepare('SELECT * FROM games WHERE group_name = ?').all(groupName) as GameRow[];
    return rows.map(toGame).sort(byName);
}

export function listGames(guildId: string): Game[] {
    return readGames(guildId);
}

// Games whose owning group still exists and is not quarantined.
export function getActiveGames(guildId: string): Game[] {
    const active = new Set(getActiveGroups(guildId).map(g => g.name.toLowerCase()));
    return readGames(guildId).filter(g => active.has(g.group.toLowerCase()));
}

export function getRandomGames(guildId: string, n: number): Game[] {
    const games = [...readGames(guildId)];
    for (let i = games.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [games[i], games[j]] = [games[j], games[i]];
    }
    return games.slice(0, n);
}

export interface DrawnGame {
    game:   Game;
    weight: number;
}

export interface PollDraw {
    picked:   DrawnGame[];
    toppedUp: number;
}

// Read from poll history rather than stored on the game, so corrected results apply automatically.
export function getLastWins(guildId: string): Map<string, string> {
    const rows = openGuildDb(guildId).prepare(`
        SELECT a.game, p.posted_at
        FROM poll_answers a JOIN polls p ON p.id = a.poll_id
        WHERE a.is_winner = 1 AND p.abandoned = 0
    `).all() as { game: string; posted_at: string }[];

    const wins = new Map<string, string>();
    for (const row of rows) {
        const key = row.game.toLowerCase();
        if (!wins.has(key) || wins.get(key)! < row.posted_at) wins.set(key, row.posted_at);
    }
    return wins;
}

export function getRestedGames(guildId: string): Set<string> {
    return new Set(listPollRuns(guildId, REST_POLLS).flatMap(run => run.winners.map(name => name.toLowerCase())));
}

function drawWeight(game: Game, lastWins: Map<string, string>, newestBallot: string | undefined, now: number): number {
    const lastWin = lastWins.get(game.name.toLowerCase());
    const weeks   = lastWin ? Math.floor((now - new Date(lastWin).getTime()) / WEEK_MS) : WEIGHT_CAP;
    const weight  = Math.min(Math.max(weeks, 1), WEIGHT_CAP);
    // Halved so a game with no wins cannot sit on every ballot.
    return newestBallot && game.lastPolledAt === newestBallot ? weight / 2 : weight;
}

function drawFrom(entries: DrawnGame[], n: number): DrawnGame[] {
    const remaining = [...entries];
    const picked:   DrawnGame[] = [];

    while (picked.length < n && remaining.length > 0) {
        const total = remaining.reduce((sum, e) => sum + e.weight, 0);
        let   roll  = Math.random() * total;
        let   idx   = remaining.length - 1;
        for (let i = 0; i < remaining.length; i++) {
            roll -= remaining[i].weight;
            if (roll <= 0) { idx = i; break; }
        }
        picked.push(remaining[idx]);
        remaining.splice(idx, 1);
    }

    return picked;
}

export function pickWeightedGames(pool: Game[], n: number, lastWins: Map<string, string>, rested: Set<string>): PollDraw {
    const now          = Date.now();
    const newestBallot = pool.reduce<string | undefined>((newest, g) => (g.lastPolledAt && (!newest || g.lastPolledAt > newest) ? g.lastPolledAt : newest), undefined);
    const entries      = pool.map(game => ({ game, weight: drawWeight(game, lastWins, newestBallot, now) }));
    const isRested     = (e: DrawnGame) => rested.has(e.game.name.toLowerCase());

    const picked = drawFrom(entries.filter(e => !isRested(e)), n);
    // A big tie can rest most of the roster, and the ballot must not come up short.
    const extras = drawFrom(entries.filter(isRested), n - picked.length);
    return { picked: [...picked, ...extras], toppedUp: extras.length };
}

export function gameCount(guildId: string): number {
    const row = openGuildDb(guildId).prepare('SELECT COUNT(*) AS n FROM games').get() as { n: number };
    return row.n;
}

export function getGroupByName(guildId: string, name: string): Group | undefined {
    const row = openGuildDb(guildId).prepare('SELECT * FROM game_groups WHERE name = ?').get(name) as GroupRow | undefined;
    return row && toGroup(row);
}

// Every group, quarantined ones included.
export function listGroups(guildId: string): Group[] {
    return readGroups(guildId);
}

// Includes quarantined groups, so a channel is never adopted into two groups.
export function findGroupByChannel(guildId: string, channelId: string): Group | undefined {
    return readGroups(guildId).find(g => g.textChannelId === channelId || g.voiceChannelId === channelId);
}

export function getActiveGroups(guildId: string): Group[] {
    return readGroups(guildId).filter(g => !g.quarantined);
}

export function saveGroup(guildId: string, group: Group): void {
    const db = openGuildDb(guildId);
    db.transaction(() => {
        db.prepare('DELETE FROM game_groups WHERE name = ?').run(group.name);
        insertGroup(db, group);
    })();
}

export function renameGroup(guildId: string, from: string, to: string): number {
    const db = openGuildDb(guildId);
    return db.transaction(() => {
        const renamed = db.prepare('UPDATE game_groups SET name = ? WHERE name = ?').run(to, from);
        if (renamed.changes === 0) return 0;
        return db.prepare('UPDATE games SET group_name = ? WHERE group_name = ?').run(to, from).changes;
    })();
}

export function updateGroup(guildId: string, name: string, patch: Partial<Group>): void {
    const group = getGroupByName(guildId, name);
    if (!group) return;

    openGuildDb(guildId).prepare(`
        UPDATE game_groups
        SET name = ?, role_id = ?, role_name = ?, role_colour = ?, category_id = ?, text_channel_id = ?, voice_channel_id = ?, quarantined = ?, quarantined_at = ?, adopted = ?
        WHERE name = ?
    `).run(...groupParams({ ...group, ...patch }), group.name);
}

/**
 * Records a problem the bot hit while acting on its own, for the dashboard to show.
 *
 * @param guildId Guild the problem belongs to.
 * @param alert   `key` identifies the recurring condition, not the occurrence.
 * @returns Nothing. An outstanding alert with the same key is refreshed and its count bumped
 *          rather than duplicated, so a failure that repeats every restart stays one entry.
 */
export function saveAlert(guildId: string, alert: { key: string; scope: string; message: string; detail?: string }): void {
    const now = new Date().toISOString();
    const db  = openGuildDb(guildId);

    db.transaction(() => {
        db.prepare(`
            INSERT INTO alerts (id, key, scope, message, detail, first_at, last_at, count)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT (key) DO UPDATE SET
                scope   = excluded.scope,
                message = excluded.message,
                detail  = excluded.detail,
                last_at = excluded.last_at,
                count   = count + 1
        `).run(randomUUID(), alert.key, alert.scope, alert.message, alert.detail ?? '', now, now);

        db.prepare('DELETE FROM alerts WHERE rowid NOT IN (SELECT rowid FROM alerts ORDER BY rowid DESC LIMIT ?)').run(MAX_ALERTS);
    })();
}

// Call once the condition behind the alert works again.
export function clearAlert(guildId: string, key: string): void {
    openGuildDb(guildId).prepare('DELETE FROM alerts WHERE key = ?').run(key);
}

// Returns false if the alert was already gone.
export function dismissAlert(guildId: string, id: string): boolean {
    return openGuildDb(guildId).prepare('DELETE FROM alerts WHERE id = ?').run(id).changes > 0;
}

// Outstanding alerts, most recent first. Empty for a guild that has never raised one.
export function listAlerts(guildId: string): Alert[] {
    const rows = openGuildDb(guildId).prepare('SELECT * FROM alerts ORDER BY last_at DESC, rowid DESC').all() as AlertRow[];
    return rows.map(toAlert);
}

export function alertCount(guildId: string): number {
    const row = openGuildDb(guildId).prepare('SELECT COUNT(*) AS n FROM alerts').get() as { n: number };
    return row.n;
}

/**
 * Appends one change to a guild's audit trail.
 *
 * @param entry `id` and `at` are filled in here, so a caller only describes what happened.
 * @returns Nothing. Every call is a new entry, the oldest are dropped past the cap, and an
 *          over-long `detail` is stored truncated.
 */
export function saveAudit(guildId: string, entry: Omit<AuditEntry, 'id' | 'at'>): void {
    const db     = openGuildDb(guildId);
    const detail = entry.detail.length > MAX_AUDIT_DETAIL
        ? `${entry.detail.slice(0, MAX_AUDIT_DETAIL)}...`
        : entry.detail;

    db.transaction(() => {
        insertAudit(db, { ...entry, detail, id: randomUUID(), at: new Date().toISOString() });
        db.prepare('DELETE FROM audit WHERE rowid NOT IN (SELECT rowid FROM audit ORDER BY rowid DESC LIMIT ?)').run(MAX_AUDIT);
    })();
}

/**
 * Recent changes to a guild, newest first.
 *
 * @param limit Caps how many are returned. Omitted, every stored entry comes back.
 * @returns An empty list for a guild that has never recorded one.
 */
export function listAudit(guildId: string, limit?: number): AuditEntry[] {
    const rows = openGuildDb(guildId).prepare('SELECT * FROM audit ORDER BY at DESC, rowid DESC').all() as AuditRow[];
    const list = rows.map(toAudit);
    return limit === undefined ? list : list.slice(0, limit);
}

export function savePollRun(guildId: string, run: Omit<PollRun, 'id'>): string {
    const db = openGuildDb(guildId);
    const id = randomUUID();
    db.transaction(() => insertPollRun(db, { ...run, id }))();
    return id;
}

function readRun(guildId: string, id: string): PollRun | undefined {
    const db  = openGuildDb(guildId);
    const row = db.prepare('SELECT * FROM polls WHERE id = ?').get(id) as PollRow | undefined;
    return row && toPollRuns(db, [row])[0];
}

// Runs still waiting on their results, oldest first. Empty for a guild that has never polled.
export function listOpenPollRuns(guildId: string): PollRun[] {
    const db   = openGuildDb(guildId);
    const rows = db.prepare('SELECT * FROM polls WHERE recorded_at IS NULL ORDER BY posted_at, rowid').all() as PollRow[];
    return toPollRuns(db, rows);
}

export function recordPollOutcome(guildId: string, id: string, answers: PollRunAnswer[], winners: string[]): boolean {
    const db = openGuildDb(guildId);
    return db.transaction(() => {
        const settled = db.prepare('UPDATE polls SET recorded_at = ? WHERE id = ? AND recorded_at IS NULL').run(new Date().toISOString(), id);
        if (settled.changes === 0) return false;

        replacePollAnswers(db, id, answers, winners);
        const addWin = db.prepare('UPDATE games SET poll_wins = poll_wins + 1 WHERE name = ?');
        for (const name of winners) addWin.run(name);
        return true;
    })();
}

function resultKey(answers: PollRunAnswer[], winners: string[]): string {
    return JSON.stringify({
        answers: [...answers].sort((a, b) => a.answerId - b.answerId).map(a => [a.answerId, a.votes, [...a.voters].sort()]),
        winners: [...winners].sort(),
    });
}

export function correctPollOutcome(guildId: string, id: string, answers: PollRunAnswer[], winners: string[]): boolean {
    const db = openGuildDb(guildId);
    return db.transaction(() => {
        const run = readRun(guildId, id);
        if (!run?.recordedAt) return false;
        if (!run.abandoned && resultKey(run.answers, run.winners) === resultKey(answers, winners)) return false;

        replacePollAnswers(db, id, answers, winners);
        db.prepare('UPDATE polls SET abandoned = 0 WHERE id = ?').run(id);

        const addWin  = db.prepare('UPDATE games SET poll_wins = poll_wins + 1 WHERE name = ?');
        const loseWin = db.prepare('UPDATE games SET poll_wins = MAX(poll_wins - 1, 0) WHERE name = ?');
        for (const name of winners)     if (!run.winners.includes(name)) addWin.run(name);
        for (const name of run.winners) if (!winners.includes(name))     loseWin.run(name);
        return true;
    })();
}

// Closes an open run without results, so an unreadable poll is not retried forever.
export function abandonPollRun(guildId: string, id: string): void {
    openGuildDb(guildId)
        .prepare('UPDATE polls SET abandoned = 1, recorded_at = ? WHERE id = ? AND recorded_at IS NULL')
        .run(new Date().toISOString(), id);
}

/**
 * Settled polls with usable results, newest first.
 *
 * @param limit Caps how many are returned. Omitted, every stored run comes back.
 * @returns Abandoned runs are left out, so callers never show a poll whose votes were lost.
 */
export function listPollRuns(guildId: string, limit?: number): PollRun[] {
    const db   = openGuildDb(guildId);
    const rows = db.prepare(`
        SELECT * FROM polls
        WHERE recorded_at IS NOT NULL AND abandoned = 0
        ORDER BY posted_at DESC, rowid DESC
        LIMIT ?
    `).all(limit ?? -1) as PollRow[];
    return toPollRuns(db, rows);
}

export function listSettledPollRuns(guildId: string): PollRun[] {
    const db   = openGuildDb(guildId);
    const rows = db.prepare('SELECT * FROM polls WHERE recorded_at IS NOT NULL ORDER BY posted_at DESC, rowid DESC').all() as PollRow[];
    return toPollRuns(db, rows);
}

export function listPollMessageIds(guildId: string): Set<string> {
    const rows = openGuildDb(guildId).prepare('SELECT message_id FROM polls').all() as { message_id: string }[];
    return new Set(rows.map(r => r.message_id));
}

export function getConfig(guildId: string, key: string): string {
    const row = openGuildDb(guildId).prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? CONFIG_DEFAULTS[key] ?? '';
}

export function setConfig(guildId: string, key: string, value: string | number): void {
    openGuildDb(guildId).prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, String(value));
}
