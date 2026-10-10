export const ENV = {
  token: process.env.DISCORD_TOKEN ?? '',
  clientId: process.env.DISCORD_CLIENT_ID ?? '',
  guildId: process.env.DISCORD_GUILD_ID || null,
  siteUrl: (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
};

export function siteLink(path: string): string {
  return `${ENV.siteUrl}${path}`;
}
