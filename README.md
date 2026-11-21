# Gia Phả Thông Minh · Smart Family Tree

**v1.0.0** — Ứng dụng web miễn phí giúp gia đình Việt tạo, khám phá và chia sẻ cây gia phả tương tác.
A free web app for Vietnamese families to create, explore and share interactive family trees.

[Tiếng Việt](#tiếng-việt) · [English](#english)

---

## Tiếng Việt

### Tính năng

- **Tài khoản**: đăng ký/đăng nhập bằng email + mật khẩu hoặc Google; hồ sơ người dùng. Không đăng nhập vẫn dùng đầy đủ ở **chế độ khách** (dữ liệu lưu trên thiết bị).
- **Nhiều cây gia phả** cho mỗi người (bên nội, bên ngoại…), có tên, mô tả, ảnh bìa. Mặc định riêng tư.
- **Thành viên**: họ tên, tên thường gọi, giới tính, ngày sinh/mất, quê quán, ảnh, điện thoại, email, địa chỉ, nghề nghiệp, tiểu sử. Liên kết cha, mẹ, vợ/chồng (nhiều đời vợ/chồng), con.
- **Sơ đồ cây tương tác (SVG)**: kéo, phóng to/thu nhỏ, thu gọn/mở nhánh, bấm để mở hồ sơ, tìm theo tên (không cần dấu), tô sáng đường nối giữa hai người và giải thích quan hệ.
- **Xưng hô tự động** theo cách gọi của người Việt: ông bà nội/ngoại, cha mẹ, anh chị em, bác/chú/cô (bên nội), cậu/dì (bên ngoại), thím/mợ/dượng, anh chị em họ, cháu nội/ngoại, dâu/rể, cha dượng/mẹ kế, anh em cùng cha khác mẹ… Trường hợp hiếm hiển thị “Họ hàng”.
- **Dòng thời gian**: sinh, cưới, mất và các cột mốc, sắp theo ngày, lọc theo thành viên.
- **Tư liệu**: ảnh, video, tài liệu gắn với thành viên hoặc cả cây; ảnh được nén ngay trên trình duyệt; hiển thị dung lượng đã dùng (gói miễn phí 5 GB).
- **Nhập tài liệu Word bằng AI**: đọc `.docx` trên trình duyệt (mammoth.js), gửi văn bản tới mô hình AI do bạn cấu hình (ví dụ khóa miễn phí Google Gemini), rồi hiện màn hình kiểm tra để sửa/xác nhận từng người và quan hệ trước khi thêm. Không có khóa thì dùng cách nhận dạng theo mẫu câu.
- **Chia sẻ**: mời qua email hoặc liên kết tham gia; vai trò Chủ sở hữu, Quản trị, Biên tập, Người xem; liên kết công khai chỉ xem (mặc định tắt).
- **Xuất dữ liệu** ngay trên trình duyệt: Excel (.xlsx), PDF (sơ đồ + danh sách), ảnh PNG.
- **Quản trị**: thống kê người dùng/cây/thành viên/dung lượng, khóa/mở khóa tài khoản, cấp/thu quyền quản trị, danh sách mọi cây, ẩn cây/thành viên bị báo cáo. Quản trị viên mặc định: `virusphuoc@gmail.com` (email phải được xác minh).
- **PWA**: cài được lên màn hình chính, giao diện ưu tiên điện thoại (390px), 100% tiếng Việt.

### Chạy trên máy

Cần Node.js 20 trở lên.

```bash
npm install
npm run dev        # http://localhost:5173 — chế độ khách nếu chưa cấu hình Firebase
npm run build      # kiểm tra kiểu + bản dựng vào dist/
npm test           # kiểm thử đơn vị (xưng hô, nhập tài liệu)
npm run lint
```

### Bật đồng bộ đám mây (Firebase, gói Spark miễn phí)

1. Tạo dự án Firebase, bật **Authentication** (Email/Password và Google), **Cloud Firestore**, và **Cloud Storage** nếu muốn lưu tư liệu trên đám mây.
2. Chép `.env.example` thành `.env.local` rồi điền các giá trị `VITE_FIREBASE_*` (Project settings → Your apps). Khi triển khai, đặt cùng các biến này trong cấu hình môi trường của nơi lưu trữ (ví dụ Vercel). **Không commit `.env.local`.**
3. Xuất bản quy tắc bảo mật trong repo: [`firestore.rules`](firestore.rules) và [`storage.rules`](storage.rules) (Firebase console → Rules, hoặc `firebase deploy --only firestore:rules,storage`). Chưa xuất bản quy tắc thì mọi thao tác đám mây đều bị từ chối.
4. Thêm tên miền triển khai vào Authentication → Settings → **Authorized domains** để đăng nhập hoạt động.

Thiếu biến `VITE_FIREBASE_*` thì ứng dụng tự chạy ở chế độ khách.

### Kiểm thử đầu-cuối

```bash
npm run emulators                                  # Firebase Emulator Suite (cần Java 21+)
VITE_FIREBASE_EMULATOR=1 npx vite --port 5174      # ứng dụng nối vào emulator
node e2e/cloud.mjs                                 # đăng nhập, đồng bộ, chia sẻ, quy tắc, quản trị
node e2e/guest.mjs http://localhost:5173           # chế độ khách: sơ đồ, xưng hô, xuất tệp, nhập Word
```

Hai kịch bản dùng `playwright-core` với Chrome có sẵn trên máy (`CHROME=/đường/dẫn/chrome`) hoặc qua `CDP=http://localhost:9222`.

### Quyền riêng tư

- Chế độ khách: dữ liệu chỉ nằm trong trình duyệt (IndexedDB) của thiết bị, không gửi đi đâu.
- Khi đăng nhập: dữ liệu lưu ở dự án Firebase của người triển khai. Chỉ chủ cây, người được mời/tham gia và quản trị viên hệ thống đọc được; liên kết công khai phải tự bật.
- Khóa API của AI chỉ lưu trong `localStorage` của trình duyệt. Khi dùng AI, nội dung tệp Word được gửi thẳng từ trình duyệt tới nhà cung cấp AI bạn chọn. Nhận dạng theo mẫu câu chạy hoàn toàn trên thiết bị.
- Ứng dụng không tự gửi email mời; lời mời có hiệu lực khi người nhận đăng nhập bằng đúng email đã xác minh.
- Xuất Excel/PDF/PNG được tạo trên trình duyệt, không qua máy chủ.
- Không có khóa bí mật nào trong repo. Không dùng công cụ theo dõi hay quảng cáo.

---

## English

### Features

- **Accounts**: email/password or Google sign-in, user profile. Without signing in the app works fully in **guest mode** (data stays on the device).
- **Multiple trees** per user with name, description and cover photo. Private by default.
- **Members**: full name, nickname, gender, birth/death dates, birthplace, photo, phone, email, address, occupation, bio. Father, mother, spouse (several spouses over time) and child links.
- **Interactive SVG diagram**: pan, zoom, collapse/expand branches, tap a member for their profile, accent-insensitive name search, highlighted path between any two members with an explanation of how they are related.
- **Automatic Vietnamese kinship terms** relative to a chosen person (paternal bác/chú/cô, maternal cậu/dì, in-laws, cousins, grandchildren, step and half relations), with a generic “Họ hàng” fallback for rare cases.
- **Timeline** of births, marriages, deaths and milestones, sorted by date and filterable by member.
- **Media**: photos, videos and documents attached to a member or the tree; images are compressed in the browser; storage usage is shown against the 5 GB free tier.
- **AI Word import**: `.docx` text is extracted in the browser (mammoth.js) and sent to an LLM you configure (e.g. a free Google Gemini key); a review screen lets you edit and confirm every person and relationship. Without a key, a simple pattern-based parser is used instead.
- **Sharing**: email invitations or a join link; roles owner, admin, editor, viewer; optional public read-only link (off by default).
- **Exports** generated in the browser: Excel (.xlsx), PDF (diagram + member list), PNG.
- **Admin dashboard**: totals, lock/unlock users, grant/revoke admin, all trees, hide reported trees or members. Default admin: `virusphuoc@gmail.com` (verified email required).
- **PWA**, mobile-first (390px), UI entirely in Vietnamese.

### Run locally

Node.js 20+.

```bash
npm install
npm run dev        # guest mode when Firebase is not configured
npm run build
npm test
npm run lint
```

### Enable cloud sync (Firebase Spark tier)

1. Create a Firebase project; enable Authentication (Email/Password, Google), Cloud Firestore, and Cloud Storage if you want cloud media.
2. Copy `.env.example` to `.env.local` and fill in the `VITE_FIREBASE_*` values; set the same variables in your host (e.g. Vercel). Never commit `.env.local`.
3. Publish [`firestore.rules`](firestore.rules) and [`storage.rules`](storage.rules). Until rules are published every cloud operation is denied.
4. Add your deployment domain to Authentication → Settings → Authorized domains.

Without the `VITE_FIREBASE_*` variables the app runs in guest mode.

### End-to-end tests

See the commands in the Vietnamese section: `e2e/cloud.mjs` runs login, sync, sharing, security-rule and admin checks against the Firebase Emulator Suite; `e2e/guest.mjs` covers the diagram, kinship labels, exports and Word import in guest mode.

### Privacy

- Guest mode keeps everything in the browser's IndexedDB.
- Signed-in data lives in the deployer's Firebase project and is readable only by the tree owner, invited/joined members and app admins; public links are opt-in.
- The LLM key is stored in `localStorage` only. With AI import, the document text goes straight from the browser to the provider you chose; the pattern-based parser is fully local.
- The app does not send invitation emails itself; an invitation applies once the invitee signs in with that verified email.
- Exports are produced in the browser. No secrets in the repo, no analytics or ads.

### Stack

React, Vite, TypeScript, Tailwind CSS, Firebase (Auth, Firestore, Storage), vite-plugin-pwa, mammoth, SheetJS, jsPDF, html-to-image.
