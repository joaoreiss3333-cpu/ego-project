import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Discord from 'next-auth/providers/discord';
import type { Provider } from 'next-auth/providers';

/**
 * Login de desenvolvimento (SOMENTE LOCAL).
 * Liga apenas com NODE_ENV diferente de "production" E DEV_LOGIN=1.
 * Entra como um discordId qualquer, sem senha. Nunca habilite em produção:
 * no build de produção NODE_ENV é fixado em "production" e o provedor nem é registrado.
 */
export const devLoginEnabled = process.env.NODE_ENV !== 'production' && process.env.DEV_LOGIN === '1';

const providers: Provider[] = [
  Discord({
    // O Discord devolve iss=https://discord.com no callback; sem isto o Auth.js espera "https://authjs.dev" e rejeita o login.
    issuer: 'https://discord.com',
    authorization: { url: 'https://discord.com/api/oauth2/authorize', params: { scope: 'identify' } },
  }),
];

if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: 'dev-login',
      name: 'Login de desenvolvimento',
      credentials: { discordId: { label: 'Discord ID', type: 'text' } },
      authorize(credentials) {
        const discordId = String(credentials?.discordId ?? '').trim();
        if (!/^\d{5,25}$/.test(discordId)) return null;
        return { id: discordId, name: `dev-${discordId.slice(-4)}` };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 3600 },
  pages: { signIn: '/entrar', error: '/entrar' },
  trustHost: true,
  callbacks: {
    jwt({ token, account, profile, user }) {
      if (account?.provider === 'discord' && profile && typeof profile.id === 'string') token.discordId = profile.id;
      if (account?.provider === 'dev-login' && user?.id) token.discordId = user.id;
      return token;
    },
    session({ session, token }) {
      const s = session as typeof session & { discordId?: string };
      if (typeof token.discordId === 'string') s.discordId = token.discordId;
      return s;
    },
  },
});
