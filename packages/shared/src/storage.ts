import fs   from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Alert, AuditEntry, Game, Group, StoredConfig } from './types';

export const DATA_DIR = process.env.CULTBOT_DATA_DIR || path.resolve(process.cwd(), 'data');

// Discord caps poll answer text at 55 characters, so a game name longer than
export const MAX_GAME_NAME_LENGTH = 55;

// Never-polled games get this pseudo "weeks since last poll" so they are the most
// likely to be featured; recently featured games decay towards a weight of 1.
const WEIGHT_CAP = 8;

// Oldest alerts are dropped past this, so a guild that ignores its dashboard cannot grow the
// file without bound.
const MAX_ALERTS = 25;

// Oldest entries are dropped past this. The trail is a recent history for the dashboard,
// not a permanent record.
const MAX_AUDIT = 100;

const CONFIG_DEFAULTS: StoredConfig = {
    poll_size:       '5',
    poll_channel_id: '',
    manager_role_id: '',
    poll_hour_utc:         '9',
    poll_duration_hours:   '24',
    poll_auto_enabled:     'true',
    role_board_channel_id: '',
    role_board_message_id: '',
};

function guildDir(guildId: string): string {
    return path.join(DATA_DIR, guildId);
}

function gamesFile(guildId: string): string {
    return path.join(guildDir(guildId), 'games.json');
}

function groupsFile(guildId: string): string {
    return path.join(guildDir(guildId), 'groups.json');
}

function configFile(guildId: string): string {
    return path.join(guildDir(guildId), 'config.json');
}

function alertsFile(guildId: string): string {
    return path.join(guildDir(guildId), 'alerts.json');
}

function auditFile(guildId: string): string {
    return path.join(guildDir(guildId), 'audit.json');
}

function writeFileAtomic(file: string, data: string): void {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
}

// Preserves an unparseable data file as a timestamped copy before the read path resets it,
// so a truncated or corrupt file is recoverable instead of being silently overwritten.
function quarantineCorruptFile(file: string, raw: string): void {
    try {
        fs.writeFileSync(`${file}.corrupt-${Date.now()}`, raw);
    } catch (err) {
        console.error(`Failed to back up corrupt file ${file}.`, err);
    }
}

// Reads and parses a JSON data file. Returns null for a missing file (the caller seeds a
// default). A file that exists but cannot be parsed is quarantined before returning null, so
// a transient JSON error never discards good data. Genuine read errors (e.g. permissions)
// are rethrown rather than treated as "empty".
function readJsonFile<T>(file: string, parse: (raw: string) => T): T | null {
    let raw: string;
    try {
        raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
    }
    try {
        return parse(raw);
    } catch (err) {
        quarantineCorruptFile(file, raw);
        console.error(`${path.basename(file)} could not be parsed. Backed it up and reset.`, err);
        return null;
    }
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
    };
}

function readGames(guildId: string): Game[] {
    const games = readJsonFile(gamesFile(guildId), raw => {
        const arr = JSON.parse(raw) as unknown;
        if (!Array.isArray(arr)) throw new Error('games.json is not an array');
        return (arr as Partial<Game>[]).map(normaliseGame);
    });
    if (games) return games;
    writeGames(guildId, []);
    return [];
}

