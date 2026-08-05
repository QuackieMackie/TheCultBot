/**
 * Shapes the bot's internal API returns. Kept out of `$lib/server` so components can import
 * them without pulling a server-only module into the client bundle.
 */

export interface GuildSummary { id: string; name: string; icon: string | null; alerts?: number; }
export interface ChannelSummary { id: string; name: string; kind: 'text' | 'voice'; parentId: string | null; parentName: string | null; }
export interface RoleSummary { id: string; name: string; color: string; }
