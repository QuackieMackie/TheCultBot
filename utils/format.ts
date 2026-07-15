import { resolveColor, type ColorResolvable } from 'discord.js';

export function slugify(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 100);
}

export function formatGroupName(input: string): string {
    return input.trim().slice(0, 100);
}

// Accepts a friendly colour name ("red", "Dark Blue"), a hex string ("#ED4245" / "ED4245"), or "random".
export function resolveGameColour(input: string): number {
    const raw = input.trim();

    if (/^#?[0-9a-fA-F]{6}$/.test(raw)) {
        return resolveColor(`#${raw.replace(/^#/, '')}` as ColorResolvable);
    }

    const key = raw
        .replace(/[\s_-]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join('');

    try {
        return resolveColor(key as ColorResolvable);
    } catch {
        throw new Error(`"${input}" is not a recognised colour. Use a name like "red" or a hex code like "#ED4245".`);
    }
}

export function colourToHex(colour: number): string {
    return `#${colour.toString(16).padStart(6, '0').toUpperCase()}`;
}
