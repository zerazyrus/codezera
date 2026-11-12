const WORKFLOW_KEY = 'codezera.pms.agentWorkflow'

/** The `/pms` skill's ticket rules (B3.5, B4.5, B5), for machines without that skill; users rewrite it per team. */
export const DEFAULT_PMS_WORKFLOW = `Quy trình xử lý (bắt buộc theo thứ tự):
1. Đọc kỹ nội dung ticket/tác vụ ở trên, xem hết ảnh đính kèm và bình luận bằng lệnh "codezera pms" (mục PMS commands). Chỉ hỏi tôi khi vẫn thiếu thông tin. Tái hiện lỗi nếu có thể.
2. Đọc code tìm nguyên nhân gốc (file/hàm/dòng gây lỗi). Báo cho tôi ngắn gọn:
   (a) hiện tượng, (b) nguyên nhân gốc, (c) hướng xử lý đề xuất (kèm phương án khác nếu có) và rủi ro.
   Rồi DỪNG, chờ tôi duyệt. Không sửa code, không commit khi tôi chưa đồng ý — kể cả lỗi có vẻ hiển nhiên.
   Ngoại lệ duy nhất: tôi nói rõ "cứ fix luôn" / "không cần hỏi".
3. Sau khi tôi đồng ý: sửa tối thiểu, đúng phạm vi ticket, không refactor ngoài lề.
4. Tự kiểm tra lại (chạy thử/test liên quan). Trình diff + tóm tắt từng file rồi DỪNG chờ tôi review.
   KHÔNG tự commit; tôi có thể còn chỉnh thêm.
5. Khi tôi xác nhận đã review: commit lên nhánh riêng theo git-flow (bug/#<số ticket>-<tên-ngắn> cho lỗi, feature/... hoặc task/... cho việc khác).
   Đang ở nhánh chung (master/dev/release) thì tạo nhánh trước. Commit message ghi rõ số ticket.
6. Sau khi đã có mã commit, kết thúc bằng khối "Cập nhật PMS" để tôi dán vào nút Hoàn tất của Codezera:
   - Trạng thái tiếp theo: Đang kiểm thử (mặc định), Chờ triển khai (chờ deploy) hoặc Đã xong - chờ đóng.
   - Nguyên nhân và Giải pháp: viết cho người dùng nghiệp vụ, không nhắc tên class/file/SQL.
     Theo mạch "Chuyện gì đã xảy ra → Ảnh hưởng → Đã sửa thế nào", mỗi mục 2-4 câu.
   - Git commit: "Project: <group>/<repo>" và "Commit: <mã commit>".
   - Khối kỹ thuật đặt cuối phần Giải pháp, cách một dòng trống:
     [Tham khảo cho DEV]
     Repo: <group>/<repo> (<git url>)
     Commit fix: <mã commit> | Merge: <mã merge> (MR !<số>)
     File: <đường dẫn>::<hàm>
     Chi tiết: <1-3 câu: đã sửa gì, vì sao an toàn, giới hạn còn lại>
   - Thời gian: ước lượng số giờ đã làm, để tôi Log giờ.`

// Overrides saved before the `codezera` command named `orca pms`, which Orca's CLI does not have.
const LEGACY_PMS_COMMAND = /\borca (pms|skills get orca-pms)\b/g

export function loadPmsWorkflow(): string {
  const saved = localStorage.getItem(WORKFLOW_KEY)
  if (saved === null) {
    return DEFAULT_PMS_WORKFLOW
  }
  const migrated = saved.replace(LEGACY_PMS_COMMAND, 'codezera $1')
  if (migrated !== saved) {
    savePmsWorkflow(migrated)
  }
  return migrated
}

/** Saving the default text (or blank) clears the override, so later default updates still apply. */
export function savePmsWorkflow(text: string): void {
  const trimmed = text.trim()
  if (!trimmed || trimmed === DEFAULT_PMS_WORKFLOW) {
    localStorage.removeItem(WORKFLOW_KEY)
    return
  }
  localStorage.setItem(WORKFLOW_KEY, trimmed)
}
