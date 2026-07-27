import { BadRequestException } from '@nestjs/common';
import * as net from 'net';
import * as dns from 'dns/promises';

/**
 * Block SSRF targets: localhost, link-local, private RFC1918, metadata IPs, non-http(s).
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
]);

function isPrivateOrLocalIp(ip: string): boolean {
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;

  // IPv4-mapped IPv6
  const mapped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  if (!net.isIP(mapped)) return true; // treat unknown as unsafe

  if (net.isIPv4(mapped)) {
    const parts = mapped.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6 private/link-local/unique-local
  const lower = mapped.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('fe80')) return true; // link-local
  return false;
}

export async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('Only http and https URLs are allowed');
  }

  if (parsed.username || parsed.password) {
    throw new BadRequestException('URLs with embedded credentials are not allowed');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new BadRequestException('Target host is not allowed');
  }

  // Literal IP in URL
  if (net.isIP(hostname)) {
    if (isPrivateOrLocalIp(hostname)) {
      throw new BadRequestException('Private or local IP targets are not allowed');
    }
    return parsed;
  }

  // Resolve DNS and check all addresses (prevents DNS rebinding to private IP)
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!results.length) {
      throw new BadRequestException('Could not resolve target host');
    }
    for (const r of results) {
      if (isPrivateOrLocalIp(r.address)) {
        throw new BadRequestException('Target resolves to a private or local address');
      }
    }
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    throw new BadRequestException('Could not resolve target host');
  }

  return parsed;
}
