import { Events, Guild } from 'discord.js';
import { purgeGuildStorage } from '@thecult/shared';
import type { EventModule } from 'types';

const event: EventModule = {
    name: Events.GuildDelete,
    async execute(guild: Guild) {
        if (!guild.available) return;
        console.log(`Removed from guild ${guild.name} (${guild.id}); purging its data.`);
        purgeGuildStorage(guild.id);
    },
};

export default event;
