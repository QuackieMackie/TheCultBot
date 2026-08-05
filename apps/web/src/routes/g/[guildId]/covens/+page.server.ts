import { getActiveGroups, listGames } from '@thecult/shared';
import { bot } from '$lib/server/bot';
import { editGroup } from '$lib/server/guild';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => ({
    groups:   getActiveGroups(params.guildId),
    games:    listGames(params.guildId),
    channels: await bot.channels(params.guildId).catch(() => [])
});

export const actions: Actions = { editGroup };
