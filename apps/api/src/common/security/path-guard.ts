import * as path from 'path';

/**
 * Ensure resolved path is inside one of the allowed roots.
 * Uses path.relative to avoid prefix attacks (/opt/hamyar vs /opt/hamyar-evil).
 */
export function isPathInsideRoots(filePath: string, allowedRoots: string[]): string | null {
  const resolved = path.resolve(filePath);

  for (const root of allowedRoots) {
    const resolvedRoot = path.resolve(root);
    const relative = path.relative(resolvedRoot, resolved);
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      return resolved;
    }
  }

  return null;
}

/** Docker container IDs / names: alphanumerics, underscore, dot, hyphen */
export function isSafeDockerId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(id);
}

/** Shell-safe absolute paths (no metacharacters) */
export function isSafeAbsolutePath(p: string): boolean {
  if (!p || p.includes('\0')) return false;
  if (!path.isAbsolute(p)) return false;
  // Disallow shell metacharacters and control chars
  if (/[;&|`$<>\\!*?[\]{}'"\n\r\t]/.test(p)) return false;
  return true;
}
