import assert from 'node:assert/strict';
import test from 'node:test';
import type { RealtimeEnvelope } from '../../shared/contracts/types';
import { DomainError } from '../domain/DomainError';
import { WORLD_CONVERSATION_ID } from '../engine/connect/ConnectEngine';
import { WorldEngine } from '../engine/WorldEngine';

function createWorld(): WorldEngine {
  return new WorldEngine({
    worldId: 'WORLD-CONNECT-TEST',
    enableBackgroundLoops: false,
    devToolsEnabled: true,
  });
}

test('CONNECT 01: Zero fake community data & strictly genuine server-verified presence', () => {
  const world = createWorld();
  const { profile: alice } = world.loginGuest('AliceZero01', 'CUSTOM');
  const { profile: bob } = world.loginGuest('BobZero01', 'CUSTOM');

  // Feed & Clubs start completely empty (zero fake posts, likes, or clubs)
  assert.equal(world.connect.listFeed(alice.id).length, 0);
  assert.equal(world.connect.listClubs(alice.id).length, 0);

  // Disconnected socket -> effectivePresence MUST be OFFLINE (never fabricated)
  const bobOffline = world.connect.getProfile(bob.id, alice.id);
  assert.equal(bobOffline.effectivePresence, 'OFFLINE');

  // Simulate real SocketGateway online presence for Bob
  world.setRealtimePresence(1, [bob.id]);
  const bobOnline = world.connect.getProfile(bob.id, alice.id);
  assert.equal(bobOnline.effectivePresence, 'IN_ONLINE_WORLD');

  // When Bob switches to INVISIBLE, Alice sees OFFLINE while Bob still sees his own preference
  world.connect.updateProfile(bob.id, { preferredPresence: 'INVISIBLE' });
  assert.equal(world.connect.getProfile(bob.id, alice.id).effectivePresence, 'OFFLINE');
});

test('CONNECT 02: Friend Request workflow, deduplication, accept, remove, and Block isolation', () => {
  const world = createWorld();
  const { profile: alice } = world.loginGuest('AliceFr02', 'CUSTOM');
  const { profile: bob } = world.loginGuest('BobFr02', 'CUSTOM');
  const bobProfile = world.connect.getProfile(bob.id, alice.id);

  // Search by publicCode (EMP-XXXXXX)
  const searchRes = world.connect.searchDirectory(alice.id, bobProfile.publicCode);
  assert.equal(searchRes.length, 1);
  assert.equal(searchRes[0].playerId, bob.id);

  // Send request
  const req = world.connect.sendFriendRequest(alice.id, bobProfile.publicCode, 'Chào Bob!');
  assert.equal(req.status, 'PENDING');

  // Duplicate pending request is rejected cleanly
  assert.throws(
    () => world.connect.sendFriendRequest(alice.id, bob.id, 'Gửi lại'),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_REQUEST_EXISTS',
  );

  // Bob accepts -> friendship established
  world.connect.acceptFriendRequest(bob.id, req.id);
  assert.equal(world.connect.areFriends(alice.id, bob.id), true);

  // Blocking immediately severs friendship and prevents future friend requests & DMs
  world.connect.blockUser(bob.id, alice.id, 'Test block');
  assert.equal(world.connect.areFriends(alice.id, bob.id), false);
  assert.throws(
    () => world.connect.sendFriendRequest(alice.id, bob.id),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_BLOCKED',
  );
  assert.throws(
    () => world.connect.openDirectConversation(alice.id, bob.id),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_BLOCKED',
  );
});

