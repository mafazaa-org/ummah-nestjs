import { config } from 'dotenv';

// Runs inside every test worker before any test file is imported.
// `override: true` guarantees .env.test wins over a developer's .env / shell.
config({ path: '.env.test', override: true });
