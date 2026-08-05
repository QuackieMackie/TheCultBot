import { listAlerts, listAudit } from '@thecult/shared';
import { bot } from '$lib/server/bot';
import { configSnapshot, dismissAlert, runPoll, setConfig } from '$lib/server/guild';
import type { Actions, PageServerLoad } from './$types';

const OMEN_TEASER  = 3;
const AUDIT_TEASER = 5;

export const load: PageServerLoad = async ({ params }) => ({
    config:   configSnapshot(params.guildId),
    alerts:   listAlerts(params.guildId).slice(0, OMEN_TEASER),
    audit:    listAudit(params.guildId, AUDIT_TEASER),
    channels: await bot.channels(params.guildId).catch(() => [])
});

export const actions: Actions = { setConfig, dismissAlert, runPoll };
