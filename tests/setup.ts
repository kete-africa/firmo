import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

// Local runs read .env (FIRMO_TEST_* values); CI passes real environment variables.
const localEnv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

// Integration tests run as the application role on the Neon "test" branch.
process.env.FIRMO_DATABASE_URL ??= process.env.FIRMO_TEST_APP_URL;
