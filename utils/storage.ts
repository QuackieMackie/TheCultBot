import fs   from 'fs';
import path from 'path';
import type { Game, StoredConfig } from 'types';

const DATA_DIR    = path.join(__dirname, '..', 'data');
const GAMES_FILE  = path.join(DATA_DIR, 'games.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const CONFIG_DEFAULTS: StoredConfig = {
    poll_size:       '5',
    poll_channel_id: '',
    manager_role_id: '',
    poll_hour_utc:       '9',
    poll_duration_hours: '24',
};

function readGames(): Game[] {
    try {
        return JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8')) as Game[];
    } catch {
        console.error('games.json is missing or corrupted. Resetting to empty list.');
        writeGames([]);
        return [];
    }
}

function writeGames(games: Game[]): void {
    fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
}

function readConfig(): StoredConfig {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as StoredConfig;
    } catch {
        console.error('config.json is missing or corrupted. Resetting to defaults.');
        const defaults = { ...CONFIG_DEFAULTS };
        writeConfig(defaults);
        return defaults;
    }
}

function writeConfig(config: StoredConfig): void {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function initStorage(): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (!fs.existsSync(GAMES_FILE)) {
        writeGames([]);
    }

    if (!fs.existsSync(CONFIG_FILE)) {
        writeConfig({ ...CONFIG_DEFAULTS });
    } else {
        const config  = readConfig();
        let   changed = false;
        for (const [k, v] of Object.entries(CONFIG_DEFAULTS)) {
            if (!(k in config)) { config[k] = v; changed = true; }
        }
        if (changed) writeConfig(config);
    }

    console.log('Storage initialised.');
}

export function addGame(name: string, addedBy: string): void {
    const games = readGames();
    if (games.some(g => g.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(`"${name}" is already in the roster.`);
    }
    games.push({ name, addedBy, addedAt: new Date().toISOString() });
    games.sort((a, b) => a.name.localeCompare(b.name));
    writeGames(games);
}

export function removeGame(name: string): number {
    const games    = readGames();
    const filtered = games.filter(g => g.name.toLowerCase() !== name.toLowerCase());
    const removed  = games.length - filtered.length;
    if (removed > 0) writeGames(filtered);
    return removed;
}

export function listGames(): Game[] {
    return readGames();
}

export function getRandomGames(n: number): Game[] {
    const games = [...readGames()];
    for (let i = games.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [games[i], games[j]] = [games[j], games[i]];
    }
    return games.slice(0, n);
}

export function gameCount(): number {
    return readGames().length;
}

export function getConfig(key: string): string {
    const config = readConfig();
    return key in config ? config[key] : (CONFIG_DEFAULTS[key] ?? '');
}

export function setConfig(key: string, value: string | number): void {
    const config = readConfig();
    config[key]  = String(value);
    writeConfig(config);
}
