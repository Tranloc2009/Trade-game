import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Compass,
  GitBranch,
  History,
  Lock,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { formatCR, formatCompactCR } from '../../../shared/contracts/money';
import type {
  CareerPathId,
  CareerTitleGroup,
  CareerTitleSpec,
  PlayerCareerProfile,
  SkillBranchId,
  SkillNodeSpec,
  WealthRankSpec,
} from '../../../shared/contracts/v4';
import { V4Service } from '../../services/v4Api';
import { useAppStore } from '../../store/useAppStore';
import { WealthTierBadge } from './BadgeIcons';

type CareerTab = 'MISSIONS' | 'SKILLS' | 'TITLES' | 'JOURNEY';

const CAREER_PATH_LABELS: Record<CareerPathId, string> = {
  THE_ENTREPRENEUR: 'Nhà Khởi Nghiệp',
  THE_INVESTOR: 'Nhà Đầu Tư',
  THE_PROPERTY_MOGUL: 'Ông Trùm Bất Động Sản',
  THE_FUND_MANAGER: 'Nhà Quản Lý Quỹ',
  THE_CORPORATE_STRATEGIST: 'Chiến Lược Gia Tập Đoàn',
  THE_LUXURY_COLLECTOR: 'Nhà Sưu Tầm Thượng Lưu',
};

const SKILL_BRANCH_LABELS: Record<SkillBranchId, string> = {
  BUSINESS_MANAGEMENT: 'Quản trị Doanh nghiệp',
  INVESTMENT_KNOWLEDGE: 'Tri thức Đầu tư',
  CORPORATE_LEADERSHIP: 'Lãnh đạo Tập đoàn',
  PROPERTY_MANAGEMENT: 'Quản lý Bất động sản',
};

const TITLE_GROUP_LABELS: Record<'ALL' | CareerTitleGroup, string> = {
  ALL: 'Tất cả (54)',
  BUSINESS: 'Doanh nghiệp',
  INVESTMENT: 'Đầu tư',
  REAL_ESTATE: 'Bất động sản',
  FINANCE: 'Tài chính',
  LIFESTYLE: 'Phong cách sống',
  WORLD: 'Thế giới',
};

