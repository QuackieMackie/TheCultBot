import fs   from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { guildDir, openGuildDb, type GuildDb } from './db';
import {
    insertAlert,
    insertAudit,
    insertGame,
    insertGroup,
    insertPollRun,
} from './rows';
import type { Alert, AuditEntry, Game, Group, PollRun, PollRunAnswer } from './types';

const LEGACY_FILES = ['games.json', 'groups.json', 'config.json', 'alerts.json', 'audit.json', 'polls.json'];
const LEGACY_DIR   = 'legacy-json';
const IMPORTED_KEY = 'legacy_json_imported';

export interface ImportSummary {
    games:         number;
    groups:        number;
    polls:         number;
    repairedPolls: number;
}

function normaliseGame(raw: Partial<Game>): Game {
    return {
        name:            raw.name ?? '',
        addedBy:         raw.addedBy ?? '',
        addedAt:         raw.addedAt ?? new Date(0).toISOString(),
        group:           raw.group ?? '',
        playerCount:     typeof raw.playerCount === 'number' ? raw.playerCount : 1,
        lastPolledAt:    raw.lastPolledAt,
        pollAppearances: typeof raw.pollAppearances === 'number' ? raw.pollAppearances : 0,
        pollWins:        typeof raw.pollWins === 'number' ? raw.pollWins : 0,
    };
}

function normaliseGroup(raw: Partial<Group>): Group {
    return {
        name:           raw.name ?? '',
        roleId:         raw.roleId ?? '',
        roleName:       raw.roleName ?? '',
        roleColour:     raw.roleColour ?? '',
        categoryId:     raw.categoryId ?? '',
        textChannelId:  raw.textChannelId ?? '',
        voiceChannelId: raw.voiceChannelId ?? '',
        quarantined:    raw.quarantined ?? false,
        quarantinedAt:  raw.quarantinedAt,
        adopted:        raw.adopted ?? false,
    };
}

function normaliseAlert(raw: Partial<Alert>): Alert {
    const at = raw.lastAt ?? raw.firstAt ?? new Date(0).toISOString();
    return {
        id:      raw.id ?? randomUUID(),
        key:     raw.key ?? '',
        scope:   raw.scope ?? '',
        message: raw.message ?? '',
        detail:  raw.detail ?? '',
        firstAt: raw.firstAt ?? at,
        lastAt:  at,
        count:   typeof raw.count === 'number' ? raw.count : 1,
    };
}

function normaliseAudit(raw: Partial<AuditEntry>): AuditEntry {
    return {
        id:      raw.id ?? randomUUID(),
        at:      raw.at ?? new Date(0).toISOString(),
        actorId: raw.actorId ?? '',
        actor:   raw.actor ?? '',
        action:  raw.action ?? '',
        target:  raw.target ?? '',
        detail:  raw.detail ?? '',
        source:  raw.source === 'command' ? 'command' : 'dashboard',
    };
}

function normaliseAnswer(raw: Partial<PollRunAnswer>): PollRunAnswer {
    return {
        game:     raw.game ?? '',
        answerId: typeof raw.answerId === 'number' ? raw.answerId : 0,
        votes:    typeof raw.votes === 'number' ? raw.votes : 0,
        voters:   Array.isArray(raw.voters) ? raw.voters.filter(v => typeof v === 'string') : [],
    };
}

function normalisePollRun(raw: Partial<PollRun>): PollRun {
    return {
        id:         raw.id ?? randomUUID(),
        messageId:  raw.messageId ?? '',
        channelId:  raw.channelId ?? '',
        kind:       'weighted',
        postedAt:   raw.postedAt ?? new Date(0).toISOString(),
        closesAt:   raw.closesAt ?? new Date(0).toISOString(),
        recordedAt: raw.recordedAt,
        abandoned:  raw.abandoned ?? false,
        answers:    Array.isArray(raw.answers) ? raw.answers.map(normaliseAnswer) : [],
        winners:    Array.isArray(raw.winners) ? raw.winners.filter(w => typeof w === 'string') : [],
    };
}

