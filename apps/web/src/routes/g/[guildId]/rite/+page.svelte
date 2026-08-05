<script lang="ts">
    import Flash from '$lib/components/Flash.svelte';
    import Panel from '$lib/components/Panel.svelte';
    import PollRite from '$lib/components/PollRite.svelte';
    import type { PageData, ActionData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const textChannels = $derived(data.channels.filter((c) => c.kind === 'text'));
</script>

{#if form?.message}
    <Flash ok={form.ok} message={form.message} />
{/if}

<Panel
    rune="☾"
    title="The weekly rite"
    lede="When the poll is drawn, where it lands, and how long it stays open."
>
    <PollRite config={data.config} {textChannels} games={data.games} />
</Panel>
