import { explainTurn, type MatchState, type TurnResult } from '@ego/engine';
import { text, type Block } from '../ui';

/**
 * Explicação do lance para a mensagem: "Como foi o lance" (em ordem, com a
 * conta de cada disputa) e o que cada um escolheu. Mensagens com Components V2
 * aceitam no máximo 4000 caracteres de texto somados; `budget` é quanto a
 * explicação pode usar.
 */
export function explainBlocks(prev: MatchState, r: TurnResult, budget = 3000): Block[] {
  const { story, choices } = explainTurn(prev, r);
  const storyBudget = Math.floor(budget * 0.7);
  const lines: string[] = [];
  let used = 0;
  for (const [i, s] of story.entries()) {
    const line = `${i + 1}. ${s}`;
    if (used + line.length + 1 > storyBudget) {
      lines.push('-# (o lance teve mais coisas; o replay completo fica no site)');
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  const blocks: Block[] = [text(`### Como foi o lance\n${lines.join('\n')}`)];
  const choiceBudget = budget - used - 60;
  const picked: string[] = [];
  let cUsed = 0;
  for (const c of choices) {
    const line = `-# ${c}`;
    if (cUsed + line.length + 1 > choiceBudget) break;
    picked.push(line);
    cUsed += line.length + 1;
  }
  if (picked.length) blocks.push(text(`**O que cada um escolheu**\n${picked.join('\n')}`));
  return blocks;
}
