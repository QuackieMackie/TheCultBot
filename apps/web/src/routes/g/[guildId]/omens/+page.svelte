<script lang="ts">
    import AlertList from '$lib/components/AlertList.svelte';
    import Flash from '$lib/components/Flash.svelte';
    import Panel from '$lib/components/Panel.svelte';
    import type { PageData, ActionData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

{#if form?.message}
    <Flash ok={form.ok} message={form.message} />
{/if}

<Panel
    rune="⚠"
    title="Ill omens"
    count={data.alerts.length > 0 ? `${data.alerts.length} unresolved` : undefined}
    tone={data.alerts.length > 0 ? 'warn' : undefined}
    lede="Things the bot could not do while nobody was watching. Each one clears itself once the bot succeeds again, or you can dismiss it here."
>
    {#if data.alerts.length > 0}
        <AlertList alerts={data.alerts} />
    {:else}
        <p class="muted">Nothing is wrong. The bot has done everything it was asked.</p>
    {/if}
</Panel>
