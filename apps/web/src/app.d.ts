import type { SessionUser } from '$lib/server/session';
import type { GuildSummary } from '$lib/types';

declare global {
    namespace App {
        interface Locals {
            user:  SessionUser | null;
            guild: GuildSummary | null;
        }
    }
}

export {};