test('CONNECT 03: Empire Messenger enforces Friends-Only DM default, private room isolation & blocks outsiders', () => {
  const world = createWorld();
  const { profile: alice } = world.loginGuest('AliceMsg03', 'CUSTOM');
  const { profile: bob } = world.loginGuest('BobMsg03', 'CUSTOM');
  const { profile: charlie } = world.loginGuest('CharlieOutsider03', 'CUSTOM');

  // Strangers cannot DM when target uses default FRIENDS_ONLY policy
  assert.throws(
    () => world.connect.openDirectConversation(alice.id, bob.id),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_DM_FRIENDS_ONLY',
  );

  // Become friends
  const fr = world.connect.sendFriendRequest(alice.id, bob.id);
  world.connect.acceptFriendRequest(bob.id, fr.id);

  const dm = world.connect.openDirectConversation(alice.id, bob.id);
  const events: Array<{ envelope: RealtimeEnvelope; room?: string }> = [];
  world.eventBus.subscribe((envelope, room) => events.push({ envelope, room }));

  const msg = world.connect.sendMessage(alice.id, dm.id, 'Chào Bob, phân tích nhóm ngành công nghệ nhé!');
  assert.equal(msg.conversationId, dm.id);

  // Private room isolation: message.created emitted ONLY to player:<alice> and player:<bob>, NEVER globally or to charlie
  const msgEvts = events.filter((e) => e.envelope.eventType === 'message.created');
  assert.equal(msgEvts.length, 2);
  assert.ok(msgEvts.every((e) => e.room === `player:${alice.id}` || e.room === `player:${bob.id}`));
  assert.equal(msgEvts.some((e) => e.room === `player:${charlie.id}` || e.room === undefined), false);

  // Outsider Charlie CANNOT read or send into Alice-Bob DM
  assert.throws(
    () => world.connect.getConversationMessages(charlie.id, dm.id),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_FORBIDDEN',
  );
  assert.throws(
    () => world.connect.sendMessage(charlie.id, dm.id, 'Đọc trộm!'),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_FORBIDDEN',
  );

  // Unread count & mark read
  const bobConvs = world.connect.listConversations(bob.id);
  const bobDm = bobConvs.find((c) => c.id === dm.id)!;
  assert.equal(bobDm.unreadCount, 1);
  world.connect.markConversationRead(bob.id, dm.id);
  const bobDmAfter = world.connect.listConversations(bob.id).find((c) => c.id === dm.id)!;
  assert.equal(bobDmAfter.unreadCount, 0);
});

test('CONNECT 04: Investment Clubs CRUD, Private Approval, RBAC, Ownership Transfer & Zero Shared Wallet', () => {
  const world = createWorld();
  const { profile: founder } = world.loginGuest('FounderClub04', 'CUSTOM');
  const { profile: member } = world.loginGuest('MemberClub04', 'CUSTOM');
  const { profile: outsider } = world.loginGuest('OutsiderClub04', 'CUSTOM');

  const club = world.connect.createClub(founder.id, {
    name: 'Saigon Capital Circle',
    tag: 'SCC',
    visibility: 'PRIVATE',
    hqTheme: 'thuthiem',
  });
  assert.equal(club.hasSharedWallet, false);
  assert.equal(club.linkedFundId, null);
  assert.equal(club.level, 1);

  // Private club requires approval
  const reqRes = world.connect.joinOrRequestClub(member.id, club.id, 'Xin gia nhập CLB');
  assert.equal(reqRes.joined, false);
  assert.ok(reqRes.request);

  // Outsider cannot read club chat
  assert.throws(
    () => world.connect.getConversationMessages(outsider.id, club.conversationId),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_FORBIDDEN',
  );

  // Founder approves member -> member gains access & club gains cooperative XP
  const approvedClub = world.connect.reviewClubRequest(founder.id, club.id, reqRes.request!.id, true);
  assert.equal(approvedClub.members.length, 2);
  assert.ok(approvedClub.xp > club.xp);

  // Regular member cannot post announcements or update club settings (RBAC)
  assert.throws(
    () => world.connect.createClubAnnouncement(member.id, club.id, 'Hack', 'Nội dung'),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_FORBIDDEN',
  );

  // Promote member to ADMIN -> now allowed to post announcement
  world.connect.updateClubMemberRole(founder.id, club.id, member.id, 'ADMIN');
  const ann = world.connect.createClubAnnouncement(member.id, club.id, 'Lịch họp tuần', 'Phân tích lãi suất NHTW', true);
  assert.equal(ann.pinned, true);

  // Transfer ownership requires explicit confirmation
  assert.throws(
    () => world.connect.transferClubOwnership(founder.id, club.id, member.id, false),
    (e: unknown) => e instanceof DomainError && e.code === 'VALIDATION_ERROR',
  );
  const transferred = world.connect.transferClubOwnership(founder.id, club.id, member.id, true);
  assert.equal(transferred.founderId, member.id);
});

