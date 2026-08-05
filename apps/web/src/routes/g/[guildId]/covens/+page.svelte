<script lang="ts">
    import Flash from '$lib/components/Flash.svelte';
    import GroupCard from '$lib/components/GroupCard.svelte';
    import Panel from '$lib/components/Panel.svelte';
    import type { PageData, ActionData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    function channelName(id: string): string {
        return data.channels.find((c) => c.id === id)?.name ?? '';
    }

    function gamesIn(group: string): number {
        return data.games.filter((g) => g.group === group).length;
    }
</script>

{#if form?.message}
    <Flash ok={form.ok} message={form.message} />
{/if}

<Panel
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
        <p class="muted">No groups yet. Adding a game in the pantheon creates the first one.</p>
    {/if}
</Panel>

<style>
    .covens { display: grid; gap: 14px; }
</style>
