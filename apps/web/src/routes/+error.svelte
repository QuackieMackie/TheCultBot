<script lang="ts">
    import { page } from '$app/stores';
    import PageHead from '$lib/components/PageHead.svelte';
</script>

<PageHead
    title={$page.error?.message ?? 'The rite was interrupted'}
    eyebrow={String($page.status)}
    size={120}
    align="centre"
>
    {#snippet action()}
        <a class="btn btn-ghost" href="/">Return to the chamber</a>
    {/snippet}
</PageHead>
