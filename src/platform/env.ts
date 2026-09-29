/**
 * Firmo's configuration, read from the environment when first used: the server starts and
 * answers `/health` before anything else is configured.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

export const env = {
  get databaseUrl(): string {
    return required('FIRMO_DATABASE_URL');
  },
  /** Firmo's own public origin, e.g. https://firmo.kete.africa */
  get publicUrl(): string {
    return required('FIRMO_URL').replace(/\/$/, '');
  },
  /** The Compte Kete's public origin. */
  get accountUrl(): string {
    return required('KETE_ACCOUNT_URL').replace(/\/$/, '');
  },
  /** Firmo's registration at the Compte Kete (`clients create --people`). */
  get clientId(): string {
    return required('FIRMO_CLIENT_ID');
  },
  get clientSecret(): string {
    return required('FIRMO_CLIENT_SECRET');
  },
  /** Signs Firmo's own session cookie; at least 32 characters, Firmo's only. */
  get sessionSecret(): string {
    return required('FIRMO_SESSION_SECRET');
  },
  get environment(): 'development' | 'preview' | 'staging' | 'production' {
    const value = process.env.KETE_ENVIRONMENT;
    return value === 'production' || value === 'staging' || value === 'preview'
      ? value
      : 'development';
  },
};
