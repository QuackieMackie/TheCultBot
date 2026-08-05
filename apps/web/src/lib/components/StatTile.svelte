<script lang="ts">
    interface Props {
        href: string;
        value: string | number;
        label: string;
        muted?: boolean;
    }
    let { href, value, label, muted = false }: Props = $props();
</script>

<a class="tile subpanel" {href}>
    <span class="value" class:muted>{value}</span>
    <span class="label mono">{label}</span>
</a>

<style>
    .tile {
        display: grid;
        gap: 4px;
        padding: 16px 18px;
        transition: border-color 0.15s, background 0.15s;
    }
    .tile:hover { border-color: var(--line-strong); background: var(--panel-2); }

    .value { font-family: var(--display); font-size: 30px; line-height: 1.1; }
    .value.muted { font-family: var(--body); font-size: 15px; padding: 7px 0; }
    .label { font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
    .tile:hover .label { color: var(--bone-dim); }
</style>
