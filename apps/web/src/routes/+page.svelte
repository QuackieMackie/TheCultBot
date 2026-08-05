<script lang="ts">
    import Seal from '$lib/Seal.svelte';
    import Flash from '$lib/components/Flash.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

{#if !data.user}
    <section class="hero">
        <Seal size={168} label="C" />
        <p class="eyebrow">Congregation management</p>
        <h1>Convene the vote.<br />Tend the roster.</h1>
        <p class="lede">
            The council chamber for TheCultBot. Set the weekly rite, curate the games your
            server plays, and summon a poll without touching a single slash command.
        </p>
        <a class="btn btn-ember" href="/auth/login">Enter with Discord</a>
    </section>
{:else}
    <section class="picker">
        <div class="section-head">
            <span class="rune">✦</span>
            <h2>Your congregations</h2>
        </div>

        {#if data.botDown}
            <Flash message="The bot is unreachable right now. Its council can't be summoned, try again shortly." />
        {/if}

        {#if data.guilds && data.guilds.length > 0}
            <div class="guild-grid">
                {#each data.guilds as g (g.id)}
                    <a class="guild-card panel" href="/g/{g.id}">
                        <Seal size={92} src={g.icon} label={g.name} />
                        <span class="guild-name">{g.name}</span>
                        {#if g.alerts}
                            <span class="omens-badge">⚠ {g.alerts} {g.alerts === 1 ? 'omen' : 'omens'}</span>
                        {/if}
                        <span class="enter mono">Tend →</span>
                    </a>
                {/each}
            </div>
        {:else if !data.botDown}
            <div class="empty panel">
                <h3>No congregations to tend</h3>
                <p class="muted">
                    You're not an admin or manager in any server that has TheCultBot. Ask a
                    server owner to add the bot, or to grant you the manager role.
                </p>
            </div>
        {/if}
    </section>
{/if}

<style>
    .hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 22px;
        padding: 72px 0 48px;
    }
    .hero h1 { font-size: clamp(38px, 7vw, 66px); line-height: 0.98; }
    .hero .lede { max-width: 40ch; color: var(--bone-dim); font-size: 16px; margin: 0; }
    .hero .btn-ember { margin-top: 8px; }

    .picker { padding: 40px 0; }

    .guild-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
        gap: 18px;
    }
    .guild-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 30px 20px 22px;
        transition: transform 0.12s ease, border-color 0.15s, box-shadow 0.15s;
    }
    .guild-card:hover { transform: translateY(-3px); border-color: var(--line-strong); }
    .guild-name { font-family: var(--display); font-size: 22px; text-align: center; }
    .omens-badge {
        font-size: 11px; letter-spacing: 0.06em; color: var(--ember-soft);
        padding: 3px 9px; border-radius: 999px;
        border: 1px solid rgba(228, 85, 46, 0.35); background: rgba(228, 85, 46, 0.08);
    }
    .enter { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
    .guild-card:hover .enter { color: var(--ember); }

    .empty { padding: 40px; text-align: center; }
    .empty h3 { font-family: var(--display); font-size: 26px; margin-bottom: 10px; }
    .empty p { max-width: 46ch; margin: 0 auto; }
</style>
