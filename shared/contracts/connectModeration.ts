/**
 * EMPIRE CONNECT — Deterministic Rule-Based Community Moderation & Input Safety.
 *
 * Strictly zero AI APIs or external moderation services.
 * Protects multiplayer chat, feed posts, comments, bios, and club descriptions against:
 * - HTML / Script / XSS injection
 * - Phishing & account credential harvesting
 * - Staff / Admin impersonation
 * - Real-Money Trading (RMT) / scam promotion
 * - Repetitive spam floods
 */

export interface ModerationResult {
  allowed: boolean;
  sanitized: string;
  reason?: string;
  flags: string[];
}

const SCRIPT_OR_XSS_PATTERNS: RegExp[] = [
  /<\s*script\b/i,
  /javascript\s*:/i,
  /on(?:error|load|click|mouseover|focus)\s*=/i,
  /<\s*iframe\b/i,
  /<\s*object\b/i,
  /<\s*embed\b/i,
  /data\s*:\s*text\/html/i,
];

const PHISHING_OR_SCAM_PATTERNS: Array<{ flag: string; regex: RegExp; reason: string }> = [
  {
    flag: 'RMT_PROMOTION',
    regex: /\b(bán\s*cr\s*tiền\s*thật|mua\s*bán\s*cr\s*vnd|nạp\s*cr\s*giá\s*rẻ|sell\s*cr\s*for\s*(usd|vnd|real\s*money)|real\s*money\s*trading)\b/i,
    reason: 'Nội dung quảng cáo mua bán tài sản mô phỏng bằng tiền thật không được phép trong cộng đồng.',
  },
  {
    flag: 'PHISHING',
    regex: /\b(gửi\s*mật\s*khẩu|nhập\s*otp|send\s*your\s*password|free\s*cr\s*generator|hack\s*cr\s*miễn\s*phí|claim\s*1000000\s*cr\s*at)\b/i,
    reason: 'Nội dung có dấu hiệu lừa đảo hoặc thu thập thông tin tài khoản.',
  },
  {
    flag: 'IMPERSONATION',
    regex: /\b(tôi\s*là\s*admin\s*hệ\s*thống|official\s*trading\s*empire\s*staff\s*giveaway|nhân\s*viên\s*sàn\s*yêu\s*cầu\s*chuyển\s*cr)\b/i,
    reason: 'Không được mạo danh quản trị viên hoặc hệ thống Trading Empire.',
  },
];

const EXCESSIVE_REPEAT_REGEX = /(.)\1{14,}/;

/**
 * Strips HTML tags, control characters, and trims text safely without altering legitimate Vietnamese Unicode.
 */
export function sanitizeSocialText(raw: string, maxLength = 1200): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, maxLength);
}

/**
 * Runs deterministic rule-based safety & moderation checks on player-authored text.
 */
export function moderateSocialText(raw: string, maxLength = 1200): ModerationResult {
  const flags: string[] = [];

  if (typeof raw !== 'string') {
    return { allowed: false, sanitized: '', reason: 'Nội dung không hợp lệ.', flags: ['INVALID_TYPE'] };
  }

  for (const pat of SCRIPT_OR_XSS_PATTERNS) {
    if (pat.test(raw)) {
      flags.push('XSS_BLOCKED');
      return {
        allowed: false,
        sanitized: '',
        reason: 'Nội dung chứa mã thực thi hoặc thẻ HTML không an toàn đã bị chặn.',
        flags,
      };
    }
  }

  const sanitized = sanitizeSocialText(raw, maxLength);
  if (!sanitized) {
    return { allowed: false, sanitized: '', reason: 'Nội dung không được để trống.', flags: ['EMPTY'] };
  }

  for (const rule of PHISHING_OR_SCAM_PATTERNS) {
    if (rule.regex.test(sanitized)) {
      flags.push(rule.flag);
      return {
        allowed: false,
        sanitized,
        reason: rule.reason,
        flags,
      };
    }
  }

  if (EXCESSIVE_REPEAT_REGEX.test(sanitized)) {
    flags.push('SPAM_REPETITION');
    return {
      allowed: false,
      sanitized,
      reason: 'Vui lòng không lặp lại cùng một ký tự quá nhiều lần.',
      flags,
    };
  }

  return { allowed: true, sanitized, flags };
}

/**
 * Validates optional user-provided image URLs for posts/avatars.
 * Allows only safe local `/assets/` paths or public `https://` URLs with no SSRF/private hosts or script schemes.
 */
export function validateSafeImageUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) {
    throw new Error('Đường dẫn ảnh quá dài (tối đa 500 ký tự).');
  }

  // Allow safe bundled local asset paths (no directory traversal)
  if (trimmed.startsWith('/assets/') && !trimmed.includes('..') && /^\/assets\/[a-zA-Z0-9/_\-.]+$/.test(trimmed)) {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Đường dẫn ảnh không hợp lệ. Chỉ chấp nhận liên kết https:// an toàn.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Chỉ chấp nhận liên kết ảnh sử dụng giao thức HTTPS.');
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error('Không chấp nhận đường dẫn ảnh trỏ tới máy chủ nội bộ.');
  }

  return parsed.toString();
}
