# EMPIRE CONNECT — Automated & Browser Verification Report

## 1. Automated Unit & Integration Tests (`node:test`)
Executed via `npx --yes tsx --test server/tests/connect.test.ts` and the full regression suite `npx --yes tsx --test server/tests/*.test.ts`.

### Empire Connect Test Coverage (`server/tests/connect.test.ts` — 6/6 Passing)
- **`CONNECT 01`**: Verifies zero fake community data on fresh world bootstrap (0 fake posts, 0 fake clubs, 0 fake friends) and strictly genuine server-verified online human presence.
- **`CONNECT 02`**: Verifies Friend Request creation, duplicate prevention, acceptance, mutual friendship creation, removal, and full Block isolation (blocks requests, hides directory visibility, severs friendship).
- **`CONNECT 03`**: Verifies Empire Messenger Friends-Only DM default rejection for non-friends, successful DM after friendship, private room authorization rejecting outsiders, message reactions, and read tracking.
- **`CONNECT 04`**: Verifies Investment Club creation, `hasSharedWallet: false` invariant, `PRIVATE` approval workflow, RBAC role promotion/demotion, explicit confirmation requirement for Founder ownership transfer, announcements, and event RSVP.
- **`CONNECT 05`**: Verifies Community Feed publishing, deterministic XSS/RMT rejection, server-verified Achievement Card ownership check (rejects unowned achievements), like/comment/save/edit/delete, and notification grouping/deduplication.
- **`CONNECT 06`**: Verifies cosmetic-only Friend Invitation redemption (asserts **zero CR wallet mutation** for both inviter and invitee), 0-CR voluntary Community Challenges, and privacy-respecting Community Leaderboards (`showOnLeaderboards: false` hides player).

### Full Suite Non-Regression
All pre-existing test suites (`economy.test.ts`, `forex.test.ts`, `futures.test.ts`, `futuresV2.test.ts`, `orderLifecycle.test.ts`, `trading.test.ts`) continue passing with zero modifications to Spot, Forex, Futures, Wallet, or Ledger logic during Project Connect.

## 2. Live Browser Verification (Playwright CLI)
Verified against running server (`http://localhost:3000`) at desktop (`1440×900`) and mobile (`390×844`):
- Confirmed zero console/page errors and zero broken images (`naturalWidth > 0` across Club HQ artwork).
- Verified Order Lifecycle regression (live Market Buy on Spot Exchange immediately settles with `Lệnh đang mở (0)` without reload).
- Verified Empire Connect end-to-end flows: Club creation with Thủ Thiêm HQ image, 7-tab HQ inspection, Feed post publication & interaction, Profile V2 modal (5 tabs + Privacy Settings), Challenges, Leaderboards, and Messenger.
- Verified responsive mobile navigation and zero horizontal scroll overflow at `390×844`.
