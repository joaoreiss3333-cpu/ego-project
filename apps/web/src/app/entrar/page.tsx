import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GAME, SITE_PATHS } from '@ego/content';
import { devLoginEnabled } from '@/auth';
import { devSignInAction, signInDiscordAction } from '@/actions/auth';
import { PageHead, Panel } from '@/components/ui';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Entrar' };

const ERRORS: Record<string, string> = {
  OAuthSignin: 'Não foi possível falar com o Discord. Tente de novo.',
  OAuthCallback: 'O Discord recusou o retorno. Tente de novo.',
  OAuthCallbackError: 'O Discord recusou o retorno. Tente de novo.',
  AccessDenied: 'Acesso negado.',
  Configuration: 'Login indisponível no momento. Avise a administração do servidor.',
  CredentialsSignin: 'ID inválido.',
};

function safeNext(v: string | undefined): string {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : SITE_PATHS.perfil;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const viewer = await getViewer();
  if (viewer) redirect(next);
  const error = sp.error ? (ERRORS[sp.error] ?? 'Não foi possível entrar. Tente de novo.') : null;
  return (
    <div className="login">
      <PageHead code="00" section="Acesso" title="Identificação" lede={`Entre com a mesma conta do Discord que você usa no servidor. O ${GAME.name} só lê seu ID e seu nome.`} />
      <div className="login__grid">
        <Panel title="Conta do Discord" code="OAUTH / IDENTIFY" tone="hot">
          <div className="stack">
            <p className="ink-2" style={{ margin: 0 }}>
              Depois do login, a instalação procura o personagem ligado à sua conta. Se ainda não tiver um, crie com <span className="kbd">/criar-personagem</span>.
            </p>
            {error ? <p className="flash flash--err">{error}</p> : null}
            <form action={signInDiscordAction}>
              <input type="hidden" name="next" value={next} />
              <button type="submit" className="btn btn--primary btn--lg btn--block">
                Entrar com Discord
              </button>
            </form>
          </div>
        </Panel>
        {devLoginEnabled ? (
          <Panel title="Login de desenvolvimento" code="SOMENTE LOCAL" tone="alert">
            <form action={devSignInAction} className="stack">
              <p className="ink-2" style={{ margin: 0 }}>
                Ativo porque <span className="kbd">DEV_LOGIN=1</span> e o servidor não está em produção. Entra como qualquer ID do Discord, sem senha.
              </p>
              <input type="hidden" name="next" value={next} />
              <label className="field">
                <span className="label">Discord ID</span>
                <input className="input" name="discordId" inputMode="numeric" pattern="\d{5,25}" required placeholder="000000000000000000" />
              </label>
              <button type="submit" className="btn btn--danger">
                Entrar como este ID
              </button>
            </form>
          </Panel>
        ) : null}
        <div className="login__aside">
          <span className="label">Sem conta ainda?</span>
          <p className="ink-2">
            Os <Link href={SITE_PATHS.guias}>guias</Link> são abertos. Leia como funciona um lance antes da primeira partida.
          </p>
        </div>
      </div>
    </div>
  );
}
