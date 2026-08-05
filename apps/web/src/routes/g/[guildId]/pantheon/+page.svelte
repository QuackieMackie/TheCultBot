<script lang="ts">
    import { untrack } from 'svelte';
    import AddGameForm from '$lib/components/AddGameForm.svelte';
    import Flash from '$lib/components/Flash.svelte';
    import GameTable from '$lib/components/GameTable.svelte';
    import Panel from '$lib/components/Panel.svelte';
    import type { PageData, ActionData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const textChannels  = $derived(data.channels.filter((c) => c.kind === 'text'));
    const voiceChannels = $derived(data.channels.filter((c) => c.kind === 'voice'));

    // Open by default when there is nothing to look at, or when a submission bounced back
    // without JavaScript, so the error never points at a form that is out of sight.
    let adding = $state(untrack(() => data.games.length === 0 || (!!form && !form.ok)));
</script>

{#if form?.message}
    <Flash ok={form.ok} message={form.message} />
{/if}

<Panel
    rune="✧"
    title="The pantheon"
    count="{data.games.length} games"
    lede="Every game the poll can draw from. Renaming one only changes the roster and future poll entries, since its role and channels belong to the group."
>
    {#snippet action()}
        <button
            type="button"
            class="btn btn-sm"
            class:btn-ember={!adding && data.games.length > 0}
            aria-expanded={adding}
            aria-controls="add-game"
            onclick={() => (adding = !adding)}
        >
            {adding ? 'Close' : '＋ Add a game'}
        </button>
    {/snippet}

    {#if data.games.length > 0}
        <GameTable games={data.games} groups={data.groups} />
    {:else}
        <p class="muted">No games yet. Add the first one below.</p>
    {/if}

    {#if adding}
        <div id="add-game" class="adder">
            <h3>Add a game</h3>
            <p class="hint">Put it in a group that already exists, create a new one, or adopt channels the server already has.</p>
            <AddGameForm
                groups={data.groups}
                {textChannels}
                {voiceChannels}
                roles={data.roles}
                claimed={data.claimed}
                onDone={(ok) => { if (ok) adding = false; }}
            />
        </div>
    {/if}
</Panel>

<style>
    .adder { margin-top: 26px; padding-top: 24px; border-top: 1px solid var(--line); display: grid; gap: 6px; }
    .adder h3 { font-size: 22px; }
    .adder .hint { margin-bottom: 12px; }
</style>
