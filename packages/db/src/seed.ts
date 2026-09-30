/**
 * Seeds: temporada ativa. O conteúdo do jogo (linhagens, itens, missões, etapas)
 * vive em packages/content e não precisa ir para o banco.
 */
import { GAME, LINEAGES, SELECTION_GROUPS } from '@ego/content';
import { prisma } from './client';
import { activeSeason } from './services/ranking';

async function main() {
  const season = await activeSeason();
  console.log(`${GAME.name}: temporada ativa "${season.name}" (${season.startsAt.toISOString().slice(0, 10)} a ${season.endsAt.toISOString().slice(0, 10)})`);
  console.log(`Conteúdo: ${LINEAGES.length} linhagens, ${SELECTION_GROUPS.length} grupos do Modo Seleção.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
