import type { AutocompleteInteraction, ChatInputCommandInteraction, Client, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';

export interface CommandModule {
    data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
    execute: (interaction: ChatInputCommandInteraction, client: Client) => Promise<unknown>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export interface EventModule {
    name:   string;
    once?:  boolean;
    execute: (...args: any[]) => Promise<unknown>;
}

export interface Game {
    name:    string;
    addedBy: string;
    addedAt: string;
    group:   string;
    playerCount: number;
    lastPolledAt?:   string;
    pollAppearances: number;
}

export interface Group {
    name:           string;
    roleId:         string;
    roleName:       string;
    roleColour:     string;
    categoryId:     string;
    textChannelId:  string;
    voiceChannelId: string;
    quarantined:    boolean;
    quarantinedAt?: string;
}

export interface StoredConfig {
    poll_size:             string;
    poll_channel_id:       string;
    manager_role_id:       string;
    poll_hour_utc:         string;
    poll_duration_hours:   string;
    poll_auto_enabled:     string;
    role_board_channel_id: string;
    role_board_message_id: string;
    [key: string]:         string;
}
