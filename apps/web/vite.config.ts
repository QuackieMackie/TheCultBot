import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [sveltekit()],
    resolve: {
        alias: {
            '@thecult/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url))
        }
    }
});
