import { Events, Guild } from 'discord.js';
import { purgeGuildStorage } from '@thecult/shared';
import { logger } from 'utils/logger';
import type { EventModule } from 'types';

const log = logger('guild');

const event: EventModule = {
    name: Events.GuildDelete,
    async execute(guild: Guild) {
        if (!guild.available) return;
        log.info('Removed from guild, purging its data', { guild: guild.id, name: guild.name });
        purgeGuildStorage(guild.id);
    },
};

export default event;
