<script lang="ts">
    import { enhance } from '$app/forms';
    import Seal from '$lib/Seal.svelte';
    import type { PageData, ActionData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const autoOn = $derived(data.config.poll_auto_enabled === 'true');

    let pollMode = $state('weighted');
    const pickOpen = $derived(pollMode === 'pick');

    let groupChoice = $state(data.groups[0] ?? '__new__');
    const creatingGroup = $derived(groupChoice === '__new__');

    function channelName(id: string): string {
        return data.channels.find((c) => c.id === id)?.name ?? '';
    }
</script>

<div class="guild-head">
    <Seal size={76} src={data.guild.icon} label={data.guild.name} />
    <div>
        <p class="eyebrow">Council chamber</p>
        <h1>{data.guild.name}</h1>
    </div>
    <a class="btn btn-ghost btn-sm back" href="/">← All congregations</a>
</div>

{#if form?.message}
    <div class="flash {form.ok ? 'ok' : 'err'}">{form.message}</div>
{/if}

<section class="block panel">
    <div class="section-head">
        <span class="rune">☾</span>
        <h2>The weekly rite</h2>
    </div>

    <div class="status-row">
        <p class="status-text">
            Drawn every Monday at
            <span class="mono">{data.config.poll_hour_utc || '9'}:00 UTC</span>
            {#if data.config.poll_channel_id}in <span class="mono">#{channelName(data.config.poll_channel_id)}</span>{/if}.
        </p>
        <form method="POST" action="?/setConfig" use:enhance>
            <input type="hidden" name="key" value="poll_auto_enabled" />
            <input type="hidden" name="value" value={autoOn ? 'false' : 'true'} />
            <label class="toggle">
                <input type="checkbox" checked={autoOn} onchange={(e) => e.currentTarget.form?.requestSubmit()} />
                <span class="track"></span>
                <span class="badge {autoOn ? 'on' : 'off'}">{autoOn ? 'Auto on' : 'Auto off'}</span>
            </label>
        </form>
    </div>

    <div class="settings">
        <form class="setting" method="POST" action="?/setConfig" use:enhance>
            <input type="hidden" name="key" value="poll_channel_id" />
            <label for="poll_channel">Poll channel</label>
            <div class="control">
                <select id="poll_channel" name="value">
                    {#each data.channels as c (c.id)}
                        <option value={c.id} selected={c.id === data.config.poll_channel_id}>#{c.name}</option>
                    {/each}
                </select>
                <button class="btn btn-sm">Set</button>
            </div>
            {#if data.channels.length === 0}<span class="hint">No channels loaded. Is the bot in this server?</span>{/if}
        </form>

        <form class="setting" method="POST" action="?/setConfig" use:enhance>
            <input type="hidden" name="key" value="poll_size" />
            <label for="poll_size">Games per poll</label>
            <div class="control">
                <input id="poll_size" name="value" type="number" min="1" max="10" value={data.config.poll_size || '5'} />
                <button class="btn btn-sm">Set</button>
            </div>
        </form>

        <form class="setting" method="POST" action="?/setConfig" use:enhance>
            <input type="hidden" name="key" value="poll_hour_utc" />
            <label for="poll_hour">Poll hour (UTC)</label>
            <div class="control">
                <input id="poll_hour" name="value" type="number" min="0" max="23" value={data.config.poll_hour_utc || '9'} />
                <button class="btn btn-sm">Set</button>
            </div>
        </form>

        <form class="setting" method="POST" action="?/setConfig" use:enhance>
            <input type="hidden" name="key" value="poll_duration_hours" />
            <label for="poll_dur">Open for (hours)</label>
            <div class="control">
                <input id="poll_dur" name="value" type="number" min="1" max="168" value={data.config.poll_duration_hours || '24'} />
                <button class="btn btn-sm">Set</button>
            </div>
        </form>
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
                {#each data.games as g (g.name)}
                    <label class="pick">
                        <input type="checkbox" name="gameNames" value={g.name} />
                        <span>{g.name}</span>
                    </label>
                {/each}
                {#if data.games.length === 0}
                    <p class="muted" style="margin:0">The roster is empty. Add a game below first.</p>
                {/if}
            </div>
        {/if}
    </form>
</section>

<section class="block panel">
    <div class="section-head">
        <span class="rune">✧</span>
        <h2>The pantheon</h2>
        <span class="count mono">{data.games.length} games</span>
    </div>

    {#if data.games.length > 0}
        <table class="table">
            <thead>
                <tr><th>Game</th><th>Group</th><th style="width:150px">Players needed</th><th style="width:90px"></th></tr>
            </thead>
            <tbody>
                {#each data.games as g (g.name)}
                    <tr>
                        <td class="game-name">{g.name}</td>
                        <td><span class="grp">{g.group || '(none)'}</span></td>
                        <td>
                            <form class="inline" method="POST" action="?/editGame" use:enhance>
                                <input type="hidden" name="name" value={g.name} />
                                <input name="playerCount" type="number" min="1" value={g.playerCount} style="width:74px" />
                                <button class="btn btn-sm btn-ghost">Save</button>
                            </form>
                        </td>
                        <td>
                            <form method="POST" action="?/removeGame" use:enhance>
                                <input type="hidden" name="name" value={g.name} />
                                <button class="btn btn-sm btn-danger">Remove</button>
                            </form>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    {:else}
        <p class="muted">No games yet. Add the first one below.</p>
    {/if}

    <form class="add-game" method="POST" action="?/addGame" use:enhance>
        <p class="add-title eyebrow">Add a game</p>
        <div class="settings add-core">
            <div class="setting">
                <label for="g_name">Game name</label>
                <input id="g_name" name="name" type="text" maxlength="55" placeholder="e.g. Deep Rock Galactic" required />
            </div>
            <div class="setting">
                <label for="g_group">Group</label>
                <select id="g_group" name="groupChoice" bind:value={groupChoice}>
                    {#each data.groups as grp}<option value={grp}>{grp}</option>{/each}
                    <option value="__new__">＋ Create a new group…</option>
                </select>
            </div>
            <div class="setting">
                <label for="g_pc">Players needed</label>
                <input id="g_pc" name="playerCount" type="number" min="1" value="1" />
            </div>
        </div>

        {#if creatingGroup}
            <div class="settings new-group">
                <div class="setting">
                    <label for="ng_name">New group name</label>
                    <input id="ng_name" name="newGroup" type="text" placeholder="e.g. Co-op shooters" required />
                </div>
                <div class="setting">
                    <label for="ng_role">Role name</label>
                    <input id="ng_role" name="roleName" type="text" placeholder="e.g. Drillers" required />
                </div>
                <div class="setting">
                    <label for="ng_colour">Role colour</label>
                    <input id="ng_colour" name="roleColour" type="text" placeholder="blurple or #5865F2" />
                </div>
                <div class="setting">
                    <label for="ng_text">Text channel</label>
                    <input id="ng_text" name="textChannel" type="text" placeholder="e.g. drg-chat" required />
                </div>
                <div class="setting">
                    <label for="ng_voice">Voice channel</label>
                    <input id="ng_voice" name="voiceChannel" type="text" placeholder="e.g. DRG Voice" required />
                </div>
            </div>
            <p class="hint">Creating a group makes a real Discord role, category, and text/voice channels.</p>
        {/if}

        <div class="add-actions">
            <button class="btn btn-ember">Add game</button>
        </div>
    </form>
</section>

<section class="block panel">
    <div class="section-head">
        <span class="rune">⛧</span>
        <h2>The sanctum</h2>
    </div>
    <p class="section-lede muted">Who may command the bot, and where members claim their game roles.</p>

    <div class="settings">
        <form class="setting" method="POST" action="?/setConfig" use:enhance>
            <input type="hidden" name="key" value="manager_role_id" />
            <label for="mgr">Manager role</label>
            <div class="control">
                <select id="mgr" name="value">
                    <option value="">(none)</option>
                    {#each data.roles as r (r.id)}
                        <option value={r.id} selected={r.id === data.config.manager_role_id}>{r.name}</option>
                    {/each}
                </select>
                <button class="btn btn-sm">Set</button>
            </div>
            <span class="hint">Admins can always manage. This role grants access too.</span>
        </form>

        <form class="setting" method="POST" action="?/setConfig" use:enhance>
            <input type="hidden" name="key" value="role_board_channel_id" />
            <label for="board">Role board channel</label>
            <div class="control">
                <select id="board" name="value">
                    {#each data.channels as c (c.id)}
                        <option value={c.id} selected={c.id === data.config.role_board_channel_id}>#{c.name}</option>
                    {/each}
                </select>
                <button class="btn btn-sm">Set</button>
            </div>
            <span class="hint">Posts the self-serve group picker. Currently: {data.config.role_board_channel_id ? '#' + channelName(data.config.role_board_channel_id) : 'not set'}.</span>
        </form>
    </div>
</section>

<style>
    .guild-head { display: flex; align-items: center; gap: 20px; padding: 40px 0 28px; }
    .guild-head h1 { font-size: clamp(32px, 5vw, 46px); margin-top: 4px; }
    .guild-head .back { margin-left: auto; align-self: flex-start; }

    .block { padding: 30px 28px; margin-bottom: 24px; }
    .section-lede { margin: -8px 0 20px; }
    .count { align-self: center; font-size: 12px; color: var(--muted); }

    .status-row {
        display: flex; align-items: center; justify-content: space-between; gap: 16px;
        padding: 14px 16px; margin-bottom: 24px;
        background: var(--ink-2); border: 1px solid var(--line); border-radius: var(--radius-sm);
    }
    .status-text { margin: 0; color: var(--muted); }

    /* Shared, alignment-safe setting: label / [input + button] / hint. */
    .settings { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 24px; }
    .setting { display: grid; gap: 7px; align-content: start; }
    .setting > label { font-size: 12px; letter-spacing: 0.04em; color: var(--bone-dim); }
    .control { display: flex; align-items: center; gap: 10px; }
    .control > select, .control > input { flex: 1; min-width: 0; }
    .control > .btn { flex: none; }
    .setting .hint, .add-game > .hint { font-size: 11.5px; color: var(--muted); margin: 0; }

    .summon { margin-top: 26px; padding-top: 24px; border-top: 1px solid var(--line); display: grid; gap: 8px; max-width: 520px; }
    .summon > label { font-size: 12px; letter-spacing: 0.04em; color: var(--bone-dim); }

    .pick-grid { margin-top: 6px; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
    .pick { display: flex; align-items: center; gap: 8px; font-size: 13.5px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
    .pick:hover { background: var(--panel-2); }
    .pick input { accent-color: var(--ember); }

    .inline { display: flex; align-items: center; gap: 8px; }

    .add-game { margin-top: 26px; padding-top: 24px; border-top: 1px solid var(--line); display: grid; gap: 18px; }
    .add-title { margin: 0; }
    .add-core { grid-template-columns: 2fr 1.4fr 1fr; }
    .new-group { grid-template-columns: repeat(3, 1fr); }
    .add-actions { display: flex; }

    @media (max-width: 720px) {
        .settings, .add-core, .new-group { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
        .guild-head { flex-wrap: wrap; }
        .guild-head .back { margin-left: 0; }
        .block { padding: 24px 18px; }
        .status-row { flex-direction: column; align-items: flex-start; }
    }
</style>
