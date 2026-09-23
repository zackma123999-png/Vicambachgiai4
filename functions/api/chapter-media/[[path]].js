import { downloadB2Object } from "../../_utils/b2-native.js";

export async function onRequestGet(context) {
  try {
    const path = Array.isArray(context.params.path)
      ? context.params.path.join("/")
      : String(context.params.path || "");
    if (!path.startsWith("chapters/")) return new Response("Not found", { status: 404 });

    const source = await downloadB2Object(
      context.env,
      path,
      context.request.headers.get("range") || ""
    );
    if (source.status === 404) return new Response("Not found", { status: 404 });
    if (!source.ok) {
      console.error("[chapter-media download]", source.status);
      return new Response("Không tải được audio.", { status: 502 });
    }

    const headers = new Headers();
    ["content-type", "content-length", "content-range", "etag", "last-modified"].forEach((name) => {
      const value = source.headers.get(name);
      if (value) headers.set(name, value);
    });
    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(source.body, { status: source.status, headers });
  } catch (error) {
    if (error.code === "B2_NOT_CONFIGURED") {
      return new Response("Kho Backblaze B2 chưa được kết nối.", { status: 503 });
    }
    console.error("[chapter-media download]", error && error.message);
    return new Response("Không tải được audio.", { status: 502 });
  }
}
