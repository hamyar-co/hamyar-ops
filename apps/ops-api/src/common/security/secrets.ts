/**
 * Centralized secret resolution with production fail-closed defaults.
 * Never ship weak hardcoded JWT secrets to production.
 */

const WEAK_ACCESS = 'dev-access-secret';
const WEAK_REFRESH = 'dev-refresh-secret';
const MIN_SECRET_LEN = 32;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function assertStrongSecret(name: string, value: string | undefined, weakFallback: string): string {
  const secret = value?.trim();

  if (!secret || secret === weakFallback) {
    if (isProduction()) {
      throw new Error(
        `${name} must be set to a strong unique value in production (min ${MIN_SECRET_LEN} chars). ` +
          `Generate with: openssl rand -hex 32`,
      );
    }
    return weakFallback;
  }

  if (isProduction() && secret.length < MIN_SECRET_LEN) {
    throw new Error(
      `${name} must be at least ${MIN_SECRET_LEN} characters in production (got ${secret.length}).`,
    );
  }

  return secret;
}

export function getJwtAccessSecret(): string {
  return assertStrongSecret('JWT_ACCESS_SECRET', process.env.JWT_ACCESS_SECRET, WEAK_ACCESS);
}

export function getJwtRefreshSecret(): string {
  return assertStrongSecret('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET, WEAK_REFRESH);
}

export function getCorsOrigins(): string[] {
  return (process.env.CORS_ORIGINS || 'http://localhost:3004')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
