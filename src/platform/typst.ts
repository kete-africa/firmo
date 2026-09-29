import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DocumentRenderer, RenderedPdf } from '@/features/documents';
import { RenderingError } from '@/features/documents';

/**
 * The Typst adapter of the rendering port. The template bundle (template, fonts, assets) is
 * checked against its manifest before every compilation, copied into a private temporary folder,
 * and compiled to PDF/A-2b with a fixed creation time — the same input gives the same PDF.
 */
export const TEMPLATE_VERSION = 'firmo-document-v4';
const MAX_LOGO_BYTES = 512 * 1024;

/**
 * The bundle's folder: FIRMO_DOCUMENT_ROOT (the image sets it), or the repository's `document/`
 * from where the process runs — never a path relative to this module, which moves once bundled.
 */
function bundleRoot(): string {
  const root = process.env.FIRMO_DOCUMENT_ROOT ?? join(process.cwd(), 'document');
  return join(root, 'templates', TEMPLATE_VERSION);
}

const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

async function verifyBundle(root: string): Promise<void> {
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')) as {
    version: string;
    files: Record<string, string>;
  };
  if (manifest.version !== TEMPLATE_VERSION) throw new RenderingError('template_drift');
  for (const [path, expected] of Object.entries(manifest.files)) {
    const content = await readFile(join(root, path)).catch(() => null);
    if (!content || sha256(content) !== expected) throw new RenderingError('template_drift');
  }
}

function logoFile(logo: { mediaType: string; content: Uint8Array }): string {
  const bytes = logo.content;
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES)
    throw new RenderingError('invalid_input');
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (logo.mediaType === 'image/png' && png.every((byte, index) => bytes[index] === byte)) {
    return 'artisan-logo.png';
  }
  if (
    logo.mediaType === 'image/jpeg' &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'artisan-logo.jpg';
  }
  throw new RenderingError('invalid_input');
}

type Logo = { mediaType: string; content: Uint8Array } | null | undefined;

export function typstRenderer(
  options: { bin?: string; timeoutMs?: number } = {},
): DocumentRenderer {
  const bin = options.bin ?? process.env.TYPST_BIN ?? 'typst';
  const timeoutMs = options.timeoutMs ?? Number(process.env.TYPST_TIMEOUT_MS ?? 15_000);

  /** Compiles the checked bundle in a private folder; returns the output's bytes. */
  async function compile(
    input: Record<string, unknown>,
    createdAt: Date,
    logo: Logo,
    format: 'pdf' | 'png',
  ): Promise<Uint8Array> {
    const root = bundleRoot();
    await verifyBundle(root);
    const workspace = await mkdtemp(join(tmpdir(), 'firmo-render-'));
    try {
      const bundle = join(workspace, 'bundle');
      await cp(root, bundle, { recursive: true });
      let payload = input;
      if (logo) {
        const name = logoFile(logo);
        await writeFile(join(bundle, 'assets', name), logo.content);
        payload = {
          ...input,
          issuer: { ...(input.issuer as Record<string, unknown>), logo: `assets/${name}` },
        };
      }
      await writeFile(join(bundle, 'case.json'), JSON.stringify(payload), 'utf8');
      const output = join(workspace, format === 'pdf' ? 'output.pdf' : 'page.png');
      const formatArgs =
        format === 'pdf'
          ? ['--pdf-standard', 'a-2b']
          : ['--format', 'png', '--pages', '1', '--ppi', '110'];
      await new Promise<void>((resolve, reject) => {
        execFile(
          bin,
          [
            'compile',
            join(bundle, 'template.typ'),
            output,
            '--root',
            bundle,
            '--font-path',
            join(bundle, 'fonts'),
            '--ignore-system-fonts',
            '--input',
            'case=case.json',
            ...formatArgs,
            '--creation-timestamp',
            String(Math.floor(createdAt.getTime() / 1000)),
          ],
          { timeout: timeoutMs, windowsHide: true },
          (error) => {
            if (!error) return resolve();
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') return reject(new RenderingError('renderer_unavailable'));
            if ((error as { killed?: boolean }).killed) {
              return reject(new RenderingError('renderer_timeout'));
            }
            return reject(new RenderingError('renderer_failed'));
          },
        );
      });
      return new Uint8Array(await readFile(output));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  return {
    templateVersion: TEMPLATE_VERSION,
    async render(input, { createdAt, logo }): Promise<RenderedPdf> {
      const started = performance.now();
      const pdf = await compile(input, createdAt, logo, 'pdf');
      if (Buffer.from(pdf.subarray(0, 5)).toString('latin1') !== '%PDF-') {
        throw new RenderingError('invalid_pdf');
      }
      return {
        pdf,
        sha256: sha256(pdf),
        sizeBytes: pdf.length,
        compilationMs: Math.round(performance.now() - started),
      };
    },
    async renderFirstPagePng(input, { createdAt, logo }) {
      return compile(input, createdAt, logo, 'png');
    },
  };
}
