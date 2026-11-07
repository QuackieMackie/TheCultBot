/**
 * Structured line logging for the bot.
 *
 * Every line is `<ISO timestamp> <LEVEL> [scope] <message> key=value ...`, written to stdout
 * (stderr for errors) so `docker logs` picks it up with no extra plumbing. Values containing
 * spaces are quoted, so a line stays greppable: `docker logs thecultbot | grep 'group="Deadlock"'`.
 *
 * LOG_LEVEL (debug | info | warn | error) sets the threshold and defaults to info.
 */

import fs   from 'fs';
import path from 'path';
import { DATA_DIR } from '@thecult/shared';

type Level  = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Read once: the level cannot change without a restart, and this runs on every log call.
const threshold = ORDER[(process.env.LOG_LEVEL || '').toLowerCase() as Level] ?? ORDER.info;

function render(value: unknown): string {
    if (value instanceof Error) return render(value.message);
    if (value === null)         return 'null';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);

    const text = String(value);
    return /[\s"]/.test(text) ? JSON.stringify(text) : text;
}

function format(level: Level, scope: string, message: string, fields?: Fields): string {
    const parts = [new Date().toISOString(), level.toUpperCase().padEnd(5), `[${scope}]`, message];

    for (const [key, value] of Object.entries(fields ?? {})) {
        if (value === undefined) continue;
        parts.push(`${key}=${render(value)}`);
    }

    return parts.join(' ');
}

function stackOf(fields?: Fields): string {
    const err = Object.values(fields ?? {}).find(v => v instanceof Error) as Error | undefined;
    return err?.stack ? `\n${err.stack}` : '';
}

const LOG_DIR        = path.join(DATA_DIR, 'logs');
const RETENTION_DAYS = 14;

let currentDay = '';

function pruneOldLogs(today: string): void {
    const cutoff = new Date(Date.parse(today) - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const name of fs.readdirSync(LOG_DIR)) {
        const day = /^bot-(\d{4}-\d{2}-\d{2})\.log$/.exec(name)?.[1];
        if (day && day < cutoff) fs.rmSync(path.join(LOG_DIR, name), { force: true });
    }
}

// A log failure must never take the bot down.
function appendToFile(text: string): void {
    try {
        const today = text.slice(0, 10);
        if (today !== currentDay) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
            pruneOldLogs(today);
            currentDay = today;
        }
        fs.appendFileSync(path.join(LOG_DIR, `bot-${today}.log`), text);
    } catch (err) {
        process.stderr.write(`Could not write the log file: ${String(err)}\n`);
    }
}

export interface Logger {
    debug(message: string, fields?: Fields): void;
    info(message: string, fields?: Fields): void;
    warn(message: string, fields?: Fields): void;
    error(message: string, fields?: Fields): void;
}

/**
 * Returns a logger tagged with a scope, conventionally the module name.
 *
 * @param scope Short label printed in brackets, e.g. "gameService".
 * @returns One method per level; calls below LOG_LEVEL are dropped. Error values are printed as
 *          their message, and error-level lines append the stack.
 */
export function logger(scope: string): Logger {
    const emit = (level: Level, message: string, fields?: Fields): void => {
        if (ORDER[level] < threshold) return;
        const line = format(level, scope, message, fields);
        const text = level === 'error' ? `${line}${stackOf(fields)}\n` : `${line}\n`;
        if (level === 'error') process.stderr.write(text);
        else                   process.stdout.write(text);
        appendToFile(text);
    };

    return {
        debug: (message, fields) => emit('debug', message, fields),
        info:  (message, fields) => emit('info',  message, fields),
        warn:  (message, fields) => emit('warn',  message, fields),
        error: (message, fields) => emit('error', message, fields),
    };
}
