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
