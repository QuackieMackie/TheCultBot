import { bot } from '$lib/server/bot';
import { dismissAlert, runPoll, setConfig } from '$lib/server/guild';
import type { Actions, PageServerLoad } from './$types';

const OMEN_TEASER  = 3;
const AUDIT_TEASER = 5;

export const load: PageServerLoad = async ({ params }) => {
    const [config, alerts, audit, channels] = await Promise.all([
        bot.config(params.guildId),
        bot.alerts(params.guildId),
        bot.audit(params.guildId, AUDIT_TEASER),
        bot.channels(params.guildId).catch(() => [])
    ]);
    return { config, alerts: alerts.slice(0, OMEN_TEASER), audit, channels };
};

export const actions: Actions = { setConfig, dismissAlert, runPoll };
