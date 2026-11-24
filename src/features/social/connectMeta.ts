import type {
  ClubHqThemeId,
  ClubRole,
  ClubVisibility,
  CommunityLeaderboardBoard,
  CommunityTopic,
  FeedFilter,
  ModerationReport,
  PresenceStatus,
  SharedAchievementCard,
} from '../../../shared/contracts/connect';

import hqBoardroomImg from '../../assets/images/hq_corporate_boardroom_1795506326470.jpg';
import hqFinancialImg from '../../assets/images/hq_financial_center_1795506327777.jpg';
import hqStartupImg from '../../assets/images/hq_modern_startup_1795506326509.jpg';
import hqSaigonRiverImg from '../../assets/images/hq_saigon_river_office_1795506327006.jpg';
import hqThuThiemImg from '../../assets/images/hq_thuthiem_office_1795506326708.jpg';

export interface ClubHqThemeMeta {
  id: ClubHqThemeId;
  name: string;
  subtitle: string;
  image: string;
}

export const CLUB_HQ_THEMES: Record<ClubHqThemeId, ClubHqThemeMeta> = {
  thuthiem: {
    id: 'thuthiem',
    name: 'Văn phòng Thủ Thiêm',
    subtitle: 'Tòa nhà tài chính ven sông · Khu đô thị mới Thủ Thiêm',
    image: hqThuThiemImg,
  },
  boardroom: {
    id: 'boardroom',
    name: 'Phòng họp tập đoàn',
    subtitle: 'Phòng điều hành chiến lược & nghiên cứu doanh nghiệp',
    image: hqBoardroomImg,
  },
  financial_center: {
    id: 'financial_center',
    name: 'Trung tâm tài chính',
    subtitle: 'Sàn phân tích vĩ mô & quản trị rủi ro đa tài sản',
    image: hqFinancialImg,
  },
  saigon_river: {
    id: 'saigon_river',
    name: 'Văn phòng nhìn ra sông Sài Gòn',
    subtitle: 'Không gian giao lưu đầu tư toàn cảnh bến sông',
    image: hqSaigonRiverImg,
  },
  startup: {
    id: 'startup',
    name: 'Không gian startup hiện đại',
    subtitle: 'Xưởng ý tưởng khởi nghiệp & công nghệ tài chính',
    image: hqStartupImg,
  },
};

export const CLUB_HQ_THEME_LIST: ClubHqThemeMeta[] = [
  CLUB_HQ_THEMES.thuthiem,
  CLUB_HQ_THEMES.boardroom,
  CLUB_HQ_THEMES.financial_center,
  CLUB_HQ_THEMES.saigon_river,
  CLUB_HQ_THEMES.startup,
];

export const COMMUNITY_TOPICS: Array<{ id: CommunityTopic; label: string }> = [
  { id: 'MARKET_ANALYSIS', label: 'Phân tích thị trường' },
  { id: 'BUSINESS_STRATEGY', label: 'Chiến lược kinh doanh' },
  { id: 'REAL_ESTATE', label: 'Bất động sản' },
  { id: 'CAREER_STORIES', label: 'Nhật ký Career' },
  { id: 'CLUB_RECRUITMENT', label: 'Tuyển thành viên CLB' },
  { id: 'ACHIEVEMENT_SHOWCASE', label: 'Khoe thành tựu' },
  { id: 'BEGINNER_GUIDE', label: 'Hướng dẫn người mới' },
  { id: 'MACRO_ECONOMY', label: 'Kinh tế vĩ mô' },
  { id: 'GENERAL', label: 'Thảo luận chung' },
];

export const TOPIC_LABEL_MAP: Record<CommunityTopic, string> = COMMUNITY_TOPICS.reduce(
  (acc, item) => {
    acc[item.id] = item.label;
    return acc;
  },
  {} as Record<CommunityTopic, string>,
);

export const FEED_FILTERS: Array<{ id: FeedFilter; label: string }> = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'FOLLOWING_FRIENDS', label: 'Bạn bè' },
  { id: 'MY_CLUBS', label: 'CLB của tôi' },
  { id: 'TRENDING', label: 'Nổi bật' },
  { id: 'SAVED', label: 'Đã lưu' },
];

export const PRESENCE_META: Record<
  PresenceStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  ONLINE: { label: 'Trực tuyến', dotClass: 'bg-[var(--positive)]', textClass: 'text-[var(--positive)]' },
  IN_ONLINE_WORLD: {
    label: 'Online World',
    dotClass: 'bg-[var(--positive)]',
    textClass: 'text-[var(--positive)]',
  },
  IN_CAREER: { label: 'Career Mode', dotClass: 'bg-[var(--accent)]', textClass: 'text-[var(--accent)]' },
  AWAY: { label: 'Tạm vắng', dotClass: 'bg-[var(--warning)]', textClass: 'text-[var(--warning)]' },
  INVISIBLE: { label: 'Ẩn trạng thái', dotClass: 'bg-[var(--text-muted)]', textClass: 'text-[var(--text-muted)]' },
  OFFLINE: { label: 'Ngoại tuyến', dotClass: 'bg-[var(--text-muted)]/60', textClass: 'text-[var(--text-muted)]' },
};

