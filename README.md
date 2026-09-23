# Vicambachgiai3

Thư viện Bách Hợp độc lập: frontend tĩnh trên Vercel, dữ liệu dùng chung trên Supabase, mã nguồn trên GitHub.

## Stack

- **GitHub** — repo `Vicambachgiai3`
- **Vercel** — host `index.html` + assets
- **Supabase** — Auth + Postgres + RLS

Độc giả khác nhau thấy cùng catalog, bình luận, đánh giá, tủ truyện. Admin sửa truyện trên web là mọi người thấy ngay.

## Tài khoản

Tạo admin bằng SQL Editor trên Supabase (`profiles.role = 'admin'`), không cấp admin từ form đăng ký.

Supabase có thể yêu cầu email thật nếu Confirm email đang bật. Tắt **Authentication → Providers → Email → Confirm email** khi dev, hoặc dùng email bạn kiểm soát được.

## Cấu hình tay (nếu agent không deploy hộ)

1. Tạo project Supabase tên `Vicambachgiai3`
2. SQL Editor → chạy `supabase/schema.sql`
3. Authentication → URL Configuration: thêm domain Vercel vào Redirect URLs
4. Điền `js/config.js`:

```js
window.VCBG_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "eyJ...",
};
```

5. Đẩy repo lên GitHub, Import vào Vercel (framework: Other, output: root)

## Seed catalog

Cần `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (không commit key này):

```
python3 scripts/seed_catalog.py
```

## Ghi chú bảo mật

- Anon key được phép nằm trên frontend.
- Service role / access token chỉ dùng trên máy deploy, không đưa vào `js/`.
- RLS: khách đọc catalog; user ghi dữ liệu của mình; admin ghi catalog.
