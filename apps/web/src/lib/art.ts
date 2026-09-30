/** URLs das imagens (arquivo real se existir, placeholder SVG se não). */
export const artUrl = {
  portrait: (characterId: string, version?: Date | number | string) =>
    `/api/art/portrait/${encodeURIComponent(characterId)}${version ? `?v=${typeof version === 'object' ? version.getTime() : version}` : ''}`,
  skill: (lineageId: string, skillId: string) => `/api/art/skill/${encodeURIComponent(lineageId)}/${encodeURIComponent(skillId)}`,
  lineage: (lineageId: string) => `/api/art/lineage/${encodeURIComponent(lineageId)}`,
};

/** SVG como data URI (isola ids internos de máscaras e clipPaths). */
export function svgUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
