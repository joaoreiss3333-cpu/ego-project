import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  FIELD_SIZES,
  GACHA,
  GAME,
  GUIDES,
  LINEAGES,
  MATCH_MODES,
  MATCH_RULES,
  RARITY_COLORS,
  RARITY_LABEL,
  SITE_PATHS,
} from '@ego/content';
import { FieldDiagram } from '@/components/field/FieldDiagram';
import { LineagePortrait } from '@/components/ui';
import { getViewer } from '@/lib/viewer';
import { pct } from '@/lib/format';

export default async function Landing() {
  const viewer = await getViewer();
  if (viewer) redirect(SITE_PATHS.perfil);
  const sizes = MATCH_MODES.map((m) => FIELD_SIZES[m]);
  const minF = sizes[0];
  const maxF = sizes[sizes.length - 1];
  return (
    <div className="landing">
      <section className="landing__hero">
        <div className="landing__copy">
          <div className="phead__code">
            <b>00</b> / {GAME.tagline}
          </div>
          <h1 className="landing__title">
            A instalação
            <br />
            <span>está avaliando.</span>
          </h1>
          <p className="landing__lede">
            Futebol tático em grade, jogado no Discord. Aqui fica a sua ficha: atributos, árvore de linhagem, loadout, missões, ranking e o replay de cada
            partida. Quem não evolui, fica para trás.
          </p>
          <div className="row">
            <Link href={SITE_PATHS.login} className="btn btn--primary btn--lg">
              Entrar com Discord
            </Link>
            <Link href={SITE_PATHS.guias} className="btn btn--ghost btn--lg">
              Ler os guias
            </Link>
          </div>
        </div>
        <div className="landing__field panel">
          <div className="panel__head">
            <span className="panel__title">Lance 07 / Resolução</span>
            <span className="panel__code">{`${FIELD_SIZES['3v3'].width}x${FIELD_SIZES['3v3'].height}`} casas</span>
          </div>
          <FieldDiagram
            title="Exemplo de lance: passe depois do movimento e chute de primeira"
            mode="3v3"
            tokens={[
              { x: 5, y: 3, team: 'A', n: 10, ball: true, focus: true },
              { x: 6, y: 1, team: 'A', n: 7 },
              { x: 3, y: 5, team: 'A', n: 4 },
              { x: 7, y: 3, team: 'B', n: 5 },
              { x: 8, y: 4, team: 'B', n: 3 },
              { x: 6, y: 5, team: 'B', n: 8 },
              { x: 0, y: 3, team: 'A', keeper: true, n: 1 },
              { x: 10, y: 3, team: 'B', keeper: true, n: 1 },
            ]}
            arrows={[
              { from: [5, 3], to: [6, 4], kind: 'move', team: 'A' },
              { from: [6, 1], to: [8, 1], kind: 'move', team: 'A' },
              { from: [6, 4], to: [8, 1], kind: 'pass' },
              { from: [8, 1], to: [10.8, 3], kind: 'shot', label: 'de primeira' },
              { from: [7, 3], to: [7, 2], kind: 'move', team: 'B' },
              { from: [8, 4], to: [9, 3], kind: 'move', team: 'B' },
            ]}
          />
        </div>
      </section>

      <section className="landing__specs">
        <div className="spec">
          <span className="label">Linhagens registradas</span>
          <span className="spec__v">{LINEAGES.length}</span>
          <div className="spec__list">
            {LINEAGES.map((l) => (
              <span key={l.id} className="spec__lin" style={{ color: RARITY_COLORS[l.rarity] }}>
                <LineagePortrait lineageId={l.id} size={40} />
                <span>
                  <b>{l.name}</b>
                  <em>{RARITY_LABEL[l.rarity]}</em>
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="spec">
          <span className="label">Campo</span>
          <span className="spec__v">
            {minF.width}x{minF.height}
            <small> a </small>
            {maxF.width}x{maxF.height}
          </span>
          <p className="muted">
            De {MATCH_MODES[0]} a {MATCH_MODES[MATCH_MODES.length - 1]}. Planejamento simultâneo, revelação com setas, resolução em passos.
          </p>
        </div>
        <div className="spec">
          <span className="label">Partida</span>
          <span className="spec__v">
            {MATCH_RULES.halves}x{MATCH_RULES.turnsPerHalf}
            <small> lances</small>
          </span>
          <p className="muted">{MATCH_RULES.planSeconds.default} segundos para planejar cada lance. Ninguém vê a sua ação antes da resolução.</p>
        </div>
        <div className="spec">
          <span className="label">Chance de Mítica</span>
          <span className="spec__v">{pct(GACHA.rates.mitica)}</span>
          <p className="muted">Garantida em até {GACHA.pityMythic} giros. Tudo auditável no histórico.</p>
        </div>
        <div className="spec">
          <span className="label">Guias</span>
          <span className="spec__v">{GUIDES.length}</span>
          <p className="muted">
            Todas as regras, com os números do jogo. <Link href={SITE_PATHS.guia('primeiros-passos')}>Comece aqui</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
