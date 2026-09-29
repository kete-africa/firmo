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
  get environment(): 'development' | 'preview' | 'staging' | 'production' {
    const value = process.env.KETE_ENVIRONMENT;
    return value === 'production' || value === 'staging' || value === 'preview'
      ? value
      : 'development';
  },
};
