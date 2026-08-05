import { listAlerts } from '@thecult/shared';
import { dismissAlert } from '$lib/server/guild';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => ({ alerts: listAlerts(params.guildId) });

export const actions: Actions = { dismissAlert };
