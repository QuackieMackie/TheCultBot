import { listGames } from '@thecult/shared';
import { bot } from '$lib/server/bot';
import { configSnapshot, runPoll, setConfig } from '$lib/server/guild';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => ({
    config:   configSnapshot(params.guildId),
    games:    listGames(params.guildId),
    channels: await bot.channels(params.guildId).catch(() => [])
});

export const actions: Actions = { setConfig, runPoll };
