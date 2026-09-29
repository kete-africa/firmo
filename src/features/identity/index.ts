// The public entry point of the identity feature. Anything not exported here is internal.
export {
  createIdentity,
  normalizePhone,
  type Identity,
  type Sender,
  type SenderProof,
} from './application';
export { AccountUnavailableError, type AccountDirectory } from './ports';
