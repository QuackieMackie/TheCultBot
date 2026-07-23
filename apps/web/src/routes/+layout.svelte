<script lang="ts">
    import '../app.css';
    import Seal from '$lib/Seal.svelte';
    import type { LayoutData } from './$types';

    let { data, children }: { data: LayoutData; children: any } = $props();

    const avatar = $derived(
        data.user?.avatar
            ? `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png?size=64`
            : null
    );
</script>

<header class="topbar">
    <a class="wordmark" href="/">
        <Seal size={38} label="C" />
        <span class="name">The <b>Cult</b></span>
    </a>

    {#if data.user}
        <div class="whoami">
            {#if avatar}<img src={avatar} alt="" />{/if}
            <span>{data.user.username}</span>
            <a class="logout" href="/auth/logout">Leave</a>
        </div>
    {/if}
</header>

<main class="shell">
    {@render children()}
</main>

<footer class="shell" style="padding-top:48px;padding-bottom:36px;color:var(--muted);font-size:12px">
    <span class="mono">Tended by TheCultBot</span>
</footer>
