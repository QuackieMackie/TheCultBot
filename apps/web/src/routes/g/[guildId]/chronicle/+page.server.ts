import { bot } from '$lib/server/bot';
import type { PageServerLoad } from './$types';

const AUDIT_LIMIT = 25;

export const load: PageServerLoad = async ({ params }) => ({ audit: await bot.audit(params.guildId, AUDIT_LIMIT) });
