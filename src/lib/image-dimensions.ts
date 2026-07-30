// Lee ancho, alto y si la imagen es en color, directamente de los bytes.
// Sin dependencias: son dos formatos y cabeceras fijas, y añadir una librería
// de imágenes al bundle del servidor por esto no se justifica.

export interface ImageInfo { width: number; height: number; color: boolean; format: 'png' | 'jpeg' }

// PNG: firma de 8 bytes, luego el chunk IHDR — ancho y alto en big-endian, y el
// tipo de color en el byte 25 (0 y 4 son escala de grises).
function readPng(b: Buffer): ImageInfo | null {
  if (b.length < 26) return null
  if (b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return null
  const colorType = b[25]
  return {
    width: b.readUInt32BE(16), height: b.readUInt32BE(20),
    color: colorType !== 0 && colorType !== 4, format: 'png',
  }
}

// JPEG: se recorren los marcadores hasta el SOF (Start Of Frame), que trae alto,
// ancho y número de componentes (1 = escala de grises, 3 = color).
function readJpeg(b: Buffer): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue }          // relleno entre segmentos
    const marker = b[i + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue }
    const len = b.readUInt16BE(i + 2)
    // SOF0..SOF15, saltando DHT (c4), JPGA (c8) y DAC (cc), que no son SOF.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) {
      return {
        height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7),
        color: b[i + 9] >= 3, format: 'jpeg',
      }
    }
    i += 2 + len
  }
  return null
}

export function readImageInfo(buf: ArrayBuffer | Buffer): ImageInfo | null {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  return readPng(b) ?? readJpeg(b)
}

// ── Requisitos de foto de ISIC ─────────────────────────────────────────────
// Del manual CCDB: "Photos must be in color and comply to passport-style
// requirements with a minimum dimension of 500 x 500 px and file size below
// 5 MB". Los content-type admitidos por el endpoint son image/jpeg e image/png.
export const ISIC_PHOTO_MIN_PX = 500
export const ISIC_PHOTO_MAX_BYTES = 5 * 1024 * 1024

export interface PhotoValidation { ok: boolean; error?: string; info?: ImageInfo }

// Valida lo que SE PUEDE comprobar automáticamente: formato, tamaño de archivo,
// dimensiones mínimas y que no sea escala de grises. Lo demás de "passport
// style" (fondo, encuadre, expresión) es criterio humano y no se finge aquí.
export function validateIsicPhoto(buf: ArrayBuffer | Buffer, bytes: number): PhotoValidation {
  if (bytes > ISIC_PHOTO_MAX_BYTES) {
    return { ok: false, error: `La foto pesa ${(bytes / 1024 / 1024).toFixed(1)} MB y el máximo es 5 MB.` }
  }
  const info = readImageInfo(buf)
  if (!info) return { ok: false, error: 'El archivo no es una imagen JPG o PNG válida.' }
  if (info.width < ISIC_PHOTO_MIN_PX || info.height < ISIC_PHOTO_MIN_PX) {
    return { ok: false, error: `La foto mide ${info.width}×${info.height} px y el mínimo que exige ISIC es 500×500 px.`, info }
  }
  if (!info.color) {
    return { ok: false, error: 'La foto debe ser en color: la que subiste está en escala de grises.', info }
  }
  return { ok: true, info }
}
