import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building, CheckCircle2, FileText, GitMerge, Layers, Rocket, ShieldCheck, Vote } from 'lucide-react';
import { formatCR } from '../../../shared/contracts/money';
import type { BusinessEntity, GovernanceProposalType, HoldingCompany } from '../../../shared/contracts/v4';
import { V4Service } from '../../services/v4Api';
import { useAppStore } from '../../store/useAppStore';

type CorporateTab = 'TREE' | 'PRIVATE_MARKET' | 'MA_ROOM' | 'GOVERNANCE' | 'IPO';

/**
 * Interactive SVG Corporate Ownership Tree & M&A Target Integration Graph
 * inspired by the Peerdom organizational circle reference.
 */
function CorporateOwnershipTreeSvg({
  playerName,
  holdings,
  companies,
  targetCompany,
}: {
  playerName: string;
  holdings: HoldingCompany[];
  companies: BusinessEntity[];
  targetCompany: BusinessEntity | null;
}) {
  const subs = companies.slice(0, 6);
  return (
    <div className="bg-[#090e1a] border border-[var(--border-subtle)] rounded-lg p-3 overflow-hidden">
      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
        <span>Sơ đồ Cây Sở Hữu Tập Đoàn (Ownership Hierarchy & M&A Integration)</span>
        <span className="font-mono">Chống sở hữu chéo vòng tròn · Loại trừ giao dịch nội bộ</span>
      </div>
      <svg viewBox="0 0 760 300" className="w-full h-72" role="img" aria-label="Sơ đồ sở hữu tập đoàn">
        {/* Outer Acquiring Group Ring (Peerdom circle language) */}
        <circle cx="245" cy="150" r="126" fill="none" stroke="#334155" strokeWidth="10" strokeOpacity="0.55" />
        <circle cx="245" cy="150" r="56" fill="#10b981" fillOpacity="0.16" stroke="#10b981" strokeWidth="2" />
        <text x="245" y="144" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="700">
          {holdings[0]?.name.slice(0, 18) || playerName.slice(0, 16)}
        </text>
        <text x="245" y="160" textAnchor="middle" fill="#94a3b8" fontSize="9.5">
          {holdings.length > 0 ? `Holding (${holdings[0].ticker})` : 'Chủ sở hữu trực tiếp'}
        </text>

        {/* Subsidiary nodes positioned radially or empty onboarding slot */}
        {subs.length === 0 ? (
          <g>
            <circle
              cx="245"
              cy="60"
              r="22"
              fill="none"
              stroke="#475569"
              strokeWidth="1.4"
              strokeDasharray="4 3"
            />
            <text x="245" y="58" textAnchor="middle" fill="#64748b" fontSize="8.5">
              0 DN con
            </text>
            <text x="245" y="69" textAnchor="middle" fill="#64748b" fontSize="7.5">
              Khởi nghiệp / M&A
            </text>
          </g>
        ) : (
          subs.map((c, idx) => {
            const angle = (-130 + idx * 52) * (Math.PI / 180);
            const nx = 245 + Math.cos(angle) * 98;
            const ny = 150 + Math.sin(angle) * 94;
            return (
              <g key={c.id}>
                <line x1="245" y1="150" x2={nx} y2={ny} stroke="#38bdf8" strokeOpacity="0.45" strokeWidth="1.5" />
                <circle cx={nx} cy={ny} r="24" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.8" />
                <text x={nx} y={ny - 2} textAnchor="middle" fill="#e2e8f0" fontSize="9.5" fontWeight="700">
                  {c.ticker}
                </text>
                <text x={nx} y={ny + 10} textAnchor="middle" fill="#94a3b8" fontSize="8">
                  Lv.{c.level} · {c.branches.length}CN
                </text>
              </g>
            );
          })
        )}

        {/* M&A Target Company Hexagon / Circle Bridge */}
        {targetCompany && (
          <g>
            <path
              d="M368 150 C435 120, 480 120, 545 148"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
            <polygon
              points="595,104 638,129 638,179 595,204 552,179 552,129"
              fill="#0ea5e9"
              fillOpacity="0.16"
              stroke="#38bdf8"
              strokeWidth="2"
            />
            <text x="595" y="146" textAnchor="middle" fill="#f8fafc" fontSize="10.5" fontWeight="700">
              {targetCompany.ticker}
            </text>
            <text x="595" y="160" textAnchor="middle" fill="#7dd3fc" fontSize="8.5">
              Mục tiêu M&A
            </text>
            <text x="595" y="174" textAnchor="middle" fill="#94a3b8" fontSize="8">
              {formatCR(targetCompany.valuationMinor)} CR
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function CorporateEmpirePage() {
  const { player, setPlayer, v4SyncSeq, pushToast } = useAppStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState<CorporateTab>('TREE');

  // Holding creation state
  const [holdingName, setHoldingName] = useState('');
  const [holdingTicker, setHoldingTicker] = useState('');
  const [holdingCash, setHoldingCash] = useState(0);

  // Private listing form
  const [listCompanyId, setListCompanyId] = useState('');
  const [listType, setListType] = useState<'PRIMARY' | 'SECONDARY'>('PRIMARY');
  const [listShares, setListShares] = useState(10_000);
  const [listPrice, setListPrice] = useState(1.5);

  // M&A offer form
  const [maTargetId, setMaTargetId] = useState('');
  const [maPct, setMaPct] = useState<10 | 25 | 51 | 75 | 100>(25);
  const [maPrice, setMaPrice] = useState(1.2);

  // Governance proposal form
  const [govCompanyId, setGovCompanyId] = useState('');
  const [govType, setGovType] = useState<GovernanceProposalType>('PAY_DIVIDEND');
  const [govTitle, setGovTitle] = useState('');
  const [govDesc, setGovDesc] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['v4-corporate', v4SyncSeq],
    queryFn: V4Service.getCorporateOverview,
    refetchInterval: 15_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['v4-corporate'] });
    qc.invalidateQueries({ queryKey: ['v4-businesses'] });
    qc.invalidateQueries({ queryKey: ['v4-empire-overview'] });
  };

  const createHoldingMut = useMutation({
    mutationFn: () => V4Service.createHolding(holdingName, holdingTicker, holdingCash),
    onSuccess: (res) => {
      setPlayer(res.profile);
      setHoldingName('');
      setHoldingTicker('');
      refresh();
      pushToast({ tone: 'success', title: `Đã thành lập Holding ${res.holding.name}` });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Tạo Holding thất bại', description: err.message }),
  });

  const attachSubMut = useMutation({
    mutationFn: (p: { holdingId: string; businessId: string }) => V4Service.attachSubsidiary(p.holdingId, p.businessId),
    onSuccess: () => {
      refresh();
      pushToast({ tone: 'success', title: 'Đã gắn công ty con vào Holding' });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Không thể gắn công ty con', description: err.message }),
  });

  const createListingMut = useMutation({
    mutationFn: () =>
      V4Service.createPrivateListing({
        companyId: listCompanyId,
        offeringType: listType,
        shares: listShares,
        pricePerShareCR: listPrice,
      }),
    onSuccess: () => {
      refresh();
      pushToast({ tone: 'success', title: 'Đã niêm yết chào bán cổ phần tư nhân' });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Chào bán thất bại', description: err.message }),
  });

  const buyListingMut = useMutation({
    mutationFn: (listingId: string) => V4Service.buyPrivateListing(listingId),
    onSuccess: (res) => {
      setPlayer(res.profile);
      refresh();
      pushToast({
        tone: 'success',
        title: `Đã mua cổ phần ${res.company.businessName}`,
        description: `Hình thức: ${res.listing.offeringType === 'PRIMARY' ? 'Phát hành mới (vào quỹ công ty)' : 'Chuyển nhượng thứ cấp'}.`,
      });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Mua cổ phần thất bại', description: err.message }),
  });

  const submitMaMut = useMutation({
    mutationFn: () =>
      V4Service.submitMaOffer({
        targetCompanyId: maTargetId,
        targetPct: maPct,
        offerPricePerShareCR: maPrice,
      }),
    onSuccess: (res) => {
      setPlayer(res.profile);
      refresh();
      pushToast({
        tone: 'success',
        title: res.offer.status === 'SETTLED' ? 'Thương vụ M&A đã tất toán thành công!' : 'Đã gửi đề nghị M&A & khóa ký quỹ Escrow',
        description: `${res.offer.targetPct}% ${res.offer.targetCompanyName} trị giá ${formatCR(res.offer.totalOfferMinor)} CR.`,
      });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Gửi đề nghị M&A thất bại', description: err.message }),
  });

  const respondMaMut = useMutation({
    mutationFn: (p: { offerId: string; decision: 'ACCEPT' | 'REJECT' | 'CANCEL' }) =>
      V4Service.respondMaOffer(p.offerId, p.decision),
    onSuccess: (res) => {
      setPlayer(res.profile);
      refresh();
      pushToast({ tone: 'success', title: `Đã xử lý đề nghị M&A (${res.offer.status})` });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Xử lý M&A thất bại', description: err.message }),
  });

  const createPropMut = useMutation({
    mutationFn: () =>
      V4Service.createGovernanceProposal(govCompanyId, {
        type: govType,
        title: govTitle,
        description: govDesc,
      }),
    onSuccess: () => {
      setGovTitle('');
      setGovDesc('');
      refresh();
      pushToast({ tone: 'success', title: 'Đã tạo nghị quyết cổ đông' });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Tạo đề xuất thất bại', description: err.message }),
  });

  const votePropMut = useMutation({
    mutationFn: (p: { companyId: string; proposalId: string; vote: 'FOR' | 'AGAINST' }) =>
      V4Service.voteGovernanceProposal(p.companyId, p.proposalId, p.vote),
    onSuccess: () => {
      refresh();
      pushToast({ tone: 'success', title: 'Đã ghi nhận phiếu biểu quyết' });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Biểu quyết thất bại', description: err.message }),
  });

  const ipoMut = useMutation({
    mutationFn: (companyId: string) => V4Service.launchIpo(companyId),
    onSuccess: (res) => {
      setPlayer(res.profile);
      refresh();
      pushToast({
        tone: 'success',
        title: `IPO thành công: ${res.company.ipoSymbol}`,
        description: 'Cổ phiếu đã niêm yết trên sàn chứng khoán ESE và sẵn sàng giao dịch trên Matching Engine.',
      });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Chưa đủ tiêu chuẩn IPO', description: err.message }),
  });

  if (isLoading || !data) {
    return <div className="p-8 text-center text-xs text-[var(--text-secondary)]">Đang tải Hệ thống Tập đoàn & M&A...</div>;
  }

  const myHoldings = player ? data.holdings.filter((h) => h.founderId === player.id) : [];
  const myCompanies = player ? data.companies.filter((c) => c.ownerId === player.id || c.shareholders.some((s) => s.playerId === player.id)) : [];
  const otherCompanies = player ? data.companies.filter((c) => c.ownerId !== player.id) : data.companies;
  const previewTarget = data.companies.find((c) => c.id === maTargetId) ?? otherCompanies[0] ?? null;

  return (
    <div className="space-y-5 max-w-[1440px] mx-auto">
      <div className="border-b border-[var(--border-subtle)] pb-4 space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Tập Đoàn, Cổ Phần Tư Nhân, M&A & IPO
        </h1>
        <p className="text-xs text-[var(--text-secondary)]">
          Sơ đồ sở hữu Holding Company · Gọi vốn & Pha loãng · Phòng thương vụ M&A có ký quỹ Escrow · Biểu quyết quản trị · Niêm yết ESE.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['TREE', 'Sơ đồ Tập đoàn & Holding', Layers],
            ['PRIVATE_MARKET', `Cổ phần Tư nhân (${data.privateListings.length})`, Building],
            ['MA_ROOM', `Phòng Thương vụ M&A (${data.maOffers.length})`, GitMerge],
            ['GOVERNANCE', 'Quản trị & Biểu quyết', Vote],
            ['IPO', 'Niêm yết IPO (ESE)', Rocket],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border cursor-pointer transition-colors ${
              tab === id
                ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: HOLDING & OWNERSHIP TREE */}
      {tab === 'TREE' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 space-y-4">
            <CorporateOwnershipTreeSvg
              playerName={player?.username ?? 'Guest'}
              holdings={myHoldings}
              companies={myCompanies}
              targetCompany={previewTarget}
            />

            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Báo cáo Hợp nhất Tập đoàn (Holding Companies)
              </h2>
              {data.holdings.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Chưa có Holding Company nào. Thành lập Holding với phí đăng ký 150,000 CR để hợp nhất các công ty con.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.holdings.map((h) => (
                    <div key={h.id} className="p-3 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-[var(--text-primary)]">
                          {h.name} <span className="font-mono text-[var(--accent)]">({h.ticker})</span>
                        </div>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          Chủ tịch: {h.founderName} · {h.subsidiaryIds.length} công ty con
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                        <div>DT Hợp nhất: {formatCR(h.consolidatedRevenueMinor)} CR</div>
                        <div>LN Hợp nhất: {formatCR(h.consolidatedProfitMinor)} CR</div>
                        <div>Vốn chủ: {formatCR(h.consolidatedEquityMinor)} CR</div>
                      </div>
                      {player?.id === h.founderId && myCompanies.some((c) => !c.holdingCompanyId) && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {myCompanies
                            .filter((c) => !c.holdingCompanyId && c.ownerId === player.id)
                            .map((sub) => (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => attachSubMut.mutate({ holdingId: h.id, businessId: sub.id })}
                                className="px-2 py-1 rounded text-[11px] bg-[var(--accent)]/15 text-[var(--accent)] cursor-pointer"
                              >
                                + Gắn {sub.ticker} làm công ty con
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3 h-fit">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Thành lập Tập đoàn Mẹ (Holding)</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Phí đăng ký: <strong className="font-mono">150,000 CR</strong>. Hợp nhất báo cáo tài chính công ty con và ngăn chặn sở hữu vòng tròn.
            </p>
            <form
              className="space-y-3 text-xs"
              onSubmit={(e) => {
                e.preventDefault();
                createHoldingMut.mutate();
              }}
            >
              <div className="space-y-1">
                <label htmlFor="hold-name" className="text-[var(--text-secondary)]">Tên Tập đoàn</label>
                <input
                  id="hold-name"
                  required
                  minLength={3}
                  placeholder="VD: Đại Việt Holdings"
                  value={holdingName}
                  onChange={(e) => setHoldingName(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="hold-ticker" className="text-[var(--text-secondary)]">Mã Tập đoàn</label>
                <input
                  id="hold-ticker"
                  required
                  minLength={2}
                  maxLength={8}
                  placeholder="DVH"
                  value={holdingTicker}
                  onChange={(e) => setHoldingTicker(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="hold-cash" className="text-[var(--text-secondary)]">Vốn dự phòng Holding bổ sung (CR)</label>
                <input
                  id="hold-cash"
                  type="number"
                  min={0}
                  step={5000}
                  value={holdingCash}
                  onChange={(e) => setHoldingCash(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                />
              </div>
              <button
                type="submit"
                disabled={createHoldingMut.isPending}
                className="w-full py-2 rounded font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer disabled:opacity-50"
              >
                Đăng ký Holding (150,000 CR)
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: PRIVATE SHARE MARKET */}
      {tab === 'PRIVATE_MARKET' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Sàn Cổ Phần Tư Nhân — Phân tách Primary (vào công ty) & Secondary (về người bán)
            </h2>
            {data.privateListings.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-6 text-center">Hiện chưa có lệnh chào bán cổ phần tư nhân nào.</p>
            ) : (
              <div className="space-y-2.5">
                {data.privateListings.map((l) => {
                  const totalCost = l.sharesAvailable * l.pricePerShareMinor;
                  const isMine = player?.id === l.sellerId;
                  return (
                    <div
                      key={l.id}
                      className="p-3.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {l.companyName} <span className="font-mono text-[var(--accent)]">({l.ticker})</span> ·{' '}
                          <span className={l.offeringType === 'PRIMARY' ? 'text-[var(--positive)]' : 'text-[var(--warning)]'}>
                            {l.offeringType === 'PRIMARY' ? 'Phát hành mới (Primary)' : 'Chuyển nhượng (Secondary)'}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-mono">
                          {l.sharesAvailable.toLocaleString('en-US')} CP × {formatCR(l.pricePerShareMinor)} CR · Tổng{' '}
                          {formatCR(totalCost)} CR · Pha loãng {l.dilutionPct.toFixed(1)}%
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Bên chào bán: {l.sellerName} · Post-Money: {formatCR(l.postMoneyValuationMinor)} CR
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isMine || buyListingMut.isPending}
                        onClick={() => buyListingMut.mutate(l.id)}
                        className="px-3.5 py-2 rounded font-semibold bg-[var(--positive)] text-[#06130e] cursor-pointer disabled:opacity-40 shrink-0"
                      >
                        {isMine ? 'Lệnh của bạn' : 'Mua toàn bộ lô'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3 h-fit">
            <h2 className="text-sm font-bold">Chào bán Cổ phần / Gọi vốn</h2>
            <form
              className="space-y-3 text-xs"
              onSubmit={(e) => {
                e.preventDefault();
                if (listCompanyId) createListingMut.mutate();
              }}
            >
              <div className="space-y-1">
                <label htmlFor="priv-comp" className="text-[var(--text-secondary)]">Doanh nghiệp</label>
                <select
                  id="priv-comp"
                  required
                  value={listCompanyId}
                  onChange={(e) => setListCompanyId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                >
                  <option value="">Chọn doanh nghiệp của bạn...</option>
                  {myCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.businessName} ({c.ticker})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="priv-type" className="text-[var(--text-secondary)]">Loại chào bán</label>
                <select
                  id="priv-type"
                  value={listType}
                  onChange={(e) => setListType(e.target.value as 'PRIMARY' | 'SECONDARY')}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                >
                  <option value="PRIMARY">Primary — Phát hành mới (Tiền vào Công ty)</option>
                  <option value="SECONDARY">Secondary — Bán cổ phần cá nhân</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="priv-shares" className="text-[var(--text-secondary)]">Số cổ phần</label>
                  <input
                    id="priv-shares"
                    type="number"
                    min={100}
                    step={500}
                    value={listShares}
                    onChange={(e) => setListShares(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="priv-price" className="text-[var(--text-secondary)]">Giá / CP (CR)</label>
                  <input
                    id="priv-price"
                    type="number"
                    min={0.1}
                    step={0.05}
                    value={listPrice}
                    onChange={(e) => setListPrice(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={!listCompanyId || createListingMut.isPending}
                className="w-full py-2 rounded font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer disabled:opacity-40"
              >
                Đăng chào bán cổ phần
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: M&A DEAL ROOM */}
      {tab === 'MA_ROOM' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Danh sách Thương vụ M&A (Khóa ký quỹ Escrow an toàn)
            </h2>
            {data.maOffers.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-6 text-center">
                Chưa có thương vụ M&A nào. Gửi đề nghị mua 10% – 100% cổ phần của doanh nghiệp khác.
              </p>
            ) : (
              <div className="space-y-2.5">
                {data.maOffers.map((o) => {
                  const isSeller = player?.id === o.sellerId;
                  const isBuyer = player?.id === o.buyerId;
                  return (
                    <div key={o.id} className="p-3.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {o.buyerName} đề nghị mua {o.targetPct}% {o.targetCompanyName} ({o.targetTicker})
                        </span>
                        <span className="font-mono font-semibold text-[var(--accent)]">{o.status}</span>
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                        {o.sharesRequested.toLocaleString('en-US')} CP × {formatCR(o.offerPricePerShareMinor)} CR · Tổng giá trị:{' '}
                        {formatCR(o.totalOfferMinor)} CR · Escrow: {formatCR(o.escrowLockedMinor)} CR
                      </div>
                      {o.status === 'PENDING' && (
                        <div className="flex gap-2 pt-1">
                          {isSeller && (
                            <>
                              <button
                                type="button"
                                onClick={() => respondMaMut.mutate({ offerId: o.id, decision: 'ACCEPT' })}
                                className="px-3 py-1 rounded font-semibold bg-[var(--positive)] text-[#06130e] cursor-pointer"
                              >
                                Chấp thuận & Chuyển nhượng
                              </button>
                              <button
                                type="button"
                                onClick={() => respondMaMut.mutate({ offerId: o.id, decision: 'REJECT' })}
                                className="px-3 py-1 rounded font-semibold bg-[var(--negative)]/20 text-[var(--negative)] cursor-pointer"
                              >
                                Từ chối
                              </button>
                            </>
                          )}
                          {isBuyer && (
                            <button
                              type="button"
                              onClick={() => respondMaMut.mutate({ offerId: o.id, decision: 'CANCEL' })}
                              className="px-3 py-1 rounded font-medium border border-[var(--border-subtle)] cursor-pointer"
                            >
                              Hủy & Hoàn Escrow
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3 h-fit">
            <h2 className="text-sm font-bold">Gửi Đề Nghị Mua Lại / Sáp Nhập (M&A)</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Tiền mua + 1% phí M&A được khóa vào tài khoản Escrow đến khi bên bán chấp thuận. Doanh nghiệp NPC sẽ tự động chấp thuận nếu giá đề nghị ≥ 105% định giá.
            </p>
            <form
              className="space-y-3 text-xs"
              onSubmit={(e) => {
                e.preventDefault();
                if (maTargetId) submitMaMut.mutate();
              }}
            >
              <div className="space-y-1">
                <label htmlFor="ma-target" className="text-[var(--text-secondary)]">Công ty mục tiêu</label>
                <select
                  id="ma-target"
                  required
                  value={maTargetId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setMaTargetId(id);
                    const comp = data.companies.find((c) => c.id === id);
                    if (comp && comp.totalIssuedShares > 0) {
                      setMaPrice(Number(((comp.valuationMinor / comp.totalIssuedShares / 100) * 1.08).toFixed(2)));
                    }
                  }}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                >
                  <option value="">Chọn doanh nghiệp mục tiêu...</option>
                  {otherCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.businessName} ({c.ticker}) — Định giá {formatCR(c.valuationMinor)} CR
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="ma-pct" className="text-[var(--text-secondary)]">Tỷ lệ đề nghị mua</label>
                  <select
                    id="ma-pct"
                    value={maPct}
                    onChange={(e) => setMaPct(Number(e.target.value) as 10 | 25 | 51 | 75 | 100)}
                    className="w-full px-3 py-2 rounded font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                  >
                    <option value={10}>10% (Đầu tư thiểu số)</option>
                    <option value={25}>25% (Cổ đông chiến lược)</option>
                    <option value={51}>51% (Quyền kiểm soát)</option>
                    <option value={75}>75% (Chi phối tuyệt đối)</option>
                    <option value={100}>100% (Thâu tóm toàn bộ)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="ma-price" className="text-[var(--text-secondary)]">Giá đề nghị / CP (CR)</label>
                  <input
                    id="ma-price"
                    type="number"
                    min={0.1}
                    step={0.05}
                    value={maPrice}
                    onChange={(e) => setMaPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={!maTargetId || submitMaMut.isPending}
                className="w-full py-2 rounded font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer disabled:opacity-40"
              >
                Gửi Đề Nghị & Khóa Escrow
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: CORPORATE GOVERNANCE & AUDIT LOG */}
      {tab === 'GOVERNANCE' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-3">
            {myCompanies.length === 0 ? (
              <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-6 text-center text-xs text-[var(--text-muted)]">
                Hãy thành lập doanh nghiệp hoặc mua cổ phần tư nhân để tham gia biểu quyết quản trị cổ đông.
              </div>
            ) : (
              myCompanies.map((c) => (
                <div key={c.id} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold">{c.businessName} ({c.ticker})</div>
                    <span className="text-xs text-[var(--text-muted)]">{c.proposals.length} nghị quyết · {c.auditLogs.length} nhật ký</span>
                  </div>
                  {c.proposals.length === 0 ? (
                    <div className="text-xs text-[var(--text-muted)]">Chưa có đề xuất biểu quyết nào.</div>
                  ) : (
                    <div className="space-y-2">
                      {c.proposals.map((p) => (
                        <div key={p.id} className="p-3 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs space-y-1.5">
                          <div className="flex justify-between">
                            <span className="font-semibold">{p.title}</span>
                            <span className="font-mono text-[var(--accent)]">{p.status}</span>
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)]">{p.description}</div>
                          <div className="flex items-center justify-between pt-1">
                            <span className="font-mono text-[11px] text-[var(--text-muted)]">
                              Ủng hộ: {p.votesFor.toLocaleString('en-US')} · Phản đối: {p.votesAgainst.toLocaleString('en-US')}
                            </span>
                            {p.status === 'OPEN' && (
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => votePropMut.mutate({ companyId: c.id, proposalId: p.id, vote: 'FOR' })}
                                  className="px-2.5 py-1 rounded bg-[var(--positive)]/20 text-[var(--positive)] font-semibold cursor-pointer"
                                >
                                  Ủng hộ
                                </button>
                                <button
                                  type="button"
                                  onClick={() => votePropMut.mutate({ companyId: c.id, proposalId: p.id, vote: 'AGAINST' })}
                                  className="px-2.5 py-1 rounded bg-[var(--negative)]/20 text-[var(--negative)] font-semibold cursor-pointer"
                                >
                                  Phản đối
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {c.auditLogs.length > 0 && (
                    <div className="pt-2 border-t border-[var(--border-subtle)]/70 space-y-1">
                      <div className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Nhật ký Kiểm toán gần nhất
                      </div>
                      {c.auditLogs.slice(0, 3).map((log) => (
                        <div key={log.id} className="text-[11px] text-[var(--text-secondary)]">
                          <span className="font-mono text-[var(--text-muted)]">[{log.action}]</span> {log.detail}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="lg:col-span-5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3 h-fit">
            <h2 className="text-sm font-bold">Tạo Đề Xuất Quản Trị Cổ Đông</h2>
            <form
              className="space-y-3 text-xs"
              onSubmit={(e) => {
                e.preventDefault();
                if (govCompanyId) createPropMut.mutate();
              }}
            >
              <select
                required
                aria-label="Chọn công ty tạo đề xuất"
                value={govCompanyId}
                onChange={(e) => setGovCompanyId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
              >
                <option value="">Chọn doanh nghiệp...</option>
                {myCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.businessName} ({c.ticker})</option>
                ))}
              </select>
              <select
                aria-label="Loại nghị quyết"
                value={govType}
                onChange={(e) => setGovType(e.target.value as GovernanceProposalType)}
                className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
              >
                <option value="PAY_DIVIDEND">Chi trả cổ tức</option>
                <option value="ISSUE_SHARES">Phát hành tăng vốn</option>
                <option value="APPOINT_CEO">Bổ nhiệm CEO</option>
                <option value="MERGER">Sáp nhập doanh nghiệp</option>
                <option value="ACQUISITION">Thương vụ M&A</option>
              </select>
              <input
                required
                minLength={3}
                placeholder="Tiêu đề nghị quyết..."
                value={govTitle}
                onChange={(e) => setGovTitle(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
              />
              <textarea
                required
                minLength={3}
                rows={3}
                placeholder="Nội dung chi tiết gửi cổ đông biểu quyết..."
                value={govDesc}
                onChange={(e) => setGovDesc(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
              />
              <button
                type="submit"
                disabled={!govCompanyId || createPropMut.isPending}
                className="w-full py-2 rounded font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer disabled:opacity-40"
              >
                Gửi Nghị quyết Biểu quyết
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 5: IPO LAUNCHPAD */}
      {tab === 'IPO' && (
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Sàn Niêm Yết IPO — Chuyển Đổi Thành Cổ Phiếu Đại Chúng Trên Sàn ESE
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Tiêu chuẩn niêm yết thực tế: Level ≥ 4 · Lịch sử hoạt động ≥ 3 chu kỳ · Vốn chủ sở hữu ≥ 150,000 CR · Trạng thái ACTIVE.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myCompanies.map((c) => {
              const meetsLevel = c.level >= 4;
              const meetsHistory = c.financialHistory.length >= 3;
              const meetsEquity = c.equityMinor >= 150_000_00;
              const qualified = meetsLevel && meetsHistory && meetsEquity && !c.isPublicIpo && c.status === 'ACTIVE';
              return (
                <div key={c.id} className="p-4 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--text-primary)]">{c.businessName} ({c.ticker})</span>
                    {c.isPublicIpo ? (
                      <span className="inline-flex items-center gap-1 text-[var(--positive)] font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã niêm yết ESE ({c.ipoSymbol})
                      </span>
                    ) : (
                      <span className="font-mono text-[var(--text-muted)]">Private</span>
                    )}
                  </div>
                  <div className="space-y-1 text-[11px] font-mono">
                    <div className={meetsLevel ? 'text-[var(--positive)]' : 'text-[var(--text-muted)]'}>
                      {meetsLevel ? '✓' : '○'} Cấp độ: Level {c.level}/4
                    </div>
                    <div className={meetsHistory ? 'text-[var(--positive)]' : 'text-[var(--text-muted)]'}>
                      {meetsHistory ? '✓' : '○'} Báo cáo tài chính: {c.financialHistory.length}/3 chu kỳ
                    </div>
                    <div className={meetsEquity ? 'text-[var(--positive)]' : 'text-[var(--text-muted)]'}>
                      {meetsEquity ? '✓' : '○'} Vốn chủ sở hữu: {formatCR(c.equityMinor)} / 150,000.00 CR
                    </div>
                  </div>
                  {!c.isPublicIpo && (
                    <button
                      type="button"
                      disabled={!qualified || ipoMut.isPending}
                      onClick={() => ipoMut.mutate(c.id)}
                      className="w-full py-2 rounded font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer disabled:opacity-35"
                    >
                      {qualified ? 'Thực hiện Niêm yết IPO lên ESE' : 'Chưa đủ điều kiện niêm yết'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
