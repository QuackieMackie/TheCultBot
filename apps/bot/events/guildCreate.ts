import { Events, Guild } from 'discord.js';
import { initGuildStorage } from '@thecult/shared';
import { ensureBoardMessageForGuild } from 'utils/roleBoard';
import { logger } from 'utils/logger';
import type { EventModule } from 'types';

const log = logger('guild');

const event: EventModule = {
    name: Events.GuildCreate,
    async execute(guild: Guild) {
        log.info('Joined guild', { guild: guild.id, name: guild.name });
        initGuildStorage(guild.id);
        await ensureBoardMessageForGuild(guild.client, guild.id)
            .catch(err => log.error('Role board setup failed', { guild: guild.id, err }));
    },
};

export default event;
