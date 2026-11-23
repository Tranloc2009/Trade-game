import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Moon, Play, RefreshCw, RotateCcw, Sun } from 'lucide-react';
import { formatTimeShort } from '../../lib/indicators';
import { ApiClientError, WorldService } from '../../services/api';
import { realtimeClient } from '../../services/realtime';
import { useAppStore } from '../../store/useAppStore';

interface SettingsPageProps {
  onWorldReset: () => void;
}

export function SettingsPage({ onWorldReset }: SettingsPageProps) {
  const { theme, toggleTheme, connectionState, lastSequenceNumber, player, pushToast } = useAppStore();
  const [busy, setBusy] = useState(false);

  const { data: diag, refetch } = useQuery({
    queryKey: ['diagnostics'],
    queryFn: WorldService.getDiagnostics,
    refetchInterval: 5_000,
  });

  const handleBotTick = async () => {
    setBusy(true);
    try {
      const res = await WorldService.devSimulateBotTick();
      await refetch();
      pushToast({
        tone: 'info',
        title: 'Đã chạy 1 chu kỳ QA Bot Tick',
        description: `Khớp ${res.tradesExecuted} giao dịch thật qua Matching Engine.`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Lỗi chạy QA Bot Tick',
        description: err instanceof ApiClientError ? err.message : 'Lỗi máy chủ.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleResetWorld = async () => {
    setBusy(true);
    try {
      await WorldService.devResetWorld();
      pushToast({
        tone: 'warning',
        title: 'Đã khởi tạo lại WORLD-01 (Development Mode)',
        description: 'Toàn bộ trạng thái in-memory đã trở về trạng thái ban đầu.',
      });
      onWorldReset();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể reset thế giới',
        description: err instanceof ApiClientError ? err.message : 'Lỗi.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Cài đặt & Chẩn đoán hệ thống (Dev Diagnostics)</h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          Quản lý giao diện, đồng bộ snapshot kết nối lại và giám sát động cơ khớp lệnh thời gian thực
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Appearance & Session */}
        <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-5 space-y-4 text-xs">
          <h2 className="text-sm font-semibold">Giao diện & Đồng bộ phiên</h2>

          <div className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]">
            <div>
              <div className="font-medium">Chế độ màu (Dark / Light Mode)</div>
              <div className="text-[var(--text-muted)]">Lưu cài đặt UI không nhạy cảm trong trình duyệt</div>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="px-3 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] inline-flex items-center gap-1.5 cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {theme === 'dark' ? 'Chuyển Light Mode' : 'Chuyển Dark Mode'}
            </button>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]">
            <div>
              <div className="font-medium">Kết nối lại & Đồng bộ Snapshot</div>
              <div className="text-[var(--text-muted)] font-mono">
                Trạng thái: {connectionState} · Sequence #{lastSequenceNumber}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                realtimeClient.forceReconnect();
                realtimeClient.requestSnapshot();
                pushToast({ tone: 'info', title: 'Đã gửi yêu cầu đồng bộ snapshot mới nhất' });
              }}
              className="px-3 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Đồng bộ lại
            </button>
          </div>

          {player && (
            <div className="space-y-1.5 text-[11px] font-mono text-[var(--text-secondary)]">
              <div>Player ID: {player.id}</div>
              <div>Username: {player.username}</div>
              <div>Thành tựu đã mở: {player.achievements.length}</div>
              {player.achievements.length > 0 && (
                <div className="pt-1 space-y-1 font-sans">
                  {player.achievements.map((a) => (
                    <div key={a.id} className="text-[var(--positive)]">
                      • {a.title} — {a.description}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Server Diagnostics */}
        <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-sm font-semibold">Developer Diagnostics (WORLD-01)</h2>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-[var(--accent)] hover:underline cursor-pointer"
            >
              Làm mới
            </button>
          </div>

          {diag && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono text-[11px]">
                <div>
                  <div className="text-[var(--text-muted)]">Server Status</div>
                  <div className="text-[var(--positive)] font-bold">{diag.serverStatus}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Matching Engine</div>
                  <div className="text-[var(--positive)] font-bold">{diag.matchingEngineHealth}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Active Sockets</div>
                  <div className="font-bold">{diag.activeConnections} ({diag.onlineHumanPlayers} players)</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Event Sequence</div>
                  <div className="font-bold">#{diag.eventSequence}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Total / Open Orders</div>
                  <div className="font-bold">{diag.totalOrders} / {diag.openOrdersCount}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Trades / Ledger</div>
                  <div className="font-bold">{diag.totalTrades} / {diag.totalLedgerEntries}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">State Version</div>
                  <div className="font-bold">v{diag.stateVersion}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Economy Cycle</div>
                  <div className="font-bold text-[var(--accent)]">{diag.economyPhase}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Uptime</div>
                  <div className="font-bold">{diag.uptimeSeconds}s</div>
                </div>
              </div>

              {diag.devToolsEnabled && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleBotTick}
                    className="px-3 py-1.5 rounded text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 text-[var(--accent)]" />
                    QA: Chạy 1 Bot Trade Tick
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleResetWorld}
                    className="px-3 py-1.5 rounded text-xs font-medium bg-[var(--negative-soft)] text-[var(--negative)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Dev Only: Reset Demo World
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Audit Log */}
      {diag && diag.recentAuditLogs.length > 0 && (
        <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
            <h2 className="text-sm font-semibold">Nhật ký bảo mật & chống gian lận (Anti-Cheat Audit Log)</h2>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]/50 text-xs font-mono max-h-60 overflow-y-auto">
            {diag.recentAuditLogs.map((log) => (
              <div key={log.id} className="px-4 py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[var(--text-muted)]">{formatTimeShort(log.timestamp)}</span>
                <span className="font-semibold text-[var(--warning)]">{log.action}</span>
                <span className="font-sans text-[var(--text-secondary)] flex-1">{log.detail}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
