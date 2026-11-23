import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads `.env` files deterministically regardless of whether the API is started
 * from the monorepo root or from `apps/api`. Existing process.env values take precedence.
 */
export function loadApiEnvFiles(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/api/.env'),
    resolve(__dirname, '../../.env'),
    resolve(__dirname, '../../../../.env'),
  ];

  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      try {
        process.loadEnvFile(filePath);
      } catch {
        // Ignore unreadable optional env files
      }
    }
  }
}
