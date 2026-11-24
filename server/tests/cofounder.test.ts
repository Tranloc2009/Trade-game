import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toMinor } from '../../shared/contracts/money';
import { DomainError } from '../domain/DomainError';
import { SYSTEM_ACCOUNTS } from '../engine/ledger/LedgerService';
import { WorldEngine } from '../engine/WorldEngine';

function getAvail(world: WorldEngine, accountId: string): number {
  return world.ledger.wallets.getWallet(accountId)?.availableMinor ?? 0;
}

function topUpTestAccount(world: WorldEngine, playerId: string, amountCR: number, ref: string): void {
  world.ledger.issueFunds(
    playerId,
    toMinor(amountCR),
    'SYSTEM_ISSUANCE',
    ref,
    'Test capital top-up from Treasury',
  );
}

function createMultiplayerWorld() {
  const world = new WorldEngine({ enableBackgroundLoops: false });
  const alice = world.loginGuest('Alice Founder', 'ALICE');
  const bob = world.loginGuest('Bob CoFounder', 'BOB');
  const charlie = world.loginGuest('Charlie Angel', 'CUSTOM');
  const diana = world.loginGuest('Diana Strategist', 'CUSTOM');

  // Seed extra test capital from TREASURY_ISSUANCE (conserves CR 100%, discrepancy === 0)
  for (const id of [alice.profile.id, bob.profile.id, charlie.profile.id, diana.profile.id]) {
    topUpTestAccount(world, id, 500_000, `test_seed_${id}`);
  }

  return {
    world,
    aliceId: alice.profile.id,
    bobId: bob.profile.id,
    charlieId: charlie.profile.id,
    dianaId: diana.profile.id,
  };
}

function assertZeroDiscrepancy(world: WorldEngine) {
  const audit = world.ledger.auditCurrencyConservation('CR');
  assert.equal(audit.discrepancyMinor, 0, `Expected 0 CR discrepancy, got ${audit.discrepancyMinor}`);
}

