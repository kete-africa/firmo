// The public entry point of the documents feature. Anything not exported here is internal.
export { calculateDocument, calculateLine, CalculationError } from './domain/calculate';
export { Dec, decimalText, formatMoney, moneyToString, quantizeMoney } from './domain/money';
export {
  formatRevisionNumber,
  formatSeriesNumber,
  NumberingError,
  validateManualNumber,
  type SeriesCadence,
  type SeriesFormat,
} from './domain/numbering';
export {
  capitalizeInitial,
  documentPayload,
  draftSnapshot,
  issuedSnapshot,
  renderInput,
  type DocumentFacts,
  type Header,
} from './domain/presentation';
export { buildSnapshot, confirms, type DocumentSnapshot } from './domain/snapshot';
export {
  DOCUMENT_STATES,
  DOCUMENT_TYPES,
  type DocumentDraft,
  type DocumentState,
  type DocumentType,
} from './domain/types';
export {
  RenderingError,
  type DocumentEvents,
  type DocumentFiles,
  type DocumentRenderer,
  type IssuanceGate,
  type IssuanceVerdict,
  type IssuedCount,
  type RenderedPdf,
} from './ports';
export {
  createDocuments,
  DocumentError,
  type Actor,
  type Documents,
  type DocumentsDeps,
} from './application';
export type { DraftInput, PaymentInput, ProfileInput } from './contracts';
export {
  answersOf,
  canConvert,
  canRevise,
  isExpired,
  nextAnswers,
  validUntil,
  type Answer,
} from './domain/lifecycle';
