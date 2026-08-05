<script lang="ts">
    import { enhance } from '$app/forms';
    import Field from './Field.svelte';
    import type { Group } from '@thecult/shared';

    interface Props {
        group: Group;
        index: number;
        gameCount: number;
        textChannelName: string;
        voiceChannelName: string;
    }
    let { group, index, gameCount, textChannelName, voiceChannelName }: Props = $props();

    const meta = $derived(
        [
            `${gameCount} games`,
            `#${textChannelName || 'channel missing'}`,
            voiceChannelName || 'channel missing',
            ...(group.adopted ? ['imported'] : []),
            ...(group.roleId ? [] : ['no role'])
        ].join(' · ')
    );
</script>

<form class="coven subpanel" method="POST" action="?/editGroup" use:enhance>
    <input type="hidden" name="name" value={group.name} />
    <div class="settings coven-fields">
        <Field id="cv_name_{index}" label="Group name">
            {#snippet control()}
                <input id="cv_name_{index}" name="newName" type="text" maxlength="100" value={group.name} required />
            {/snippet}
        </Field>
        <Field id="cv_role_{index}" label="Role name">
            {#snippet control()}
                <input id="cv_role_{index}" name="roleName" type="text" maxlength="100" value={group.roleName} required />
            {/snippet}
        </Field>
        <Field id="cv_colour_{index}" label="Role colour">
            {#snippet control()}
                <div class="control">
                    <span class="swatch" style="background:{group.roleColour || '#5865F2'}"></span>
                    <input id="cv_colour_{index}" name="roleColour" type="text" value={group.roleColour} placeholder="blurple or #5865F2" />
                </div>
            {/snippet}
        </Field>
    </div>
    <div class="coven-foot">
        <span class="coven-meta mono">{meta}</span>
        <button class="btn btn-sm">Save</button>
    </div>
</form>

<style>
    .coven { padding: 16px 18px; }
    .coven-fields { grid-template-columns: 1fr 1fr 1fr; }
    .coven-foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 14px; }
    .coven-meta { font-size: 11px; color: var(--muted); }
    .swatch { flex: none; width: 22px; height: 22px; border-radius: 6px; border: 1px solid var(--line-strong); }

    @media (max-width: 720px) {
        .coven-fields { grid-template-columns: 1fr; }
    }
</style>
