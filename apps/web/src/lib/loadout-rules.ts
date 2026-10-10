import { LINEAGES, allTreeNodes } from '@ego/content';
import { validateLoadout } from '@ego/db';

/**
 * Quantas ativas cabem no loadout, lido da validação real do serviço
 * (assim guia e site acompanham se a regra mudar).
 */
function probeMaxActive(): number {
  const actives = (l: (typeof LINEAGES)[number]) => l.skills.filter((s) => s.kind === 'active').map((s) => s.id);
  const l = [...LINEAGES].sort((a, b) => actives(b).length - actives(a).length)[0];
  const nodes = allTreeNodes(l).map((n) => n.id);
  const flow = l.skills.find((s) => s.kind === 'flow')?.id ?? '';
  let max = 0;
  for (let k = 1; k <= actives(l).length; k++) if (validateLoadout(l.id, nodes, actives(l).slice(0, k), flow) === null) max = k;
  return max;
}

export const MAX_ACTIVE = probeMaxActive();
