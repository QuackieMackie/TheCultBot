<script lang="ts">
    import { enhance } from '$app/forms';
    import AlertList from '$lib/components/AlertList.svelte';
    import AuditList from '$lib/components/AuditList.svelte';
    import Flash from '$lib/components/Flash.svelte';
    import Panel from '$lib/components/Panel.svelte';
    import StatTile from '$lib/components/StatTile.svelte';
    import type { PageData, ActionData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const base   = $derived(`/g/${data.guild.id}`);
    const autoOn = $derived(data.config.poll_auto_enabled === 'true');

    function channelName(id: string): string {
        return data.channels.find((c) => c.id === id)?.name ?? '';
    }

    const boardChannel = $derived(
        data.config.role_board_channel_id ? '#' + channelName(data.config.role_board_channel_id) : 'not set'
    );
</script>

{#if form?.message}
    <Flash ok={form.ok} message={form.message} />
{/if}

<div class="status panel">
    <div class="status-head">
        <div>
            <p class="eyebrow">Next drawing</p>
            <p class="status-text">
                Monday at <span class="mono">{data.config.poll_hour_utc || '9'}:00 UTC</span>
                {#if data.config.poll_channel_id}in <span class="mono">#{channelName(data.config.poll_channel_id)}</span>{/if},
                drawing <span class="mono">{data.config.poll_size || '5'}</span> games for
                <span class="mono">{data.config.poll_duration_hours || '24'}h</span>.
            </p>
        </div>

        <form method="POST" action="?/setConfig" use:enhance>
            <input type="hidden" name="key" value="poll_auto_enabled" />
            <input type="hidden" name="value" value={autoOn ? 'false' : 'true'} />
            <label class="toggle">
                <input type="checkbox" checked={autoOn} onchange={(e) => e.currentTarget.form?.requestSubmit()} />
                <span class="track"></span>
                <span class="badge {autoOn ? 'on' : 'off'}">{autoOn ? 'Auto on' : 'Auto off'}</span>
            </label>
        </form>
    </div>

    <div class="status-foot">
        <form method="POST" action="?/runPoll" use:enhance>
            <input type="hidden" name="mode" value="weighted" />
            <button class="btn btn-ember" disabled={data.counts.games === 0}>Summon a poll now</button>
        </form>
        <a class="mono more" href="{base}/rite">Change the rite →</a>
    </div>
</div>

{#if data.alerts.length > 0}
    <Panel
        rune="⚠"
        title="Ill omens"
        count="{data.counts.alerts} unresolved"
        tone="warn"
        lede="Things the bot could not do while nobody was watching."
    >
        {#snippet action()}
            <a class="btn btn-ghost btn-sm" href="{base}/omens">See all</a>
        {/snippet}
        <AlertList alerts={data.alerts} />
    </Panel>
{/if}

<div class="tiles">
    <StatTile href="{base}/pantheon" value={data.counts.games} label="Games" />
    <StatTile href="{base}/covens" value={data.counts.groups} label="Covens" />
    <StatTile href="{base}/sanctum" value={boardChannel} label="Role board" muted />
</div>

<Panel rune="✎" title="Lately" lede="The most recent changes to this server.">
    {#snippet action()}
        <a class="btn btn-ghost btn-sm" href="{base}/chronicle">The chronicle</a>
    {/snippet}
    {#if data.audit.length > 0}
        <AuditList entries={data.audit} />
    {:else}
        <p class="muted">Nothing has happened here yet.</p>
    {/if}
</Panel>

<style>
    .status { padding: 20px 22px; margin-bottom: 24px; display: grid; gap: 16px; }
    .status-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
    .status-text { margin: 6px 0 0; color: var(--bone-dim); }

    .status-foot { display: flex; align-items: center; gap: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
    .more { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
    .more:hover { color: var(--ember); }

    .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 24px; }

    @media (max-width: 640px) {
        .status-head { flex-direction: column; }
        .tiles { grid-template-columns: 1fr; }
    }
</style>
