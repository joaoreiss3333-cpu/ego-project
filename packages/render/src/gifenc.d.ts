declare module 'gifenc' {
  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: { palette?: number[][]; delay?: number; repeat?: number; transparent?: boolean }): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  export function GIFEncoder(): Encoder;
  export function quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: Record<string, unknown>): number[][];
  export function applyPalette(data: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
}
