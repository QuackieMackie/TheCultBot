<script lang="ts">
    import { untrack } from 'svelte';
    import { enhance } from '$app/forms';
    import Field from './Field.svelte';
    import type { ChannelSummary, RoleSummary } from '$lib/types';
    import type { Group } from '@thecult/shared';

    interface Props {
        groups: Group[];
        textChannels: ChannelSummary[];
        voiceChannels: ChannelSummary[];
        roles: RoleSummary[];
        claimed: Record<string, string>;
    }
    let { groups, textChannels, voiceChannels, roles, claimed }: Props = $props();

    // Only the opening default: a reload must not yank the dropdown out from under an edit.
    let groupChoice = $state(untrack(() => groups[0]?.name ?? '__new__'));
    const creatingGroup = $derived(groupChoice === '__new__');
    const importing     = $derived(groupChoice === '__import__');
    const formAction    = $derived(importing ? '?/importGame' : '?/addGame');

    // Import adopts the channels as they are, so the voice list is held to the category the
    // chosen text channel already sits in.
    let importText = $state('');
    const importTextChannel  = $derived(textChannels.find((c) => c.id === importText));
    const importCategory     = $derived(importTextChannel?.parentId ?? null);
    const importVoiceOptions = $derived(voiceChannels.filter((c) => c.parentId === importCategory));

    let importRole = $state('');

    function claimedBy(id: string): string | undefined {
        return claimed[id];
    }

    const importHint = $derived(
        importTextChannel && !importCategory
            ? `#${importTextChannel.name} is not inside a category. Move it and the voice channel under one category first.`
            : !importCategory
                ? 'Pick a text channel first. The voice list then narrows to its category, since both channels must share one.'
                : 'Adopts these channels as they are: no messages, permissions, or names are touched. Only the role is created, and only if you asked for one.'
    );
</script>

<form class="add-game" method="POST" action={formAction} use:enhance>
    <div class="settings add-core">
        <Field id="g_name" label="Game name">
            {#snippet control()}
                <input id="g_name" name="name" type="text" maxlength="55" placeholder="e.g. Deep Rock Galactic" required />
            {/snippet}
        </Field>
        <Field id="g_group" label="Group">
            {#snippet control()}
                <select id="g_group" name="groupChoice" bind:value={groupChoice}>
                    {#each groups as grp (grp.name)}<option value={grp.name}>{grp.name}</option>{/each}
                    <option value="__new__">＋ Create a new group…</option>
                    <option value="__import__">⇱ Use channels that already exist…</option>
                </select>
            {/snippet}
        </Field>
        <Field id="g_pc" label="Players needed">
            {#snippet control()}
                <input id="g_pc" name="playerCount" type="number" min="1" value="1" />
            {/snippet}
        </Field>
    </div>

    {#if creatingGroup}
        <div class="settings new-group">
            <Field id="ng_name" label="New group name">
                {#snippet control()}
                    <input id="ng_name" name="newGroup" type="text" placeholder="e.g. Co-op shooters" required />
                {/snippet}
            </Field>
            <Field id="ng_role" label="Role name">
                {#snippet control()}
                    <input id="ng_role" name="roleName" type="text" placeholder="e.g. Drillers" required />
                {/snippet}
            </Field>
            <Field id="ng_colour" label="Role colour">
                {#snippet control()}
                    <input id="ng_colour" name="roleColour" type="text" placeholder="blurple or #5865F2" />
                {/snippet}
            </Field>
            <Field id="ng_text" label="Text channel">
                {#snippet control()}
                    <input id="ng_text" name="textChannel" type="text" placeholder="e.g. drg-chat" required />
                {/snippet}
            </Field>
            <Field id="ng_voice" label="Voice channel">
                {#snippet control()}
                    <input id="ng_voice" name="voiceChannel" type="text" placeholder="e.g. DRG Voice" required />
                {/snippet}
            </Field>
        </div>
        <p class="hint">Creating a group makes a real Discord role, category, and text/voice channels.</p>
    {/if}

    {#if importing}
        <div class="settings new-group">
            <Field id="im_group" label="New group name">
                {#snippet control()}
                    <input id="im_group" name="newGroup" type="text" placeholder="e.g. Deadlock" required />
                {/snippet}
            </Field>
            <Field id="im_text" label="Existing text channel">
                {#snippet control()}
                    <select id="im_text" name="textChannelId" bind:value={importText} required>
                        <option value="" disabled>Choose a channel…</option>
                        {#each textChannels as c (c.id)}
                            <option value={c.id} disabled={!!claimedBy(c.id)}>
                                #{c.name}{claimedBy(c.id) ? ` (in ${claimedBy(c.id)})` : ''}
                            </option>
                        {/each}
                    </select>
                {/snippet}
            </Field>
            <Field id="im_voice" label="Existing voice channel">
                {#snippet control()}
                    {#key importText}
                        <select id="im_voice" name="voiceChannelId" required disabled={!importCategory}>
                            <option value="" disabled selected>Choose a channel…</option>
                            {#each importVoiceOptions as c (c.id)}
                                <option value={c.id} disabled={!!claimedBy(c.id)}>
                                    {c.name}{claimedBy(c.id) ? ` (in ${claimedBy(c.id)})` : ''}
                                </option>
                            {/each}
                        </select>
                    {/key}
                {/snippet}
            </Field>
            <Field id="im_role" label="Access role">
                {#snippet control()}
                    <select id="im_role" name="roleId" bind:value={importRole}>
                        <option value="">＋ Create a new role</option>
                        {#each roles as r (r.id)}
                            <option value={r.id}>{r.name}</option>
                        {/each}
                    </select>
                {/snippet}
            </Field>
            {#if !importRole}
                <Field id="im_rolename" label="New role name">
                    {#snippet control()}
                        <input id="im_rolename" name="roleName" type="text" placeholder="defaults to the group name" />
                    {/snippet}
                </Field>
                <Field id="im_colour" label="New role colour">
                    {#snippet control()}
                        <input id="im_colour" name="roleColour" type="text" placeholder="blurple or #5865F2" />
                    {/snippet}
                </Field>
            {/if}
        </div>
        <p class="hint" class:warn={importTextChannel && !importCategory}>{importHint}</p>
    {/if}

    <div class="add-actions">
        <button class="btn btn-ember" disabled={importing && !importCategory}>{importing ? 'Import game' : 'Add game'}</button>
    </div>
</form>

<style>
    .add-game { display: grid; gap: 18px; }
    .add-core { grid-template-columns: 2fr 1.4fr 1fr; }
    .new-group { grid-template-columns: repeat(3, 1fr); }
    .add-actions { display: flex; }

    @media (max-width: 720px) {
        .add-core, .new-group { grid-template-columns: 1fr; }
    }
</style>
