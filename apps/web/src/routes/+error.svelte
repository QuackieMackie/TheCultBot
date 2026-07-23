<script lang="ts">
    import { page } from '$app/stores';
    import Seal from '$lib/Seal.svelte';
</script>

<section class="err-page">
    <Seal size={120} label="!" />
    <p class="eyebrow">{$page.status}</p>
    <h1>{$page.error?.message ?? 'The rite was interrupted'}</h1>
    <a class="btn btn-ghost" href="/">Return to the chamber</a>
</section>

<style>
    .err-page { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 20px; padding: 80px 0; }
    .err-page h1 { font-size: clamp(28px, 5vw, 44px); max-width: 22ch; }
</style>
