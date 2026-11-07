import { bot } from '$lib/server/bot';
import { dismissAlert } from '$lib/server/guild';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => ({ alerts: await bot.alerts(params.guildId) });

export const actions: Actions = { dismissAlert };