export function CareerProfilePage() {
  const { v4SyncSeq, setPlayer, pushToast } = useAppStore();

  const [tab, setTab] = useState<CareerTab>('MISSIONS');
  const [career, setCareer] = useState<PlayerCareerProfile | null>(null);
  const [ranks, setRanks] = useState<WealthRankSpec[]>([]);
  const [titles, setTitles] = useState<CareerTitleSpec[]>([]);
  const [skills, setSkills] = useState<SkillNodeSpec[]>([]);
  const [pathFilter, setPathFilter] = useState<'ALL' | CareerPathId>('ALL');
  const [titleGroupFilter, setTitleGroupFilter] = useState<'ALL' | CareerTitleGroup>('ALL');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadCareer = useCallback(async () => {
    try {
      const data = await V4Service.getCareer();
      setCareer(data.career);
      setRanks(data.ranks);
      setTitles(data.titles);
      setSkills(data.skills);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể tải Hồ sơ Sự nghiệp',
        description: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ.',
      });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadCareer();
  }, [loadCareer, v4SyncSeq]);

  const handleEquipTitle = async (titleId: string) => {
    setBusy(true);
    try {
      const res = await V4Service.equipTitle(titleId);
      setCareer(res.career);
      setPlayer(res.profile);
      pushToast({
        tone: 'success',
        title: 'Đã trang bị danh hiệu mới',
        description: res.career.equippedTitleName,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể trang bị danh hiệu',
        description: err instanceof Error ? err.message : 'Danh hiệu chưa được mở khóa.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockSkill = async (skillId: string) => {
    setBusy(true);
    try {
      const res = await V4Service.unlockSkill(skillId);
      setCareer(res.career);
      pushToast({
        tone: 'success',
        title: 'Đã mở khóa kỹ năng mới',
        description: `Điểm kỹ năng còn lại: ${res.skillPointsRemaining}`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể mở khóa kỹ năng',
        description: err instanceof Error ? err.message : 'Kiểm tra điểm kỹ năng hoặc điều kiện tiên quyết.',
      });
    } finally {
      setBusy(false);
    }
  };

  const filteredMissions = useMemo(() => {
    if (!career) return [];
    return pathFilter === 'ALL'
      ? career.missions
      : career.missions.filter((m) => m.pathId === pathFilter);
  }, [career, pathFilter]);

  const filteredTitles = useMemo(
    () => (titleGroupFilter === 'ALL' ? titles : titles.filter((t) => t.group === titleGroupFilter)),
    [titles, titleGroupFilter],
  );

  const completedMissionsCount = useMemo(
    () => career?.missions.filter((m) => m.completed).length ?? 0,
    [career],
  );

  if (loading && !career) {
    return (
      <div className="max-w-[1440px] mx-auto p-10 text-center text-xs text-[var(--text-muted)] rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
        Đang tải Hồ sơ Sự nghiệp, Cấp bậc Tài sản & Danh hiệu...
      </div>
    );
  }

  if (!career) return null;

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Sự nghiệp, Cấp bậc Tài sản & Danh hiệu</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            12 Cấp bậc Tài sản · 54 Danh hiệu · 6 Lộ trình Nghề nghiệp · Cây Kỹ năng mở khóa công cụ quản trị chuyên sâu
          </p>
        </div>
        <button
          type="button"
          onClick={loadCareer}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Đồng bộ tiến độ
        </button>
      </div>

      {/* Wealth Rank Hero Banner */}
      <section className="p-5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <WealthTierBadge tier={career.wealthRank.tier} size={64} />
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--accent)]">
                {career.wealthRank.frameLabel} · {career.wealthRank.tier}
              </div>
              <h2 className="text-xl font-bold">{career.wealthRank.name}</h2>
              <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                {career.username} · Danh hiệu đang hiển thị:{' '}
                <span className="font-semibold text-[var(--text-primary)]">{career.equippedTitleName}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-right">
            <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)]">
              <div className="text-[11px] text-[var(--text-muted)]">Tài sản Ròng (Net Worth)</div>
              <div className="text-sm font-mono font-bold tabular-nums text-[var(--positive)] mt-0.5">
                {formatCR(career.netWorthMinor)} CR
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)]">
              <div className="text-[11px] text-[var(--text-muted)]">Điểm Kỹ năng</div>
              <div className="text-sm font-mono font-bold tabular-nums text-amber-400 mt-0.5">
                {career.skillPoints} SP
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)]">
              <div className="text-[11px] text-[var(--text-muted)]">Nhiệm vụ / Danh hiệu</div>
              <div className="text-sm font-mono font-bold tabular-nums mt-0.5">
                {completedMissionsCount}/{career.missions.length} · {career.unlockedTitleIds.length}/{titles.length}
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar to next Wealth Rank */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">
              {career.nextWealthRank
                ? `Mục tiêu tiếp theo: ${career.nextWealthRank.name} (${career.nextWealthRank.minNetWorthCR.toLocaleString('vi-VN')} CR)`
                : 'Đã đạt đỉnh cao tối thượng của thế giới Trading Empire'}
            </span>
            <span className="font-mono font-semibold text-[var(--accent)]">
              {career.progressToNextRankPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--bg-app)] overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all"
              style={{ width: `${Math.min(100, Math.max(2, career.progressToNextRankPct))}%` }}
            />
          </div>
        </div>

        {/* 12 Wealth Ranks Ladder */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-2 border-t border-[var(--border-subtle)]/60">
          {ranks.map((rk) => {
            const reached = career.netWorthMinor >= rk.minNetWorthCR * 100;
            const current = rk.id === career.wealthRank.id;
            return (
              <div
                key={rk.id}
                className={`p-2 rounded-lg border text-xs flex items-center gap-2 ${
                  current
                    ? 'bg-[var(--bg-surface)] border-[var(--accent)]'
                    : reached
                      ? 'bg-[var(--bg-app)] border-[var(--border-subtle)]'
                      : 'bg-[var(--bg-app)]/40 border-[var(--border-subtle)]/40 opacity-55'
                }`}
              >
                <WealthTierBadge tier={rk.tier} size={26} className="shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold truncate text-[11px]">{rk.name}</div>
                  <div className="font-mono text-[10px] text-[var(--text-muted)]">
                    ≥ {formatCompactCR(rk.minNetWorthCR * 100)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Main Career Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--border-subtle)] pb-2">
        {(
          [
            { id: 'MISSIONS', label: '6 Lộ trình & 21 Nhiệm vụ', icon: Compass },
            { id: 'SKILLS', label: 'Cây Kỹ năng (12 Nút)', icon: GitBranch },
            { id: 'TITLES', label: `Bộ sưu tập Danh hiệu (${titles.length})`, icon: Award },
            { id: 'JOURNEY', label: `Hành trình Người chơi (${career.journey.length})`, icon: History },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                active
                  ? 'bg-[var(--accent)] text-[#0B0F17]'
                  : 'bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Career Paths & 21 Missions */}
      {tab === 'MISSIONS' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setPathFilter('ALL')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer ${
                pathFilter === 'ALL'
                  ? 'bg-[var(--bg-surface)] border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              Tất cả lộ trình
            </button>
            {(Object.keys(CAREER_PATH_LABELS) as CareerPathId[]).map((pid) => (
              <button
                key={pid}
                type="button"
                onClick={() => setPathFilter(pid)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer ${
                  pathFilter === pid
                    ? 'bg-[var(--bg-surface)] border-[var(--accent)] text-[var(--accent)]'
                    : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                {CAREER_PATH_LABELS[pid]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredMissions.map((m) => {
              const pct = Math.min(100, (m.currentValue / Math.max(m.targetValue, 1)) * 100);
              return (
                <div
                  key={m.id}
                  className={`p-4 rounded-xl border space-y-3 ${
                    m.completed
                      ? 'bg-[var(--bg-panel)] border-[var(--positive)]/50'
                      : 'bg-[var(--bg-panel)] border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {CAREER_PATH_LABELS[m.pathId]} · Nhiệm vụ #{m.order}
                      </div>
                      <h3 className="text-sm font-semibold mt-0.5">{m.title}</h3>
                    </div>
                    <WealthTierBadge tier={m.rewardBadgeTier} size={30} className="shrink-0" />
                  </div>

                  <p className="text-xs text-[var(--text-secondary)]">{m.description}</p>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className={m.completed ? 'text-[var(--positive)] font-semibold' : 'text-[var(--text-muted)]'}>
                        {m.completed ? 'ĐÃ HOÀN THÀNH (Xác thực máy chủ)' : 'Đang thực hiện'}
                      </span>
                      <span>
                        {Math.min(m.currentValue, m.targetValue).toLocaleString('vi-VN')} /{' '}
                        {m.targetValue.toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--bg-app)] overflow-hidden">
                      <div
                        className={`h-full ${m.completed ? 'bg-[var(--positive)]' : 'bg-[var(--accent)]'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[var(--border-subtle)]/60 flex items-center justify-between text-[11px]">
                    <span className="text-amber-400 font-mono">+{m.skillPointsReward} SP</span>
                    <span className="text-[var(--text-secondary)] truncate">{m.rewardDescription}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: 4-Branch Skill Tree */}
      {tab === 'SKILLS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.keys(SKILL_BRANCH_LABELS) as SkillBranchId[]).map((branch) => {
            const branchNodes = skills.filter((s) => s.branch === branch);
            return (
              <section
                key={branch}
                className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold">{SKILL_BRANCH_LABELS[branch]}</h2>
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">
                    {branchNodes.filter((n) => career.unlockedSkillIds.includes(n.id)).length}/{branchNodes.length} đã mở
                  </span>
                </div>

                <div className="space-y-2.5">
                  {branchNodes.map((node) => {
                    const unlocked = career.unlockedSkillIds.includes(node.id);
                    const prereqMet = !node.prerequisiteId || career.unlockedSkillIds.includes(node.prerequisiteId);
                    const canUnlock = !unlocked && prereqMet && career.skillPoints >= node.costPoints;
                    return (
                      <div
                        key={node.id}
                        className={`p-3 rounded-lg border space-y-1.5 ${
                          unlocked
                            ? 'bg-[var(--positive)]/5 border-[var(--positive)]/40'
                            : 'bg-[var(--bg-app)] border-[var(--border-subtle)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold flex items-center gap-1.5">
                            {unlocked ? (
                              <CheckCircle2 className="w-4 h-4 text-[var(--positive)]" />
                            ) : !prereqMet ? (
                              <Lock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            )}
                            {node.name}
                          </div>
                          {unlocked ? (
                            <span className="font-mono text-[11px] text-[var(--positive)]">Đã mở khóa</span>
                          ) : (
                            <button
                              type="button"
                              disabled={busy || !canUnlock}
                              onClick={() => handleUnlockSkill(node.id)}
                              className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[var(--accent)] text-[#0B0F17] disabled:opacity-40 cursor-pointer"
                            >
                              Mở khóa ({node.costPoints} SP)
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)]">{node.description}</p>
                        <div className="text-[11px] font-mono text-[var(--accent)]">
                          Mở khóa công cụ: {node.unlocksTool}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Tab 3: 54 Titles */}
      {tab === 'TITLES' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TITLE_GROUP_LABELS) as Array<'ALL' | CareerTitleGroup>).map((grp) => (
              <button
                key={grp}
                type="button"
                onClick={() => setTitleGroupFilter(grp)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer ${
                  titleGroupFilter === grp
                    ? 'bg-[var(--bg-surface)] border-[var(--accent)] text-[var(--accent)]'
                    : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                {TITLE_GROUP_LABELS[grp]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredTitles.map((t) => {
              const unlocked = career.unlockedTitleIds.includes(t.id);
              const equipped = career.equippedTitleId === t.id;
              return (
                <div
                  key={t.id}
                  className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                    equipped
                      ? 'bg-[var(--bg-surface)] border-[var(--accent)]'
                      : unlocked
                        ? 'bg-[var(--bg-panel)] border-[var(--border-subtle)]'
                        : 'bg-[var(--bg-panel)]/50 border-[var(--border-subtle)]/50 opacity-65'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <WealthTierBadge tier={t.tier} size={34} className="shrink-0 mt-0.5" />
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs font-bold truncate">{t.name}</div>
                      <div className="text-[11px] text-[var(--text-secondary)]">{t.conditionLabel}</div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">
                        {t.group} · {t.tier}
                      </div>
                    </div>
                  </div>

                  {equipped ? (
                    <span className="shrink-0 text-[11px] font-mono font-semibold text-[var(--accent)]">Đang dùng</span>
                  ) : unlocked ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleEquipTitle(t.id)}
                      className="shrink-0 px-2.5 py-1 rounded text-[11px] font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
                    >
                      Trang bị
                    </button>
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 mt-1" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 4: Player Journey */}
      {tab === 'JOURNEY' && (
        <section className="p-5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold">Biên niên sử Hành trình Người chơi (Player Journey)</h2>
          </div>

          {career.journey.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)] py-6 text-center">
              Các cột mốc khởi nghiệp, M&A, IPO, thành lập Quỹ và mua sắm Xa xỉ sẽ được tự động lưu trữ tại đây.
            </div>
          ) : (
            <ol className="divide-y divide-[var(--border-subtle)]/60">
              {career.journey.map((ev) => (
                <li key={ev.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-mono text-[var(--accent)]">{ev.category}</div>
                    <div className="text-sm font-semibold">{ev.title}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{ev.detail}</div>
                  </div>
                  <div className="text-[11px] font-mono text-[var(--text-muted)] shrink-0">
                    {new Date(ev.timestamp).toLocaleString('vi-VN')}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
