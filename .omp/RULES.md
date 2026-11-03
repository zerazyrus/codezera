# Codezera rules (Codezera-owned; root `AGENTS.md` belongs to Orca, never edit it)

- **Commit message hoàn toàn bằng tiếng Anh** (tiêu đề và thân), dạng `feat(codezera): …`, viết cho người dùng đọc được (release notes lấy từ tiêu đề commit).
- **Tác giả `The Zera <zerazyrus@gmail.com>`**: `~/.gitconfig` tự chọn danh tính này cho remote `github.com/zerazyrus/*`. Trước khi commit kiểm tra `git config user.email` ra `zerazyrus@gmail.com`; sai thì dừng, không commit. Không đặt `user.*` trong `.git/config` của repo.
- **Có thể có phiên khác đang sửa cùng repo.** `git status` trước khi sửa; chỉ `git add <file>` của mình, không `git add -A`.
- Nhánh `codezera` nhận merge Orca tự động mỗi sáng: `git fetch` + rebase lên `origin/codezera` trước khi push, không force-push.
- Tránh conflict với Orca: theo mục "Keeping upstream merges conflict-free" trong `CODEZERA.md` (logic mới ở file của Codezera, file Orca chỉ thêm một dòng hook).
