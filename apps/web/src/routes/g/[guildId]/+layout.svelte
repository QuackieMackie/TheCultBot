<script lang="ts">
    import GuildNav from '$lib/components/GuildNav.svelte';
    import PageHead from '$lib/components/PageHead.svelte';
    import type { LayoutData } from './$types';

    let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<PageHead title={data.guild.name} eyebrow="Council chamber" icon={data.guild.icon} size={62}>
    {#snippet action()}
        <a class="btn btn-ghost btn-sm" href="/">← All congregations</a>
    {/snippet}
</PageHead>

<div class="dash">
    <GuildNav guildId={data.guild.id} counts={data.counts} />
    <div class="dash-main">
        {@render children()}
    </div>
</div>

<style>
    .dash { display: grid; grid-template-columns: 196px 1fr; gap: 28px; padding-bottom: 40px; }
    .dash-main { min-width: 0; }

    @media (max-width: 860px) {
        .dash { grid-template-columns: 1fr; gap: 20px; }
    }
</style>
