import fs   from 'fs';
import path from 'path';
import type { Game, Group, StoredConfig } from './types';

export const DATA_DIR = process.env.CULTBOT_DATA_DIR || path.resolve(process.cwd(), 'data');

// Discord caps poll answer text at 55 characters, so a game name longer than
export const MAX_GAME_NAME_LENGTH = 55;

// Never-polled games get this pseudo "weeks since last poll" so they are the most
// likely to be featured; recently featured games decay towards a weight of 1.
const WEIGHT_CAP = 8;

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

function writeFileAtomic(file: string, data: string): void {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
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
    try {
        const raw = JSON.parse(fs.readFileSync(gamesFile(guildId), 'utf8')) as Partial<Game>[];
        return raw.map(normaliseGame);
    } catch {
        console.error(`games.json for guild ${guildId} is missing or corrupted. Resetting to empty list.`);
        writeGames(guildId, []);
        return [];
    }
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
    };
}

function readGroups(guildId: string): Group[] {
    try {
        const raw = JSON.parse(fs.readFileSync(groupsFile(guildId), 'utf8')) as Partial<Group>[];
        return raw.map(normaliseGroup);
    } catch {
        console.error(`groups.json for guild ${guildId} is missing or corrupted. Resetting to empty list.`);
        writeGroups(guildId, []);
        return [];
    }
}

function writeGroups(guildId: string, groups: Group[]): void {
    writeFileAtomic(groupsFile(guildId), JSON.stringify(groups, null, 2));
}

function readConfig(guildId: string): StoredConfig {
    try {
        return JSON.parse(fs.readFileSync(configFile(guildId), 'utf8')) as StoredConfig;
    } catch {
        console.error(`config.json for guild ${guildId} is missing or corrupted. Resetting to defaults.`);
        const defaults = { ...CONFIG_DEFAULTS };
        writeConfig(guildId, defaults);
        return defaults;
    }
}

function writeConfig(guildId: string, config: StoredConfig): void {
    writeFileAtomic(configFile(guildId), JSON.stringify(config, null, 2));
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

export function updateGame(guildId: string, name: string, patch: Partial<Game>): void {
    const games = readGames(guildId);
    const game  = games.find(g => g.name.toLowerCase() === name.toLowerCase());
    if (!game) return;
    Object.assign(game, patch);
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

export function updateGroup(guildId: string, name: string, patch: Partial<Group>): void {
    const groups = readGroups(guildId);
    const group  = groups.find(g => g.name.toLowerCase() === name.toLowerCase());
    if (!group) return;
    Object.assign(group, patch);
    writeGroups(guildId, groups);
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
