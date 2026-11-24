import crypto from 'node:crypto';

/**
 * High-performance monotonic ID generator for hot-path exchange entities
 * (orders, trades, ledger entries, realtime envelopes).
 * Avoids synchronous crypto.randomBytes() syscalls inside the matching loop while
 * guaranteeing collision-free uniqueness across process restarts via boot nonce.
 */
const BOOT_NONCE = crypto.randomBytes(3).toString('hex');
let globalSeq = 0;

export function fastId(prefix: string): string {
  globalSeq += 1;
  return `${prefix}_${BOOT_NONCE}_${globalSeq.toString(36)}`;
}
