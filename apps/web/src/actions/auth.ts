'use server';

import { signIn, signOut, devLoginEnabled } from '@/auth';

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === 'string' ? v : '';
  // só caminhos internos (nada de //host ou /\host)
  return /^\/(?![/\\])/.test(s) ? s : '/perfil';
}

export async function signInDiscordAction(formData: FormData) {
  await signIn('discord', { redirectTo: safeNext(formData.get('next')) });
}

/** Somente desenvolvimento local (ver src/auth.ts). */
export async function devSignInAction(formData: FormData) {
  if (!devLoginEnabled) throw new Error('Login de desenvolvimento desligado.');
  const discordId = String(formData.get('discordId') ?? '').trim();
  await signIn('dev-login', { discordId, redirectTo: safeNext(formData.get('next')) });
}

export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}
