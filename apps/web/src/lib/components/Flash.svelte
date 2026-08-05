<script lang="ts">
    interface Props {
        ok?: boolean;
        message: string;
    }
    let { ok = false, message }: Props = $props();
</script>

<div class="flash {ok ? 'ok' : 'err'}">{message}</div>
