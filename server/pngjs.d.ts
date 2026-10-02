// Tipos mínimos de `pngjs` (lo que usa server/wristband.ts). La librería ya
// viene con `qrcode`; se declara aquí para no agregar @types/pngjs.
declare module 'pngjs' {
  export class PNG {
    width: number;
    height: number;
    data: Buffer;
    constructor(options?: { width?: number; height?: number });
    static sync: {
      read(buffer: Buffer): PNG;
      write(png: PNG, options?: Record<string, unknown>): Buffer;
    };
  }
}
