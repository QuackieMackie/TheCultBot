<script lang="ts">
    import { page } from '$app/state';

    interface Counts { alerts: number; games: number; groups: number; }
    let { guildId, counts }: { guildId: string; counts: Counts } = $props();

    const base = $derived(`/g/${guildId}`);

    const items = $derived([
        ...(counts.alerts > 0
            ? [{ href: base + '/omens', rune: '⚠', label: 'Ill omens', count: counts.alerts, tone: 'warn' }]
            : []),
        { href: base,               rune: '◈', label: 'Overview',      count: null,          tone: null },
        { href: base + '/rite',     rune: '☾', label: 'The weekly rite', count: null,        tone: null },
        { href: base + '/pantheon', rune: '✧', label: 'The pantheon',  count: counts.games,  tone: null },
        { href: base + '/covens',   rune: '❖', label: 'The covens',    count: counts.groups, tone: null },
        { href: base + '/sanctum',  rune: '⛧', label: 'The sanctum',   count: null,          tone: null },
        { href: base + '/chronicle', rune: '✎', label: 'The chronicle', count: null,         tone: null }
    ]);

    // The overview owns the bare guild path, so it must match exactly or it stays lit everywhere.
    function isActive(href: string): boolean {
        return href === base ? page.url.pathname === base : page.url.pathname.startsWith(href);
    }
</script>

<nav class="guild-nav" aria-label="Dashboard sections">
    {#each items as item (item.href)}
        <a
            href={item.href}
            class="nav-item"
            class:active={isActive(item.href)}
            class:warn={item.tone === 'warn'}
            aria-current={isActive(item.href) ? 'page' : undefined}
        >
            <span class="rune" aria-hidden="true">{item.rune}</span>
            <span class="label">{item.label}</span>
            {#if item.count !== null}<span class="count mono">{item.count}</span>{/if}
        </a>
    {/each}
</nav>

<style>
    /* align-self keeps the box its own height. A stretched grid item fills the row and has
       nothing left to stick against. */
    .guild-nav { display: grid; gap: 2px; align-self: start; position: sticky; top: 24px; }

    .nav-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: var(--radius-sm);
        border: 1px solid transparent;
        color: var(--bone-dim);
        font-size: 13.5px;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .nav-item:hover { background: var(--panel-2); color: var(--bone); }
    .nav-item.active {
        background: var(--panel-2);
        border-color: var(--line-strong);
        color: var(--bone);
    }

    .rune { flex: none; width: 14px; text-align: center; font-size: 12px; color: var(--verdigris); }
    .label { flex: 1; min-width: 0; }
    .count { flex: none; font-size: 11px; color: var(--muted); }

    .nav-item.warn { color: var(--ember-soft); }
    .nav-item.warn .rune, .nav-item.warn .count { color: var(--ember); }
    .nav-item.warn.active { border-color: rgba(228, 85, 46, 0.4); }

    /* Below the split the rail turns into a swipeable chip row, so every section stays
       one tap away without hiding behind a menu. */
    @media (max-width: 860px) {
        .guild-nav {
            position: static;
            grid-auto-flow: column;
            grid-auto-columns: max-content;
            gap: 6px;
            overflow-x: auto;
            padding-bottom: 4px;
            scrollbar-width: thin;
        }
        .nav-item {
            border-color: var(--line);
            white-space: nowrap;
            padding: 7px 12px;
        }
        .label { flex: none; }
    }
</style>
