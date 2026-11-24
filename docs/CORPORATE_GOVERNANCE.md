# CORPORATE GOVERNANCE & BOARD ROOM RULES

## 1. Phân tách Vai trò (Role Separation)
| Vai trò | Quyền hạn chính | Giới hạn bảo vệ |
| --- | --- | --- |
| **CEO** | Điều hành vận hành, giá bán, tuyển dụng, mở chi nhánh / nâng cấp trong hạn mức `ceoSpendingLimitCR`, bổ nhiệm CFO/COO | Không thể tự rút tiền từ Ví Công ty; không tự phát hành cổ phần vượt quy chế |
| **CFO** | Quản lý báo cáo tài chính, mở vòng gọi vốn sau phê duyệt, theo dõi thanh khoản | Không thể tự rút quỹ hoặc thay đổi CEO |
| **COO** | Điều chỉnh vận hành, nhân sự, tối ưu công suất | Không thao tác vốn điều lệ hoặc cổ tức |
| **BOARD_MEMBER** | Đệ trình và tham gia giám sát nghị quyết Hội đồng Quản trị | Biểu quyết theo số cổ phần chốt tại Snapshot |
| **SHAREHOLDER** | Bỏ phiếu theo tỷ lệ cổ phần, nhận cổ tức, thảo luận tại Phòng Cổ đông | Không điều hành trực tiếp nếu không giữ chức vụ |

## 2. Quy chế Biểu quyết & Snapshot Chống Gian lận
- **Voting Power Snapshot:** Tại thời điểm tạo nghị quyết (`createBoardProposal`), hệ thống đóng băng số cổ phần có quyền biểu quyết của từng cổ đông vào `votingPowerSnapshot`. Cổ phần chuyển nhượng sau thời điểm tạo đề xuất không thể dùng để bỏ phiếu kép.
- **Chặn bỏ phiếu trùng:** Mỗi cổ đông chỉ bỏ phiếu 1 lần (`FOR`, `AGAINST`, hoặc `ABSTAIN`); lần thứ hai trả về `DUPLICATE_VOTE_FORBIDDEN`.
- **Ngưỡng thông qua:**
  - Nghị quyết thường (`OPEN_BRANCH`, `UPGRADE_BUSINESS`, `PAY_DIVIDEND`, `BANK_LOAN`, `ELECT_CEO`, `APPOINT_EXECUTIVE`, `CREATE_SUBSIDIARY`): Đa số quá bán (`> 50.01%`) và đạt túc số `Quorum ≥ 40%`.
  - Nghị quyết đại đa số (`ISSUE_SHARES`, `RAISE_CAPITAL`, `ACQUIRE_COMPANY`, `MERGER`, `DISSOLVE`): `≥ 75%` và đạt túc số `Quorum`.
- **Thực thi Duy nhất (Single Execution):** Khi trạng thái chuyển `APPROVED`, nghị quyết chỉ được thực thi đúng một lần (`EXECUTED`); lần thực thi lặp lại bị chặn bằng `PROPOSAL_ALREADY_EXECUTED`.

## 3. Chống Biển thủ (Anti-Embezzlement) & Nguyên tắc Cổ tức
- Mọi yêu cầu rút trực tiếp từ Ví Công ty (`attemptUnauthorizedCompanyWithdrawal`) bị chặn tuyệt đối với lỗi `COMPANY_UNAUTHORIZED_WITHDRAWAL` (403) và ghi nhận vĩnh viễn vào `auditLog` (`SECURITY_BLOCKED_WITHDRAWAL`).
- Cổ tức chỉ được chi khi: (1) Đã thông qua nghị quyết `PAY_DIVIDEND`, (2) Doanh nghiệp có lợi nhuận giữ lại dương (`distributableProfitMinor > 0`), và (3) Số dư tiền mặt sau chi cổ tức vẫn lớn hơn hoặc bằng dự trữ vận hành tối thiểu (`max(12% vốn điều lệ, 1 chu kỳ chi phí vận hành)`).
