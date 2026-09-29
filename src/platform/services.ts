import { createDocuments, type Documents } from '@/features/documents';
import { createIdentity, type Identity } from '@/features/identity';
import { accountDirectory } from './account';
import { env } from './env';
import { getStorage } from './files';
import { typstRenderer } from './typst';

/** Firmo's use cases wired to their adapters, created on first use. */
let wired: { documents: Documents; identity: Identity } | undefined;

export function services() {
  wired ??= {
    documents: createDocuments({ renderer: typstRenderer(), files: getStorage() }),
    identity: createIdentity({
      directory: accountDirectory({
        accountUrl: env.accountUrl,
        clientId: env.clientId,
        clientSecret: env.clientSecret,
      }),
      publicUrl: env.publicUrl,
    }),
  };
  return wired;
}
