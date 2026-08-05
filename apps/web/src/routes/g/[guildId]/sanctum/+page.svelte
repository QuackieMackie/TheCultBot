<script lang="ts">
    import ConfigField from '$lib/components/ConfigField.svelte';
    import Flash from '$lib/components/Flash.svelte';
    import Panel from '$lib/components/Panel.svelte';
    import type { PageData, ActionData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const textChannels = $derived(data.channels.filter((c) => c.kind === 'text'));

    function channelName(id: string): string {
        return data.channels.find((c) => c.id === id)?.name ?? '';
    }
</script>

{#if form?.message}
    <Flash ok={form.ok} message={form.message} />
{/if}

<Panel
    rune="⛧"
    title="The sanctum"
    lede="Who may command the bot, and where members claim their game roles."
>
    <div class="settings">
        <ConfigField
            key="manager_role_id"
            id="mgr"
            label="Manager role"
            hint="Admins can always manage. This role grants access too."
        >
            {#snippet control()}
                <select id="mgr" name="value">
                    <option value="">(none)</option>
                    {#each data.roles as r (r.id)}
                        <option value={r.id} selected={r.id === data.config.manager_role_id}>{r.name}</option>
                    {/each}
                </select>
            {/snippet}
        </ConfigField>

        <ConfigField
            key="role_board_channel_id"
            id="board"
            label="Role board channel"
            hint="Posts the self-serve group picker. Currently: {data.config.role_board_channel_id
                ? '#' + channelName(data.config.role_board_channel_id)
                : 'not set'}."
        >
            {#snippet control()}
                <select id="board" name="value">
                    {#each textChannels as c (c.id)}
                        <option value={c.id} selected={c.id === data.config.role_board_channel_id}>#{c.name}</option>
                    {/each}
                </select>
            {/snippet}
        </ConfigField>
    </div>
</Panel>