function writeGames(guildId: string, games: Game[]): void {
    writeFileAtomic(gamesFile(guildId), JSON.stringify(games, null, 2));
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

function readGroups(guildId: string): Group[] {
    const groups = readJsonFile(groupsFile(guildId), raw => {
        const arr = JSON.parse(raw) as unknown;
        if (!Array.isArray(arr)) throw new Error('groups.json is not an array');
        return (arr as Partial<Group>[]).map(normaliseGroup);
    });
    if (groups) return groups;
    writeGroups(guildId, []);
    return [];
}

function writeGroups(guildId: string, groups: Group[]): void {
    writeFileAtomic(groupsFile(guildId), JSON.stringify(groups, null, 2));
}

function readConfig(guildId: string): StoredConfig {
    const config = readJsonFile(configFile(guildId), raw => {
        const obj = JSON.parse(raw) as unknown;
        if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('config.json is not an object');
        return obj as StoredConfig;
    });
    if (config) return config;
    const defaults = { ...CONFIG_DEFAULTS };
    writeConfig(guildId, defaults);
    return defaults;
}

function writeConfig(guildId: string, config: StoredConfig): void {
    writeFileAtomic(configFile(guildId), JSON.stringify(config, null, 2));
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

// Unlike the other readers this never seeds a missing file: the dashboard reads alerts from a
// read-only mount, so a guild that predates alerts.json must not trigger a write on read.
function readAlerts(guildId: string): Alert[] {
    return readJsonFile(alertsFile(guildId), raw => {
        const arr = JSON.parse(raw) as unknown;
        if (!Array.isArray(arr)) throw new Error('alerts.json is not an array');
        return (arr as Partial<Alert>[]).map(normaliseAlert);
    }) ?? [];
}

function writeAlerts(guildId: string, alerts: Alert[]): void {
    writeFileAtomic(alertsFile(guildId), JSON.stringify(alerts, null, 2));
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

// Like readAlerts, this never seeds a missing file: the dashboard reads the trail from a
// read-only mount, so a guild that predates audit.json must not trigger a write on read.
function readAudit(guildId: string): AuditEntry[] {
    return readJsonFile(auditFile(guildId), raw => {
        const arr = JSON.parse(raw) as unknown;
        if (!Array.isArray(arr)) throw new Error('audit.json is not an array');
        return (arr as Partial<AuditEntry>[]).map(normaliseAudit);
    }) ?? [];
}

function writeAudit(guildId: string, entries: AuditEntry[]): void {
    writeFileAtomic(auditFile(guildId), JSON.stringify(entries, null, 2));
}

// Ensures the top-level data directory exists. Call once at boot before init-ing guilds.
export function initStorage(): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('Storage initialised.');
}

// Seeds a guild's data directory: empty games/groups and a default config.
// Back-fills newly added default keys into an existing config. Safe to re-run.
export function initGuildStorage(guildId: string): void {
    fs.mkdirSync(guildDir(guildId), { recursive: true });

    if (!fs.existsSync(gamesFile(guildId))) {
        writeGames(guildId, []);
    }

    if (!fs.existsSync(groupsFile(guildId))) {
        writeGroups(guildId, []);
    }

    if (!fs.existsSync(configFile(guildId))) {
        writeConfig(guildId, { ...CONFIG_DEFAULTS });
    } else {
        const config  = readConfig(guildId);
        let   changed = false;
        for (const [k, v] of Object.entries(CONFIG_DEFAULTS)) {
            if (!(k in config)) { config[k] = v; changed = true; }
        }
        if (changed) writeConfig(guildId, config);
    }
}

// Removes a guild's entire data directory. Called when the bot is kicked/leaves.
export function purgeGuildStorage(guildId: string): void {
    fs.rmSync(guildDir(guildId), { recursive: true, force: true });
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
    if (readGames(guildId).some(g => g.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(`"${trimmed}" is already in the roster.`);
    }
}

export function saveNewGame(guildId: string, game: Game): void {
    const games = readGames(guildId);
    games.push(game);
    games.sort((a, b) => a.name.localeCompare(b.name));
    writeGames(guildId, games);
}

// Re-sorts on write, so a patch that renames the game leaves the file in name order.
export function updateGame(guildId: string, name: string, patch: Partial<Game>): void {
    const games = readGames(guildId);
    const game  = games.find(g => g.name.toLowerCase() === name.toLowerCase());
    if (!game) return;
    Object.assign(game, patch);
    games.sort((a, b) => a.name.localeCompare(b.name));
    writeGames(guildId, games);
}

export function deleteGame(guildId: string, name: string): number {
    const games    = readGames(guildId);
    const filtered = games.filter(g => g.name.toLowerCase() !== name.toLowerCase());
    const removed  = games.length - filtered.length;
    if (removed > 0) writeGames(guildId, filtered);
    return removed;
}

export function getGameByName(guildId: string, name: string): Game | undefined {
    return readGames(guildId).find(g => g.name.toLowerCase() === name.toLowerCase());
}

export function getGamesInGroup(guildId: string, groupName: string): Game[] {
    return readGames(guildId).filter(g => g.group.toLowerCase() === groupName.toLowerCase());
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

// Weighted random selection without replacement. Weight = weeks since the game last
// appeared in an auto poll (never-polled games get WEIGHT_CAP), so recently featured
// games are unlikely and un-featured games rise back to the top over time.
export function pickWeightedGames(pool: Game[], n: number): Game[] {
    const now       = Date.now();
    const remaining = pool.map(game => ({ game, weight: pollWeight(game, now) }));
    const picked:   Game[] = [];

    while (picked.length < n && remaining.length > 0) {
        const total = remaining.reduce((sum, e) => sum + e.weight, 0);
        let   roll  = Math.random() * total;
        let   idx   = remaining.length - 1;
        for (let i = 0; i < remaining.length; i++) {
            roll -= remaining[i].weight;
            if (roll <= 0) { idx = i; break; }
        }
        picked.push(remaining[idx].game);
        remaining.splice(idx, 1);
    }

    return picked;
}

function pollWeight(game: Game, now: number): number {
    if (!game.lastPolledAt) return WEIGHT_CAP;
    const weeks = Math.floor((now - new Date(game.lastPolledAt).getTime()) / (7 * 24 * 60 * 60 * 1000));
    return Math.min(Math.max(weeks, 1), WEIGHT_CAP);
}

export function gameCount(guildId: string): number {
    return readGames(guildId).length;
}

export function getGroupByName(guildId: string, name: string): Group | undefined {
    return readGroups(guildId).find(g => g.name.toLowerCase() === name.toLowerCase());
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
    const groups = readGroups(guildId);
    const idx    = groups.findIndex(g => g.name.toLowerCase() === group.name.toLowerCase());
    if (idx >= 0) groups[idx] = group;
    else          groups.push(group);
    groups.sort((a, b) => a.name.localeCompare(b.name));
    writeGroups(guildId, groups);
}

/**
 * Renames a group and re-points every game that sits in it.
 *
 * @param from Current group name, matched case-insensitively.
 * @param to   New name, stored as given.
 * @returns The number of games moved onto the new name. Does nothing if the group is unknown.
 */
export function renameGroup(guildId: string, from: string, to: string): number {
    const groups = readGroups(guildId);
    const group  = groups.find(g => g.name.toLowerCase() === from.toLowerCase());
    if (!group) return 0;

    group.name = to;
    groups.sort((a, b) => a.name.localeCompare(b.name));
    writeGroups(guildId, groups);

    const games   = readGames(guildId);
    let   touched = 0;
    for (const game of games) {
        if (game.group.toLowerCase() === from.toLowerCase()) {
            game.group = to;
            touched   += 1;
        }
    }
    if (touched > 0) writeGames(guildId, games);
    return touched;
}

export function updateGroup(guildId: string, name: string, patch: Partial<Group>): void {
    const groups = readGroups(guildId);
    const group  = groups.find(g => g.name.toLowerCase() === name.toLowerCase());
    if (!group) return;
    Object.assign(group, patch);
    writeGroups(guildId, groups);
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
    const alerts   = readAlerts(guildId);
    const existing = alerts.find(a => a.key === alert.key);
    const now      = new Date().toISOString();

    if (existing) {
        existing.scope   = alert.scope;
        existing.message = alert.message;
        existing.detail  = alert.detail ?? '';
        existing.lastAt  = now;
        existing.count  += 1;
    } else {
        alerts.push({
            id:      randomUUID(),
            key:     alert.key,
            scope:   alert.scope,
            message: alert.message,
            detail:  alert.detail ?? '',
            firstAt: now,
            lastAt:  now,
            count:   1,
        });
    }

    writeAlerts(guildId, alerts.slice(-MAX_ALERTS));
}

// Drops the alert for a condition that has started working again.
export function clearAlert(guildId: string, key: string): void {
    const alerts = readAlerts(guildId);
    const kept   = alerts.filter(a => a.key !== key);
    if (kept.length !== alerts.length) writeAlerts(guildId, kept);
}

// Removes one alert by id. Returns false if it was already gone.
export function dismissAlert(guildId: string, id: string): boolean {
    const alerts = readAlerts(guildId);
    const kept   = alerts.filter(a => a.id !== id);
    if (kept.length === alerts.length) return false;
    writeAlerts(guildId, kept);
    return true;
}

// Outstanding alerts, most recent first. Empty for a guild that has never raised one.
export function listAlerts(guildId: string): Alert[] {
    return readAlerts(guildId).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export function alertCount(guildId: string): number {
    return readAlerts(guildId).length;
}

/**
 * Appends one change to a guild's audit trail.
 *
 * @param entry `id` and `at` are filled in here, so a caller only describes what happened.
 * @returns Nothing. Every call is a new entry, and the oldest are dropped past the cap.
 */
export function saveAudit(guildId: string, entry: Omit<AuditEntry, 'id' | 'at'>): void {
    const entries = readAudit(guildId);
    entries.push({ ...entry, id: randomUUID(), at: new Date().toISOString() });
    writeAudit(guildId, entries.slice(-MAX_AUDIT));
}

/**
 * Recent changes to a guild, newest first.
 *
 * @param limit Caps how many are returned. Omitted, every stored entry comes back.
 * @returns An empty list for a guild that has never recorded one.
 */
export function listAudit(guildId: string, limit?: number): AuditEntry[] {
    const entries = readAudit(guildId).sort((a, b) => b.at.localeCompare(a.at));
    return limit === undefined ? entries : entries.slice(0, limit);
}

export function getConfig(guildId: string, key: string): string {
    const config = readConfig(guildId);
    return key in config ? config[key] : (CONFIG_DEFAULTS[key] ?? '');
}

export function setConfig(guildId: string, key: string, value: string | number): void {
    const config = readConfig(guildId);
    config[key]  = String(value);
    writeConfig(guildId, config);
}
