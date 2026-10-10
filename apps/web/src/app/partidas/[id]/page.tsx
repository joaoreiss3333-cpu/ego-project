import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SITE_PATHS, findLineage, RARITY_COLORS } from '@ego/content';
import { matchForReplay } from '@ego/db';
import type { PlayerStats } from '@ego/engine';
import { Replay } from '@/components/Replay';
import { NoCharacter, PageHead, Panel } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { KIND_LABEL, matchResult } from '@/lib/matches';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Replay' };

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await requireViewer(SITE_PATHS.partida(id));
  if (!v.character) return <NoCharacter />;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) notFound();
  const data = await matchForReplay(id);
  if (!data) notFound();
  const me = v.character;
  const participated = data.match.participants.some((p) => p.characterId === me.id);
  if (!participated && data.match.guildId !== me.guildId) notFound();
  const r = matchResult(data.match);
  const stats = new Map(data.match.participants.map((p) => [p.slotId, p.stats as PlayerStats | null]));
  const mySlot = data.match.participants.find((p) => p.characterId === me.id)?.slotId ?? null;

  return (
    <>
      <PageHead
        code="07.R"
        section={`Partidas / ${data.match.mode} · ${KIND_LABEL[data.match.kind] ?? data.match.kind}`}
        title={r.score ? `${r.score.A} x ${r.score.B}` : 'Replay'}
        lede={`Encerrada em ${data.match.finishedAt ? fmtDate(data.match.finishedAt) : '-'}. Reproduzida no navegador a partir da seed e dos planos finais de cada lance.`}
        aside={
          <Link href={SITE_PATHS.partidas} className="btn btn--ghost btn--sm">
            Voltar ao histórico
          </Link>
        }
      />
      <Replay setup={data.setup} turns={data.turns} mySlot={mySlot} />
      <Panel title="Ficha da partida" code={`SEED ${data.match.seed.slice(0, 12)}`} style={{ marginTop: 20 }}>
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Jogador</th>
                <th>Linhagem</th>
                <th className="n">G</th>
                <th className="n">A</th>
                <th className="n">Passes</th>
                <th className="n">Dribles</th>
                <th className="n">Desarmes</th>
                <th className="n">Leituras</th>
                <th className="n">Defesas</th>
              </tr>
            </thead>
            <tbody>
              {data.setup.slots.map((s) => {
                const st = stats.get(s.id);
                const l = findLineage(s.lineageId);
                return (
                  <tr key={s.id} className={s.id === mySlot ? 'is-me' : undefined}>
                    <td className="t-mono">{s.team}</td>
                    <td>
                      <b>{s.name}</b> <span className="muted t-mono">#{s.number}{s.isKeeper ? ' · GOL' : ''}{s.isBot ? ' · bot' : ''}</span>
                    </td>
                    <td style={{ color: l ? RARITY_COLORS[l.rarity] : undefined }}>{l?.name ?? s.lineageId}</td>
                    <td className="n">{st?.goals ?? '-'}</td>
                    <td className="n">{st?.assists ?? '-'}</td>
                    <td className="n">{st ? `${st.passesCompleted}/${st.passesAttempted}` : '-'}</td>
                    <td className="n">{st?.dribblesWon ?? '-'}</td>
                    <td className="n">{st?.tackles ?? '-'}</td>
                    <td className="n">{st?.readsCorrect ?? '-'}</td>
                    <td className="n">{st?.saves ?? '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
          Estatísticas de bots não são gravadas. Veja o que cada ação faz no <Link href={SITE_PATHS.guia('estrutura-do-lance')}>guia do lance</Link>.
        </p>
      </Panel>
    </>
  );
}
