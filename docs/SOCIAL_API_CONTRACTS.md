# EMPIRE CONNECT — Social API & Realtime Contracts

All endpoints are mounted under `/api/connect` and return the standard Trading Empire response envelope:

```json
{
  "ok": true,
  "apiVersion": "1.0.0",
  "serverTimestamp": "2026-11-24T00:00:00.000Z",
  "data": {}
}
```

Authenticated endpoints require `Authorization: Bearer <session-token>`.

## 1. Bootstrap, Profiles & Privacy
| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/connect/bootstrap` | Required | Unified social snapshot: profile, friends, requests, recent players, blocked users, conversations, clubs, challenges, invitation, notifications, unread counts, real online count. |
| `GET` | `/api/connect/directory?q=` | Required | Search real human players by username or `EMP-XXXX` public code (excludes blocked pairs). |
| `GET` | `/api/connect/profiles/:playerId` | Optional | View Profile V2 respecting target's `PrivacySettings` and viewer relationship. |
| `PATCH` | `/api/connect/profile` | Required | Update bio, title, avatar color/URL, favorite industries, mode context (`ONLINE`/`CAREER`), preferred presence. |
| `PATCH` | `/api/connect/privacy` | Required | Update visibility, DM policy (`FRIENDS_ONLY`/`CLUB_MEMBERS`/`EVERYONE`), leaderboard opt-in, friend/club invite toggles. |

## 2. Friends, Blocking & Muting
| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/connect/friends` | List friends (with server-verified presence), incoming/outgoing requests, recent players, blocked users. |
| `POST` | `/api/connect/friends/requests` | Send friend request by `target` (username or `EMP-XXXX`) + optional `note`. Deduplicated & block-checked. |
| `POST` | `/api/connect/friends/requests/:id/accept` | Accept incoming request; establishes mutual friendship and emits `friend.accepted`. |
| `POST` | `/api/connect/friends/requests/:id/decline` | Decline incoming or cancel outgoing pending request. |
| `DELETE` | `/api/connect/friends/:friendId` | Remove mutual friendship. |
| `POST` | `/api/connect/blocks` | Block player; auto-removes friendship, cancels pending requests, hides posts/DMs. |
| `DELETE` | `/api/connect/blocks/:targetId` | Unblock player. |
| `POST` | `/api/connect/mutes/:targetId` | Toggle mute status on a friend. |

## 3. Empire Messenger
| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/connect/conversations` | List player's DM, Group, Club, and moderated World Chat rooms with unread counters. |
| `POST` | `/api/connect/conversations/dm` | Open/get 1:1 DM (enforces recipient `allowDirectMessages` policy & block list). |
| `POST` | `/api/connect/conversations/group` | Create private Group Chat (`title`, `memberIds`). |
| `GET` | `/api/connect/conversations/:id/messages?q=` | Fetch messages (strict membership check for non-WORLD rooms; optional keyword filter `q`). |
| `POST` | `/api/connect/conversations/:id/messages` | Send moderated message (`content`, optional `replyToId`). |
| `POST` | `/api/connect/conversations/:id/messages/:messageId/react` | Toggle emoji reaction. |
| `POST` | `/api/connect/conversations/:id/read` | Mark conversation messages as read. |
| `POST` | `/api/connect/conversations/:id/mute` | Toggle conversation mute. |

## 4. Investment Clubs & Headquarters
| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/connect/clubs?q=` | List visible Investment Clubs. |
| `GET` | `/api/connect/clubs/:id` | Fetch Club HQ details (members, announcements, events, requests for staff, Level 1–10 cosmetics). |
| `POST` | `/api/connect/clubs` | Create Club (`name`, `tag`, `slogan`, `description`, `visibility`, `hqTheme`, `rules`). |
| `PATCH` | `/api/connect/clubs/:id` | Update HQ theme, visibility, slogan, description, rules (`FOUNDER`/`ADMIN`). |
| `POST` | `/api/connect/clubs/:id/join` | Join `PUBLIC` club immediately or submit approval request for `PRIVATE` club. |
| `POST` | `/api/connect/clubs/:id/invite` | Invite player by username/code (`FOUNDER`/`ADMIN`/`MODERATOR`). |
| `POST` | `/api/connect/clubs/:id/requests/:requestId` | Approve/reject join request (`approve: boolean`). |
| `PATCH` | `/api/connect/clubs/:id/members/:targetPlayerId/role` | Update member role (`ADMIN`/`MODERATOR`/`MEMBER`). |
| `POST` | `/api/connect/clubs/:id/transfer-ownership` | Transfer `FOUNDER` role (requires explicit `confirmTransfer: true`). |
| `DELETE` | `/api/connect/clubs/:id/members/:targetPlayerId` | Leave club or kick lower-ranked member. |
| `POST` | `/api/connect/clubs/:id/announcements` | Publish club announcement (`title`, `content`, `pinned`). |
| `POST` | `/api/connect/clubs/:id/events` | Schedule club event (`WORKSHOP`/`MACRO_REVIEW`/`NETWORKING`/`CHALLENGE_COOP`). |
| `POST` | `/api/connect/clubs/:id/events/:eventId/rsvp` | Toggle RSVP for club member. |

## 5. Community Feed, Challenges, Invites, Leaderboards, Notifications & Moderation
| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/connect/feed?filter=&topic=&clubId=&authorId=` | Filtered community feed (`ALL`, `FOLLOWING_FRIENDS`, `MY_CLUBS`, `SAVED`, `TRENDING`; 9 topics). |
| `POST` / `PATCH` / `DELETE` | `/api/connect/posts[/:id]` | Create, edit, or delete own post (with optional safe HTTPS image & server-verified Achievement Card). |
| `POST` | `/api/connect/posts/:id/{like,save,share,comments}` | Toggle like/save, record share, or add moderated comment. |
| `POST` | `/api/connect/achievements/share` | Generate server-verified `SharedAchievementCard` payload (rejects unowned achievements). |
| `GET` / `POST` | `/api/connect/challenges[/:id/join]` | List and join 5 voluntary 0-CR community challenges. |
| `GET` / `POST` | `/api/connect/invitations/{me,redeem}` | Fetch/redeem cosmetic-only friend invitation code (0 CR minted). |
| `GET` | `/api/connect/leaderboards?board=` | Query 6 leaderboards respecting `showOnLeaderboards` privacy setting. |
| `GET` / `POST` / `PATCH` | `/api/connect/notifications[/:id/read, /read-all, /preferences]` | Grouped notifications and notification preferences. |
| `POST` / `GET` | `/api/connect/reports`, `/api/connect/reports/me`, `/api/connect/moderation/audit` | Submit moderation reports and view audit trail. |

## 6. Realtime Event Types (`world:event`)
`friend.requested`, `friend.accepted`, `friend.removed`, `message.created`, `message.read`, `club.created`, `club.member.joined`, `club.member.removed`, `club.announcement.created`, `post.created`, `post.updated`, `post.deleted`, `comment.created`, `achievement.shared`, `notification.created`.
