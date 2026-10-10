import type { Metadata } from 'next';
import { RankingBoard, pageParam } from '@/components/RankingBoard';

export const metadata: Metadata = { title: 'Ranking Solo' };

export default async function Page({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const { pagina } = await searchParams;
  return <RankingBoard group="solo" page={pageParam(pagina)} />;
}
