<script lang="ts">
    import Seal from '$lib/Seal.svelte';
    import type { Snippet } from 'svelte';

    interface Props {
        title: string;
        eyebrow: string;
        icon?: string | null;
        size?: number;
        align?: 'row' | 'centre';
        action?: Snippet;
    }
    let { title, eyebrow, icon = null, size = 76, align = 'row', action }: Props = $props();
</script>

<div class="head" class:centre={align === 'centre'}>
    <Seal {size} src={icon} label={title} />
    <div>
        <p class="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
    </div>
    {#if action}{@render action()}{/if}
</div>

<style>
    .head { display: flex; align-items: center; gap: 20px; padding: 40px 0 28px; }
    .head h1 { font-size: clamp(32px, 5vw, 46px); margin-top: 4px; }
    .head :global(.btn) { margin-left: auto; align-self: flex-start; }

    .centre {
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 80px 0;
    }
    .centre h1 { max-width: 22ch; }
    .centre :global(.btn) { margin-left: 0; align-self: auto; }

    @media (max-width: 640px) {
        .head { flex-wrap: wrap; }
        .head :global(.btn) { margin-left: 0; }
    }
</style>
