import fs       from 'fs';
import path     from 'path';
import Database from 'better-sqlite3';

export type GuildDb = Database.Database;

export const DATA_DIR = process.env.CULTBOT_DATA_DIR || path.resolve(process.cwd(), 'data');

// Never edit a shipped migration; append a new one.
const MIGRATIONS: string[] = [`
    CREATE TABLE config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE game_groups (
        name             TEXT PRIMARY KEY COLLATE NOCASE,
        role_id          TEXT NOT NULL,
        role_name        TEXT NOT NULL,
        role_colour      TEXT NOT NULL,
        category_id      TEXT NOT NULL,
        text_channel_id  TEXT NOT NULL,
        voice_channel_id TEXT NOT NULL,
        quarantined      INTEGER NOT NULL,
        quarantined_at   TEXT,
        adopted          INTEGER NOT NULL
    );

    CREATE TABLE games (
        name             TEXT PRIMARY KEY COLLATE NOCASE,
        added_by         TEXT NOT NULL,
        added_at         TEXT NOT NULL,
        group_name       TEXT NOT NULL COLLATE NOCASE,
        player_count     INTEGER NOT NULL,
        last_polled_at   TEXT,
        poll_appearances INTEGER NOT NULL,
        poll_wins        INTEGER NOT NULL
    );

    CREATE TABLE polls (
        id          TEXT PRIMARY KEY,
        message_id  TEXT NOT NULL,
        channel_id  TEXT NOT NULL,
        kind        TEXT NOT NULL,
        posted_at   TEXT NOT NULL,
        closes_at   TEXT NOT NULL,
        recorded_at TEXT,
        abandoned   INTEGER NOT NULL
    );
    CREATE INDEX polls_recorded_at ON polls (recorded_at);

    CREATE TABLE poll_answers (
        poll_id   TEXT NOT NULL REFERENCES polls (id) ON DELETE CASCADE,
        answer_id INTEGER NOT NULL,
        game      TEXT NOT NULL,
        votes     INTEGER NOT NULL,
        is_winner INTEGER NOT NULL,
        PRIMARY KEY (poll_id, answer_id)
    );

    CREATE TABLE poll_votes (
        poll_id   TEXT NOT NULL,
        answer_id INTEGER NOT NULL,
        user_id   TEXT NOT NULL,
        PRIMARY KEY (poll_id, answer_id, user_id),
        FOREIGN KEY (poll_id, answer_id) REFERENCES poll_answers (poll_id, answer_id) ON DELETE CASCADE
    );

    CREATE TABLE alerts (
        id       TEXT PRIMARY KEY,
        key      TEXT NOT NULL UNIQUE,
        scope    TEXT NOT NULL,
        message  TEXT NOT NULL,
        detail   TEXT NOT NULL,
        first_at TEXT NOT NULL,
        last_at  TEXT NOT NULL,
        count    INTEGER NOT NULL
    );

    CREATE TABLE audit (
        id       TEXT PRIMARY KEY,
        at       TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor    TEXT NOT NULL,
        action   TEXT NOT NULL,
        target   TEXT NOT NULL,
        detail   TEXT NOT NULL,
        source   TEXT NOT NULL
    );
`];

const connections = new Map<string, GuildDb>();

function migrate(db: GuildDb): void {
    const version = db.pragma('user_version', { simple: true }) as number;
    for (let v = version; v < MIGRATIONS.length; v++) {
        db.transaction(() => {
            db.exec(MIGRATIONS[v]);
            db.pragma(`user_version = ${v + 1}`);
        })();
    }
}

export function guildDir(guildId: string): string {
    return path.join(DATA_DIR, guildId);
}

export function openGuildDb(guildId: string): GuildDb {
    const existing = connections.get(guildId);
    if (existing) return existing;

    fs.mkdirSync(guildDir(guildId), { recursive: true });
    // Rollback journal, not WAL: there is one process, and the database stays one copyable file.
    const db = new Database(path.join(guildDir(guildId), 'guild.db'));
    db.pragma('foreign_keys = ON');
    migrate(db);
    connections.set(guildId, db);
    return db;
}

export function closeGuildDb(guildId: string): void {
    connections.get(guildId)?.close();
    connections.delete(guildId);
}

export function closeAllDatabases(): void {
    for (const guildId of [...connections.keys()]) closeGuildDb(guildId);
}
