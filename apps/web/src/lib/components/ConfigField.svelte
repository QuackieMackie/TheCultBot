<script lang="ts">
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';
    import type { Snippet } from 'svelte';

    /** One `?/setConfig` form: the hidden key, a labelled control, and its own Set button. */
    interface Props {
        key: string;
        id: string;
        label: string;
        hint?: string;
        control: Snippet;
    }
    let { key, id, label, hint, control }: Props = $props();

    const keepValue: SubmitFunction = () => async ({ update }) => update({ reset: false });
</script>

<form class="setting" method="POST" action="?/setConfig" use:enhance={keepValue}>
    <input type="hidden" name="key" value={key} />
    <label for={id}>{label}</label>
    <div class="control">
        {@render control()}
        <button class="btn btn-sm">Set</button>
    </div>
    {#if hint}<span class="hint">{hint}</span>{/if}
</form>
