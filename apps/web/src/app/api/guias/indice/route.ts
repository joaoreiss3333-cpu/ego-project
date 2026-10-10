import { searchIndex } from '@/guides';

export const dynamic = 'force-static';

/** Índice de busca dos guias (títulos, palavras-chave e texto). */
export function GET() {
  return Response.json(searchIndex(), { headers: { 'Cache-Control': 'public, max-age=600' } });
}
