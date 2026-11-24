# EMPIRE CONNECT — System Architecture

## 1. Purpose & Domain Boundaries
**Empire Connect** (TEAM C) is the multiplayer social network, messaging layer, investment club ecosystem, and community engagement hub for **Trading Empire (`WORLD-01`)**.

### Strict Architectural Invariants
1. **Zero AI APIs / Zero Chatbots**: All community interactions are human-to-human. Moderation relies strictly on deterministic server-side rules (`shared/contracts/connectModeration.ts`).
2. **Zero Fake Community Data**: No synthetic posts, fake likes, fake comments, fake users, or fabricated online presence indicators are seeded or rendered.
3. **Isolation from Core Financial Engines**: Empire Connect does **not** modify or mutate `MatchingEngine`, `Wallet`, `Ledger`, `ForexEngine`, `FuturesEngine`, `BusinessEngine`, or `BankingEngine`. All reads from World state pass through the read-only `WorldContextAdapter` interface (`shared/contracts/connect.ts`).
4. **Career vs. Online Separation**: Profiles, posts, achievement cards, and leaderboards strictly separate `ONLINE` (`WORLD-01`) from `CAREER` milestones.
5. **Privacy-First Defaults**: Private CR balances, spot/forex order history, Futures leverage positions, debt, and PII are never exposed in public profiles, leaderboards, or exported PNG achievement cards. Direct messages default to `FRIENDS_ONLY`.
6. **Non-Custodial Clubs**: Investment Clubs (`hasSharedWallet: false`) are social/educational organizations with zero pooled capital. Future integration with TEAM A Investment Funds uses the optional `linkedFundId: string | null` adapter field.

## 2. Layered Module Map

```
shared/contracts/
  ├── connect.ts               # Canonical DTOs, Privacy defaults, WorldContextAdapter, IConnectRepository
  ├── connectModeration.ts     # Deterministic XSS/phishing/RMT/impersonation/SSRF rule engine
  └── types.ts                 # Shared CONNECT_* error codes & 15 realtime event types

server/engine/connect/
  └── ConnectEngine.ts         # Authoritative social state machine (Profiles, Friends, Messenger,
                               # Clubs & HQ, Feed, Verified Cards, Challenges, Invites, Leaderboards,
                               # Notifications, Moderation Reports & Audit Trail)

server/api/
  └── connectRoutes.ts         # Express REST router mounted at /api/connect/*

src/features/social/
  ├── SocialPage.tsx           # 3-column desktop / tabbed mobile Empire Connect hub
  ├── connectMeta.ts           # Static HQ theme artwork imports, labels, HTML5 Canvas PNG exporter
  ├── ConnectFeedPanel.tsx     # 9 topics, 5 filters, verified achievement cards, edit/delete/report
  ├── ConnectFriendsPanel.tsx  # Directory search, requests, real presence, block/mute, cosmetic invites
  ├── ConnectMessengerPanel.tsx# DM, Group, Club, and moderated World Chat with reactions & search
  ├── ConnectClubsPanel.tsx    # Directory + 7-tab Club Headquarters (RBAC, Events, Announcements, HQ themes)
  ├── ConnectProfileModal.tsx  # 5-tab Profile V2 modal + Privacy Settings
  └── ConnectCommunityExtras.tsx # 5 Voluntary Challenges, 6 Leaderboards, Notification Center, Safety Audit
```

## 3. Realtime Event Flow
- All private social events (`friend.requested`, `friend.accepted`, `friend.removed`, `message.created`, `message.read`, `notification.created`) emit to player-scoped Socket.IO rooms (`player:<playerId>`).
- Public community updates (`post.created`, `post.updated`, `post.deleted`, `comment.created`, `club.created`, `club.member.joined`, `club.member.removed`, `club.announcement.created`, `achievement.shared`) broadcast on `world:event`.
- On reconnect, `src/services/realtime.ts` emits `connect:resync`, and `useAppStore` increments `connectSyncSeq` to reconcile unread counters and active views without stale state.

## 4. Persistence Boundary (Prototype Limitation)
- Current prototype storage runs via an in-memory implementation conforming to `IConnectRepository` (`driver: 'IN_MEMORY_PROTOTYPE'`, `isVolatile: true`).
- Data resets when the temporary demo server restarts or when `/api/dev/reset` is invoked.
- Production deployments should provide a PostgreSQL or Firestore repository adapter implementing `IConnectRepository` without changing `ConnectEngine` business rules or REST contracts.
