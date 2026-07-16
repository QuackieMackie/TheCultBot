import { Events, Guild } from 'discord.js';
import { initGuildStorage } from 'utils/storage';
import { ensureBoardMessageForGuild } from 'utils/roleBoard';
import type { EventModule } from 'types';

const event: EventModule = {
    name: Events.GuildCreate,
    async execute(guild: Guild) {
        console.log(`Joined guild ${guild.name} (${guild.id}).`);
        initGuildStorage(guild.id);
        await ensureBoardMessageForGuild(guild.client, guild.id)
            .catch(err => console.error(`Role board setup failed for guild ${guild.id}:`, err));
    },
};

export default event;
