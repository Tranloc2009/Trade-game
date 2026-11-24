import { useMemo, useState } from 'react';
import {
  Award,
  Bookmark,
  Download,
  Edit3,
  Flag,
  Heart,
  Image as ImageIcon,
  MessageSquare,
  Send,
  Share2,
  Trash2,
} from 'lucide-react';
import type {
  Club,
  CommunityPost,
  CommunityTopic,
  FeedFilter,
  GameModeContext,
  PlayerSocialProfile,
} from '../../../shared/contracts/connect';
import { ApiClientError, ConnectService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import {
  COMMUNITY_TOPICS,
  exportAchievementCardPng,
  FEED_FILTERS,
  formatRelativeTimeVi,
  TOPIC_LABEL_MAP,
} from './connectMeta';

interface ConnectFeedPanelProps {
  profile: PlayerSocialProfile;
  myClubs: Club[];
  posts: CommunityPost[];
  filter: FeedFilter;
  topic: CommunityTopic | 'ALL';
  onFilterChange: (filter: FeedFilter) => void;
  onTopicChange: (topic: CommunityTopic | 'ALL') => void;
  onRefresh: () => void;
  onOpenProfile: (playerId: string) => void;
  onReportTarget: (targetType: 'POST' | 'COMMENT', targetId: string) => void;
  fixedClubId?: string | null;
}

export function ConnectFeedPanel({
  profile,
  myClubs,
  posts,
  filter,
  topic,
  onFilterChange,
  onTopicChange,
  onRefresh,
  onOpenProfile,
  onReportTarget,
  fixedClubId = null,
}: ConnectFeedPanelProps) {
  const pushToast = useAppStore((s) => s.pushToast);

  // Post composer state
  const [composerOpen, setComposerOpen] = useState(Boolean(fixedClubId));
  const [postTopic, setPostTopic] = useState<CommunityTopic>(
    fixedClubId ? 'BUSINESS_STRATEGY' : 'MARKET_ANALYSIS',
  );
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postImageUrl, setPostImageUrl] = useState('');
  const [postClubId, setPostClubId] = useState<string>(fixedClubId ?? '');
  const [postAchievementId, setPostAchievementId] = useState<string>('');
  const [postMode, setPostMode] = useState<GameModeContext>(profile.modeContext);
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  // Comment draft state keyed by postId
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const availableAchievements = useMemo(() => profile.achievements ?? [], [profile.achievements]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTitle.trim() || !postContent.trim()) {
      pushToast({ tone: 'warning', title: 'Thiếu nội dung', description: 'Vui lòng nhập tiêu đề và nội dung bài viết.' });
      return;
    }
    setSubmitting(true);
    try {
      await ConnectService.createPost({
        topic: postTopic,
        title: postTitle.trim(),
        content: postContent.trim(),
        imageUrl: postImageUrl.trim() ? postImageUrl.trim() : null,
        clubId: fixedClubId ?? (postClubId || null),
        achievementId: postAchievementId || null,
        modeContext: postMode,
      });
      setPostTitle('');
      setPostContent('');
      setPostImageUrl('');
      setPostAchievementId('');
      if (!fixedClubId) setComposerOpen(false);
      pushToast({ tone: 'success', title: 'Đã đăng bài viết mới' });
      onRefresh();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể đăng bài',
        description: err instanceof ApiClientError ? err.message : 'Vui lòng kiểm tra nội dung hợp lệ.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (post: CommunityPost) => {
    setEditingPostId(post.id);
    setEditTitle(post.title);
    setEditContent(post.content);
  };

  const handleSaveEdit = async (postId: string) => {
    try {
      await ConnectService.updatePost(postId, {
        title: editTitle.trim(),
        content: editContent.trim(),
      });
      setEditingPostId(null);
      pushToast({ tone: 'success', title: 'Đã cập nhật bài viết' });
      onRefresh();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể chỉnh sửa',
        description: err instanceof ApiClientError ? err.message : 'Thao tác thất bại.',
      });
    }
  };

  const handleDelete = async (postId: string) => {
    try {
      await ConnectService.deletePost(postId);
      pushToast({ tone: 'info', title: 'Đã xóa bài viết' });
      onRefresh();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể xóa bài viết',
        description: err instanceof ApiClientError ? err.message : 'Thao tác thất bại.',
      });
    }
  };

  const handleLike = async (postId: string) => {
    try {
      await ConnectService.togglePostLike(postId);
      onRefresh();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi tương tác', description: err instanceof ApiClientError ? err.message : '' });
    }
  };

  const handleSave = async (postId: string) => {
    try {
      await ConnectService.togglePostSave(postId);
      onRefresh();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi lưu bài', description: err instanceof ApiClientError ? err.message : '' });
    }
  };

  const handleShare = async (postId: string) => {
    try {
      await ConnectService.sharePost(postId);
      pushToast({ tone: 'success', title: 'Đã ghi nhận chia sẻ bài viết' });
      onRefresh();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi chia sẻ', description: err instanceof ApiClientError ? err.message : '' });
    }
  };

  const handleAddComment = async (postId: string) => {
    const content = (commentDrafts[postId] ?? '').trim();
    if (!content) return;
    try {
      await ConnectService.addComment(postId, content);
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
      setExpandedComments((prev) => ({ ...prev, [postId]: true }));
      onRefresh();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể bình luận',
        description: err instanceof ApiClientError ? err.message : 'Nội dung không hợp lệ.',
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter & Topic Controls (hidden when embedded inside Club Discussion tab) */}
      {!fixedClubId && (
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Bộ lọc bảng tin">
              {FEED_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => onFilterChange(f.id)}
                  className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                    filter === f.id
                      ? 'bg-[var(--bg-surface)] text-[var(--accent)] border border-[var(--accent)]/40'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/50 border border-transparent'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="connect-topic-filter" className="sr-only">
                Lọc chủ đề
              </label>
              <select
                id="connect-topic-filter"
                value={topic}
                onChange={(e) => onTopicChange(e.target.value as CommunityTopic | 'ALL')}
                className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="ALL">Mọi chủ đề (9)</option>
                {COMMUNITY_TOPICS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setComposerOpen((v) => !v)}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer whitespace-nowrap"
              >
                {composerOpen ? 'Đóng soạn bài' : 'Đăng bài mới'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post Composer */}
      {composerOpen && (
        <form
          onSubmit={handlePublish}
          className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {fixedClubId ? 'Đăng thảo luận trong Câu lạc bộ' : 'Chia sẻ góc nhìn cộng đồng'}
            </h3>
            <span className="text-[11px] text-[var(--text-muted)]">
              Kiểm duyệt quy tắc tự động · Không chia sẻ dữ liệu tài chính cá nhân
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label htmlFor="post-topic" className="block text-[11px] text-[var(--text-muted)] mb-1">
                Chủ đề
              </label>
              <select
                id="post-topic"
                value={postTopic}
                onChange={(e) => setPostTopic(e.target.value as CommunityTopic)}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
              >
                {COMMUNITY_TOPICS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="post-mode" className="block text-[11px] text-[var(--text-muted)] mb-1">
                Ngữ cảnh chế độ
              </label>
              <select
                id="post-mode"
                value={postMode}
                onChange={(e) => setPostMode(e.target.value as GameModeContext)}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
              >
                <option value="ONLINE">Online World (WORLD-01)</option>
                <option value="CAREER">Career Mode (Độc lập)</option>
              </select>
            </div>

            {!fixedClubId && (
              <div>
                <label htmlFor="post-club" className="block text-[11px] text-[var(--text-muted)] mb-1">
                  Gắn Câu lạc bộ (tuỳ chọn)
                </label>
                <select
                  id="post-club"
                  value={postClubId}
                  onChange={(e) => setPostClubId(e.target.value)}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                >
                  <option value="">Bảng tin công khai</option>
                  {myClubs.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.tag}] {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="post-title" className="block text-[11px] text-[var(--text-muted)] mb-1">
              Tiêu đề bài viết
            </label>
            <input
              id="post-title"
              type="text"
              value={postTitle}
              onChange={(e) => setPostTitle(e.target.value)}
              maxLength={120}
              placeholder="Ví dụ: Phân tích chu kỳ lãi suất WORLD-01 và phân bổ danh mục..."
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label htmlFor="post-content" className="block text-[11px] text-[var(--text-muted)] mb-1">
              Nội dung phân tích / thảo luận
            </label>
            <textarea
              id="post-content"
              rows={3}
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              maxLength={1600}
              placeholder="Chia sẻ nhận định thị trường, kinh nghiệm xây dựng doanh nghiệp hoặc bài học quản trị rủi ro..."
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="post-image-url" className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] mb-1">
                <ImageIcon className="w-3.5 h-3.5" />
                Ảnh minh họa HTTPS (tuỳ chọn)
              </label>
              <input
                id="post-image-url"
                type="url"
                value={postImageUrl}
                onChange={(e) => setPostImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>

            <div>
              <label htmlFor="post-achievement" className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] mb-1">
                <Award className="w-3.5 h-3.5" />
                Đính kèm Thẻ Thành tựu xác thực
              </label>
              <select
                id="post-achievement"
                value={postAchievementId}
                onChange={(e) => setPostAchievementId(e.target.value)}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
              >
                <option value="">Không đính kèm</option>
                {availableAchievements.map((ach) => (
                  <option key={ach.id} value={ach.id}>
                    {ach.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {!fixedClubId && (
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="px-3 py-1.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Hủy
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Đang đăng...' : 'Xuất bản bài viết'}
            </button>
          </div>
        </form>
      )}

      {/* Feed Stream */}
      {posts.length === 0 ? (
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-8 text-center space-y-2">
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            Chưa có bài viết nào trong bộ lọc này
          </div>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            Empire Connect chỉ hiển thị bài viết thật từ người chơi trong WORLD-01 (không tạo dữ liệu cộng đồng giả). Hãy là người đầu tiên mở thảo luận.
          </p>
          {!composerOpen && (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="mt-2 px-3.5 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer"
            >
              Viết bài đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const isOwner = post.authorId === profile.playerId;
            const liked = post.likedBy.includes(profile.playerId);
            const saved = post.savedBy.includes(profile.playerId);
            const commentsOpen = Boolean(expandedComments[post.id]) || post.comments.length > 0;

            return (
              <article
                key={post.id}
                className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3"
              >
                {/* Author & Context Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(post.authorId)}
                      className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-xs font-mono font-bold text-[#0B0F17] cursor-pointer"
                      style={{ backgroundColor: post.authorColor || '#38BDF8' }}
                      aria-label={`Xem hồ sơ ${post.authorName}`}
                    >
                      {post.authorInitials}
                    </button>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => onOpenProfile(post.authorId)}
                          className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer truncate"
                        >
                          {post.authorName}
                        </button>
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">
                          {post.authorPublicCode}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">· {post.authorTitle}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--text-muted)]">
                        <span>{TOPIC_LABEL_MAP[post.topic] ?? post.topic}</span>
                        <span>·</span>
                        <span className="font-mono text-[10px]">
                          {post.modeContext === 'CAREER' ? 'CAREER' : 'ONLINE'}
                        </span>
                        {post.clubName && (
                          <>
                            <span>·</span>
                            <span className="text-[var(--accent)]">{post.clubName}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{formatRelativeTimeVi(post.createdAt)}</span>
                        {post.editedAt && <span>(đã sửa)</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isOwner && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(post)}
                          aria-label={`Chỉnh sửa bài viết ${post.title}`}
                          className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(post.id)}
                          aria-label={`Xóa bài viết ${post.title}`}
                          className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--negative)] hover:bg-[var(--bg-surface)] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {!isOwner && (
                      <button
                        type="button"
                        onClick={() => onReportTarget('POST', post.id)}
                        aria-label={`Báo cáo bài viết ${post.title}`}
                        className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--warning)] hover:bg-[var(--bg-surface)] cursor-pointer"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Body or Inline Edit */}
                {editingPostId === post.id ? (
                  <div className="space-y-2 pt-1">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                    />
                    <textarea
                      rows={3}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingPostId(null)}
                        className="px-2.5 py-1 text-xs text-[var(--text-secondary)] cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(post.id)}
                        className="px-3 py-1 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
                      >
                        Lưu chỉnh sửa
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] leading-snug">
                      {post.title}
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                      {post.content}
                    </p>
                    {post.imageUrl && (
                      <div className="rounded-md overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                        <img
                          src={post.imageUrl}
                          alt={post.title}
                          loading="lazy"
                          className="w-full max-h-80 object-cover"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Verified Achievement Share Card */}
                {post.achievementCard && (
                  <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent)]">
                        <Award className="w-4 h-4 shrink-0" />
                        <span>THẺ THÀNH TỰU XÁC THỰC MÁY CHỦ</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => exportAchievementCardPng(post.achievementCard!)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Tải ảnh PNG
                      </button>
                    </div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      {post.achievementCard.achievementTitle}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {post.achievementCard.achievementDescription}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-muted)]">
                      {post.achievementCard.username} ({post.achievementCard.publicCode}) ·{' '}
                      {post.achievementCard.modeContext} · Không lộ số dư cá nhân
                    </div>
                  </div>
                )}

                {/* Action Bar */}
                <div className="pt-2 border-t border-[var(--border-subtle)]/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleLike(post.id)}
                      className={`inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        liked ? 'text-[var(--negative)] font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-current' : ''}`} />
                      <span className="font-mono tabular-nums">{post.likedBy.length}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedComments((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
                      }
                      className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span className="font-mono tabular-nums">{post.comments.length}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShare(post.id)}
                      className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span className="font-mono tabular-nums">{post.shareCount}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSave(post.id)}
                    className={`inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      saved ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Bookmark className={`w-3.5 h-3.5 ${saved ? 'fill-current' : ''}`} />
                    <span>{saved ? 'Đã lưu' : 'Lưu bài'}</span>
                  </button>
                </div>

                {/* Comments Section */}
                {commentsOpen && (
                  <div className="pt-2 border-t border-[var(--border-subtle)]/50 space-y-2.5">
                    {post.comments.map((c) => (
                      <div key={c.id} className="flex items-start justify-between gap-2 text-xs bg-[var(--bg-surface)]/50 rounded p-2.5">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenProfile(c.authorId)}
                              className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer"
                            >
                              {c.authorName}
                            </button>
                            <span className="text-[10px] text-[var(--text-muted)]">
                              {formatRelativeTimeVi(c.createdAt)}
                            </span>
                          </div>
                          <p className="text-[var(--text-secondary)] break-words">{c.content}</p>
                        </div>
                        {c.authorId !== profile.playerId && (
                          <button
                            type="button"
                            onClick={() => onReportTarget('COMMENT', c.id)}
                            aria-label="Báo cáo bình luận"
                            className="p-1 text-[var(--text-muted)] hover:text-[var(--warning)] cursor-pointer shrink-0"
                          >
                            <Flag className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={commentDrafts[post.id] ?? ''}
                        onChange={(e) =>
                          setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleAddComment(post.id);
                          }
                        }}
                        placeholder="Viết bình luận góp ý..."
                        className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddComment(post.id)}
                        aria-label="Gửi bình luận"
                        className="px-2.5 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[#0B0F17] transition-colors cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
