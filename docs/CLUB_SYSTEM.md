# EMPIRE CONNECT — Investment Club System & Headquarters

## 1. Clear Boundary: Investment Clubs vs. Investment Funds
- **Investment Clubs** (TEAM C / Empire Connect) are **community, educational, and collaborative organizations**.
- Every Club enforces `hasSharedWallet: false` at both the type and runtime level. Clubs cannot hold CR, accept deposits, pool member capital, execute trades, or distribute financial returns.
- Future **Investment Funds** (TEAM A) remain strictly separate. A Club exposes an optional `linkedFundId: string | null` adapter reference for cross-navigation once TEAM A ships Fund management.

## 2. Club Visibility & Access Models
1. **`PUBLIC`**: Any non-blocked player may join immediately.
2. **`PRIVATE`**: Players submit a join request; `FOUNDER`, `ADMIN`, or `MODERATOR` approves or rejects.
3. **`INVITE_ONLY`**: Membership requires an invitation issued by Club leadership.

## 3. Role-Based Access Control (RBAC)
| Permission | FOUNDER | ADMIN | MODERATOR | MEMBER |
| --- | :---: | :---: | :---: | :---: |
| View HQ, Discussion, Club Chat, RSVP Events | Yes | Yes | Yes | Yes |
| Post Announcements & Create Events | Yes | Yes | Yes | No |
| Invite Players & Review Join Requests | Yes | Yes | Yes | No |
| Promote / Demote (`ADMIN`/`MODERATOR`/`MEMBER`) | Yes | Yes (below self) | No | No |
| Kick Lower-Ranked Members | Yes | Yes | No | No |
| Edit HQ Theme, Slogan, Rules, Visibility | Yes | Yes | No | No |
| Transfer Ownership (`confirmTransfer: true`) | Yes | No | No | No |

## 4. 7-Tab Club Headquarters & Visual Themes
Each Club provides a 7-tab Headquarters workspace:
1. **Tổng quan (Overview)**: Full-bleed 16:9 HQ artwork, Level 1–10 XP progress bar, charter, rules, and explicit non-custodial governance banner.
2. **Thành viên (Members)**: Live server-verified presence, contribution points, RBAC controls, pending request queue, and Founder ownership transfer confirmation.
3. **Thảo luận (Discussion)**: Club-scoped Community Feed.
4. **Thông báo (Announcements)**: Pinned and chronological leadership notices.
5. **Sự kiện (Events)**: Workshops, macro reviews, networking, and co-op sessions with live RSVP.
6. **Thành tựu (Achievements)**: Level 1–10 cosmetic progression unlocks.
7. **Cài đặt (Settings)**: Visibility, rules, description, and 5 bespoke HQ visual themes (`thuthiem`, `boardroom`, `financial_center`, `saigon_river`, `startup`).

## 5. Level 1–10 Cooperative Progression (Cosmetic-Only)
- Clubs earn XP from cooperative milestones (creating the club, welcoming members, publishing club discussions, announcements, and events).
- Level rewards strictly unlock cosmetic recognition (emblems, titles, headquarters prestige styles) and **never** grant trading fee discounts, leverage bonuses, or CR payouts.
