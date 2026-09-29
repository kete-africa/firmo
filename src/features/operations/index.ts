// The server-side entry point of the operator space. Pages import `./client` instead.
export {
  createOperations,
  OperationError,
  type Incident,
  type JournalEntry,
  type Operations,
} from './application';
export { checkOperator, type OperatorCheck } from './domain';
