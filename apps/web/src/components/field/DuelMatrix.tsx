import { ACTION_LABEL, GOAL_ZONE_LABEL, MATCH_RULES, type GoalZone } from '@ego/content';
import { duelMatrix, zonesAdjacent } from '@ego/engine';

/**
 * Matriz de duelo lida direto do motor (duelMatrix). Se a regra mudar lá,
 * a tabela muda junto.
 */
const ROWS: { action: string; label: string; note?: string }[] = [
  { action: 'driblar', label: ACTION_LABEL.driblar },
  { action: 'proteger', label: ACTION_LABEL.proteger, note: `+${MATCH_RULES.duel.protectBonus} fixo do Proteger` },
  { action: 'passe_pe', label: 'Passar / Chutar' },
  { action: 'conduzir', label: ACTION_LABEL.conduzir },
];
const COLS: { action: string; label: string }[] = [
  { action: 'bote', label: ACTION_LABEL.bote },
  { action: 'conter', label: ACTION_LABEL.conter },
  { action: 'mover', label: 'Outra ação' },
];

export function DuelMatrix() {
  return (
    <div className="matrix" role="table" aria-label="Matriz de duelo: portador nas linhas, defensor nas colunas">
      <div className="matrix__h" role="columnheader">
        Portador / Defensor
      </div>
      {COLS.map((c) => (
        <div key={c.action} className="matrix__h" role="columnheader">
          {c.label}
        </div>
      ))}
      {ROWS.map((r) => (
        <Row key={r.action} r={r} />
      ))}
    </div>
  );
}

function Row({ r }: { r: (typeof ROWS)[number] }) {
  return (
    <>
      <div className="matrix__h matrix__h--row" role="rowheader">
        {r.label}
      </div>
      {COLS.map((c) => {
        const [atk, def] = duelMatrix(r.action, c.action);
        const extra = r.action === 'proteger' ? MATCH_RULES.duel.protectBonus : 0;
        const totalAtk = atk + extra;
        const cls = atk > 0 ? 'is-atk' : def > 0 ? 'is-def' : '';
        return (
          <div key={c.action} className={`matrix__c ${cls}`} role="cell">
            <b>{atk > 0 ? `+${atk}` : def > 0 ? `+${def}` : '0'}</b>
            <span>{atk > 0 ? 'para o portador' : def > 0 ? 'para o defensor' : 'sem bônus da matriz'}</span>
            {extra ? (
              <span className="accent">
                Portador soma {totalAtk > 0 ? `+${totalAtk}` : totalAtk} no total
              </span>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/** As 6 zonas do gol, com o bônus do goleiro por zona escolhida. */
export function GoalZones({ shot, keeper }: { shot?: GoalZone; keeper?: GoalZone }) {
  const order: GoalZone[] = [3, 4, 5, 0, 1, 2];
  return (
    <div className="gz" role="img" aria-label="As seis zonas do gol">
      {order.map((z) => {
        const exact = keeper !== undefined && z === keeper;
        const adj = keeper !== undefined && !exact && zonesAdjacent(keeper, z);
        const isShot = shot === z;
        return (
          <div key={z} className={`gz__z${isShot ? ' is-shot' : ''}${exact ? ' is-exact' : ''}${adj ? ' is-adj' : ''}`}>
            <span>
              Zona {z} {isShot ? '/ chute' : ''}
            </span>
            <b>{GOAL_ZONE_LABEL[z]}</b>
            {keeper !== undefined ? (
              <span className={exact ? 'accent' : adj ? 'ink-2' : ''}>
                {exact ? `Goleiro +${MATCH_RULES.shot.keeperExactZone}` : adj ? `Goleiro +${MATCH_RULES.shot.keeperAdjacentZone}` : 'Goleiro +0'}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
