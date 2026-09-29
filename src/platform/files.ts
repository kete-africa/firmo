import { s3Storage, type ObjectStorage } from '@kete/files';

/**
 * Firmo's object storage: Neon Object Storage (S3-compatible), one bucket per Neon branch.
 * Created on first use, so the server starts without it.
 */
let storage: ObjectStorage | undefined;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

export function getStorage(): ObjectStorage {
  storage ??= s3Storage({
    endpoint: required('FIRMO_STORAGE_ENDPOINT'),
    region: required('FIRMO_STORAGE_REGION'),
    bucket: required('FIRMO_STORAGE_BUCKET'),
    accessKeyId: required('FIRMO_STORAGE_ACCESS_KEY_ID'),
    secretAccessKey: required('FIRMO_STORAGE_SECRET_ACCESS_KEY'),
  });
  return storage;
}

/** For tests: another storage (memory, or a test bucket). */
export function useStorage(replacement: ObjectStorage): void {
  storage = replacement;
}
