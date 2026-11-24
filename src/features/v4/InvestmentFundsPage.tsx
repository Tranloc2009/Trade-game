import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Users,
  Vote,
  X,
} from 'lucide-react';
import { formatCR, formatCompactCR } from '../../../shared/contracts/money';
import type { FundType, InvestmentFund } from '../../../shared/contracts/v4';
import { V4Service } from '../../services/v4Api';
import { useAppStore } from '../../store/useAppStore';

const DONUT_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#06b6d4', '#ec4899'];

const FUND_TYPE_OPTIONS: Array<{ value: FundType; label: string }> = [
  { value: 'STOCK_FUND', label: 'Quỹ Cổ phiếu (ESE)' },
  { value: 'CRYPTO_SPOT_FUND', label: 'Quỹ Crypto Spot (ECX)' },
  { value: 'FOREX_FUND', label: 'Quỹ Ngoại hối (EFX)' },
  { value: 'REAL_ESTATE_FUND', label: 'Quỹ Bất động sản VN' },
  { value: 'DIVIDEND_FUND', label: 'Quỹ Cổ tức' },
  { value: 'BALANCED_FUND', label: 'Quỹ Cân bằng' },
  { value: 'MONEY_MARKET_FUND', label: 'Quỹ Thị trường Tiền tệ' },
  { value: 'MULTI_ASSET_FUND', label: 'Quỹ Đa tài sản' },
];