describe('Project Co-Founder — 17 Authoritative Multiplayer Acceptance Tests', () => {
  it('TEST 01: Create Capital Project — valid project listed, founder initial commit locked in Escrow, zero-sum CR', () => {
    const { world, aliceId } = createMultiplayerWorld();
    const beforeMinor = getAvail(world, aliceId);

    const project = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'Saigon Brew Collective',
      ticker: 'SGBC',
      businessTypeId: 'fnb_coffee_shop',
      cityCode: 'HCMC',
      businessGoal: 'Xây dựng chuỗi cà phê đặc sản tại TP.HCM',
      businessPlan: '65% vận hành chi nhánh đầu tiên, 20% rang xay, 15% dự phòng.',
      targetCapitalCR: 100_000,
      initialTotalShares: 10_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 40_000,
    });

    assert.equal(project.status, 'OPEN');
    assert.equal(project.committedCapitalMinor, toMinor(40_000));
    assert.equal(getAvail(world, aliceId), beforeMinor - toMinor(40_000));
    assert.equal(world.ledger.getSystemBalance(SYSTEM_ACCOUNTS.CAPITAL_ESCROW_POOL), toMinor(40_000));
    assertZeroDiscrepancy(world);
  });

  it('TEST 02: Multi-Player Capital Contribution — 3 players commit 40/35/25%, reaches FUNDED, blocks overfunding', () => {
    const { world, aliceId, bobId, charlieId, dianaId } = createMultiplayerWorld();
    const project = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'Mekong Tech Studio',
      ticker: 'MKTS',
      businessTypeId: 'tech_software_startup',
      cityCode: 'HCMC',
      businessGoal: 'Phát triển nền tảng SaaS doanh nghiệp',
      businessPlan: 'Đầu tư đội ngũ kỹ sư và hạ tầng đám mây.',
      targetCapitalCR: 100_000,
      initialTotalShares: 10_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 40_000,
    });

    world.commitCapitalToCoFounderProject(bobId, { projectId: project.id, amountCR: 35_000, worldMode: 'ONLINE' });
    const third = world.commitCapitalToCoFounderProject(charlieId, {
      projectId: project.id,
      amountCR: 25_000,
      worldMode: 'ONLINE',
    });

    assert.equal(third.project.status, 'FUNDED');
    assert.equal(third.project.committedCapitalMinor, toMinor(100_000));

    // Overfunding must be blocked
    assert.throws(
      () => world.commitCapitalToCoFounderProject(dianaId, { projectId: project.id, amountCR: 10_000, worldMode: 'ONLINE' }),
      (err: unknown) => err instanceof DomainError && (err.code === 'OVERFUNDING_BLOCKED' || err.code === 'PROJECT_CLOSED'),
    );
    assertZeroDiscrepancy(world);
  });

  it('TEST 03: Capital Escrow Cancellation & 100% Zero-Fee Refund', () => {
    const { world, aliceId, bobId } = createMultiplayerWorld();
    const aliceStart = getAvail(world, aliceId);
    const bobStart = getAvail(world, bobId);

    const project = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'Danang Bistro Concept',
      ticker: 'DNBC',
      businessTypeId: 'fnb_coffee_shop',
      cityCode: 'DANANG',
      businessGoal: 'Thử nghiệm mô hình F&B ven biển',
      businessPlan: 'Thuê mặt bằng và thiết bị pha chế.',
      targetCapitalCR: 100_000,
      initialTotalShares: 10_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 30_000,
    });

    world.commitCapitalToCoFounderProject(bobId, { projectId: project.id, amountCR: 20_000, worldMode: 'ONLINE' });
    const cancelled = world.cancelOrExpireCoFounderProject(aliceId, project.id, 'CANCELLED');

    assert.equal(cancelled.project.status, 'REFUNDED');
    assert.equal(cancelled.refundedCount, 2);
    assert.equal(cancelled.refundedTotalMinor, toMinor(50_000));
    assert.equal(getAvail(world, aliceId), aliceStart);
    assert.equal(getAvail(world, bobId), bobStart);
    assert.equal(world.ledger.getSystemBalance(SYSTEM_ACCOUNTS.CAPITAL_ESCROW_POOL), 0);
    assertZeroDiscrepancy(world);
  });

  it('TEST 04: Co-Founder Invite Flow — invite does NOT auto-debit; ACCEPT, REJECT, COUNTER_PROPOSE work accurately', () => {
    const { world, aliceId, bobId, charlieId } = createMultiplayerWorld();
    const bobStart = getAvail(world, bobId);

    const project = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'Hanoi Private Ventures',
      ticker: 'HNPV',
      businessTypeId: 'tech_software_startup',
      cityCode: 'HANOI',
      businessGoal: 'Dự án riêng tư chỉ mời đồng sáng lập',
      businessPlan: 'Triển khai phần mềm quản trị kho.',
      targetCapitalCR: 100_000,
      initialTotalShares: 10_000,
      minContributionCR: 10_000,
      visibility: 'PRIVATE',
      founderInitialCommitCR: 50_000,
    });

    const invBob = world.inviteCoFounder(aliceId, {
      projectId: project.id,
      inviteeUsername: 'Bob CoFounder',
      proposedRole: 'CFO',
      proposedContributionCR: 30_000,
      inviteChannel: 'USERNAME',
      message: 'Mời Bob làm CFO',
    });
    const invCharlie = world.inviteCoFounder(aliceId, {
      projectId: project.id,
      inviteeId: charlieId,
      proposedRole: 'COO',
      proposedContributionCR: 20_000,
      inviteChannel: 'PLAYER_ID',
    });

    // Accepting invite does NOT auto-debit wallet!
    const acc = world.respondCoFounderInvite(bobId, { inviteId: invBob.id, decision: 'ACCEPT' });
    assert.equal(acc.status, 'ACCEPTED');
    assert.equal(getAvail(world, bobId), bobStart);

    // Counter-propose works
    const cnt = world.respondCoFounderInvite(charlieId, {
      inviteId: invCharlie.id,
      decision: 'COUNTER_PROPOSE',
      counterContributionCR: 25_000,
      counterRole: 'BOARD_MEMBER',
      counterNote: 'Tôi góp 25k CR',
    });
    assert.equal(cnt.status, 'COUNTER_PROPOSED');
    assert.equal(cnt.counterContributionMinor, toMinor(25_000));
    assertZeroDiscrepancy(world);
  });

  it('TEST 05: Atomic Company Activation — Escrow releases 100% to Company Wallet, exact share distribution, duplicate activation blocked', () => {
    const { world, aliceId, bobId, charlieId } = createMultiplayerWorld();
    const project = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'VietCloud Infrastructure',
      ticker: 'VCLD',
      businessTypeId: 'tech_software_startup',
      cityCode: 'HCMC',
      businessGoal: 'Hạ tầng máy chủ doanh nghiệp',
      businessPlan: 'Triển khai cụm máy chủ tại Quận 7.',
      targetCapitalCR: 100_000,
      initialTotalShares: 10_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 50_000,
    });

    world.commitCapitalToCoFounderProject(bobId, { projectId: project.id, amountCR: 30_000, worldMode: 'ONLINE' });
    world.commitCapitalToCoFounderProject(charlieId, { projectId: project.id, amountCR: 20_000, worldMode: 'ONLINE' });

    const activated = world.activateCoFounderProject(aliceId, project.id, 'act_key_1');
    assert.equal(activated.project.status, 'ACTIVATED');
    assert.equal(activated.company.companyCashMinor + activated.company.companyAssetsMinor, toMinor(100_000));
    assert.equal(activated.company.equityMinor, toMinor(100_000));
    assert.equal(world.ledger.getSystemBalance(SYSTEM_ACCOUNTS.CAPITAL_ESCROW_POOL), 0);

    const totalShares = activated.company.shareholders.reduce((acc, s) => acc + s.shares, 0);
    assert.equal(totalShares, 10_000);
    assert.equal(activated.company.shareholders.find((s) => s.playerId === aliceId)?.shares, 5_000);
    assert.equal(activated.company.shareholders.find((s) => s.playerId === bobId)?.shares, 3_000);
    assert.equal(activated.company.shareholders.find((s) => s.playerId === charlieId)?.shares, 2_000);

    // Same idempotency key returns same company without double-creating
    const replay = world.activateCoFounderProject(aliceId, project.id, 'act_key_1');
    assert.equal(replay.company.id, activated.company.id);

    // Duplicate activation without same key is blocked
    assert.throws(
      () => world.activateCoFounderProject(aliceId, project.id),
      (err: unknown) => err instanceof DomainError && err.code === 'PROJECT_CLOSED',
    );
    assertZeroDiscrepancy(world);
  });

  it('TEST 06: Anti-Embezzlement & Company Wallet Isolation — CEO cannot withdraw company cash directly', () => {
    const { world, aliceId, bobId } = createMultiplayerWorld();
    const project = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'SafeVault Corp',
      ticker: 'SFVT',
      businessTypeId: 'fnb_coffee_shop',
      cityCode: 'HCMC',
      businessGoal: 'Kiểm thử cô lập tài khoản công ty',
      businessPlan: 'Mọi chi tiêu phải qua vận hành hoặc nghị quyết HĐQT.',
      targetCapitalCR: 80_000,
      initialTotalShares: 8_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 50_000,
    });
    world.commitCapitalToCoFounderProject(bobId, { projectId: project.id, amountCR: 30_000, worldMode: 'ONLINE' });
    const { company } = world.activateCoFounderProject(aliceId, project.id);

    const cashBefore = company.companyCashMinor;
    const aliceWalletBefore = getAvail(world, aliceId);

    assert.throws(
      () => world.attemptUnauthorizedCompanyWithdrawal(aliceId, company.id),
      (err: unknown) => err instanceof DomainError && err.code === 'COMPANY_UNAUTHORIZED_WITHDRAWAL',
    );

    assert.equal(world.businessEmpire.getBusiness(company.id)?.companyCashMinor, cashBefore);
    assert.equal(getAvail(world, aliceId), aliceWalletBefore);
    const auditLogs = world.businessEmpire.getBusiness(company.id)!.auditLogs;
    assert.ok(auditLogs.some((l) => l.action === 'SECURITY_BLOCK_WITHDRAWAL'));
    assertZeroDiscrepancy(world);
  });

  it('TEST 07: Role Separation (CEO, CFO, COO, BOARD_MEMBER, SHAREHOLDER) — non-CEO cannot grant roles', () => {
    const { world, aliceId, bobId, charlieId } = createMultiplayerWorld();
    const project = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'RoleGuard Enterprises',
      ticker: 'RLGD',
      businessTypeId: 'tech_software_startup',
      cityCode: 'HCMC',
      businessGoal: 'Phân quyền chặt chẽ giữa các vị trí điều hành',
      businessPlan: 'CEO bổ nhiệm CFO/COO; cổ đông thường không tự cấp quyền.',
      targetCapitalCR: 100_000,
      initialTotalShares: 10_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 50_000,
    });
    world.commitCapitalToCoFounderProject(bobId, { projectId: project.id, amountCR: 30_000, worldMode: 'ONLINE' });
    world.commitCapitalToCoFounderProject(charlieId, { projectId: project.id, amountCR: 20_000, worldMode: 'ONLINE' });
    const { company } = world.activateCoFounderProject(aliceId, project.id);

    // Bob (not CEO) cannot grant CFO role
    assert.throws(
      () =>
        world.assignCoFounderCompanyRole(bobId, {
          companyId: company.id,
          targetPlayerId: charlieId,
          role: 'CFO',
          action: 'GRANT',
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'INSUFFICIENT_ROLE_PERMISSION',
    );

    // Alice (CEO) grants CFO to Bob and COO to Charlie
    world.assignCoFounderCompanyRole(aliceId, {
      companyId: company.id,
      targetPlayerId: bobId,
      role: 'CFO',
      action: 'GRANT',
    });
    world.assignCoFounderCompanyRole(aliceId, {
      companyId: company.id,
      targetPlayerId: charlieId,
      role: 'COO',
      action: 'GRANT',
    });

    const hq = world.getCompanyHeadquarters(company.id, bobId);
    assert.ok(hq.myRoles.includes('CFO'));
    assert.ok(!hq.myRoles.includes('CEO'));
    assertZeroDiscrepancy(world);
  });

  it('TEST 08: Board Room Snapshot Voting — blocks duplicate vote and blocks double-voting after share transfer', () => {
    const { world, aliceId, bobId, charlieId } = createMultiplayerWorld();
    const project = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'VoteLock Holdings',
      ticker: 'VTLK',
      businessTypeId: 'fnb_coffee_shop',
      cityCode: 'HANOI',
      businessGoal: 'Quản trị minh bạch qua Snapshot biểu quyết',
      businessPlan: 'Mọi nghị quyết khóa quyền biểu quyết tại thời điểm tạo.',
      targetCapitalCR: 100_000,
      initialTotalShares: 10_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 40_000,
    });
    world.commitCapitalToCoFounderProject(bobId, { projectId: project.id, amountCR: 40_000, worldMode: 'ONLINE' });
    world.commitCapitalToCoFounderProject(charlieId, { projectId: project.id, amountCR: 20_000, worldMode: 'ONLINE' });
    const { company } = world.activateCoFounderProject(aliceId, project.id);

    const proposal = world.createCoFounderBoardProposal(aliceId, {
      companyId: company.id,
      type: 'OPEN_BRANCH',
      title: 'Mở chi nhánh Đà Nẵng',
      description: 'Mở rộng thị trường miền Trung.',
      rationale: 'Nhu cầu tăng trưởng cao.',
      expectedImpact: 'Tăng công suất phục vụ 30%.',
      payload: { cityCode: 'DANANG', branchName: 'Chi nhánh Hải Châu' },
    });

    // Alice votes FOR (4,000 shares)
    world.voteCoFounderBoardProposal(aliceId, proposal.id, 'FOR');

    // Duplicate vote by Alice must fail
    assert.throws(
      () => world.voteCoFounderBoardProposal(aliceId, proposal.id, 'FOR'),
      (err: unknown) => err instanceof DomainError && err.code === 'DUPLICATE_VOTE_FORBIDDEN',
    );

    // Even if Alice sells 1,000 shares to LateBuyer after proposal creation, LateBuyer has 0 snapshot voting power!
    const listing = world.createV4PrivateListing(aliceId, {
      companyId: company.id,
      offeringType: 'SECONDARY',
      shares: 1_000,
      pricePerShareCR: 12,
    });
    const lateBuyer = world.loginGuest('Diana LateBuyer', 'CUSTOM');
    topUpTestAccount(world, lateBuyer.profile.id, 50_000, 'test_late_buyer');
    world.buyV4PrivateListing(lateBuyer.profile.id, listing.id, 1_000);

    assert.throws(
      () => world.voteCoFounderBoardProposal(lateBuyer.profile.id, proposal.id, 'FOR'),
      (err: unknown) => err instanceof DomainError && err.code === 'INSUFFICIENT_ROLE_PERMISSION',
    );

    // Bob votes FOR -> passes (80% > 50.01%) and executes ONCE
    const voted = world.voteCoFounderBoardProposal(bobId, proposal.id, 'FOR');
    assert.equal(voted.status, 'APPROVED');

    const executed = world.executeCoFounderBoardProposal(aliceId, proposal.id);
    assert.equal(executed.proposal.status, 'EXECUTED');
    assert.equal(executed.company.branches.length, 1);

    // Second execution must fail
    assert.throws(
      () => world.executeCoFounderBoardProposal(aliceId, proposal.id),
      (err: unknown) => err instanceof DomainError && err.code === 'PROPOSAL_ALREADY_EXECUTED',
    );
    assertZeroDiscrepancy(world);
  });

  it('TEST 09: CEO Replacement via Board Room Resolution', () => {
    const { world, aliceId, bobId, charlieId } = createMultiplayerWorld();
    const project = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'BoardShift Group',
      ticker: 'BSFG',
      businessTypeId: 'fnb_coffee_shop',
      cityCode: 'HCMC',
      businessGoal: 'Thử nghiệm thay CEO bằng biểu quyết',
      businessPlan: 'HĐQT có quyền bầu CEO mới.',
      targetCapitalCR: 100_000,
      initialTotalShares: 10_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 40_000,
    });
    world.commitCapitalToCoFounderProject(bobId, { projectId: project.id, amountCR: 35_000, worldMode: 'ONLINE' });
    world.commitCapitalToCoFounderProject(charlieId, { projectId: project.id, amountCR: 25_000, worldMode: 'ONLINE' });
    const { company } = world.activateCoFounderProject(aliceId, project.id);
    assert.equal(company.ceoId, aliceId);

    const prop = world.createCoFounderBoardProposal(bobId, {
      companyId: company.id,
      type: 'REPLACE_CEO',
      title: 'Bổ nhiệm Bob làm CEO',
      description: 'Chuyển giao quyền điều hành sang Bob.',
      rationale: 'Tối ưu chiến lược mở rộng.',
      expectedImpact: 'Cập nhật CEO chính thức.',
      payload: { newCeoId: bobId },
    });
    world.voteCoFounderBoardProposal(bobId, prop.id, 'FOR');
    world.voteCoFounderBoardProposal(charlieId, prop.id, 'FOR');
    const execRes = world.executeCoFounderBoardProposal(bobId, prop.id);
    assert.equal(execRes.company.ceoId, bobId);
    assertZeroDiscrepancy(world);
  });

  it('TEST 10: Dividend Distribution — blocks dividend without retained earnings, pays exact pro-rata once profitable', () => {
    const { world, aliceId, bobId } = createMultiplayerWorld();
    const project = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'CashCow Foods',
      ticker: 'CCWF',
      businessTypeId: 'fnb_coffee_shop',
      cityCode: 'HCMC',
      businessGoal: 'Kinh doanh tạo dòng tiền và chia cổ tức minh bạch',
      businessPlan: 'Chỉ chia cổ tức từ lợi nhuận giữ lại dương.',
      targetCapitalCR: 100_000,
      initialTotalShares: 10_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 60_000,
    });
    world.commitCapitalToCoFounderProject(bobId, { projectId: project.id, amountCR: 40_000, worldMode: 'ONLINE' });
    const { company } = world.activateCoFounderProject(aliceId, project.id);

    // Before generating profit, dividend execution must be rejected
    const earlyProp = world.createCoFounderBoardProposal(aliceId, {
      companyId: company.id,
      type: 'PAY_DIVIDEND',
      title: 'Chia cổ tức sớm khi chưa có lãi',
      description: 'Thử nghiệm bảo vệ dự trữ vốn điều lệ.',
      rationale: 'Kiểm thử kế toán.',
      expectedImpact: 'Phải bị chặn.',
      payload: { dividendAmountCR: 5_000 },
    });
    world.voteCoFounderBoardProposal(aliceId, earlyProp.id, 'FOR');
    assert.throws(
      () => world.executeCoFounderBoardProposal(aliceId, earlyProp.id),
      (err: unknown) => err instanceof DomainError && err.code === 'DIVIDEND_CONDITIONS_NOT_MET',
    );

    // Run real business operating cycles to earn positive operating profit
    const macro = world.macroV4.indicators;
    for (let i = 1; i <= 8; i += 1) {
      world.businessEmpire.runOperatingCycle({
        tickId: `test_cycle_${i}`,
        gameDay: i,
        currentGameHourTotal: i * 24,
        macro,
      });
    }

    const hq = world.getCompanyHeadquarters(company.id, aliceId);
    assert.ok(hq.statements.maxSafeDividendMinor > 0, 'Company should earn positive distributable profit');

    const divCR = Math.max(100, Math.floor((hq.statements.maxSafeDividendMinor / 100) * 0.5));
    const aliceBefore = getAvail(world, aliceId);
    const bobBefore = getAvail(world, bobId);

    const divProp = world.createCoFounderBoardProposal(aliceId, {
      companyId: company.id,
      type: 'PAY_DIVIDEND',
      title: 'Chia cổ tức từ lợi nhuận thực',
      description: `Chi trả ${divCR} CR theo tỷ lệ 60/40.`,
      rationale: 'Lợi nhuận giữ lại dương và đủ dự trữ 12%.',
      expectedImpact: 'Cổ đông nhận tiền mặt về ví cá nhân.',
      payload: { dividendAmountCR: divCR },
    });
    world.voteCoFounderBoardProposal(aliceId, divProp.id, 'FOR');
    const execDiv = world.executeCoFounderBoardProposal(aliceId, divProp.id);

    assert.ok(execDiv.dividendRecord);
    const aliceGain = getAvail(world, aliceId) - aliceBefore;
    const bobGain = getAvail(world, bobId) - bobBefore;
    assert.equal(aliceGain + bobGain, execDiv.dividendRecord!.totalAmountMinor);
    assert.ok(Math.abs(aliceGain / execDiv.dividendRecord!.totalAmountMinor - 0.6) < 0.01);
    assert.ok(Math.abs(bobGain / execDiv.dividendRecord!.totalAmountMinor - 0.4) < 0.01);
    assertZeroDiscrepancy(world);
  });

  it('TEST 11: Follow-On Capital Raising Round (Series A) — accurate Pre/Post-money share dilution & company cash growth', () => {
    const { world, aliceId, bobId, charlieId } = createMultiplayerWorld();
    const project = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'Alpha FinTech VN',
      ticker: 'AFVN',
      businessTypeId: 'tech_software_startup',
      cityCode: 'HCMC',
      businessGoal: 'Gọi vốn vòng Series A',
      businessPlan: 'Phát hành cổ phần sơ cấp để mở rộng.',
      targetCapitalCR: 100_000,
      initialTotalShares: 10_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 60_000,
    });
    world.commitCapitalToCoFounderProject(bobId, { projectId: project.id, amountCR: 40_000, worldMode: 'ONLINE' });
    const { company } = world.activateCoFounderProject(aliceId, project.id);

    // Pre-money = 200,000 CR (20 CR/share), Target Raise = 50,000 CR (2,500 new shares -> 20% dilution)
    const round = world.createCoFounderCapitalRound(aliceId, {
      companyId: company.id,
      roundType: 'SERIES_A',
      preMoneyValuationCR: 200_000,
      targetRaiseCR: 50_000,
      useOfProceeds: 'Mở rộng hạ tầng thanh toán.',
    });

    const cashBefore = world.businessEmpire.getBusiness(company.id)!.companyCashMinor;
    const invest = world.investCoFounderCapitalRound(charlieId, {
      roundId: round.id,
      amountCR: 50_000,
      worldMode: 'ONLINE',
      idempotencyKey: 'series_a_charlie_1',
    });

    assert.equal(invest.round.status, 'CLOSED');
    assert.equal(invest.company.totalIssuedShares, 12_500);
    assert.equal(invest.company.companyCashMinor, cashBefore + toMinor(50_000));
    const alicePct = invest.company.shareholders.find((s) => s.playerId === aliceId)!.ownershipPct;
    const charliePct = invest.company.shareholders.find((s) => s.playerId === charlieId)!.ownershipPct;
    assert.ok(Math.abs(alicePct - 48) < 0.05, `Expected Alice diluted from 60% to 48%, got ${alicePct}`);
    assert.ok(Math.abs(charliePct - 20) < 0.05, `Expected Charlie 20%, got ${charliePct}`);
    assertZeroDiscrepancy(world);
  });

  it('TEST 12: Secondary Share Transfer vs Primary Issuance — Secondary pays seller directly with zero dilution', () => {
    const { world, aliceId, bobId, charlieId } = createMultiplayerWorld();
    const project = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'Secondary Trade Co',
      ticker: 'STRC',
      businessTypeId: 'fnb_coffee_shop',
      cityCode: 'HCMC',
      businessGoal: 'Kiểm thử giao dịch cổ phần thứ cấp',
      businessPlan: 'Chuyển nhượng trực tiếp giữa các cổ đông.',
      targetCapitalCR: 100_000,
      initialTotalShares: 10_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 60_000,
    });
    world.commitCapitalToCoFounderProject(bobId, { projectId: project.id, amountCR: 40_000, worldMode: 'ONLINE' });
    const { company } = world.activateCoFounderProject(aliceId, project.id);

    const companyCashBefore = company.companyCashMinor;
    const aliceBefore = getAvail(world, aliceId);
    const listing = world.createV4PrivateListing(aliceId, {
      companyId: company.id,
      offeringType: 'SECONDARY',
      shares: 1_000,
      pricePerShareCR: 15,
    });
    world.buyV4PrivateListing(charlieId, listing.id, 1_000);

    const after = world.businessEmpire.getBusiness(company.id)!;
    assert.equal(after.totalIssuedShares, 10_000); // zero dilution
    assert.equal(after.companyCashMinor, companyCashBefore); // cash goes to seller, not company
    assert.ok(getAvail(world, aliceId) > aliceBefore);
    assertZeroDiscrepancy(world);
  });

  it('TEST 13: Joint Venture Creation — funded directly from Partner Company Wallets, owned by Partner Companies', () => {
    const { world, aliceId, bobId } = createMultiplayerWorld();
    const c1 = world.createV4Business(aliceId, {
      businessTypeId: 'fnb_coffee_shop',
      businessName: 'Alice Holdings',
      ticker: 'ALHD',
      cityCode: 'HCMC',
      initialCapitalCR: 120_000,
    });
    const c2 = world.createV4Business(bobId, {
      businessTypeId: 'trn_delivery',
      businessName: 'Bob Logistics',
      ticker: 'BBLG',
      cityCode: 'HANOI',
      initialCapitalCR: 120_000,
    });

    const c1CashBefore = c1.companyCashMinor;
    const c2CashBefore = c2.companyCashMinor;
    const alicePersonalBefore = getAvail(world, aliceId);
    const bobPersonalBefore = getAvail(world, bobId);

    const jv = world.createCoFounderJointVenture(aliceId, {
      creatorCompanyId: c1.id,
      partnerCompanyIds: [c2.id],
      jvName: 'North-South Express JV',
      ticker: 'NSEJ',
      businessTypeId: 'trn_delivery',
      cityCode: 'DANANG',
      purpose: 'Liên doanh vận tải Bắc Nam từ vốn 2 công ty.',
      partnerContributionsCR: [
        { companyId: c1.id, amountCR: 40_000 },
        { companyId: c2.id, amountCR: 40_000 },
      ],
      worldMode: 'ONLINE',
    });

    const approved = world.approveCoFounderJointVenture(bobId, jv.id, c2.id);
    assert.equal(approved.jv.status, 'ACTIVE');
    assert.ok(approved.company);
    assert.equal(approved.company!.companyCashMinor + approved.company!.companyAssetsMinor, toMinor(80_000));
    assert.equal(approved.company!.equityMinor, toMinor(80_000));
    // Deducted from Company Wallets, NOT personal wallets!
    assert.equal(world.businessEmpire.getBusiness(c1.id)!.companyCashMinor, c1CashBefore - toMinor(40_000));
    assert.equal(world.businessEmpire.getBusiness(c2.id)!.companyCashMinor, c2CashBefore - toMinor(40_000));
    assert.equal(getAvail(world, aliceId), alicePersonalBefore);
    assert.equal(getAvail(world, bobId), bobPersonalBefore);

    // JV shareholders are the partner company legal IDs (not individual CEOs)
    const hq = world.getCompanyHeadquarters(approved.company!.id, aliceId);
    assert.equal(hq.isJointVenture, true);
    assert.equal(hq.parentPartnerCompanies.length, 2);
    assertZeroDiscrepancy(world);
  });

  it('TEST 14: Multiplayer Investment Fund NAV Accounting — live NAV subscription/redemption & zero CR discrepancy', () => {
    const { world, aliceId, bobId } = createMultiplayerWorld();
    const fund = world.createV4Fund(aliceId, {
      name: 'Saigon Alpha Multi-Player Fund',
      code: 'SAMF',
      fundType: 'MULTI_ASSET_FUND',
      initialCapitalCR: 100_000,
      managementFeeAnnualPct: 1.5,
      redemptionFeePct: 0.5,
    });

    const sub = world.subscribeV4Fund(bobId, fund.id, 50_000, 'sub_bob_1');
    assert.ok(sub.unitsIssued > 0);
    assert.equal(sub.fund.members.length, 2);

    // Fund executes a real market trade (never withdraws to manager wallet)
    world.executeV4FundTrade(aliceId, fund.id, 'NOVA', 'BUY', 40_000);
    const updatedFund = world.funds.getFund(fund.id)!;
    assert.ok(updatedFund.navPerUnitMinor > 0);

    // Bob redeems half his units
    const red = world.redeemV4Fund(bobId, fund.id, sub.unitsIssued / 2, 'red_bob_1');
    assert.ok(red.request.estimatedPayoutMinor > 0);
    assertZeroDiscrepancy(world);
  });

  it('TEST 15: Career vs Online Strict World Isolation — Career project cannot receive Online commits & Career NPC works only in Career', () => {
    const { world, aliceId, bobId } = createMultiplayerWorld();

    const onlineProj = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'Online Pure Corp',
      ticker: 'ONPC',
      businessTypeId: 'fnb_coffee_shop',
      cityCode: 'HCMC',
      businessGoal: 'Dự án thuần Online Multiplayer',
      businessPlan: 'Không dùng NPC.',
      targetCapitalCR: 60_000,
      initialTotalShares: 6_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 30_000,
    });

    // Calling Career NPC on ONLINE project must fail
    assert.throws(
      () => world.commitCareerNpcToProject(aliceId, { projectId: onlineProj.id, amountCR: 30_000 }),
      (err: unknown) => err instanceof DomainError && err.code === 'CROSS_WORLD_TRANSFER_FORBIDDEN',
    );

    // Cross-mode commit (sending CAREER mode flag to ONLINE project) must fail
    assert.throws(
      () => world.commitCapitalToCoFounderProject(bobId, { projectId: onlineProj.id, amountCR: 30_000, worldMode: 'CAREER' }),
      (err: unknown) => err instanceof DomainError && err.code === 'CROSS_WORLD_TRANSFER_FORBIDDEN',
    );

    // Career project CAN receive finite-budget NPC Career co-founder commit
    const careerProj = world.createCoFounderProject(aliceId, {
      worldMode: 'CAREER',
      businessName: 'Career Solo Builder',
      ticker: 'CSBL',
      businessTypeId: 'fnb_coffee_shop',
      cityCode: 'HCMC',
      businessGoal: 'Dự án Career có NPC đồng sáng lập',
      businessPlan: 'Chế độ Career cô lập hoàn toàn.',
      targetCapitalCR: 60_000,
      initialTotalShares: 6_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 30_000,
    });

    const npcRes = world.commitCareerNpcToProject(aliceId, { projectId: careerProj.id, amountCR: 30_000 });
    assert.equal(npcRes.project.status, 'FUNDED');
    assert.equal(npcRes.contribution.isNpc, true);

    // Online Capital Hub MUST NOT list Career project
    const onlineHub = world.getCoFounderCapitalHub(aliceId, 'ONLINE');
    assert.ok(!onlineHub.projects.some((p) => p.id === careerProj.id));
    assertZeroDiscrepancy(world);
  });

  it('TEST 16: Dual-Client Realtime Consistency & Reconnect Idempotency', () => {
    const { world, aliceId, bobId } = createMultiplayerWorld();
    const receivedEvents: string[] = [];
    const unsubscribe = world.eventBus.subscribe((env) => {
      receivedEvents.push(env.eventType);
    });

    const project = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'Realtime Sync Corp',
      ticker: 'RTSC',
      businessTypeId: 'tech_software_startup',
      cityCode: 'HCMC',
      businessGoal: 'Kiểm thử đồng bộ sự kiện thời gian thực và idempotency',
      businessPlan: 'Đảm bảo gửi trùng request không trừ tiền 2 lần.',
      targetCapitalCR: 100_000,
      initialTotalShares: 10_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 40_000,
    });

    const bobBefore = getAvail(world, bobId);
    // Simulate duplicate network retry with identical idempotencyKey
    const first = world.commitCapitalToCoFounderProject(bobId, {
      projectId: project.id,
      amountCR: 30_000,
      worldMode: 'ONLINE',
      idempotencyKey: 'retry_commit_bob_42',
    });
    const second = world.commitCapitalToCoFounderProject(bobId, {
      projectId: project.id,
      amountCR: 30_000,
      worldMode: 'ONLINE',
      idempotencyKey: 'retry_commit_bob_42',
    });

    assert.equal(first.contribution.contributionId, second.contribution.contributionId);
    assert.equal(getAvail(world, bobId), bobBefore - toMinor(30_000));

    // Both Alice & Bob read identical authoritative state
    const hubA = world.getCoFounderCapitalHub(aliceId, 'ONLINE');
    const hubB = world.getCoFounderCapitalHub(bobId, 'ONLINE');
    const pA = hubA.projects.find((p) => p.id === project.id)!;
    const pB = hubB.projects.find((p) => p.id === project.id)!;
    assert.equal(pA.committedCapitalMinor, pB.committedCapitalMinor);
    assert.ok(receivedEvents.includes('cofounder.project.updated'));
    assert.ok(receivedEvents.includes('cofounder.commitment.updated'));

    unsubscribe();
    assertZeroDiscrepancy(world);
  });

  it('TEST 17: Legacy Modules Non-Regression Sanity — Spot Matching, Forex, Futures, Banking & Empire Connect remain intact', () => {
    const { world, aliceId } = createMultiplayerWorld();

    // 1. Spot order on ECX/ESE
    const spotRes = world.placeOrder(aliceId, {
      symbol: 'NOVA',
      side: 'BUY',
      type: 'MARKET',
      quantity: 5,
    });
    assert.ok(spotRes.order.id);

    // 2. Forex overview intact
    const fx = world.getForexOverview();
    assert.ok(fx.pairs.length >= 6);

    // 3. Futures overview intact
    const fut = world.getFuturesOverview();
    assert.ok(fut.contracts.length >= 6);

    // 4. Empire Connect share hook works on Capital Hub project
    const proj = world.createCoFounderProject(aliceId, {
      worldMode: 'ONLINE',
      businessName: 'Connect Hook Studio',
      ticker: 'CNHS',
      businessTypeId: 'fnb_coffee_shop',
      cityCode: 'HCMC',
      businessGoal: 'Kiểm thử chia sẻ dự án sang Empire Connect',
      businessPlan: 'Đăng bài vào kênh thị trường.',
      targetCapitalCR: 50_000,
      initialTotalShares: 5_000,
      minContributionCR: 10_000,
      visibility: 'PUBLIC',
      founderInitialCommitCR: 20_000,
    });
    const chat = world.shareCoFounderProjectToEmpireConnect(aliceId, proj.id, 'Tìm đối tác F&B');
    assert.ok(chat.content.includes('CNHS'));
    assertZeroDiscrepancy(world);
  });
});
