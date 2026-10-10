/// <reference path="./gifenc.d.ts" />
import * as ns from 'gifenc';

/**
 * gifenc tem build CommonJS (Node carrega em `default`) e ESM (Vite carrega as
 * exportações nomeadas). Aceita os dois formatos.
 */
type Gifenc = Pick<typeof ns, 'GIFEncoder' | 'quantize' | 'applyPalette'>;
const any = ns as unknown as Gifenc & { default?: Gifenc };
export const gifenc: Gifenc = typeof any.GIFEncoder === 'function' ? any : (any.default as Gifenc);
