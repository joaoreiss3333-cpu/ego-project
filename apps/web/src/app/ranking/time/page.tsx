import type { Metadata } from 'next';
import { RankingBoard, pageParam } from '@/components/RankingBoard';

export const metadata: Metadata = { title: 'Ranking Time' };

export default async function Page({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const { pagina } = await searchParams;
  return <RankingBoard group="time" page={pageParam(pagina)} />;
}
