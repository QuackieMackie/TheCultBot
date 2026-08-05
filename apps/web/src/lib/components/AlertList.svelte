<script lang="ts">
    import { enhance } from '$app/forms';
    import type { Alert } from '@thecult/shared';

    let { alerts }: { alerts: Alert[] } = $props();

    // Fixed UTC rendering: the server and the browser must agree or hydration mismatches.
    function when(iso: string): string {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '' : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
    }
</script>

<ul class="omen-list">
    {#each alerts as a (a.id)}
        <li class="omen subpanel">
            <div>
                <p class="omen-msg">{a.message}</p>
                <p class="omen-meta mono">
                    {a.scope} · {when(a.lastAt)}{a.count > 1 ? ` · ${a.count} times` : ''}
                </p>
                {#if a.detail}<p class="omen-detail mono">{a.detail}</p>{/if}
            </div>
            <form method="POST" action="?/dismissAlert" use:enhance>
                <input type="hidden" name="id" value={a.id} />
                <button class="btn btn-ghost btn-sm">Dismiss</button>
            </form>
        </li>
    {/each}
</ul>

<style>
    .omen-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .omen {
        display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
        padding: 14px 16px;
        background: rgba(228, 85, 46, 0.06);
        border-color: rgba(228, 85, 46, 0.28);
    }
    .omen-msg { margin: 0; font-size: 14px; color: var(--ember-soft); }
    .omen-meta { margin: 6px 0 0; font-size: 11px; color: var(--muted); }
    .omen-detail { margin: 4px 0 0; font-size: 11px; color: var(--muted); opacity: 0.75; word-break: break-word; }
    .omen form { flex: none; }
</style>
