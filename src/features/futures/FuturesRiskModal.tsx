import { useState } from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { FuturesService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

interface FuturesRiskModalProps {
  onAccepted: () => void;
  onClose?: () => void;
}

export function FuturesRiskModal({ onAccepted, onClose }: FuturesRiskModalProps) {
  const { pushToast } = useAppStore();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await FuturesService.acknowledgeRisk();
      pushToast({
        tone: 'info',
        title: 'Đã kích hoạt quyền giao dịch Futures',
        description: 'Đòn bẩy mặc định là 1x với chế độ ký quỹ Isolated Margin.',
      });
      onAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xác nhận cảnh báo rủi ro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="futures-risk-modal-title"
    >
      <div className="w-full max-w-lg rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-[var(--warning)] shrink-0" />
            <div>
              <h2 id="futures-risk-modal-title" className="text-sm font-bold text-[var(--text-primary)]">
                Cảnh báo Rủi ro Giao dịch Phái sinh (Empire Futures)
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Bắt buộc xác nhận trước khi mở vị thế hợp đồng vĩnh cửu đầu tiên
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng hộp thoại cảnh báo"
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4 text-xs text-[var(--text-secondary)] leading-relaxed">
          <div className="p-3 rounded-md bg-[var(--bg-surface)] border border-[var(--warning)]/40 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" />
            <div className="text-[var(--text-primary)]">
              <strong>Tài sản mô phỏng 100% trong game:</strong> Toàn bộ hợp đồng vĩnh cửu, ký quỹ CR và lãi/lỗ chỉ
              tồn tại trong thế giới mô phỏng WORLD-01, không phải giao dịch tiền thật.
            </div>
          </div>

          <ol className="space-y-2.5 list-decimal pl-4">
            <li>
              <strong className="text-[var(--text-primary)]">Rủi ro đòn bẩy (1x – 125x theo tài sản):</strong> Đòn bẩy
              khuếch đại cả lợi nhuận lẫn thua lỗ và được giới hạn theo thanh khoản tài sản, bậc quy mô (Risk Tier) và
              trạng thái thị trường (tối đa 125x cho BTC/ETH, 75x cho SOL, 10x–50x cho Meme, 10x cho Cổ phiếu/FX). Ở
              mức 125x (IM 0.80%, MMR 0.35% + phí thanh lý 0.15%), giá đi ngược ~0.30% đã có thể kích hoạt thanh lý.
              Mức đòn bẩy khởi đầu mặc định là <strong className="font-mono text-[var(--accent)]">1x</strong>.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Cơ chế Thanh lý (Liquidation theo Mark Price):</strong>{' '}
              Khi Tỷ lệ ký quỹ (Margin Ratio) đạt <strong>80%</strong>, hệ thống phát cảnh báo Margin Call. Khi đạt{' '}
              <strong>100%</strong>, vị thế bị buộc đóng trên sổ lệnh thực và chịu phí thanh lý{' '}
              <span className="font-mono">0.15% – 0.50%</span> theo bậc đòn bẩy.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Ký quỹ Độc lập (Isolated Margin):</strong> Mỗi vị thế có
              vốn ký quỹ riêng biệt. Mức lỗ tối đa của vị thế được giới hạn trong phần ký quỹ Isolated của vị thế đó
              (không tự động trừ số dư ví CR khác). Cross Margin hiện bị khóa.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Phí giao dịch & Funding Rate ngang hàng:</strong> Phí{' '}
              Maker <span className="font-mono">0.02%</span> / Taker <span className="font-mono">0.05%</span> (Meme:{' '}
              <span className="font-mono">0.03% / 0.06%</span>). Funding được thanh toán định kỳ giữa bên Long và bên
              Short theo cơ chế tổng bằng 0 (sàn không in thêm CR).
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Hợp đồng không đại diện sở hữu Spot:</strong> Mở vị thế
              Long/Short trên PERP không tạo quyền sở hữu cổ phiếu, crypto hay ngoại tệ trên sàn Spot.
            </li>
          </ol>

          <label className="flex items-start gap-2.5 pt-2 border-t border-[var(--border-subtle)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)] cursor-pointer"
            />
            <span className="text-[var(--text-primary)] font-medium">
              Tôi đã đọc, hiểu rõ cơ chế đòn bẩy, Mark Price, Funding Rate, Isolated Margin và chấp nhận rủi ro thanh lý
              trong mô phỏng WORLD-01.
            </span>
          </label>

          {error && <div className="text-[var(--negative)] font-medium">{error}</div>}
        </div>

        <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 flex items-center justify-end gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Để sau
            </button>
          )}
          <button
            type="button"
            disabled={!checked || submitting}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {submitting ? 'Đang xác nhận...' : 'Xác nhận & Kích hoạt Futures'}
          </button>
        </div>
      </div>
    </div>
  );
}
