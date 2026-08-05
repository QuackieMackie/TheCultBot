<script lang="ts">
    import { enhance } from '$app/forms';
    import AddGameForm from '$lib/components/AddGameForm.svelte';
    import AlertList from '$lib/components/AlertList.svelte';
    import AuditList from '$lib/components/AuditList.svelte';
    import ConfigField from '$lib/components/ConfigField.svelte';
    import Flash from '$lib/components/Flash.svelte';
    import GameTable from '$lib/components/GameTable.svelte';
    import GroupCard from '$lib/components/GroupCard.svelte';
    import PageHead from '$lib/components/PageHead.svelte';
    import Panel from '$lib/components/Panel.svelte';
    import PollRite from '$lib/components/PollRite.svelte';
    import type { PageData, ActionData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const autoOn = $derived(data.config.poll_auto_enabled === 'true');

    const textChannels  = $derived(data.channels.filter((c) => c.kind === 'text'));
    const voiceChannels = $derived(data.channels.filter((c) => c.kind === 'voice'));

    function channelName(id: string): string {
        return data.channels.find((c) => c.id === id)?.name ?? '';
    }

    function gamesIn(group: string): number {
        return data.games.filter((g) => g.group === group).length;
    }
</script>

<PageHead title={data.guild.name} eyebrow="Council chamber" icon={data.guild.icon}>
    {#snippet action()}
        <a class="btn btn-ghost btn-sm" href="/">← All congregations</a>
    {/snippet}
</PageHead>

<div class="status subpanel">
    <div class="status-main">
        <p class="status-text">
            Drawn every Monday at
            <span class="mono">{data.config.poll_hour_utc || '9'}:00 UTC</span>
            {#if data.config.poll_channel_id}in <span class="mono">#{channelName(data.config.poll_channel_id)}</span>{/if}.
        </p>
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

    <nav class="rail mono">
        {#if data.alerts.length > 0}<a href="#omens" class="warn">⚠ {data.alerts.length} omens</a>{/if}
        <a href="#rite">The weekly rite</a>
        <a href="#pantheon">{data.games.length} games</a>
        <a href="#add">Add a game</a>
        <a href="#covens">{data.groups.length} groups</a>
        <a href="#sanctum">The sanctum</a>
        {#if data.audit.length > 0}<a href="#chronicle">The chronicle</a>{/if}
    </nav>
</div>

{#if form?.message}
    <Flash ok={form.ok} message={form.message} />
{/if}

{#if data.alerts.length > 0}
    <Panel
        id="omens"
        rune="⚠"
        title="Ill omens"
        count="{data.alerts.length} unresolved"
        tone="warn"
        lede="Things the bot could not do while nobody was watching. Each one clears itself once the bot succeeds again, or you can dismiss it here."
    >
        <AlertList alerts={data.alerts} />
    </Panel>
{/if}

<Panel
    id="rite"
    rune="☾"
    title="The weekly rite"
    lede="When the poll is drawn, where it lands, and how long it stays open."
>
    <PollRite config={data.config} {textChannels} games={data.games} />
</Panel>

<Panel
    id="pantheon"
    rune="✧"
    title="The pantheon"
    count="{data.games.length} games"
    lede="Every game the poll can draw from. Renaming one only changes the roster and future poll entries, since its role and channels belong to the group."
>
    {#if data.games.length > 0}
        <GameTable games={data.games} groups={data.groups} />
    {:else}
        <p class="muted">No games yet. Add the first one below.</p>
    {/if}
</Panel>

<Panel
    id="add"
    rune="＋"
    title="Add a game"
    lede="Put it in a group that already exists, create a new one, or adopt channels the server already has."
>
    <AddGameForm groups={data.groups} {textChannels} {voiceChannels} roles={data.roles} claimed={data.claimed} />
</Panel>

<Panel
    id="covens"
    rune="❖"
    title="The covens"
    count="{data.groups.length} groups"
    lede="A group owns the Discord role and channels that its games share, so role names and colours are set here. Renaming a group renames its category too, unless the group was imported."
>
    {#if data.groups.length > 0}
        <div class="covens">
            {#each data.groups as grp, i (grp.name)}
                <GroupCard
                    group={grp}
                    index={i}
                    gameCount={gamesIn(grp.name)}
                    textChannelName={channelName(grp.textChannelId)}
                    voiceChannelName={channelName(grp.voiceChannelId)}
                />
            {/each}
        </div>
    {:else}
        <p class="muted">No groups yet. Adding a game creates the first one.</p>
    {/if}
</Panel>

<Panel
    id="sanctum"
    rune="⛧"
    title="The sanctum"
    lede="Who may command the bot, and where members claim their game roles."
>
    <div class="settings">
        <ConfigField
            key="manager_role_id"
            id="mgr"
            label="Manager role"
            hint="Admins can always manage. This role grants access too."
        >
            {#snippet control()}
                <select id="mgr" name="value">
                    <option value="">(none)</option>
                    {#each data.roles as r (r.id)}
                        <option value={r.id} selected={r.id === data.config.manager_role_id}>{r.name}</option>
                    {/each}
                </select>
            {/snippet}
        </ConfigField>

        <ConfigField
            key="role_board_channel_id"
            id="board"
            label="Role board channel"
            hint="Posts the self-serve group picker. Currently: {data.config.role_board_channel_id
                ? '#' + channelName(data.config.role_board_channel_id)
                : 'not set'}."
        >
            {#snippet control()}
                <select id="board" name="value">
                    {#each textChannels as c (c.id)}
                        <option value={c.id} selected={c.id === data.config.role_board_channel_id}>#{c.name}</option>
                    {/each}
                </select>
            {/snippet}
        </ConfigField>
    </div>
</Panel>

{#if data.audit.length > 0}
    <Panel
        id="chronicle"
        rune="✎"
        title="The chronicle"
        count="last {data.audit.length}"
        lede="Recent changes to this server, from the dashboard and from slash commands alike. Older entries drop off as new ones arrive."
    >
        <AuditList entries={data.audit} />
    </Panel>
{/if}

<style>
    .status { padding: 14px 16px; margin-bottom: 24px; display: grid; gap: 12px; }
    .status-main { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .status-text { margin: 0; color: var(--muted); }

    .rail { display: flex; flex-wrap: wrap; gap: 8px 18px; padding-top: 12px; border-top: 1px solid var(--line); }
    .rail a { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
    .rail a:hover { color: var(--ember); }
    .rail a.warn { color: var(--ember-soft); }

    .covens { display: grid; gap: 14px; }

    @media (max-width: 640px) {
        .status-main { flex-direction: column; align-items: flex-start; }
    }
</style>
