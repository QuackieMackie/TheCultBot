<script lang="ts">
    import { enhance } from '$app/forms';
    import type { Game, Group } from '@thecult/shared';

    let { games, groups }: { games: Game[]; groups: Group[] } = $props();
</script>

<table class="table">
    <thead>
        <tr><th>Game</th><th class="col-group">Group</th><th class="col-players">Players needed</th><th class="col-actions"></th></tr>
    </thead>
    <tbody>
        <!-- Inputs sit in their own cells and point back at the row's form by id, since a
             form element cannot wrap a set of table cells. -->
        {#each games as g, i (g.name)}
            <tr>
                <td>
                    <form id="game-{i}" method="POST" action="?/editGame" use:enhance>
                        <input type="hidden" name="name" value={g.name} />
                        <input class="name-input" name="newName" type="text" maxlength="55" value={g.name} required />
                    </form>
                </td>
                <td>
                    <select name="group" form="game-{i}">
                        {#each groups as grp (grp.name)}
                            <option value={grp.name} selected={grp.name === g.group}>{grp.name}</option>
                        {/each}
                        {#if !groups.some((grp) => grp.name === g.group)}
                            <option value={g.group} selected>{g.group || '(none)'}</option>
                        {/if}
                    </select>
                </td>
                <td>
                    <input class="count-input" name="playerCount" type="number" min="1" value={g.playerCount} form="game-{i}" />
                </td>
                <td>
                    <div class="row-actions">
                        <button class="btn btn-sm btn-ghost" form="game-{i}">Save</button>
                        <form method="POST" action="?/removeGame" use:enhance>
                            <input type="hidden" name="name" value={g.name} />
                            <button class="btn btn-sm btn-danger">Remove</button>
                        </form>
                    </div>
                </td>
            </tr>
        {/each}
    </tbody>
</table>

<style>
    .col-group   { width: 210px; }
    .col-players { width: 120px; }
    .col-actions { width: 150px; }

    .name-input { width: 100%; font-family: var(--display); font-size: 17px; }
    .count-input { width: 74px; }
    .row-actions { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
</style>