export const CLUB_ROLE_LABELS: Record<ClubRole, string> = {
  FOUNDER: 'Nhà sáng lập',
  ADMIN: 'Quản trị viên',
  MODERATOR: 'Điều phối viên',
  MEMBER: 'Thành viên',
};

export const CLUB_VISIBILITY_LABELS: Record<ClubVisibility, string> = {
  PUBLIC: 'Công khai',
  PRIVATE: 'Phê duyệt',
  INVITE_ONLY: 'Chỉ qua lời mời',
};

export const LEADERBOARD_BOARDS: Array<{
  id: CommunityLeaderboardBoard;
  label: string;
  description: string;
}> = [
  {
    id: 'COMMUNITY_CONTRIBUTORS',
    label: 'Đóng góp cộng đồng',
    description: 'Xếp hạng theo bài viết hữu ích, lượt yêu thích và chia sẻ kiến thức.',
  },
  {
    id: 'INVESTMENT_CLUBS',
    label: 'Câu lạc bộ đầu tư',
    description: 'Xếp hạng theo cấp độ CLB (1–10), XP hợp tác và quy mô thành viên.',
  },
  {
    id: 'LARGEST_EMPIRE',
    label: 'Đế chế lớn nhất (Online)',
    description: 'Tổng quy mô đế chế Online (chỉ hiển thị người chơi cho phép công khai).',
  },
  {
    id: 'TOP_ENTREPRENEURS',
    label: 'Doanh nhân tiêu biểu',
    description: 'Định giá doanh nghiệp đã thành lập trong WORLD-01.',
  },
  {
    id: 'PROPERTY_INVESTORS',
    label: 'Nhà đầu tư Bất động sản',
    description: 'Quy mô danh mục bất động sản mô phỏng trên máy chủ.',
  },
  {
    id: 'CAREER_ACHIEVEMENTS',
    label: 'Thành tựu Career',
    description: 'Tách biệt hoàn toàn với tài sản Online — xếp hạng theo mốc Career.',
  },
];

export const REPORT_REASONS: Array<{ id: ModerationReport['reason']; label: string }> = [
  { id: 'SPAM', label: 'Spam / Lặp nội dung' },
  { id: 'HARASSMENT', label: 'Quấy rối / Ngôn từ xúc phạm' },
  { id: 'SCAM_PHISHING', label: 'Lừa đảo / Liên kết đáng ngờ' },
  { id: 'RMT_PROMOTION', label: 'Quảng cáo mua bán tiền thật (RMT)' },
  { id: 'IMPERSONATION', label: 'Giả mạo quản trị viên / người chơi khác' },
  { id: 'OTHER', label: 'Lý do khác' },
];

export const QUICK_REACTIONS = ['👍', '💡', '🎯', '👏', '🔥'];

export function formatRelativeTimeVi(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ trước`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} ngày trước`;
  return new Date(ts).toLocaleDateString('vi-VN');
}

/**
 * Generates a crisp PNG image of a server-verified Achievement Share Card
 * using HTML5 Canvas (strictly zero private balances, trade history, or PII).
 */
export function exportAchievementCardPng(card: SharedAchievementCard): void {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Institutional dark backdrop
  ctx.fillStyle = '#0B0F17';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle architectural grid lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 40; x < canvas.width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 40; y < canvas.height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Outer hairline frame
  ctx.strokeStyle = '#253147';
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

  // Accent top bar
  ctx.fillStyle = card.themeColor || '#38BDF8';
  ctx.fillRect(28, 28, canvas.width - 56, 6);

  // Header brand
  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 16px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('TRADING EMPIRE · EMPIRE CONNECT · VERIFIED ACHIEVEMENT', 64, 84);

  // Mode tag
  ctx.fillStyle = card.modeContext === 'CAREER' ? '#F59E0B' : '#22C55E';
  ctx.font = '700 14px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(`CHẾ ĐỘ: ${card.modeContext === 'CAREER' ? 'CAREER MODE' : 'ONLINE WORLD-01'}`, 64, 114);

  // Achievement Title
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 40px system-ui, -apple-system, sans-serif';
  ctx.fillText(card.achievementTitle.slice(0, 44), 64, 200);

  // Achievement Description (wrapped)
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '400 21px system-ui, -apple-system, sans-serif';
  const words = card.achievementDescription.split(/\s+/);
  let line = '';
  let y = 250;
  for (const w of words) {
    const testLine = line ? `${line} ${w}` : w;
    if (ctx.measureText(testLine).width > 820) {
      ctx.fillText(line, 64, y);
      line = w;
      y += 32;
      if (y > 330) break;
    } else {
      line = testLine;
    }
  }
  if (line && y <= 330) ctx.fillText(line, 64, y);

  // Divider
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, 372);
  ctx.lineTo(canvas.width - 64, 372);
  ctx.stroke();

  // Player Identity Footer
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '600 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${card.username}  (${card.publicCode})`, 64, 412);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '400 16px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `${card.activeTitle} · Xác thực máy chủ ngày ${new Date(card.unlockedAt).toLocaleDateString('vi-VN')}`,
    64,
    442,
  );

  ctx.fillStyle = '#64748B';
  ctx.font = '500 13px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('Tài sản mô phỏng CR · Không hiển thị số dư hoặc lịch sử lệnh cá nhân', 64, 466);

  const link = document.createElement('a');
  link.download = `empire-connect-${card.achievementId}-${card.publicCode.toLowerCase()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
