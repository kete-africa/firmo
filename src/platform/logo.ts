import { prepareImage, UnsafeFileError } from '@kete/files';
import sharp from 'sharp';

/**
 * A tradesman's logo, made safe: `prepareImage` reads the real format from the content, decodes
 * and re-encodes it, and drops every metadata block; it is then made a small PNG, the format the
 * document template reads (at most 512 KB).
 */
export const MAX_LOGO_UPLOAD_BYTES = 5 * 1024 * 1024;

export class LogoError extends Error {
  constructor(readonly code: 'too_large' | 'unsupported_type' | 'unreadable') {
    super(code);
  }
}

export async function prepareLogo(upload: Uint8Array): Promise<Uint8Array> {
  let safe;
  try {
    safe = await prepareImage(upload, { maxBytes: MAX_LOGO_UPLOAD_BYTES, maxDimension: 600 });
  } catch (error) {
    if (error instanceof UnsafeFileError) throw new LogoError(error.code);
    throw error;
  }
  const png = await sharp(safe.body).png({ compressionLevel: 9, palette: true }).toBuffer();
  if (png.length > 512 * 1024) throw new LogoError('too_large');
  return new Uint8Array(png);
}
