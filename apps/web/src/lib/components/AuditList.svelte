<script lang="ts">
    import type { AuditEntry } from '@thecult/shared';

    let { entries }: { entries: AuditEntry[] } = $props();

    const VERBS: Record<string, string> = {
        'game.added':    'added',
        'game.imported': 'imported',
        'game.edited':   'edited',
        'game.removed':  'removed',
        'group.edited':  'edited the group',
        'config.set':    'set',
        'poll.run':      'ran a poll'
    };

    function verb(action: string): string {
        return VERBS[action] ?? action;
    }

    // Fixed UTC rendering: the server and the browser must agree or hydration mismatches.
    function when(iso: string): string {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '' : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
    }
</script>

<ul class="change-list">
    {#each entries as e (e.id)}
        <li class="change subpanel">
            <div>
                <p class="change-msg">
                    <span class="who">{e.actor || 'someone'}</span>
                    {verb(e.action)}
                    {#if e.target}<span class="what">{e.target}</span>{/if}
                </p>
                {#if e.detail}<p class="change-detail mono">{e.detail}</p>{/if}
            </div>
            <p class="change-meta mono">{when(e.at)} · {e.source}</p>
        </li>
    {/each}
</ul>

<style>
    .change-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .change {
        display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
        padding: 10px 14px;
    }
    .change-msg { margin: 0; font-size: 14px; }
    .who  { color: var(--ember-soft); }
    .what { font-family: var(--display); }
    .change-detail { margin: 4px 0 0; font-size: 11px; color: var(--muted); word-break: break-word; }
    .change-meta { flex: none; margin: 0; font-size: 11px; color: var(--muted); white-space: nowrap; }

    @media (max-width: 640px) {
        .change { flex-direction: column; gap: 6px; }
    }
</style>
