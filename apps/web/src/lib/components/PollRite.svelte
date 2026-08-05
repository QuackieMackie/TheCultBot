<script lang="ts">
    import { enhance } from '$app/forms';
    import ConfigField from './ConfigField.svelte';
    import type { ChannelSummary, RoleSummary } from '$lib/types';
    import type { Game } from '@thecult/shared';

    interface Props {
        config: Record<string, string>;
        textChannels: ChannelSummary[];
        games: Game[];
        roles: RoleSummary[];
    }
    let { config, textChannels, games, roles }: Props = $props();

    let pollMode = $state('weighted');
    const pickOpen = $derived(pollMode === 'pick');

    // Mirrors MAX_POLL_MESSAGE_LENGTH. Importing it would drag @thecult/shared, and the node
    // builtins storage.ts pulls in, into the client bundle. The bot validates authoritatively.
    const MAX_MESSAGE = 2000;

    let messageBox: HTMLTextAreaElement;

    // A named role only pings when written as its raw <@&id> token, which nobody should have to
    // type, so the picker splices one in at the cursor and resets itself.
    function insertMention(event: Event) {
        const picker = event.currentTarget as HTMLSelectElement;
        const token = picker.value;
        picker.selectedIndex = 0;
        if (!token) return;

        const from = messageBox.selectionStart;
        const to = messageBox.selectionEnd;
        messageBox.value = messageBox.value.slice(0, from) + token + messageBox.value.slice(to);
        messageBox.focus();
        messageBox.selectionStart = messageBox.selectionEnd = from + token.length;
    }
</script>

<div class="settings">
    <ConfigField
        key="poll_channel_id"
        id="poll_channel"
        label="Poll channel"
        hint={textChannels.length === 0 ? 'No channels loaded. Is the bot in this server?' : undefined}
    >
        {#snippet control()}
            <select id="poll_channel" name="value">
                {#each textChannels as c (c.id)}
                    <option value={c.id} selected={c.id === config.poll_channel_id}>#{c.name}</option>
                {/each}
            </select>
        {/snippet}
    </ConfigField>

    <ConfigField key="poll_size" id="poll_size" label="Games per poll">
        {#snippet control()}
            <input id="poll_size" name="value" type="number" min="1" max="10" value={config.poll_size || '5'} />
        {/snippet}
    </ConfigField>

    <ConfigField key="poll_hour_utc" id="poll_hour" label="Poll hour (UTC)">
        {#snippet control()}
            <input id="poll_hour" name="value" type="number" min="0" max="23" value={config.poll_hour_utc || '9'} />
        {/snippet}
    </ConfigField>

    <ConfigField key="poll_duration_hours" id="poll_dur" label="Open for (hours)">
        {#snippet control()}
            <input id="poll_dur" name="value" type="number" min="1" max="168" value={config.poll_duration_hours || '24'} />
        {/snippet}
    </ConfigField>

    <div class="wide">
        <ConfigField
            key="poll_message"
            id="poll_msg"
            label="Message above the poll"
            hint="Posted with the poll. @everyone and @here work as typed; use the picker for a role. Leave it empty to post the poll on its own."
        >
            {#snippet control()}
                <div class="message">
                    <textarea
                        id="poll_msg"
                        name="value"
                        rows="3"
                        maxlength={MAX_MESSAGE}
                        bind:this={messageBox}
                        value={config.poll_message ?? ''}
                    ></textarea>
                    <select aria-label="Insert a mention" onchange={insertMention}>
                        <option value="">Insert a mention...</option>
                        <option value="@everyone">@everyone</option>
                        <option value="@here">@here</option>
                        {#each roles as r (r.id)}
                            <option value={`<@&${r.id}>`}>@{r.name}</option>
                        {/each}
                    </select>
                </div>
            {/snippet}
        </ConfigField>
    </div>
</div>

<form class="summon" method="POST" action="?/runPoll" use:enhance>
    <label for="mode">Summon a poll now</label>
    <div class="control">
        <select id="mode" name="mode" bind:value={pollMode}>
            <option value="weighted">Weighted: favour un-played games</option>
            <option value="random">Random selection</option>
            <option value="pick">Hand-pick the games</option>
        </select>
        <button class="btn btn-ember">Post the poll</button>
    </div>

    {#if pickOpen}
        <div class="pick-grid">
            {#each games as g (g.name)}
                <label class="pick">
                    <input type="checkbox" name="gameNames" value={g.name} />
                    <span>{g.name}</span>
                </label>
            {/each}
            {#if games.length === 0}
                <p class="muted empty">The roster is empty. Add a game below first.</p>
            {/if}
        </div>
    {/if}
</form>

<style>
    .wide { grid-column: 1 / -1; }
    .message { flex: 1; min-width: 0; display: grid; gap: 8px; }
    .message select { max-width: 260px; }

    .summon { margin-top: 26px; padding-top: 24px; border-top: 1px solid var(--line); display: grid; gap: 8px; max-width: 520px; }
    .summon > label { font-size: 12px; letter-spacing: 0.04em; color: var(--bone-dim); }

    .pick-grid { margin-top: 6px; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
    .pick { display: flex; align-items: center; gap: 8px; font-size: 13.5px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
    .pick:hover { background: var(--panel-2); }
    .pick input { accent-color: var(--ember); }
    .empty { margin: 0; }
</style>
