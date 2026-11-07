import { bot } from '$lib/server/bot';
import type { PageServerLoad } from './$types';

const POLL_LIMIT = 52;

// Voters become a count so member ids never reach the browser.
export const load: PageServerLoad = async ({ params }) => {
    const polls = await bot.polls(params.guildId, POLL_LIMIT);
    return {
        polls: polls.map((poll) => ({
            id:       poll.id,
            kind:     poll.kind,
            postedAt: poll.postedAt,
            winners:  poll.winners,
            turnout:  new Set(poll.answers.flatMap((a) => a.voters)).size,
            answers:  poll.answers
                .map((a) => ({ game: a.game, votes: a.votes }))
                .sort((a, b) => b.votes - a.votes || a.game.localeCompare(b.game))
        }))
    };
};
