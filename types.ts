import type { ChatInputCommandInteraction, Client, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';

export interface CommandModule {
    data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
    execute: (interaction: ChatInputCommandInteraction, client: Client) => Promise<unknown>;
}

export interface EventModule {
    name: string;
    once?: boolean;
    execute: (...args: any[]) => Promise<unknown>;
}

export interface Game {
    name:    string;
    addedBy: string;
    addedAt: string;
}

export interface StoredConfig {
    poll_size:       string;
    poll_channel_id: string;
    manager_role_id: string;
    poll_hour_utc:       string;
    poll_duration_hours: string;
    [key: string]:   string;
}
