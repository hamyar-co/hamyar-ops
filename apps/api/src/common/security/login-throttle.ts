/**
 * In-memory login failure tracker with progressive lockout.
 * Suitable for single-node ops deployments; multi-node can swap to Redis later.
 */

interface AttemptState {
  failures: number;
  lockedUntil: number;
  firstFailureAt: number;
}

const attempts = new Map<string, AttemptState>();

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function key(username: string, ip?: string): string {
  return `${(username || '').toLowerCase()}|${ip || 'unknown'}`;
}

export function getLoginLockRemainingMs(username: string, ip?: string): number {
  const state = attempts.get(key(username, ip));
  if (!state) return 0;
  const remaining = state.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

export function recordLoginFailure(username: string, ip?: string): number {
  const k = key(username, ip);
  const now = Date.now();
  let state = attempts.get(k);

  if (!state || now - state.firstFailureAt > WINDOW_MS) {
    state = { failures: 0, lockedUntil: 0, firstFailureAt: now };
  }

  if (state.lockedUntil > now) {
    return state.lockedUntil - now;
  }

  state.failures += 1;
  if (state.failures >= MAX_FAILURES) {
    state.lockedUntil = now + LOCKOUT_MS;
    state.failures = 0;
    state.firstFailureAt = now;
  }

  attempts.set(k, state);
  return Math.max(0, state.lockedUntil - now);
}

export function clearLoginFailures(username: string, ip?: string): void {
  attempts.delete(key(username, ip));
}

/** Periodic cleanup to avoid unbounded growth */
export function pruneLoginThrottle(maxAgeMs = WINDOW_MS + LOCKOUT_MS): void {
  const now = Date.now();
  for (const [k, state] of attempts) {
    if (state.lockedUntil < now && now - state.firstFailureAt > maxAgeMs) {
      attempts.delete(k);
    }
  }
}

// Prune every 10 minutes
setInterval(() => pruneLoginThrottle(), 10 * 60 * 1000).unref?.();
