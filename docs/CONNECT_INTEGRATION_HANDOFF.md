# EMPIRE CONNECT — Team A / Team B Integration Handoff

## 1. Parallel Development & Branch Disclosure
- **Team Scope**: TEAM C (`Empire Connect — Social & Community`).
- **Git Branch Note**: The execution container workspace does not include a `.git` repository (`fatal: not a git repository`), so checking out a local `feature/empire-connect` branch was not possible inside this container. All Empire Connect code is strictly isolated into dedicated modules (`shared/contracts/connect*.ts`, `server/engine/connect/`, `server/api/connectRoutes.ts`, `src/features/social/`) so it can be cherry-picked or committed cleanly onto `feature/empire-connect` upstream.
- **Zero Impact on Financial Engines**: `MatchingEngine`, `Wallet`, `Ledger`, `ForexEngine`, `FuturesEngine`, `BusinessEngine`, and `BankingEngine` were not altered by Project Connect.

## 2. Integration Contracts for TEAM A (Career Mode, Corporate Empire & Investment Funds)
Empire Connect already provides clean, non-breaking extension points in `shared/contracts/connect.ts`:

1. **Career Mode Summary (`WorldContextAdapter.getCareerSummary`)**:
   - Currently optional; when TEAM A ships Career progression, return `{ unlockedMilestones, highestTierTitle }` from `WorldEngine`'s adapter binding. Profile V2 and the `CAREER_ACHIEVEMENTS` leaderboard will automatically reflect live Career milestones without mixing Online assets.
2. **Investment Funds Link (`Club.linkedFundId`)**:
   - Clubs permanently enforce `hasSharedWallet: false`. Once TEAM A delivers Investment Funds, a Club Founder can link an official Fund ID into `Club.linkedFundId` for read-only cross-navigation while keeping custody strictly inside TEAM A's audited Fund Ledger.
3. **Collection & Cosmetic Badges (`ProfileCollectionItem`)**:
   - TEAM A Lifestyle/Property landmarks can be appended to the read-only snapshot adapter without exposing private financial balances.

## 3. Integration Contracts for TEAM B (Beginner / Pro Mode & Trading UX)
- `AppShell` displays a single compact `Empire Connect` sidebar entry with real unread counters (`connectUnreadNotifications + connectUnreadMessages`).
- `useAppStore` keeps all social sync state isolated (`connectSyncSeq`, `connectUnreadNotifications`, `connectUnreadMessages`) so trading order-book and candle renders are unaffected by community traffic.

## 4. Production Persistence Migration (`IConnectRepository`)
- Current prototype runs in memory (`driver: 'IN_MEMORY_PROTOTYPE'`, `isVolatile: true`).
- To persist across server restarts, implement `IConnectRepository` against PostgreSQL or Firestore and inject it into `ConnectEngine` during `WorldEngine` initialization. All REST endpoints (`/api/connect/*`) and Socket.IO event payloads remain backward-compatible.
