import type { Metadata } from 'next';
import Link from 'next/link';
import { GACHA, GAME, LINEAGES, RARITIES, RARITY_COLORS, RARITY_LABEL, SITE_PATHS, findLineage, type Rarity } from '@ego/content';
import { pendingSpin, spinHistory } from '@ego/db';
import type { SpinReveal } from '@/actions/gacha';
import { SpinConsole, type LadderBand } from '@/components/SpinConsole';
import { Meter, NoCharacter, PageHead, Panel, RarityTag } from '@/components/ui';
import { fmt, fmtDate, pct } from '@/lib/format';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Giro de linhagem' };

export default async function GiroPage() {
  const v = await requireViewer(SITE_PATHS.giro);
  if (!v.character) return <NoCharacter />;
  const c = v.character;
  const [pending, history] = await Promise.all([pendingSpin(c.id), spinHistory(c.id, 25)]);

  let acc = 0;
  const ladder: LadderBand[] = RARITIES.map((r) => {
    const from = acc;
    acc += GACHA.rates[r];
    return { rarity: r, from, to: acc, label: RARITY_LABEL[r], color: RARITY_COLORS[r] };
  });

  const pendingReveal: SpinReveal | null = pending
    ? (() => {
        const l = findLineage(pending.lineageId)!;
        return {
          logId: pending.id,
          rarity: pending.rarity as Rarity,
          lineageId: pending.lineageId,
          lineageName: l.name,
          tagline: l.tagline,
          roll: pending.roll,
          isNew: false,
          forcedBy: (pending.forcedBy as SpinReveal['forcedBy']) ?? null,
          autoAccepted: false,
          free: pending.free,
          pityLegendary: c.pityLegendary,
          pityMythic: c.pityMythic,
        };
      })()
    : null;

  const free = c.freeSpin;
  const canSpin = !pending && (free || c.coins >= GACHA.cost);
  const reason = pending ? 'Decida o giro pendente antes.' : !canSpin ? `Faltam ${fmt(GACHA.cost - c.coins)} ${GAME.premiumCurrency.plural}.` : null;

  return (
    <>
      <PageHead
        code="05"
        section="Giro de linhagem"
        title="Avaliação genética"
        lede="O sorteio acontece no servidor e fica registrado com seed e número sorteado. Aceitar troca a linhagem equipada; o progresso da árvore de cada linhagem fica guardado."
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">{free ? 'Giro gratuito disponível' : GAME.premiumCurrency.plural}</span>
            <span className="big big--md">{free ? 'GRÁTIS' : fmt(c.coins)}</span>
            {!free ? <span className="label">Custo por giro: {GACHA.cost}</span> : null}
          </div>
        }
      />

      <div className="side-r">
        <SpinConsole
          ladder={ladder}
          canSpin={canSpin}
          reason={reason}
          free={free}
          cost={GACHA.cost}
          currency={GAME.premiumCurrency.short}
          pending={pendingReveal}
          hasLineage={!!c.lineageId}
        />

        <div className="stack">
          <Panel title="Chances" code="POR GIRO">
            <div className="rates">
              {RARITIES.map((r) => (
                <div key={r} className="rates__row">
                  <RarityTag rarity={r} />
                  <span className="rates__bar">
                    <i style={{ width: `${Math.max(1.5, GACHA.rates[r] * 100)}%`, background: RARITY_COLORS[r] }} />
                  </span>
                  <span className="t-mono">{pct(GACHA.rates[r], 2)}</span>
                </div>
              ))}
            </div>
            <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
              Linhagens por raridade: {RARITIES.map((r) => `${RARITY_LABEL[r]} ${LINEAGES.filter((l) => l.rarity === r).map((l) => l.name).join('/') || '—'}`).join(' · ')}.
            </p>
          </Panel>

          <Panel title="Garantias" code="SEUS CONTADORES">
            <div className="stack">
              <div className="pity">
                <div className="row row--between">
                  <span className="label">Lendária ou melhor</span>
                  <span className="t-mono">
                    {c.pityLegendary}/{GACHA.pityLegendary}
                  </span>
                </div>
                <Meter value={c.pityLegendary} max={GACHA.pityLegendary} color={RARITY_COLORS.lendaria} label="Contador de Lendária" />
                <span className="muted" style={{ fontSize: 13 }}>
                  No máximo {GACHA.pityLegendary} giros sem Lendária ou Mítica. Zera quando sai uma.
                </span>
              </div>
              <div className="pity">
                <div className="row row--between">
                  <span className="label">Mítica</span>
                  <span className="t-mono">
                    {c.pityMythic}/{GACHA.pityMythic}
                  </span>
                </div>
                <Meter value={c.pityMythic} max={GACHA.pityMythic} color={RARITY_COLORS.mitica} label="Contador de Mítica" />
                <span className="muted" style={{ fontSize: 13 }}>
                  No máximo {GACHA.pityMythic} giros sem Mítica. Zera quando sai uma.
                </span>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="rule">
        <b>Registro</b> Últimos giros (auditoria)
      </div>
      {history.length ? (
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Custo</th>
                <th className="n">Número sorteado</th>
                <th>Raridade</th>
                <th>Linhagem</th>
                <th className="n">Contadores antes</th>
                <th>Garantia</th>
                <th>Decisão</th>
                <th>Seed</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="t-mono nowrap">{fmtDate(h.createdAt)}</td>
                  <td className="t-mono">{h.free ? 'Grátis' : `${h.cost} ${GAME.premiumCurrency.short}`}</td>
                  <td className="n">{h.roll.toFixed(6)}</td>
                  <td>
                    <RarityTag rarity={h.rarity as Rarity} />
                  </td>
                  <td>{findLineage(h.lineageId)?.name ?? h.lineageId}</td>
                  <td className="n">
                    L {h.pityLegendaryBefore} · M {h.pityMythicBefore}
                  </td>
                  <td className="t-mono">{h.forcedBy ? RARITY_LABEL[h.forcedBy as Rarity] : '—'}</td>
                  <td className="t-mono">{h.decision ?? 'pendente'}</td>
                  <td className="t-mono muted" title={h.seed}>
                    {h.seed.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Nenhum giro ainda. {free ? 'O primeiro é por conta da instalação.' : ''}</p>
      )}
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
        Regras completas no <Link href={SITE_PATHS.guia('giro-de-linhagem')}>guia do giro</Link>.
      </p>
    </>
  );
}