function MiniSparkline({ points, stroke }: { points: number[]; stroke: string }) {
  const safe = points.length >= 2 ? points : [100, 100];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const span = Math.max(max - min, 1);
  const d = safe
    .map((v, i) => {
      const x = (i / (safe.length - 1)) * 76 + 2;
      const y = 26 - ((v - min) / span) * 22;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width="80" height="30" viewBox="0 0 80 30" className="shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExposureRing({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 15;
  const circ = 2 * Math.PI * r;
  const dash = (clamped / 100) * circ;
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" className="shrink-0" aria-hidden="true">
      <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="4" />
      <circle
        cx="19"
        cy="19"
        r={r}
        fill="none"
        stroke="#10b981"
        strokeWidth="4"
        strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
        strokeLinecap="round"
        transform="rotate(-90 19 19)"
      />
    </svg>
  );
}

export function InvestmentFundsPage() {
  const { player, v4SyncSeq, setPlayer, pushToast } = useAppStore();

  const [funds, setFunds] = useState<InvestmentFund[]>([]);
  const [selectedFundId, setSelectedFundId] = useState<string>('');
  const [fundView, setFundView] = useState<'DISCOVER' | 'MINE'>('DISCOVER');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Investor actions
  const [subscribeCR, setSubscribeCR] = useState('15000');
  const [redeemUnits, setRedeemUnits] = useState('100');

  // Manager trade desk
  const [tradeSymbol, setTradeSymbol] = useState('');
  const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeAmountCR, setTradeAmountCR] = useState('10000');

  // Governance proposal
  const [propTitle, setPropTitle] = useState('');
  const [propDesc, setPropDesc] = useState('');
  const [propType, setPropType] = useState<'CHANGE_STRATEGY' | 'CHANGE_RISK_LIMIT' | 'ADJUST_FEE'>('CHANGE_STRATEGY');

  // Create Fund Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<FundType>('BALANCED_FUND');
  const [newCapitalCR, setNewCapitalCR] = useState('50000');
  const [newMgmtFee, setNewMgmtFee] = useState('1.5');
  const [newMaxPos, setNewMaxPos] = useState('35');
  const [newMinCash, setNewMinCash] = useState('15');
  const [newDesc, setNewDesc] = useState('');

  const loadFunds = useCallback(async () => {
    try {
      const data = await V4Service.getFunds();
      setFunds(data.funds);
      setSelectedFundId((prev) =>
        prev && data.funds.some((f) => f.id === prev) ? prev : (data.funds[0]?.id ?? ''),
      );
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể tải danh sách Quỹ Đầu tư',
        description: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ.',
      });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadFunds();
  }, [loadFunds, v4SyncSeq]);

  const myFunds = useMemo(
    () =>
      player
        ? funds.filter(
            (f) => f.managerId === player.id || f.members.some((m) => m.playerId === player.id && m.units > 0),
          )
        : [],
    [funds, player],
  );

  const visibleFunds = fundView === 'MINE' ? myFunds : funds;

  const activeFund = useMemo(
    () => visibleFunds.find((f) => f.id === selectedFundId) ?? visibleFunds[0] ?? null,
    [visibleFunds, selectedFundId],
  );

  useEffect(() => {
    if (activeFund && activeFund.allowedAssets.length > 0 && !activeFund.allowedAssets.includes(tradeSymbol)) {
      setTradeSymbol(activeFund.allowedAssets[0]);
    }
  }, [activeFund, tradeSymbol]);

  const myMembership = useMemo(
    () => activeFund?.members.find((m) => m.playerId === player?.id) ?? null,
    [activeFund, player],
  );

  const isManager = Boolean(activeFund && player && activeFund.managerId === player.id);

  // Compute allocation slices (Holdings + Cash)
  const allocationSlices = useMemo(() => {
    if (!activeFund) return [];
    const total = Math.max(activeFund.totalAssetsMinor, 1);
    const slices = activeFund.holdings.map((h, i) => ({
      label: h.symbol,
      assetClass: h.assetClass,
      valueMinor: h.marketValueMinor,
      pct: (h.marketValueMinor / total) * 100,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }));
    slices.push({
      label: 'Tiền mặt (CR)',
      assetClass: 'CASH_EQUIV',
      valueMinor: activeFund.cashMinor,
      pct: (activeFund.cashMinor / total) * 100,
      color: '#10b981',
    });
    return slices.filter((s) => s.valueMinor > 0 || slices.length === 1);
  }, [activeFund]);

  const exposurePct = useMemo(() => {
    if (!activeFund || activeFund.totalAssetsMinor <= 0) return 0;
    const invested = activeFund.totalAssetsMinor - activeFund.cashMinor;
    return Math.max(0, Math.min(100, (invested / activeFund.totalAssetsMinor) * 100));
  }, [activeFund]);

  const handleSubscribe = async () => {
    if (!activeFund) return;
    const amt = Number(subscribeCR);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setBusy(true);
    try {
      const res = await V4Service.subscribeFund(activeFund.id, amt);
      setPlayer(res.profile);
      pushToast({
        tone: 'success',
        title: `Đã góp vốn vào ${res.fund.code}`,
        description: `Nhận ${res.unitsIssued.toFixed(2)} chứng chỉ quỹ (NAV ${formatCR(res.fund.navPerUnitMinor)} CR).`,
      });
      await loadFunds();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Góp vốn quỹ thất bại',
        description: err instanceof Error ? err.message : 'Vui lòng kiểm tra số dư khả dụng.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRedeem = async () => {
    if (!activeFund) return;
    const units = Number(redeemUnits);
    if (!Number.isFinite(units) || units <= 0) return;
    setBusy(true);
    try {
      const res = await V4Service.redeemFund(activeFund.id, units);
      setPlayer(res.profile);
      pushToast({
        tone: res.settledImmediately ? 'success' : 'warning',
        title: res.settledImmediately ? 'Đã tất toán rút vốn quỹ' : 'Đã xếp hàng đợi thanh khoản FIFO',
        description: res.settledImmediately
          ? `Thanh toán ròng ${formatCR(res.request.estimatedPayoutMinor)} CR vào ví.`
          : 'Tiền mặt quỹ đang giữ mức đệm tối thiểu — yêu cầu sẽ tự động giải ngân khi có thanh khoản.',
      });
      await loadFunds();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Yêu cầu rút vốn thất bại',
        description: err instanceof Error ? err.message : 'Kiểm tra số lượng chứng chỉ quỹ.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleManagerTrade = async () => {
    if (!activeFund || !tradeSymbol) return;
    const amt = Number(tradeAmountCR);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setBusy(true);
    try {
      await V4Service.executeFundTrade(activeFund.id, tradeSymbol, tradeSide, amt);
      pushToast({
        tone: 'success',
        title: `Đã khớp lệnh phân bổ quỹ ${activeFund.code}`,
        description: `${tradeSide === 'BUY' ? 'MUA' : 'BÁN'} ${tradeSymbol} trị giá ${amt.toLocaleString('vi-VN')} CR.`,
      });
      await loadFunds();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Lệnh phân bổ quỹ bị từ chối',
        description: err instanceof Error ? err.message : 'Vi phạm giới hạn rủi ro hoặc thanh khoản quỹ.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateFund = async () => {
    if (!newName.trim() || !newCode.trim()) return;
    setBusy(true);
    try {
      const res = await V4Service.createFund({
        name: newName.trim(),
        code: newCode.trim().toUpperCase(),
        fundType: newType,
        description: newDesc.trim() || undefined,
        initialCapitalCR: Number(newCapitalCR),
        managementFeeAnnualPct: Number(newMgmtFee),
        maxSinglePositionPct: Number(newMaxPos),
        minCashReservePct: Number(newMinCash),
        isPublic: true,
      });
      setPlayer(res.profile);
      setCreateOpen(false);
      setNewName('');
      setNewCode('');
      setNewDesc('');
      setSelectedFundId(res.fund.id);
      pushToast({
        tone: 'success',
        title: `Thành lập quỹ ${res.fund.code} thành công`,
        description: `Vốn ban đầu ${formatCR(res.fund.navMinor)} CR đã chuyển vào tài khoản tách biệt của quỹ.`,
      });
      await loadFunds();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể thành lập quỹ',
        description: err instanceof Error ? err.message : 'Kiểm tra vốn tối thiểu (25.000 CR) và thông số.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateProposal = async () => {
    if (!activeFund || !propTitle.trim()) return;
    setBusy(true);
    try {
      await V4Service.createFundProposal(activeFund.id, {
        type: propType,
        title: propTitle.trim(),
        description: propDesc.trim() || propTitle.trim(),
      });
      setPropTitle('');
      setPropDesc('');
      pushToast({ tone: 'success', title: 'Đã tạo đề xuất quản trị quỹ', description: 'Các nhà đầu tư có thể bỏ phiếu theo tỷ lệ chứng chỉ quỹ.' });
      await loadFunds();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Tạo đề xuất thất bại',
        description: err instanceof Error ? err.message : 'Chỉ thành viên nắm chứng chỉ quỹ mới có quyền đề xuất.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleVote = async (proposalId: string, vote: 'FOR' | 'AGAINST') => {
    if (!activeFund) return;
    setBusy(true);
    try {
      await V4Service.voteFundProposal(activeFund.id, proposalId, vote);
      pushToast({ tone: 'info', title: 'Đã ghi nhận phiếu bầu quản trị quỹ' });
      await loadFunds();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Bỏ phiếu thất bại',
        description: err instanceof Error ? err.message : 'Lỗi bỏ phiếu.',
      });
    } finally {
      setBusy(false);
    }
  };

  // Build NAV SVG path
  const navChart = useMemo(() => {
    const pts = activeFund?.navHistory ?? [];
    if (pts.length === 0) return { line: '', area: '', min: 0, max: 100, lastY: 96 };
    const values = pts.length === 1 ? [pts[0].navMinor, pts[0].navMinor] : pts.map((p) => p.navMinor);
    const min = Math.min(...values) * 0.96;
    const max = Math.max(...values) * 1.04 + 1;
    const span = Math.max(max - min, 1);
    const coords = values.map((v, idx) => {
      const x = 64 + (idx / Math.max(values.length - 1, 1)) * 420;
      const y = 162 - ((v - min) / span) * 126;
      return { x, y };
    });
    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},172 L${coords[0].x.toFixed(1)},172 Z`;
    const lastY = coords[coords.length - 1]?.y ?? 96;
    return { line, area, min, max, lastY };
  }, [activeFund]);

  // Build SVG Donut segments
  const donutSegments = useMemo(() => {
    const r = 56;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    return allocationSlices.map((s) => {
      const len = (s.pct / 100) * circ;
      const seg = { ...s, dashArray: `${len.toFixed(2)} ${(circ - len).toFixed(2)}`, dashOffset: -offset };
      offset += len;
      return seg;
    });
  }, [allocationSlices]);

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      {/* Header & 2-Tab View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Quỹ đầu tư</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Góp vốn cùng nhà quản lý quỹ để đầu tư đa tài sản · Không đòn bẩy · Định giá minh bạch theo thị trường.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Chế độ xem quỹ đầu tư"
            className="inline-flex rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 text-xs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={fundView === 'DISCOVER'}
              onClick={() => setFundView('DISCOVER')}
              className={`px-3 py-1.5 rounded font-medium cursor-pointer transition-colors whitespace-nowrap ${
                fundView === 'DISCOVER'
                  ? 'bg-[var(--bg-panel)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Khám phá quỹ ({funds.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={fundView === 'MINE'}
              onClick={() => setFundView('MINE')}
              className={`px-3 py-1.5 rounded font-medium cursor-pointer transition-colors whitespace-nowrap ${
                fundView === 'MINE'
                  ? 'bg-[var(--bg-panel)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Quỹ của tôi ({myFunds.length})
            </button>
          </div>
          <button
            type="button"
            onClick={loadFunds}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Làm mới
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Tạo quỹ mới
          </button>
        </div>
      </div>

      {/* Fund Selector Strip */}
      {visibleFunds.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {visibleFunds.map((f) => {
            const active = f.id === activeFund?.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFundId(f.id)}
                className={`shrink-0 px-3.5 py-2.5 rounded-lg border text-left transition-colors cursor-pointer min-w-[210px] ${
                  active
                    ? 'bg-[var(--bg-surface)] border-[var(--accent)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] hover:border-[var(--accent)]/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold" style={{ color: active ? 'var(--accent)' : f.logoColor }}>
                    {f.code}
                  </span>
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      f.returnPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                    }`}
                  >
                    {f.returnPct >= 0 ? '+' : ''}
                    {f.returnPct.toFixed(2)}%
                  </span>
                </div>
                <div className="text-xs font-semibold truncate mt-0.5">{f.name}</div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1">
                  Quy mô {formatCompactCR(f.navMinor)} CR · {f.members.length} NĐT
                </div>
              </button>
            );
          })}
        </div>
      )}

      {loading && !activeFund ? (
        <div className="p-10 text-center text-xs text-[var(--text-muted)] rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          Đang tải danh sách quỹ đầu tư...
        </div>
      ) : !activeFund && fundView === 'MINE' ? (
        <div className="p-10 text-center space-y-3 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <Briefcase className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
          <div className="text-sm font-semibold">Bạn chưa tham gia quỹ đầu tư nào</div>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            Khám phá các quỹ đang mở để góp vốn và nắm giữ chứng chỉ quỹ, hoặc tự thành lập quỹ đầu tư của riêng bạn.
          </p>
          <button
            type="button"
            onClick={() => setFundView('DISCOVER')}
            className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
          >
            Khám phá quỹ ngay
          </button>
        </div>
      ) : activeFund ? (
        <>
          {/* Top 5 KPI Cards (Black101 inspired dark navy institutional layout) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Tổng Tài sản Ròng (AUM)</div>
                <div className="text-lg font-mono font-bold tabular-nums mt-1 truncate">
                  {formatCompactCR(activeFund.navMinor)} CR
                </div>
                <div className="text-[11px] font-mono text-[var(--positive)] mt-0.5">
                  Tiền mặt {formatCompactCR(activeFund.cashMinor)} CR
                </div>
              </div>
              <MiniSparkline
                points={activeFund.navHistory.map((p) => p.navMinor)}
                stroke="#10b981"
              />
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Hiệu suất Quỹ</div>
                <div
                  className={`text-lg font-mono font-bold tabular-nums mt-1 ${
                    activeFund.returnPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                  }`}
                >
                  {activeFund.returnPct >= 0 ? '+' : ''}
                  {activeFund.returnPct.toFixed(2)}%
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Từ thời điểm thành lập</div>
              </div>
              <MiniSparkline
                points={activeFund.navHistory.map((p) => p.navPerUnitMinor)}
                stroke="#3b82f6"
              />
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Giá 1 Chứng chỉ Quỹ</div>
                <div className="text-lg font-mono font-bold tabular-nums mt-1">
                  {formatCR(activeFund.navPerUnitMinor)} CR
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                  {activeFund.outstandingUnits.toFixed(1)} CCQ lưu hành
                </div>
              </div>
              <MiniSparkline
                points={activeFund.navHistory.map((p, i) => p.navPerUnitMinor + i * 2)}
                stroke="#8b5cf6"
              />
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Nhà đầu tư</div>
                <div className="text-lg font-mono font-bold tabular-nums mt-1 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-amber-400" />
                  {activeFund.members.length}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
                  QL: {activeFund.managerName}
                </div>
              </div>
              <MiniSparkline
                points={[1, 2, Math.max(2, activeFund.members.length)]}
                stroke="#f59e0b"
              />
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Tỷ lệ Phân bổ Vốn</div>
                <div className="text-lg font-mono font-bold tabular-nums mt-1">{exposurePct.toFixed(1)}%</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Đệm TM tối thiểu {activeFund.minCashReservePct}%
                </div>
              </div>
              <ExposureRing pct={exposurePct} />
            </div>
          </div>

          {/* Investor Actions + Holdings Desk (Primary V5 Surface) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Subscribe & Redeem Panel */}
            <section className="lg:col-span-5 p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Góp vốn & Rút Chứng chỉ Quỹ</h2>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {myMembership
                      ? `Bạn nắm giữ ${myMembership.units.toFixed(2)} CCQ (${myMembership.ownershipPct.toFixed(1)}% quỹ · Giá trị ${formatCR(Math.round(myMembership.units * activeFund.navPerUnitMinor))} CR)`
                      : 'Bạn chưa sở hữu chứng chỉ quỹ này.'}
                  </p>
                </div>
                <Briefcase className="w-4 h-4 text-[var(--accent)]" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-2">
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                    Góp vốn mới (CR)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={subscribeCR}
                    onChange={(e) => setSubscribeCR(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-mono text-xs"
                  />
                  <div className="text-[11px] font-mono text-[var(--text-muted)]">
                    Ước tính ≈{' '}
                    {(
                      (Number(subscribeCR) || 0) /
                      Math.max(activeFund.navPerUnitMinor / 100, 1)
                    ).toFixed(2)}{' '}
                    CCQ · Phí QL {activeFund.managementFeeAnnualPct.toFixed(1)}%/năm
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] leading-snug">
                    Không đòn bẩy · Giá trị CCQ biến động theo thị trường · Phí rút {activeFund.redemptionFeePct}% ({activeFund.redemptionNoticeLabel}).
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleSubscribe}
                    className="w-full py-2 rounded-md text-xs font-semibold bg-[var(--positive)] text-[#07130d] hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Góp vốn vào quỹ
                  </button>
                </div>

                <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-2">
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                    Rút vốn (số lượng CCQ)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={10}
                    value={redeemUnits}
                    onChange={(e) => setRedeemUnits(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-mono text-xs"
                  />
                  <div className="text-[11px] font-mono text-[var(--text-muted)]">
                    Phí rút {activeFund.redemptionFeePct}% · Thanh khoản FIFO
                  </div>
                  <button
                    type="button"
                    disabled={busy || !myMembership || myMembership.units <= 0}
                    onClick={handleRedeem}
                    className="w-full py-2 rounded-md text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--warning)] text-[var(--text-primary)] disabled:opacity-40 inline-flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    Yêu cầu Rút vốn
                  </button>
                </div>
              </div>

              {activeFund.redemptionQueue.length > 0 && (
                <div className="pt-2 border-t border-[var(--border-subtle)]/60 space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-secondary)]">Lịch sử & Hàng đợi Rút vốn</div>
                  {activeFund.redemptionQueue.slice(0, 4).map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[var(--text-secondary)] truncate">
                        {r.playerName} · {r.unitsRequested.toFixed(1)} CCQ
                      </span>
                      <span
                        className={
                          r.status === 'SETTLED'
                            ? 'text-[var(--positive)]'
                            : r.status === 'QUEUED'
                              ? 'text-[var(--warning)]'
                              : 'text-[var(--text-muted)]'
                        }
                      >
                        {r.status} · {formatCompactCR(r.estimatedPayoutMinor)} CR
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Manager Trade Desk & Holdings Table */}
            <section className="lg:col-span-7 p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Danh mục & Bàn Giao dịch Quỹ</h2>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {isManager ? 'Bạn là Nhà Quản lý Quỹ — có thể phân bổ lệnh' : `Đang quản lý bởi ${activeFund.managerName}`}
                  </p>
                </div>
                <TrendingUp className="w-4 h-4 text-blue-400" />
              </div>

              {isManager && (
                <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={tradeSymbol}
                      onChange={(e) => setTradeSymbol(e.target.value)}
                      className="px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-mono text-xs"
                    >
                      {activeFund.allowedAssets.map((sym) => (
                        <option key={sym} value={sym}>
                          {sym}
                        </option>
                      ))}
                    </select>
                    <select
                      value={tradeSide}
                      onChange={(e) => setTradeSide(e.target.value as 'BUY' | 'SELL')}
                      className="px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs"
                    >
                      <option value="BUY">MUA phân bổ</option>
                      <option value="SELL">BÁN thanh lý</option>
                    </select>
                    <input
                      type="number"
                      min={1000}
                      step={1000}
                      value={tradeAmountCR}
                      onChange={(e) => setTradeAmountCR(e.target.value)}
                      className="px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-mono text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleManagerTrade}
                    className="w-full py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 cursor-pointer"
                  >
                    Thực thi phân bổ tài sản quỹ
                  </button>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[11px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                      <th className="pb-1.5">Tài sản</th>
                      <th className="pb-1.5 text-right">SL</th>
                      <th className="pb-1.5 text-right">Giá trị</th>
                      <th className="pb-1.5 text-right">Tỷ trọng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]/40 font-mono">
                    {activeFund.holdings.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-center font-sans text-[var(--text-muted)]">
                          Quỹ đang nắm giữ 100% tiền mặt CR.
                        </td>
                      </tr>
                    ) : (
                      activeFund.holdings.map((h) => (
                        <tr key={h.symbol}>
                          <td className="py-2 font-semibold">{h.symbol}</td>
                          <td className="py-2 text-right">{h.quantity.toFixed(2)}</td>
                          <td className="py-2 text-right">{formatCompactCR(h.marketValueMinor)}</td>
                          <td className="py-2 text-right text-blue-400">{h.weightPct.toFixed(1)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

          </div>

          {/* Collapsible Advanced Institutional Analytics & Governance */}
          <div className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/50 transition-colors cursor-pointer"
            >
              <span>Chỉ số nâng cao & Quản trị quỹ (Biểu đồ NAV · Phân bổ · Rủi ro · Biểu quyết)</span>
              {showAdvanced ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
            </button>

            {showAdvanced && (
              <div className="p-4 pt-2 border-t border-[var(--border-subtle)] space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* NAV Evolution */}
                  <section className="lg:col-span-5 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h2 className="text-sm font-semibold">Diễn biến Tài sản Ròng (NAV)</h2>
                        <p className="text-[11px] text-[var(--text-muted)]">{activeFund.investmentObjective}</p>
                      </div>
                      <span className="font-mono text-xs text-[var(--accent)]">{activeFund.code}</span>
                    </div>

                    <svg viewBox="0 0 500 190" className="w-full h-44" role="img" aria-label="Biểu đồ diễn biến NAV quỹ">
                      <defs>
                        <linearGradient id="navAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.32" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
                        </linearGradient>
                      </defs>
                      {[
                        { y: 36, val: navChart.max },
                        { y: 78, val: navChart.min + (navChart.max - navChart.min) * 0.67 },
                        { y: 120, val: navChart.min + (navChart.max - navChart.min) * 0.33 },
                        { y: 162, val: navChart.min },
                      ].map((tick) => (
                        <g key={tick.y}>
                          <line x1="62" y1={tick.y} x2="484" y2={tick.y} stroke="rgba(148,163,184,0.14)" strokeDasharray="3 3" />
                          <text x="56" y={tick.y + 3} textAnchor="end" fill="#64748b" fontSize="9.5" fontFamily="monospace">
                            {formatCompactCR(tick.val)}
                          </text>
                        </g>
                      ))}
                      {navChart.area && <path d={navChart.area} fill="url(#navAreaGrad)" />}
                      {navChart.line && (
                        <path d={navChart.line} fill="none" stroke="#3b82f6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      )}
                      <circle cx="484" cy={navChart.lastY} r="4" fill="#60a5fa" stroke="#0b1120" strokeWidth="2" />
                    </svg>

                    <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)]/60">
                      <span>Không dùng đòn bẩy</span>
                      <span>Phí QL: {activeFund.managementFeeAnnualPct.toFixed(2)}%/năm · Rút: {activeFund.redemptionFeePct.toFixed(2)}%</span>
                    </div>
                  </section>

                  {/* Asset Allocation Donut */}
                  <section className="lg:col-span-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col justify-between">
                    <div>
                      <h2 className="text-sm font-semibold">Cơ cấu danh mục</h2>
                      <p className="text-[11px] text-[var(--text-muted)]">Tỷ trọng định giá theo thị trường thực</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 my-3">
                      <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                        <svg viewBox="0 0 144 144" className="w-32 h-32 -rotate-90" role="img" aria-label="Biểu đồ cơ cấu tài sản quỹ">
                          <circle cx="72" cy="72" r="56" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="18" />
                          {donutSegments.map((seg) => (
                            <circle
                              key={seg.label}
                              cx="72"
                              cy="72"
                              r="56"
                              fill="none"
                              stroke={seg.color}
                              strokeWidth="18"
                              strokeDasharray={seg.dashArray}
                              strokeDashoffset={seg.dashOffset}
                            />
                          ))}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                          <span className="text-xs font-mono font-bold tabular-nums">{formatCompactCR(activeFund.navMinor)}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">NAV</span>
                        </div>
                      </div>
                      <div className="flex-1 w-full space-y-1.5 text-xs">
                        {allocationSlices.map((s) => (
                          <div key={s.label} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                              <span className="truncate font-medium">{s.label}</span>
                            </div>
                            <span className="font-mono tabular-nums text-[var(--text-secondary)]">{s.pct.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)]/60">
                      Cho phép: <span className="font-mono text-[var(--text-secondary)]">{activeFund.allowedAssets.join(', ')}</span>
                    </div>
                  </section>

                  {/* Risk Indicators & Net Flows */}
                  <section className="lg:col-span-3 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col justify-between">
                    <div>
                      <h2 className="text-sm font-semibold">Chỉ số rủi ro</h2>
                      <p className="text-[11px] text-[var(--text-muted)]">Kiểm soát giới hạn trên máy chủ</p>
                    </div>
                    <dl className="divide-y divide-[var(--border-subtle)]/50 text-xs my-2">
                      <div className="py-1.5 flex justify-between">
                        <dt className="text-[var(--text-secondary)]">Biến động năm hóa</dt>
                        <dd className="font-mono font-semibold tabular-nums">{activeFund.annualizedVolatilityPct.toFixed(2)}%</dd>
                      </div>
                      <div className="py-1.5 flex justify-between">
                        <dt className="text-[var(--text-secondary)]">Sụt giảm tối đa</dt>
                        <dd className="font-mono font-semibold tabular-nums text-[var(--negative)]">-{activeFund.maxDrawdownPct.toFixed(2)}%</dd>
                      </div>
                      <div className="py-1.5 flex justify-between">
                        <dt className="text-[var(--text-secondary)]">Sharpe Ratio</dt>
                        <dd className="font-mono font-semibold tabular-nums">{activeFund.sharpeRatio.toFixed(2)}</dd>
                      </div>
                      <div className="py-1.5 flex justify-between">
                        <dt className="text-[var(--text-secondary)]">Giới hạn 1 tài sản</dt>
                        <dd className="font-mono font-semibold tabular-nums">{activeFund.maxSinglePositionPct}%</dd>
                      </div>
                      <div className="py-1.5 flex justify-between">
                        <dt className="text-[var(--text-secondary)]">Dự trữ tiền mặt</dt>
                        <dd className="font-mono font-semibold tabular-nums text-[var(--positive)]">
                          {((activeFund.cashMinor / Math.max(activeFund.totalAssetsMinor, 1)) * 100).toFixed(1)}%
                        </dd>
                      </div>
                    </dl>
                    <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <span>Quản lý quỹ không thể rút tiền quỹ về ví cá nhân.</span>
                    </div>
                  </section>
                </div>

                {/* Governance & Immutable Audit Log */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <Vote className="w-4 h-4 text-[var(--accent)]" />
                  Quản trị Quỹ (Bỏ phiếu theo Chứng chỉ Quỹ)
                </h2>
              </div>

              {myMembership && (
                <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={propType}
                      onChange={(e) => setPropType(e.target.value as typeof propType)}
                      className="px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs"
                    >
                      <option value="CHANGE_STRATEGY">Đổi chiến lược</option>
                      <option value="CHANGE_RISK_LIMIT">Đổi giới hạn rủi ro</option>
                      <option value="ADJUST_FEE">Điều chỉnh phí</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Tiêu đề đề xuất..."
                      value={propTitle}
                      onChange={(e) => setPropTitle(e.target.value)}
                      className="sm:col-span-2 px-2.5 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Mô tả chi tiết nghị quyết..."
                      value={propDesc}
                      onChange={(e) => setPropDesc(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs"
                    />
                    <button
                      type="button"
                      disabled={busy || !propTitle.trim()}
                      onClick={handleCreateProposal}
                      className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] disabled:opacity-40 cursor-pointer"
                    >
                      Gửi đề xuất
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {activeFund.proposals.length === 0 ? (
                  <div className="text-xs text-[var(--text-muted)] py-3">Chưa có đề xuất quản trị nào cho quỹ này.</div>
                ) : (
                  activeFund.proposals.map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{p.title}</span>
                        <span className="font-mono text-[11px] text-[var(--accent)]">{p.status}</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)]">{p.description}</p>
                      <div className="flex items-center justify-between text-[11px] font-mono pt-1">
                        <span>
                          Ủng hộ: {p.votesFor.toFixed(1)} · Phản đối: {p.votesAgainst.toFixed(1)}
                        </span>
                        {p.status === 'OPEN' && myMembership && (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleVote(p.id, 'FOR')}
                              className="px-2 py-0.5 rounded bg-[var(--positive)]/20 text-[var(--positive)] hover:bg-[var(--positive)]/30 cursor-pointer"
                            >
                              Tán thành
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVote(p.id, 'AGAINST')}
                              className="px-2 py-0.5 rounded bg-[var(--negative)]/20 text-[var(--negative)] hover:bg-[var(--negative)]/30 cursor-pointer"
                            >
                              Phản đối
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[var(--positive)]" />
                Nhật ký Kiểm toán Quỹ (Immutable Audit Log)
              </h2>
              <div className="max-h-60 overflow-y-auto divide-y divide-[var(--border-subtle)]/50 text-xs">
                {activeFund.auditLogs.slice(0, 15).map((log) => (
                  <div key={log.id} className="py-2 space-y-0.5">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="font-semibold text-[var(--accent)]">{log.action}</span>
                      <span className="text-[var(--text-muted)]">{log.actorName}</span>
                    </div>
                    <div className="text-[var(--text-secondary)]">{log.detail}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* Create Fund Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Thành lập Quỹ Đầu tư Mới</h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Đóng hộp thoại"
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] text-[var(--text-muted)] mb-1">Tên Quỹ</label>
                <input
                  type="text"
                  placeholder="VD: Quỹ Tăng trưởng Đông Dương"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-muted)] mb-1">Mã Quỹ (3-6 ký tự)</label>
                <input
                  type="text"
                  placeholder="IDGF"
                  maxLength={6}
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-muted)] mb-1">Loại hình Quỹ</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as FundType)}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
                >
                  {FUND_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-muted)] mb-1">Vốn khởi tạo (tối thiểu 25.000 CR)</label>
                <input
                  type="number"
                  min={25000}
                  step={5000}
                  value={newCapitalCR}
                  onChange={(e) => setNewCapitalCR(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-muted)] mb-1">Phí quản lý năm (≤ 3.0%)</label>
                <input
                  type="number"
                  min={0}
                  max={3}
                  step={0.1}
                  value={newMgmtFee}
                  onChange={(e) => setNewMgmtFee(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1">Max 1 mã (%)</label>
                  <input
                    type="number"
                    min={10}
                    max={80}
                    value={newMaxPos}
                    onChange={(e) => setNewMaxPos(e.target.value)}
                    className="w-full px-2.5 py-2 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1">Đệm TM (%)</label>
                  <input
                    type="number"
                    min={5}
                    max={50}
                    value={newMinCash}
                    onChange={(e) => setNewMinCash(e.target.value)}
                    className="w-full px-2.5 py-2 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-[var(--text-muted)] mb-1">Mô tả chiến lược đầu tư</label>
                <input
                  type="text"
                  placeholder="Phân bổ dài hạn cổ phiếu tăng trưởng và dự trữ thanh khoản an toàn..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-3.5 py-2 rounded-md text-xs bg-[var(--bg-surface)] text-[var(--text-secondary)] cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={busy || !newName.trim() || !newCode.trim()}
                onClick={handleCreateFund}
                className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] disabled:opacity-40 cursor-pointer"
              >
                Khởi tạo Quỹ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
