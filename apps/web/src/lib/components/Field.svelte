<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        id: string;
        label: string;
        hint?: string;
        hintTone?: 'warn';
        control: Snippet;
    }
    let { id, label, hint, hintTone, control }: Props = $props();
</script>

<div class="setting">
    <label for={id}>{label}</label>
    {@render control()}
    {#if hint}<span class="hint" class:warn={hintTone === 'warn'}>{hint}</span>{/if}
</div>
