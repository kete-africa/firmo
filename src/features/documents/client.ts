// What screens may import from the documents feature: pure formatting and types, no server code.
export { formatMoney } from './domain/money';
export type { DocumentState, DocumentType } from './domain/types';
export { canConvert, canRevise, nextAnswers, type Answer } from './domain/lifecycle';
