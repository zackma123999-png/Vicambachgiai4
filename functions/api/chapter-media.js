import { uploadB2Object } from "../_utils/b2-native.js";

const SUPABASE_URL = "https://isawawkxjbnlbuxlhlnk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzYXdhd2t4amJubGJ1eGxobG5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4OTQ0NzAsImV4cCI6MjEwMjQ3MDQ3MH0.QfFRAyBOKnpy9fjvv5UKv1EgvMDh5LJTKoo36Da8ZAc";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

const safeExt = (name, type, kind) => {
  const ext = String(name || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ext && ext.length <= 5) return ext;
  if (kind === "cover") return "webp";
  return type === "audio/mpeg" ? "mp3" : "m4a";
};

async function requireAdmin(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const headers = { apikey: SUPABASE_ANON_KEY, authorization: auth };
  const userRes = await fetch(SUPABASE_URL + "/auth/v1/user", { headers });
  if (!userRes.ok) throw new Error("UNAUTHORIZED");
  const user = await userRes.json();
  const profileRes = await fetch(
    SUPABASE_URL + "/rest/v1/profiles?select=role,status&user_id=eq." + encodeURIComponent(user.id) + "&limit=1",
    { headers }
  );
  if (!profileRes.ok) throw new Error("FORBIDDEN");
  const profiles = await profileRes.json();
  if (!profiles[0] || profiles[0].role !== "admin" || (profiles[0].status && profiles[0].status !== "active")) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function onRequestPost(context) {
  try {
    await requireAdmin(context.request);
    const kind = context.request.headers.get("x-media-kind") === "cover" ? "cover" : "audio";
    const chapterId = String(context.request.headers.get("x-chapter-id") || "");
    const name = decodeURIComponent(context.request.headers.get("x-file-name") || "");
    const type = context.request.headers.get("content-type") || "application/octet-stream";
    const size = Number(context.request.headers.get("content-length") || 0);

    if (!/^[0-9a-f-]{36}$/i.test(chapterId) || !context.request.body) {
      return json({ error: "Dữ liệu tải lên không hợp lệ." }, 400);
    }

    const max = kind === "audio" ? 60 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!size || size > max) {
      return json({ error: kind === "audio" ? "File audio phải nhỏ hơn 60MB." : "Ảnh phải nhỏ hơn 8MB." }, 413);
    }
    if (kind === "audio" && !type.startsWith("audio/")) return json({ error: "Đây không phải file audio." }, 415);
    if (kind === "cover" && !type.startsWith("image/")) return json({ error: "Đây không phải file ảnh." }, 415);

    const key = `chapters/${chapterId}/${kind}-${Date.now()}.${safeExt(name, type, kind)}`;
    const bytes = await context.request.arrayBuffer();
    if (bytes.byteLength !== size) return json({ error: "File tải lên chưa đầy đủ. Hãy thử lại." }, 400);

    await uploadB2Object(context.env, key, type, bytes);
    return json({ url: "/api/chapter-media/" + key });
  } catch (error) {
    if (error.message === "UNAUTHORIZED") return json({ error: "Phiên đăng nhập đã hết." }, 401);
    if (error.message === "FORBIDDEN") return json({ error: "Chỉ quản trị viên được tải bản thu." }, 403);
    if (error.code === "B2_NOT_CONFIGURED") {
      return json({ error: "Kho Backblaze B2 chưa được kết nối trong Cloudflare Secrets." }, 503);
    }
    if (error.code === "B2_BUCKET_NOT_ALLOWED") {
      return json({ error: "Key Backblaze chưa được cấp quyền cho kho audio." }, 503);
    }
    console.error("[chapter-media upload]", error && error.message);
    return json({ error: "Không tải được file lên Backblaze B2. Hãy thử lại." }, 502);
  }
}

export function onRequest() {
  return json({ error: "Phương thức không được hỗ trợ." }, 405);
}
