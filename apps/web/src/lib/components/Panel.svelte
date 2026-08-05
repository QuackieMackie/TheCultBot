<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        id?: string;
        rune: string;
        title: string;
        count?: string;
        lede?: string;
        tone?: 'warn';
        children: Snippet;
    }
    let { id, rune, title, count, lede, tone, children }: Props = $props();
</script>

<section {id} class="block panel" class:warn={tone === 'warn'}>
    <div class="section-head">
        <span class="rune">{rune}</span>
        <h2>{title}</h2>
        {#if count}<span class="count mono">{count}</span>{/if}
    </div>
    {#if lede}<p class="section-lede muted">{lede}</p>{/if}

    {@render children()}
</section>

<style>
    .block { padding: 30px 28px; margin-bottom: 24px; scroll-margin-top: 24px; }
    .section-lede { margin: -8px 0 20px; }
    .count { align-self: center; font-size: 12px; color: var(--muted); }

    .warn { border-color: rgba(228, 85, 46, 0.4); }
    .warn .rune { color: var(--ember); }

    @media (max-width: 640px) {
        .block { padding: 24px 18px; }
    }
</style>
