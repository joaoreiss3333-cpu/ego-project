import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  // SVG servido como documento não pode rodar nada
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
};

export function svgResponse(svg: string, maxAge = 300): Response {
  return new Response(svg, {
    headers: { ...BASE_HEADERS, 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge}` },
  });
}

export async function fileResponse(path: string, maxAge = 300): Promise<Response> {
  const body = await readFile(path);
  const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
  return new Response(new Uint8Array(body), {
    headers: { ...BASE_HEADERS, 'Content-Type': type, 'Cache-Control': `public, max-age=${maxAge}` },
  });
}

export function notFound(): Response {
  return new Response('Não encontrado', { status: 404, headers: BASE_HEADERS });
}
