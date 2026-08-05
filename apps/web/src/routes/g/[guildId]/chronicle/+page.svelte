<script lang="ts">
    import AuditList from '$lib/components/AuditList.svelte';
    import Panel from '$lib/components/Panel.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<Panel
    rune="✎"
    title="The chronicle"
    count="last {data.audit.length}"
    lede="Recent changes to this server, from the dashboard and from slash commands alike. Older entries drop off as new ones arrive."
>
    {#if data.audit.length > 0}
        <AuditList entries={data.audit} />
    {:else}
        <p class="muted">Nothing has been written down yet.</p>
    {/if}
</Panel>
