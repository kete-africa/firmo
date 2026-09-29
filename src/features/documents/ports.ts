/** Renders a document's template input to a PDF. The Typst adapter lives in src/platform. */
export interface DocumentRenderer {
  readonly templateVersion: string;
  render(
    input: Record<string, unknown>,
    options: { createdAt: Date; logo?: { mediaType: string; content: Uint8Array } | null },
  ): Promise<RenderedPdf>;
  /** The first page as a PNG image — for a live preview of a presentation. */
  renderFirstPagePng?(
    input: Record<string, unknown>,
    options: { createdAt: Date; logo?: { mediaType: string; content: Uint8Array } | null },
  ): Promise<Uint8Array>;
}

export interface RenderedPdf {
  pdf: Uint8Array;
  sha256: string;
  sizeBytes: number;
  compilationMs: number;
}

export class RenderingError extends Error {
  constructor(
    readonly code:
      | 'invalid_input'
      | 'template_drift'
      | 'renderer_unavailable'
      | 'renderer_timeout'
      | 'renderer_failed'
      | 'invalid_pdf',
  ) {
    super(code);
  }
}

/** Where issued PDFs and logos are kept. The Neon Object Storage adapter comes from @kete/files. */
export interface DocumentFiles {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

/**
 * Whether one more document may be issued now — Firmo's plans (spec 007) decide, the documents
 * only ask. Asked inside the issuance transaction, after the organization's issuance lock, so two
 * issuances never share the last document. A correction (/R2) is never asked about.
 */
export interface IssuanceGate {
  admit(actor: { organizationId: string }, issued: IssuedCount): Promise<IssuanceVerdict>;
}

/** `plans_unavailable`: the plans could not be read — nothing is given that was not bought. */
export type IssuanceVerdict = 'allowed' | 'plan_required' | 'quota_reached' | 'plans_unavailable';

/** First issuances of the organization (corrections excluded), counted where they are asked. */
export interface IssuedCount {
  /** All of them, ever. */
  total(): Promise<number>;
  /** Those issued since `date`, leaving out the organization's first `excludingFirst` ones. */
  since(date: Date, excludingFirst: number): Promise<number>;
}