test('CONNECT 05: Community Feed, Rule-Based XSS/RMT Moderation, Verified Achievement Cards & Notification Grouping', () => {
  const world = createWorld();
  const { profile: alice } = world.loginGuest('AliceFeed05', 'CUSTOM');
  const { profile: bob } = world.loginGuest('BobFeed05', 'CUSTOM');

  // Rule-based moderation blocks XSS script injection & Real-Money Trading ads
  assert.throws(
    () =>
      world.connect.createPost(alice.id, {
        topic: 'GENERAL',
        title: 'Test XSS',
        content: '<script>alert(1)</script>',
      }),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_MODERATION_BLOCKED',
  );
  assert.throws(
    () =>
      world.connect.sendMessage(alice.id, WORLD_CONVERSATION_ID, 'Bán CR tiền thật giá rẻ inbox ngay'),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_MODERATION_BLOCKED',
  );

  // Cannot forge an achievement card for an achievement the player has NOT unlocked
  assert.throws(
    () => world.connect.createVerifiedAchievementCard(alice.id, 'FIRST_COMPANY'),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_ACHIEVEMENT_NOT_UNLOCKED',
  );

  // Complete a real trade -> unlocks server-verified FIRST_TRADE -> can now share verified card!
  world.placeOrder(alice.id, {
    symbol: 'NOVA',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: 'IOC',
    quantity: 2,
    idempotencyKey: 'conn_05_trade',
  });
  const card = world.connect.createVerifiedAchievementCard(alice.id, 'FIRST_TRADE');
  assert.equal(card.verifiedByServer, true);
  assert.equal(card.achievementId, 'FIRST_TRADE');
  // Privacy check: card contains zero private balance/wallet/debt keys
  assert.equal('wallet' in card, false);
  assert.equal('netWorthMinor' in card, false);

  // Create valid post with verified achievement card
  const post = world.connect.createPost(alice.id, {
    topic: 'ACHIEVEMENT_SHOWCASE',
    title: 'Cột mốc giao dịch đầu tiên trên WORLD-01',
    content: 'Chia sẻ trải nghiệm khớp lệnh thực trên sàn ESE.',
    achievementId: 'FIRST_TRADE',
  });
  assert.ok(post.achievementCard);

  // Non-author Bob cannot edit or delete Alice's post
  assert.throws(
    () => world.connect.updatePost(bob.id, post.id, { title: 'Sửa trộm' }),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_FORBIDDEN',
  );
  assert.throws(
    () => world.connect.deletePost(bob.id, post.id),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_FORBIDDEN',
  );

  // Multiple comments on the same post group cleanly into 1 deduplicated unread notification
  world.connect.addComment(bob.id, post.id, 'Chúc mừng bạn!');
  world.connect.addComment(bob.id, post.id, 'Chiến lược rất ổn định.');
  const aliceNotifs = world.connect.listNotifications(alice.id).filter((n) => n.type === 'POST_COMMENT');
  assert.equal(aliceNotifs.length, 1);
  assert.equal(aliceNotifs[0].count, 2);

  // Report post works and records audit trail
  const rep = world.connect.submitReport(bob.id, {
    targetType: 'POST',
    targetId: post.id,
    reason: 'OTHER',
    details: 'Kiểm thử hàng đợi báo cáo cộng đồng',
  });
  assert.equal(rep.status, 'OPEN');
});

test('CONNECT 06: Cosmetic-Only Friend Invites (Zero CR Minting), Voluntary Challenges & Privacy-Aware Leaderboards', () => {
  const world = createWorld();
  const { profile: alice } = world.loginGuest('AliceInv06', 'CUSTOM');
  const { profile: bob } = world.loginGuest('BobInv06', 'CUSTOM');
  const aliceCashBefore = world.ledger.requireWallet(alice.id).availableMinor;

  // Join Ambassador challenge voluntarily (entryFeeCR === 0)
  const joinedChal = world.connect.joinChallenge(alice.id, 'chal_ambassador');
  assert.equal(joinedChal.entryFeeCR, 0);
  assert.equal(joinedChal.joined, true);

  const invite = world.connect.getOrCreateInvitation(alice.id);

  // Self-redeem blocked
  assert.throws(
    () => world.connect.redeemInvitation(alice.id, invite.code),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_INVITE_INVALID',
  );

  // Bob redeems Alice's invite -> cosmetic reward only, ZERO CR minted, challenge completed!
  const redeemed = world.connect.redeemInvitation(bob.id, invite.code, true);
  assert.equal(redeemed.invitation.acceptedCount, 1);
  assert.ok(redeemed.invitation.cosmeticRewardUnlocked);
  assert.equal(world.ledger.requireWallet(alice.id).availableMinor, aliceCashBefore);

  // Duplicate redeem blocked
  assert.throws(
    () => world.connect.redeemInvitation(bob.id, invite.code),
    (e: unknown) => e instanceof DomainError && e.code === 'CONNECT_INVITE_INVALID',
  );

  const challengesAfter = world.connect.listChallenges(alice.id);
  const ambassador = challengesAfter.find((c) => c.id === 'chal_ambassador')!;
  assert.equal(ambassador.completed, true);

  // Privacy-aware Leaderboards: hiding Bob from leaderboards removes Bob for Alice's view
  world.connect.updatePrivacy(bob.id, { showOnLeaderboards: false });
  const board = world.connect.getLeaderboard('COMMUNITY_CONTRIBUTORS', alice.id);
  assert.equal(board.some((e) => e.entityId === bob.id), false);
  assert.equal(board.some((e) => e.entityId === alice.id), true);

  // Career board stays strictly scoped to CAREER mode
  const careerBoard = world.connect.getLeaderboard('CAREER_ACHIEVEMENTS', alice.id);
  assert.ok(careerBoard.every((e) => e.modeScope === 'CAREER'));
});
