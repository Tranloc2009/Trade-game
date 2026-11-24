# EMPIRE CONNECT — Community Moderation & Safety Rules

## 1. Deterministic Rule-Based Moderation (Zero AI APIs)
All user-generated strings (profiles, posts, comments, direct/group/club/world messages, club titles/slogans/announcements/events) pass through `shared/contracts/connectModeration.ts` on the server before storage or broadcast.

### Enforced Safeguards
1. **XSS & Control-Character Sanitization (`sanitizeSocialText`)**:
   - Rejects raw `<script>`, `javascript:` URIs, inline event handlers (`onload=`, `onclick=`, etc.), `<iframe>`, `<object>`, and `data:text/html` payloads.
   - Strips unsafe control characters and enforces per-field length limits.
2. **Anti-Scam, Phishing & RMT Protection (`moderateSocialText`)**:
   - Blocks real-money trading (RMT) solicitation patterns (selling/buying CR for VND/USD/USDT/bank transfer).
   - Blocks admin/system impersonation and phishing credential requests.
   - Blocks repeated character flooding and low-effort spam patterns.
3. **Safe External Image URL Validation (`validateSafeImageUrl`)**:
   - Allows `https:` URLs only (rejects `http:`, `javascript:`, `data:`, `file:`).
   - Blocks `localhost`, loopback IPs (`127.0.0.1`, `::1`), and RFC-1918 / link-local private network addresses (`10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`) to prevent SSRF/LAN probing.
4. **Per-Actor Rate Limiting**:
   - All write endpoints (friend requests, messages, posts, comments, clubs, reports) enforce server-side sliding-window rate limits via `WorldContextAdapter.checkRateLimit`.

## 2. Privacy & Abuse Controls
- **Block Isolation**: Blocking a user immediately severs friendship, cancels pending friend requests, blocks DMs in both directions, and hides the blocked user's posts/profile from search and feed.
- **Mute Controls**: Players can mute individual friends or conversations without severing relationships.
- **Friends-Only DM Default**: New accounts default to `allowDirectMessages: 'FRIENDS_ONLY'`, preventing unsolicited direct spam.
- **Non-Sensitive Public Surface**: Balances, order books, private trades, Futures margin/liquidation state, and bank loans are excluded from all social DTOs.

## 3. Reporting & Transparent Audit Trail
- Players can report any `POST`, `COMMENT`, `MESSAGE`, `PROFILE`, or `CLUB` using structured categories (`SPAM`, `HARASSMENT`, `SCAM_PHISHING`, `RMT_PROMOTION`, `IMPERSONATION`, `OTHER`).
- Reports are logged in the player's own report list (`/api/connect/reports/me`) and append sanitized entries to the Moderation Audit Trail (`/api/connect/moderation/audit`) as well as the World Security Audit log.
