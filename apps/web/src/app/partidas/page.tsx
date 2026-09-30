import type { Metadata } from 'next';
import Link from 'next/link';
import { GAME, SITE_PATHS } from '@ego/content';
import { matchHistory } from '@ego/db';
import type { PlayerStats } from '@ego/engine';
import { NoCharacter, PageHead, Tag } from '@/components/ui';
import { fmt, fmtDate } from '@/lib/format';
import { KIND_LABEL, matchOutcome } from '@/lib/matches';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Partidas' };

interface StoredRewards {
  reward?: { xp: number; ienes: number } | null;
  selection?: { reward?: { xp: number; ienes: number } | null; first?: boolean } | null;
  multiplier?: number;
  reasons?: string[];
}

export default async function PartidasPage() {
  const v = await requireViewer(SITE_PATHS.partidas);
  if (!v.character) return <NoCharacter />;
  const list = await matchHistory(v.character.id, 40);
  const wins = list.filter((p) => matchOutcome(p).code === 'v').length;

  return (
    <>
      <PageHead
        code="07"
        section="Partidas"
        title="Histórico"
        lede="Cada partida encerrada fica gravada com a seed e os planos de todos os lances. O replay refaz a partida inteira no seu navegador, lance por lance."
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">Vitórias nas últimas {list.length}</span>
            <span className="big big--md">
              {wins}/{list.length}
            </span>
          </div>
        }
      />
      {list.length ? (
        <div className="matches">
          {list.map((p) => {
            const o = matchOutcome(p);
            const st = (p.stats ?? null) as PlayerStats | null;
            const rw = (p.rewards ?? {}) as StoredRewards;
            const gained = rw.reward ?? rw.selection?.reward ?? null;
            return (
              <article key={p.id} className={`match res-${o.code}`}>
                <div className="match__res">
                  <span className="match__label">{o.label}</span>
                  <span className="match__score num">{o.score}</span>
                </div>
                <div className="match__info">
                  <div className="row" style={{ gap: 8 }}>
                    <b className="t-cond" style={{ fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {p.match.mode} · {KIND_LABEL[p.match.kind] ?? p.match.kind}
                    </b>
                    {p.match.flagged ? <Tag color="var(--alert)">Em revisão</Tag> : null}
                    {p.mmrDelta !== null && p.mmrDelta !== undefined ? (
                      <Tag color={p.mmrDelta >= 0 ? 'var(--success)' : 'var(--alert)'}>
                        MMR {p.mmrDelta >= 0 ? '+' : ''}
                        {p.mmrDelta}
                      </Tag>
                    ) : null}
                  </div>
                  <span className="t-mono muted" style={{ fontSize: 12 }}>
                    {p.match.finishedAt ? fmtDate(p.match.finishedAt) : ''} · time {p.team}
                    {p.isKeeper ? ' · goleiro' : ''} · {p.activeTurns}/{p.totalTurns} lances com ação própria
                  </span>
                  {st ? (
                    <span className="match__stats t-mono">
                      {st.goals} G · {st.assists} A · {st.passesCompleted}/{st.passesAttempted} passes · {st.dribblesWon} dribles · {st.tackles} desarmes · {st.readsCorrect} leituras
                      {st.saves ? ` · ${st.saves} defesas` : ''}
                    </span>
                  ) : null}
                  {gained ? (
                    <span className="t-mono" style={{ fontSize: 12 }}>
                      +{fmt(gained.xp)} XP · +{fmt(gained.ienes)} {GAME.commonCurrency.plural}
                      {rw.multiplier !== undefined && rw.multiplier < 1 ? <span className="amber"> · x{rw.multiplier.toFixed(2)} ({(rw.reasons ?? []).join('; ')})</span> : null}
                    </span>
                  ) : null}
                </div>
                <Link href={SITE_PATHS.partida(p.matchId)} className="btn btn--ghost btn--sm">
                  Replay
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="muted">Nenhuma partida encerrada ainda. Jogue pelo Discord e o replay aparece aqui.</p>
      )}
    </>
  );
}
