<script lang="ts">
    import Panel from '$lib/components/Panel.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const KINDS: Record<string, string> = {
        weighted:  'Weekly draw',
        pick:      'Hand-picked',
        random:    'Random',
        recovered: 'Recovered'
    };

    // Fixed UTC so the server and browser agree during hydration.
    function when(iso: string): string {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }

    function plural(n: number, word: string): string {
        return `${n} ${word}${n === 1 ? '' : 's'}`;
    }

    function widthOf(votes: number, answers: { votes: number }[]): number {
        const top = Math.max(1, ...answers.map((a) => a.votes));
        return Math.round((votes / top) * 100);
    }
</script>

<Panel
    rune="⚖"
    title="The reckoning"
    count="last {data.polls.length}"
    lede="How each closed poll came out, newest first. Ties share the win."
>
    {#if data.polls.length > 0}
        <ul class="polls">
            {#each data.polls as poll (poll.id)}
                <li class="poll subpanel">
                    <div class="poll-head">
                        <h3>
                            {#if poll.winners.length > 0}
                                {poll.winners.join(', ')}
                            {:else}
                                No votes were cast
                            {/if}
                        </h3>
                        <p class="meta mono">{when(poll.postedAt)} · {KINDS[poll.kind] ?? poll.kind} · {plural(poll.turnout, 'voter')}</p>
                    </div>
                    {#if poll.winners.length > 0}
                        <ul class="answers">
                            {#each poll.answers as answer (answer.game)}
                                <li class="answer" class:won={poll.winners.includes(answer.game)}>
                                    <span class="game">{answer.game}</span>
                                    <span class="track" aria-hidden="true">
                                        <span class="bar" style="width: {widthOf(answer.votes, poll.answers)}%"></span>
                                    </span>
                                    <span class="votes mono">{answer.votes}</span>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </li>
            {/each}
        </ul>
    {:else}
        <p class="muted">No poll has closed yet.</p>
    {/if}
</Panel>

<style>
    .polls, .answers { list-style: none; margin: 0; padding: 0; }
    .polls { display: grid; gap: 10px; }
    .poll { padding: 14px 16px; }

    .poll-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
    .poll-head h3 { margin: 0; font-family: var(--display); font-size: 18px; font-weight: 400; }
    .meta { flex: none; margin: 0; font-size: 11px; color: var(--muted); white-space: nowrap; }

    .answers { display: grid; gap: 5px; margin-top: 12px; }
    .answer {
        display: grid; grid-template-columns: minmax(0, 190px) 1fr 28px; align-items: center; gap: 10px;
        font-size: 13px; color: var(--muted);
    }
    .answer.won { color: var(--ember-soft); }
    .game { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .track { display: block; height: 6px; }
    .bar { display: block; height: 100%; min-width: 2px; border-radius: 3px; background: currentColor; opacity: 0.55; }
    .answer.won .bar { opacity: 1; }
    .votes { text-align: right; }

    @media (max-width: 640px) {
        .poll-head { flex-direction: column; gap: 4px; }
        .meta { white-space: normal; }
        .answer { grid-template-columns: minmax(0, 120px) 1fr 24px; }
    }
</style>
