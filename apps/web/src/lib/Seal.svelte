<script lang="ts">
    interface Props {
        size?: number;
        src?: string | null;
        label?: string;
    }
    let { size = 72, src = null, label = '' }: Props = $props();

    const core = $derived(Math.round(size * 0.66));
    const glyph = $derived((label.trim()[0] || '☾').toUpperCase());
</script>

<div class="seal" style="width:{size}px;height:{size}px">
    <svg viewBox="0 0 100 100" aria-hidden="true">
        <g class="ring-outer">
            <circle cx="50" cy="50" r="48" fill="none" stroke="var(--ember)" stroke-width="0.8" opacity="0.55" />
            {#each Array(24) as _, i}
                <line
                    x1="50" y1="2" x2="50" y2={i % 6 === 0 ? 7 : 5}
                    stroke="var(--ember)" stroke-width="0.8" opacity="0.55"
                    transform="rotate({i * 15} 50 50)"
                />
            {/each}
        </g>
        <g class="ring-inner">
            <circle cx="50" cy="50" r="39" fill="none" stroke="var(--verdigris)" stroke-width="0.6" opacity="0.5" stroke-dasharray="2 4" />
        </g>
    </svg>
    <div class="core" style="width:{core}px;height:{core}px">
        {#if src}
            <img {src} alt="" />
        {:else}
            <span class="glyph" style="font-size:{Math.round(core * 0.5)}px">{glyph}</span>
        {/if}
    </div>
</div>