// Zero votes with real voters means the counts were lost to the stale cache.
function repairRun(run: PollRun): { run: PollRun; repaired: boolean } {
    const hasVotes  = run.answers.some(a => a.votes > 0);
    const hasVoters = run.answers.some(a => a.voters.length > 0);
    if (!run.recordedAt || run.abandoned || hasVotes || !hasVoters) return { run, repaired: false };

    const answers = run.answers.map(a => ({ ...a, votes: a.voters.length }));
    const top     = Math.max(...answers.map(a => a.votes));
    return {
        run:      { ...run, answers, winners: answers.filter(a => a.votes === top).map(a => a.game) },
        repaired: true,
    };
}

function readLegacy<T>(guildId: string, name: string, shape: 'array' | 'object'): T | undefined {
    const file = path.join(guildDir(guildId), name);
    if (!fs.existsSync(file)) return undefined;

    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    const valid  = shape === 'array'
        ? Array.isArray(parsed)
        : parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
    if (!valid) throw new Error(`${name} is not an ${shape}`);
    return parsed as T;
}

function importAll(db: GuildDb, guildId: string): ImportSummary {
    const games  = readLegacy<Partial<Game>[]>(guildId, 'games.json', 'array') ?? [];
    const groups = readLegacy<Partial<Group>[]>(guildId, 'groups.json', 'array') ?? [];
    const config = readLegacy<Record<string, unknown>>(guildId, 'config.json', 'object') ?? {};
    const alerts = readLegacy<Partial<Alert>[]>(guildId, 'alerts.json', 'array') ?? [];
    const audit  = readLegacy<Partial<AuditEntry>[]>(guildId, 'audit.json', 'array') ?? [];
    const polls  = readLegacy<Partial<PollRun>[]>(guildId, 'polls.json', 'array') ?? [];

    let repairedPolls = 0;

    db.transaction(() => {
        for (const raw of games)  insertGame(db, normaliseGame(raw), 'OR IGNORE');
        for (const raw of groups) insertGroup(db, normaliseGroup(raw), 'OR IGNORE');
        for (const raw of alerts) insertAlert(db, normaliseAlert(raw), 'OR IGNORE');
        for (const raw of audit)  insertAudit(db, normaliseAudit(raw), 'OR IGNORE');

        const setConfig = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(config)) setConfig.run(key, String(value));

        const addWin = db.prepare('UPDATE games SET poll_wins = poll_wins + 1 WHERE name = ?');
        for (const raw of polls) {
            const { run, repaired } = repairRun(normalisePollRun(raw));
            insertPollRun(db, run);
            if (repaired) {
                repairedPolls += 1;
                for (const winner of run.winners) addWin.run(winner);
            }
        }

        // In the transaction, so a crash before the move cannot repair twice.
        db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(IMPORTED_KEY, new Date().toISOString());
    })();

    return { games: games.length, groups: groups.length, polls: polls.length, repairedPolls };
}

function moveAside(guildId: string): void {
    const dir = path.join(guildDir(guildId), LEGACY_DIR);
    fs.mkdirSync(dir, { recursive: true });
    for (const name of LEGACY_FILES) {
        const file = path.join(guildDir(guildId), name);
        if (fs.existsSync(file)) fs.renameSync(file, path.join(dir, name));
    }
}

export function importLegacyJson(guildId: string): ImportSummary | null {
    const present = LEGACY_FILES.some(name => fs.existsSync(path.join(guildDir(guildId), name)));
    if (!present) return null;

    const db      = openGuildDb(guildId);
    const summary = db.prepare('SELECT 1 FROM meta WHERE key = ?').get(IMPORTED_KEY) ? null : importAll(db, guildId);
    moveAside(guildId);
    return summary;
}
