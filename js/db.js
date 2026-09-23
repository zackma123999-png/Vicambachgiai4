/* ViCamBachGiai3 — shared Supabase data layer. Same VCBG API as the static build. */
(function (global) {
  const SESSION_KEY = "vicambachgiai.session.v3";
  const OWNER_EMAIL = "jasminenemo3311@gmail.com";
  const RATE_KEY = "vicambachgiai.rate.v1";
  const GUEST_PROGRESS = "vicambachgiai.guest.progress";

  const emptySettings = () => ({
    name: "ViCamBachGiai",
    tagline: "Thư viện Bách Hợp — đọc chậm, ở lại lâu.",
    allow_comments: true,
    allow_registration: true,
    site_mode: "normal",
    maintenance_message: "",
    maintenance_until: null,
    mode_reason: "",
    mode_updated_at: null,
    mode_updated_by: null,
    social: { youtube: "", tiktok: "", instagram: "", facebook: "", wattpad: "" },
    featured_quote: null,
    poll: { id: "poll_home", title: "Bạn muốn ViCam ưu tiên truyện nào?", story_ids: [] },
  });

  const cache = {
    ready: false,
    users: [],
    profiles: [],
    stories: [],
    chapters: [],
    genres: [],
    tags: [],
    story_genres: [],
    story_tags: [],
    favorites: [],
    follows: [],
    reading_progress: [],
    reading_history: [],
    comments: [],
    comment_replies: [],
    comment_likes: [],
    chapter_likes: [],
    ratings: [],
    views: [],
    story_stats: {},
    notifications: [],
    poll_votes: [],
    inbox: [],
    site_settings: emptySettings(),
  };

  let sb = null;
  let sessionUser = null;
  let persistQueue = Promise.resolve();
  const PUBLIC_VISITOR_KEY = "vicambachgiai.public-visitor.v1";
  const publicMetricListeners = new Set();
  const communityListeners = new Set();
  const authStateListeners = new Set();
  let authSubscriptionStarted = false;
  let accountStatusChannel = null;
  let accountStatusTimer = null;
  let monitoredAccountId = "";
  let publicMetricTimer = null;
  let publicMetricLifecycleBound = false;
  let publicPresenceTimer = null;
  let publicPresenceInFlight = false;
  let publicPresenceGeneration = 0;
  let publicPresenceFailures = 0;
  let publicVisitRecorded = false;
  let communityChannel = null;
  let communityStarting = false;
  let communityRefreshTimer = null;
  let publicMetrics = {
    // null means the presence heartbeat has not confirmed a live count yet. Never
    // present a connection failure as a real zero-person result.
    online: null,
    online_guests: null,
    online_members: null,
    visits_today: null,
    members: null,
    comments: null,
    total_views: null,
    hearts: null,
    published_stories: null,
    updated_at: 0,
  };

  function cfg() {
    return global.VCBG_CONFIG || {};
  }

  function now() {
    return Date.now();
  }

  async function decodeCoverImage(file) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close() { if (bitmap.close) bitmap.close(); },
      };
    } catch (_) {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.decoding = "async";
      try {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error("Không đọc được định dạng ảnh này."));
          image.src = url;
        });
        return {
          source: image,
          width: image.naturalWidth,
          height: image.naturalHeight,
          close() { URL.revokeObjectURL(url); },
        };
      } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
      }
    }
  }

  async function optimizeCoverFile(file) {
    if (!file || !/^image\//i.test(file.type || "")) throw new Error("Tệp bìa không hợp lệ.");
    const decoded = await decodeCoverImage(file);
    if (!decoded.width || !decoded.height) {
      decoded.close();
      throw new Error("Ảnh bìa không có kích thước hợp lệ.");
    }

    const targetBytes = 850 * 1024;
    let scale = Math.min(1, 1000 / decoded.width, 1500 / decoded.height);
    let lastBlob = null;

    try {
      for (let resize = 0; resize < 10; resize += 1) {
        const width = Math.max(1, Math.round(decoded.width * scale));
        const height = Math.max(1, Math.round(decoded.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Thiết bị không thể xử lý ảnh bìa.");
        context.fillStyle = "#0b0e18";
        context.fillRect(0, 0, width, height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(decoded.source, 0, 0, width, height);

        for (const quality of [0.84, 0.74, 0.64, 0.54, 0.44, 0.36]) {
          lastBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
          if (lastBlob && lastBlob.size <= targetBytes) return lastBlob;
        }

        if (width <= 320 || height <= 480) break;
        scale *= 0.78;
      }
    } finally {
      decoded.close();
    }

    if (!lastBlob) throw new Error("Thiết bị không thể chuyển ảnh bìa sang WebP.");
    throw new Error("Không thể giảm ảnh bìa xuống dung lượng an toàn.");
  }

  async function optimizeAudioCoverFile(file) {
    if (!file || !/^image\//i.test(file.type || "")) throw new Error("Ảnh đĩa không hợp lệ.");
    const bitmap = await createImageBitmap(file);
    const size = Math.min(900, bitmap.width, bitmap.height);
    const sx = Math.max(0, Math.round((bitmap.width - size) / 2));
    const sy = Math.max(0, Math.round((bitmap.height - size) / 2));
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 720;
    const context = canvas.getContext("2d", { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, sx, sy, size, size, 0, 0, 720, 720);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob) throw new Error("Không thể tối ưu ảnh đĩa.");
    return new File([blob], "audio-cover.webp", { type: "image/webp" });
  }

  async function uploadChapterMedia(chapterId, file, kind) {
    if (!file) return "";
    const isAudio = kind === "audio";
    const max = isAudio ? 60 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > max) {
      throw new Error(isAudio ? "File audio tối đa 60MB. Nên dùng MP3 96kbps để âm thanh rõ và nhẹ." : "Ảnh đĩa tối đa 8MB.");
    }
    if (isAudio && !/^audio\//i.test(file.type || "")) throw new Error("Hãy chọn file ghi âm hoặc audio.");
    const session = await sb.auth.getSession();
    const token = session && session.data && session.data.session && session.data.session.access_token;
    if (!token) throw new Error("Phiên đăng nhập đã hết. Hãy đăng nhập lại.");
    const response = await fetch("/api/chapter-media", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "content-type": file.type || "application/octet-stream",
        "x-chapter-id": chapterId,
        "x-media-kind": kind,
        "x-file-name": encodeURIComponent(file.name || (isAudio ? "chapter-audio" : "audio-cover")),
      },
      body: file,
    });
    let result = null;
    try { result = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error((result && result.error) || "Không tải được file lên kho audio.");
    return result.url;
  }

  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function uid() {
    return uuid();
  }

  function toMs(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return v < 1e12 ? Math.round(v * 1000) : v;
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }

  function iso(ms) {
    if (!ms) return null;
    const n = typeof ms === "number" ? ms : toMs(ms);
    return n ? new Date(n).toISOString() : null;
  }

  function slugify(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80);
  }

  function uniqueSlug(base, exceptId) {
    let slug = base || "truyen";
    let n = 2;
    while (cache.stories.some((s) => s.slug === slug && s.id !== exceptId)) {
      slug = base + "-" + n++;
    }
    return slug;
  }

  function storeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }
  function storeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  }
  function storeDel(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }

  function publicVisitorId() {
    let id = storeGet(PUBLIC_VISITOR_KEY);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || "")) {
      id = uuid();
      storeSet(PUBLIC_VISITOR_KEY, id);
    }
    return id;
  }

  function emitPublicMetrics(patch) {
    publicMetrics = { ...publicMetrics, ...(patch || {}), updated_at: now() };
    publicMetricListeners.forEach((listener) => {
      try { listener({ ...publicMetrics }); } catch (_) {}
    });
  }

  async function refreshPublicMetrics() {
    try {
      const { data, error } = await sb.rpc("get_public_site_stats");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return;
      emitPublicMetrics({
        visits_today: Number(row.visits_today || 0),
        members: Number(row.members || 0),
        comments: Number(row.comments || 0),
        total_views: Number(row.total_views || 0),
        hearts: Number(row.hearts || 0),
        published_stories: Number(row.published_stories || 0),
      });
    } catch (err) {
      console.warn("[VCBG public metrics]", err && err.message);
    }
  }

  function schedulePublicPresence(delay) {
    if (publicPresenceTimer) global.clearTimeout(publicPresenceTimer);
    publicPresenceTimer = global.setTimeout(() => {
      publicPresenceTimer = null;
      runPublicPresenceHeartbeat();
    }, Math.max(0, delay || 0));
  }

  function stopPublicPresence({ leave = false } = {}) {
    publicPresenceGeneration += 1;
    publicPresenceInFlight = false;
    if (publicPresenceTimer) global.clearTimeout(publicPresenceTimer);
    publicPresenceTimer = null;
    if (leave && sb) {
      Promise.resolve(sb.rpc("leave_site_presence", {
        p_visitor_key: publicVisitorId(),
      })).catch(() => {});
    }
  }

  async function runPublicPresenceHeartbeat() {
    if (publicPresenceInFlight || !sb) return;
    if (global.navigator && global.navigator.onLine === false) {
      emitPublicMetrics({ online: null, online_guests: null, online_members: null });
      return;
    }
    const generation = publicPresenceGeneration;
    publicPresenceInFlight = true;
    let nextDelay = 30000;
    try {
      const { data, error } = await sb.rpc("heartbeat_site_presence", {
        p_visitor_key: publicVisitorId(),
      });
      if (generation !== publicPresenceGeneration) return;
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("không nhận được số liệu hiện diện");
      emitPublicMetrics({
        online: Number(row.online || 0),
        online_guests: Number(row.online_guests || 0),
        online_members: Number(row.online_members || 0),
      });
      publicPresenceFailures = 0;
    } catch (err) {
      if (generation !== publicPresenceGeneration) return;
      publicPresenceFailures += 1;
      const delays = [2000, 5000, 10000, 30000];
      nextDelay = delays[Math.min(publicPresenceFailures - 1, delays.length - 1)];
      emitPublicMetrics({ online: null, online_guests: null, online_members: null });
      console.warn("[VCBG presence heartbeat]", err && err.message);
    } finally {
      if (generation === publicPresenceGeneration) {
        publicPresenceInFlight = false;
        schedulePublicPresence(nextDelay);
      }
    }
  }

  function bindPublicMetricLifecycle() {
    if (publicMetricLifecycleBound) return;
    publicMetricLifecycleBound = true;
    global.addEventListener("online", () => {
      publicPresenceFailures = 0;
      stopPublicPresence();
      startPublicPresence();
    });
    global.addEventListener("offline", () => {
      stopPublicPresence();
      emitPublicMetrics({ online: null, online_guests: null, online_members: null });
    });
    global.addEventListener("pagehide", () => {
      stopPublicPresence({ leave: true });
    });
    global.addEventListener("pageshow", () => {
      startPublicPresence();
    });
  }

  async function startPublicMetricPolling() {
    if (publicMetricTimer) return;
    const visitorId = publicVisitorId();
    const recordVisit = async () => {
      if (publicVisitRecorded) return true;
      try {
        const { error } = await sb.rpc("record_site_visit", { p_visitor_key: visitorId });
        if (error) throw error;
        publicVisitRecorded = true;
        return true;
      } catch (err) {
        console.warn("[VCBG visit]", err && err.message);
        return false;
      }
    };
    await recordVisit();
    await refreshPublicMetrics();
    publicMetricTimer = global.setInterval(async () => {
      if (!publicVisitRecorded) await recordVisit();
      await refreshPublicMetrics();
    }, 60 * 1000);
  }

  function startPublicPresence() {
    if (!sb || publicPresenceInFlight || publicPresenceTimer) return;
    schedulePublicPresence(0);
  }

  function restartPublicPresenceForIdentityChange() {
    publicPresenceFailures = 0;
    stopPublicPresence();
    startPublicPresence();
  }

  function startPublicMetrics() {
    bindPublicMetricLifecycle();
    if (!sb) return;
    startPublicMetricPolling().catch((err) => {
      console.warn("[VCBG public metrics]", err && err.message);
    });
    startPublicPresence();
  }

  function emitCommunityChange() {
    communityListeners.forEach((listener) => {
      try { listener(); } catch (_) {}
    });
  }

  async function refreshCommunityData() {
    try {
      const [profiles, comments, replies, likes] = await Promise.all([
        loadCommunityProfiles(),
        loadOptional("comments"),
        loadOptional("comment_replies"),
        loadOptional("comment_likes"),
      ]);
      cache.profiles = (profiles || []).map((p) => {
        const id = p.user_id || p.id;
        return { ...p, id, user_id: id, created_at: toMs(p.created_at) };
      });
      cache.users = cache.profiles.map((p) => ({
        id: p.id,
        email: p.email,
        role: p.role,
        status: p.status === "banned" ? "banned" : "active",
        created_at: p.created_at,
      }));
      cache.comment_likes = likes || [];
      cache.comments = (comments || []).map((c) => ({
        ...c,
        likes: cache.comment_likes.filter((l) => l.comment_id === c.id).map((l) => l.user_id),
        created_at: toMs(c.created_at),
      }));
      cache.comment_replies = (replies || []).map((r) => ({ ...r, created_at: toMs(r.created_at) }));
      writeSnap();
      emitCommunityChange();
    } catch (err) {
      console.warn("[VCBG community realtime]", err && err.message);
    }
  }

  function scheduleCommunityRefresh() {
    global.clearTimeout(communityRefreshTimer);
    communityRefreshTimer = global.setTimeout(refreshCommunityData, 90);
  }

  function startCommunityRealtime() {
    if (communityChannel || communityStarting || !sb) return;
    communityStarting = true;
    communityChannel = sb
      .channel("vicam-community-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, scheduleCommunityRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "comment_replies" }, scheduleCommunityRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "comment_likes" }, scheduleCommunityRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") communityStarting = false;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          communityStarting = false;
        }
      });
  }

  function hitRate(key, limit, windowMs) {
    let table = {};
    try {
      table = JSON.parse(sessionStorage.getItem(RATE_KEY) || "{}");
    } catch {
      table = {};
    }
    const t = now();
    const arr = (table[key] || []).filter((x) => t - x < windowMs);
    if (arr.length >= limit) return false;
    arr.push(t);
    table[key] = arr;
    try {
      sessionStorage.setItem(RATE_KEY, JSON.stringify(table));
    } catch (_) {}
    return true;
  }

  function publicError(err, fallback) {
    const raw = String((err && (err.message || err.error_description || err.msg)) || "");
    const leaked =
      /column |relation |permission denied|row-level security|PGRST|inbox\.|does not exist|JWT|apikey/i.test(
        raw
      );
    const e = new Error(leaked ? fallback || "Không thực hiện được." : raw || fallback || "Không thực hiện được.");
    if (err && err.code && !leaked) e.code = err.code;
    return e;
  }

  function throwHttp(err, fallback) {
    throw publicError(err, fallback);
  }

  function persist(fn) {
    const run = persistQueue.then(fn);
    persistQueue = run.catch((err) => {
      console.error("[VCBG persist]", err);
    });
    return run;
  }

  function isRateLimitError(err) {
    const status = Number(err && (err.status || err.statusCode));
    const code = String((err && err.code) || "").toLowerCase();
    const message = String((err && err.message) || "").toLowerCase();
    return status === 429 || code.indexOf("rate_limit") !== -1 ||
      message.indexOf("rate limit") !== -1 || message.indexOf("too many requests") !== -1;
  }

  async function retryRateLimited(operation) {
    const delays = [2000, 4000, 8000, 15000];
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await operation();
      } catch (err) {
        if (!isRateLimitError(err) || attempt >= delays.length) throw err;
        await new Promise((resolve) => global.setTimeout(resolve, delays[attempt]));
      }
    }
  }

  let bgQueue = Promise.resolve();
  function persistBg(fn) {
    const run = bgQueue.then(fn);
    bgQueue = run.catch((err) => {
      console.error("[VCBG persist bg]", err);
    });
    return run;
  }

  function normalizeRole(role) {
    return role === "admin" ? "admin" : "reader";
  }

  function profileOf(userId) {
    return cache.profiles.find((p) => p.user_id === userId || p.id === userId) || null;
  }

  function currentUser() {
    if (!sessionUser) return null;
    const p = cache.profiles.find((x) => x.id === sessionUser.id || x.user_id === sessionUser.id);
    if (p && p.status && p.status !== "active") return null;
    const id = (p && (p.id || p.user_id)) || sessionUser.id;
    const email = (p && p.email) || sessionUser.email || "";
    /* The verified Supabase session email is authoritative for the sole owner.
       Server-side RLS still makes the final authorization decision. */
    const ownerSession =
      String(sessionUser.email || "").trim().toLowerCase() === OWNER_EMAIL &&
      !!sessionUser.email_confirmed_at;
    const role = ownerSession ? "admin" : normalizeRole(p && p.role);
    const display = (p && p.display_name) || email.split("@")[0] || "Độc giả";
    const googleMeta = (sessionUser && sessionUser.user_metadata) || {};
    const googleAvatar = String((p && p.google_avatar) || googleMeta.avatar_url || googleMeta.picture || "");
    return {
      id,
      email,
      role,
      status: (p && p.status) || "active",
      created_at: p && p.created_at,
      profile: {
        id,
        user_id: id,
        display_name: display,
        avatar: (p && p.avatar) || display.slice(0, 1).toUpperCase(),
        google_avatar: /^https:\/\//i.test(googleAvatar) ? googleAvatar : "",
        bio: (p && p.bio) || "",
      },
    };
  }

  function requireUser() {
    const u = currentUser();
    if (!u) {
      const err = new Error("Cần đăng nhập để thực hiện thao tác này.");
      err.code = "AUTH_REQUIRED";
      throw err;
    }
    return u;
  }

  function requireAdmin() {
    const u = requireUser();
    if (u.role !== "admin") {
      const err = new Error("Bạn không có quyền quản trị.");
      err.code = "FORBIDDEN";
      throw err;
    }
    return u;
  }

  function isAdmin() {
    const u = currentUser();
    return !!(u && u.role === "admin");
  }

  function storyStats(storyId) {
    const chapters = cache.chapters.filter((c) => c.story_id === storyId && c.status === "published");
    const rpc = cache.story_stats[storyId] || {};
    const likes =
      rpc.likes != null
        ? Number(rpc.likes)
        : cache.chapter_likes.filter((l) => chapters.some((c) => c.id === l.chapter_id)).length;
    const ratings = cache.ratings.filter((r) => r.story_id === storyId);
    const avg =
      rpc.rating_avg != null
        ? Number(rpc.rating_avg)
        : ratings.length === 0
          ? 0
          : ratings.reduce((a, r) => a + r.stars, 0) / ratings.length;
    const views = rpc.views != null ? Number(rpc.views) : cache.views.filter((v) => v.story_id === storyId).length;
    const last = chapters.slice().sort((a, b) => b.number - a.number)[0];
    return {
      chapter_count: chapters.length,
      likes,
      rating_avg: Math.round(avg * 10) / 10,
      rating_count: ratings.length,
      views,
      latest_chapter: last || null,
    };
  }

  function hydrateStory(story) {
    if (!story) return null;
    const genres = cache.story_genres
      .filter((x) => x.story_id === story.id)
      .map((x) => cache.genres.find((g) => g.id === x.genre_id))
      .filter(Boolean);
    const tags = cache.story_tags
      .filter((x) => x.story_id === story.id)
      .map((x) => cache.tags.find((t) => t.id === x.tag_id))
      .filter(Boolean);
    return { ...story, genres, tags, stats: storyStats(story.id) };
  }

  function isStoryPublic(story) {
    return !!story && story.published !== false;
  }

  function settle(q, ms, label) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error("Hết thời gian tải " + (label || "dữ liệu") + "."));
      }, ms);
      Promise.resolve(q).then(
        (value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  function withTimeout(promise, ms, label) {
    return settle(promise, ms, label);
  }

  async function loadTable(name, extra) {
    let q = sb.from(name).select("*");
    if (extra) q = extra(q);
    const { data, error } = await settle(q, 7000, name);
    if (error) throwHttp(error, "Không tải được " + name);
    return data || [];
  }

  function loadOptional(name, extra) {
    return loadTable(name, extra).catch((err) => {
      console.warn("[VCBG optional]", name, err && err.message);
      return [];
    });
  }

  async function loadCommunityProfiles() {
    /* The public profile view omits private account fields such as status.
       Admin screens must keep using the authoritative member RPC. */
    if (isAdmin()) {
      const { data, error } = await settle(sb.rpc("admin_list_members"), 7000, "danh sách thành viên");
      if (error) throwHttp(error, "Không tải được danh sách thành viên.");
      return data || [];
    }
    const publicRows = await loadOptional("public_profiles");
    return publicRows && publicRows.length ? publicRows : loadOptional("profiles");
  }

  let bootstrapped = false;
  let bootPromise = null;
  let authReadyPromise = null;
  let publicSyncPromise = null;
  let publicSyncedAt = 0;

  function publicCatalogVersion() {
    const storyVersion = cache.stories.reduce((max, row) => Math.max(max, Number(row.updated_at || 0)), 0);
    const chapterVersion = cache.chapters.reduce((max, row) => Math.max(max, Number(row.updated_at || 0)), 0);
    return [cache.stories.length, storyVersion, cache.chapters.length, chapterVersion].join(":");
  }

  async function loadOwnProfile() {
    if (!sessionUser) return;
    try {
      const mine = await loadTable("profiles", (q) => q.eq("user_id", sessionUser.id));
      if (mine && mine[0]) {
        const p = {
          ...mine[0],
          id: mine[0].user_id,
          user_id: mine[0].user_id,
          created_at: toMs(mine[0].created_at),
        };
        cache.profiles = cache.profiles.filter((x) => x.id !== p.id && x.user_id !== p.id).concat([p]);
        cache.users = cache.profiles.map((x) => ({
          id: x.id,
          email: x.email,
          role: x.role,
          status: x.status || "active",
          created_at: x.created_at,
        }));
      }
    } catch (_) {}
  }

  const SNAP_KEY = "vicambachgiai.catalog.v1";
  const SNAP_MAX_AGE = 12 * 60 * 60 * 1000;

  function applyCatalog(payload) {
    if (!payload) return false;
    cache.profiles = payload.profiles || [];
    cache.users = payload.users || [];
    cache.genres = payload.genres || [];
    cache.tags = payload.tags || [];
    cache.stories = payload.stories || [];
    cache.story_genres = payload.story_genres || [];
    cache.story_tags = payload.story_tags || [];
    // A device snapshot may contain an old chapter body from earlier builds.
    // Keep only chapter metadata here; the reader always requests the shared
    // server copy before displaying a chapter.
    cache.chapters = mapChapters(payload.chapters || []).map((chapter) => ({
      ...chapter,
      body: "",
      content: undefined,
    }));
    cache.comments = payload.comments || [];
    cache.comment_replies = payload.comment_replies || [];
    cache.comment_likes = payload.comment_likes || [];
    cache.chapter_likes = payload.chapter_likes || [];
    cache.ratings = payload.ratings || [];
    cache.story_stats = payload.story_stats || {};
    cache.poll_votes = payload.poll_votes || [];
    cache.site_settings = Object.assign(emptySettings(), payload.site_settings || {});
    cache.ready = true;
    return !!(cache.stories && cache.stories.length);
  }

  function readSnap() {
    try {
      const raw = storeGet(SNAP_KEY);
      if (!raw) return null;
      const snap = JSON.parse(raw);
      if (!snap || !snap.at || now() - snap.at > SNAP_MAX_AGE) return null;
      return snap;
    } catch (_) {
      return null;
    }
  }

  function writeSnap() {
    try {
      storeSet(
        SNAP_KEY,
        JSON.stringify({
          at: now(),
          profiles: cache.profiles,
          users: cache.users,
          genres: cache.genres,
          tags: cache.tags,
          stories: cache.stories,
          story_genres: cache.story_genres,
          story_tags: cache.story_tags,
          chapters: cache.chapters.map((chapter) => ({
            id: chapter.id,
            story_id: chapter.story_id,
            number: chapter.number,
            chapter_number: chapter.number,
            title: chapter.title,
            status: chapter.status,
            publish_at: chapter.publish_at,
            published_at: chapter.published_at,
            created_at: chapter.created_at,
            updated_at: chapter.updated_at,
            audio_url: chapter.audio_url,
            audio_cover_url: chapter.audio_cover_url,
            audio_title: chapter.audio_title,
            audio_duration_seconds: chapter.audio_duration_seconds,
            youtube_audio_url: chapter.youtube_audio_url,
            notify_edit_at: chapter.notify_edit_at,
          })),
          comments: cache.comments,
          comment_replies: cache.comment_replies,
          comment_likes: cache.comment_likes,
          chapter_likes: cache.chapter_likes,
          ratings: cache.ratings,
          story_stats: cache.story_stats,
          poll_votes: cache.poll_votes,
          site_settings: cache.site_settings,
        })
      );
    } catch (_) {}
  }

  function mapStories(stories) {
    return (stories || []).map((s) => ({
      ...s,
      cover: s.cover || s.cover_url || "",
      description: s.description || "",
      home_priority: Number(s.home_priority) > 0 ? Number(s.home_priority) : null,
      created_at: toMs(s.created_at),
      updated_at: toMs(s.updated_at),
    }));
  }
  function mapChapters(chapters) {
    return (chapters || []).map((c) => ({
      ...c,
      number: Number(c.number || c.chapter_number || 0),
      body: c.body != null ? c.body : c.content || "",
      publish_at: c.publish_at ? toMs(c.publish_at) : null,
      published_at: c.published_at ? toMs(c.published_at) : null,
      created_at: toMs(c.created_at),
      updated_at: toMs(c.updated_at),
    }));
  }

  function normalizeYouTubeLink(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      let id = "";
      if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
      else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
        id = url.searchParams.get("v") || "";
        if (!id) {
          const parts = url.pathname.split("/").filter(Boolean);
          if (["shorts", "embed", "live"].includes(parts[0])) id = parts[1] || "";
        }
      }
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error("invalid");
      return `https://www.youtube.com/watch?v=${id}`;
    } catch (_) {
      throw new Error("Liên kết YouTube không hợp lệ. Hãy dùng link video đầy đủ, youtu.be hoặc YouTube Shorts.");
    }
  }

  async function refreshCatalog() {
    const stories = await loadTable("stories");
    cache.stories = mapStories(stories);
    cache.ready = true;
    await fillCatalogRest(stories);
    publicSyncedAt = now();
  }

  async function fillCatalogRest(stories) {
    try {
      const chapterIndexColumns = currentUser()
        ? "id,story_id,number,chapter_number,title,status,publish_at,published_at,created_at,updated_at,audio_url,audio_cover_url,audio_title,audio_duration_seconds,youtube_audio_url,notify_edit_at"
        : "id,story_id,number,chapter_number,title,status,publish_at,published_at,created_at,updated_at,notify_edit_at";
    const [genres, tags, story_genres, story_tags, chapters, settingsRows] = await Promise.all([
      loadOptional("genres"),
      loadOptional("tags"),
      loadOptional("story_genres"),
      loadOptional("story_tags"),
      settle(
        sb
          .from("chapters")
          .select(chapterIndexColumns),
        7000,
        "chapters"
      )
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        })
        .catch((err) => {
          console.warn("[VCBG optional] chapters", err && err.message);
          return cache.chapters || [];
        }),
      loadOptional("site_settings"),
    ]);

    cache.genres = genres || [];
    cache.tags = tags || [];
    cache.stories = mapStories(stories);
    cache.story_genres = story_genres || [];
    cache.story_tags = story_tags || [];
    cache.chapters = mapChapters(chapters);
    const settings = (settingsRows && settingsRows[0]) || {};
    cache.site_settings = Object.assign(emptySettings(), {
      name: settings.name,
      tagline: settings.tagline,
      allow_comments: settings.allow_comments,
      allow_registration: settings.allow_registration,
      site_mode: ["normal", "readonly", "maintenance"].includes(settings.site_mode) ? settings.site_mode : "normal",
      maintenance_message: settings.maintenance_message || "",
      maintenance_until: settings.maintenance_until || null,
      mode_reason: settings.mode_reason || "",
      mode_updated_at: settings.mode_updated_at || null,
      mode_updated_by: settings.mode_updated_by || null,
      social: settings.social || emptySettings().social,
      featured_quote: settings.featured_quote || null,
      poll: settings.poll || emptySettings().poll,
      seeded: !!settings.seeded,
    });
    cache.ready = true;
    writeSnap();

    Promise.all([
      loadCommunityProfiles(),
      loadOptional("comments"),
      loadOptional("comment_replies"),
      loadOptional("comment_likes"),
      loadOptional("chapter_likes"),
      loadOptional("ratings"),
      loadOptional("poll_votes"),
      withTimeout(Promise.resolve(sb.rpc("get_story_stats")), 8000, "thống kê")
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        })
        .catch((err) => {
          console.warn("[VCBG optional] stats", err && err.message);
          return [];
        }),
    ])
      .then(
        ([
          profiles,
          comments,
          comment_replies,
          comment_likes,
          chapter_likes,
          ratings,
          poll_votes,
          storyStatsRows,
        ]) => {
          cache.profiles = (profiles || []).map((p) => {
            const id = p.user_id || p.id;
            return { ...p, id, user_id: id, created_at: toMs(p.created_at) };
          });
          cache.users = cache.profiles.map((p) => ({
            id: p.id,
            email: p.email,
            role: p.role,
            status: p.status === "banned" ? "banned" : "active",
            created_at: p.created_at,
          }));
          cache.comments = (comments || []).map((c) => ({
            ...c,
            likes: (comment_likes || []).filter((l) => l.comment_id === c.id).map((l) => l.user_id),
            created_at: toMs(c.created_at),
          }));
          cache.comment_replies = (comment_replies || []).map((r) => ({
            ...r,
            created_at: toMs(r.created_at),
          }));
          cache.comment_likes = comment_likes || [];
          cache.chapter_likes = (chapter_likes || []).map((l) => ({
            ...l,
            id: l.id || l.user_id + ":" + l.chapter_id,
            at: toMs(l.at || l.created_at),
          }));
          cache.ratings = (ratings || []).map((r) => ({
            ...r,
            id: r.id || r.user_id + ":" + r.story_id,
            at: toMs(r.at || r.created_at),
          }));
          cache.story_stats = {};
          (storyStatsRows || []).forEach((row) => {
            cache.story_stats[row.story_id] = row;
          });
          cache.poll_votes = (poll_votes || []).map((v) => ({
            ...v,
            at: toMs(v.at || v.created_at),
          }));
          writeSnap();
        }
      )
      .catch((err) => console.warn("[VCBG extras]", err && err.message));
    } catch (err) {
      console.warn("[VCBG catalog rest]", err && err.message);
    }
  }

  async function refreshAccount() {
    if (!sessionUser) {
      cache.favorites = [];
      cache.follows = [];
      cache.reading_progress = [];
      cache.reading_history = [];
      cache.notifications = [];
      cache.inbox = [];
      cache.views = [];
      return;
    }
    const uid_ = sessionUser.id;
    await loadOwnProfile();
    if (isAdmin()) {
      const { data: all, error: memberError } = await settle(
        sb.rpc("admin_list_members"),
        7000,
        "danh sách thành viên"
      );
      if (memberError) throwHttp(memberError, "Không tải được danh sách thành viên.");
      cache.profiles = (all || []).map((p) => ({
        ...p,
        id: p.user_id || p.id,
        user_id: p.user_id || p.id,
        created_at: toMs(p.created_at),
      }));
      cache.users = cache.profiles.map((x) => ({
        id: x.id,
        email: x.email,
        role: x.role,
        status: x.status || "active",
        created_at: x.created_at,
      }));
    }
    const [favorites, follows, reading_progress, reading_history, notifications, inbox] = await Promise.all([
      loadTable("favorites", (q) => q.eq("user_id", uid_)),
      loadTable("follows", (q) => q.eq("user_id", uid_)),
      loadTable("reading_progress", (q) => q.eq("user_id", uid_)),
      loadTable("reading_history", (q) => q.eq("user_id", uid_).order("read_at", { ascending: false }).limit(80)),
      loadTable("notifications", (q) => q.eq("user_id", uid_).order("created_at", { ascending: false }).limit(60)),
      isAdmin() ? loadTable("inbox", (q) => q.order("created_at", { ascending: false }).limit(300)) : Promise.resolve([]),
    ]);
    cache.favorites = (favorites || []).map((f) => ({
      ...f,
      id: f.id || f.user_id + ":" + f.story_id,
      at: toMs(f.at || f.created_at),
    }));
    cache.follows = (follows || []).map((f) => ({
      ...f,
      id: f.id || f.user_id + ":" + f.story_id,
      at: toMs(f.at || f.created_at),
    }));
    cache.reading_progress = (reading_progress || []).map((p) => ({
      ...p,
      id: p.id || p.user_id + ":" + p.story_id,
      chapter_number: Number(p.chapter_number || 0),
      scroll: Number(p.scroll || 0),
      at: toMs(p.at || p.updated_at),
    }));
    cache.reading_history = (reading_history || []).map((h) => ({
      ...h,
      chapter_number: Number(h.chapter_number || 0),
      at: toMs(h.at || h.read_at),
    }));
    cache.notifications = (notifications || []).map((n) => ({
      ...n,
      at: toMs(n.at || n.created_at),
    }));
    cache.inbox = (inbox || []).map((m) => ({
      ...m,
      at: toMs(m.at || m.created_at),
    }));
    if (isAdmin()) {
      try {
        const views = await loadTable("views");
        cache.views = (views || []).map((v) => ({
          ...v,
          at: toMs(v.at || v.created_at),
        }));
      } catch (_) {
        cache.views = [];
      }
    }
  }

  async function refresh() {
    await refreshCatalog();
    await withTimeout(refreshAccount(), 6000, "tài khoản").catch((err) => {
      console.warn("[VCBG account]", err && err.message);
    });
  }

  function authFingerprint() {
    const u = currentUser();
    return u ? [u.id, u.role, u.status, u.profile && u.profile.avatar].join("|") : "";
  }

  function emitAuthState() {
    const user = currentUser();
    authStateListeners.forEach((listener) => {
      try { listener(user); } catch (_) {}
    });
  }

  const LOCKED_ACCOUNT_MESSAGE = "Tài khoản đã bị khóa, không thể đăng nhập website.";

  function stopAccountStatusMonitor() {
    if (accountStatusTimer) global.clearInterval(accountStatusTimer);
    accountStatusTimer = null;
    monitoredAccountId = "";
    if (accountStatusChannel && sb) {
      const channel = accountStatusChannel;
      accountStatusChannel = null;
      Promise.resolve(sb.removeChannel(channel)).catch(() => {});
    }
  }

  async function rejectLockedAccount({ announce = false } = {}) {
    if (!sessionUser) return false;
    const p = profileOf(sessionUser.id);
    if (!p || p.status !== "banned") return false;
    stopAccountStatusMonitor();
    storeDel(SESSION_KEY);
    try {
      /* The blocked member's own session can revoke all of their refresh
         tokens, signing the same account out on its other devices too. */
      await sb.auth.signOut({ scope: "global" });
    } catch (_) {
      try { await sb.auth.signOut({ scope: "local" }); } catch (_) {}
    }
    sessionUser = null;
    emitAuthState();
    if (announce) {
      try {
        global.dispatchEvent(new CustomEvent("vcbg:account-blocked", {
          detail: { message: LOCKED_ACCOUNT_MESSAGE },
        }));
      } catch (_) {}
    }
    return true;
  }

  function startAccountStatusMonitor() {
    if (!sessionUser || !sb) return;
    const userId = sessionUser.id;
    if (monitoredAccountId === userId) return;
    stopAccountStatusMonitor();
    monitoredAccountId = userId;

    const check = async () => {
      if (!sessionUser || sessionUser.id !== userId) return;
      await loadOwnProfile();
      await rejectLockedAccount({ announce: true });
    };
    accountStatusTimer = global.setInterval(() => {
      check().catch(() => {});
    }, 30000);
    accountStatusChannel = sb
      .channel("vcbg-account-status-" + userId)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "profiles",
        filter: "user_id=eq." + userId,
      }, (payload) => {
        const next = payload && payload.new;
        if (next && next.status === "banned") {
          const p = profileOf(userId);
          if (p) p.status = "banned";
          rejectLockedAccount({ announce: true }).catch(() => {});
        }
      })
      .subscribe();
  }

  function startAuthSubscription() {
    if (authSubscriptionStarted || !sb) return;
    authSubscriptionStarted = true;
    sb.auth.onAuthStateChange((_event, session) => {
      const nextUser = (session && session.user) || null;
      global.setTimeout(async () => {
        const before = authFingerprint();
        sessionUser = nextUser;
        if (sessionUser) {
          try { await loadOwnProfile(); } catch (err) {
            console.warn("[VCBG auth profile]", err && err.message);
          }
          if (!(await rejectLockedAccount({ announce: true }))) {
            storeSet(SESSION_KEY, JSON.stringify({ userId: sessionUser.id, at: now() }));
            startAccountStatusMonitor();
          }
        } else {
          stopAccountStatusMonitor();
          storeDel(SESSION_KEY);
        }
        restartPublicPresenceForIdentityChange();
        if (before !== authFingerprint()) emitAuthState();
      }, 0);
    });
  }

  async function syncSession() {
    try {
      const { data, error } = await sb.auth.getSession();
      if (error) {
        console.warn(error);
        return sessionUser;
      }
      sessionUser = (data && data.session && data.session.user) || null;
    } catch (err) {
      console.warn(err);
      return sessionUser;
    }
    if (sessionUser) storeSet(SESSION_KEY, JSON.stringify({ userId: sessionUser.id, at: now() }));
    else storeDel(SESSION_KEY);
    return sessionUser;
  }

  const AUTH_URL_KEYS = new Set([
    "access_token",
    "refresh_token",
    "provider_token",
    "provider_refresh_token",
    "token",
    "token_hash",
    "code",
  ]);

  function scrubAuthSecretsFromUrl() {
    try {
      const url = new URL(global.location.href);
      let changed = false;

      [...url.searchParams.keys()].forEach((key) => {
        if (AUTH_URL_KEYS.has(String(key).toLowerCase())) {
          url.searchParams.delete(key);
          changed = true;
        }
      });

      const rawHash = String(url.hash || "").replace(/^#/, "");
      const hashParams = new URLSearchParams(rawHash.startsWith("/") ? "" : rawHash);
      const hashHasSecret = [...hashParams.keys()].some((key) => AUTH_URL_KEYS.has(String(key).toLowerCase()));
      if (hashHasSecret) {
        // Old/shared OAuth links must never be accepted as a browser session.
        url.hash = "#/";
        changed = true;
      }

      if (changed) global.history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch (_) {}
  }

  // Mobile Safari (in particular its pull-to-refresh reload) can serve a
  // stale cached response for a GET request that was already made with the
  // same URL, even after a fresh page load — Supabase's REST reads never
  // set Cache-Control themselves, so without this, a just-reloaded page can
  // show data (e.g. notifications) that's already out of date.
  function noStoreFetch(input, init) {
    return global.fetch(input, Object.assign({}, init, { cache: "no-store" }));
  }

  function client() {
    if (sb) return sb;
    const url = cfg().supabaseUrl;
    const key = cfg().supabaseAnonKey;
    if (!url || !key || !global.supabase) {
      throw new Error("Thiếu cấu hình Supabase. Điền js/config.js rồi deploy lại.");
    }
    scrubAuthSecretsFromUrl();
    sb = global.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { fetch: noStoreFetch },
    });
    startAuthSubscription();
    return sb;
  }

  const api = {
    currentUser,
    isAdmin,

    // Reuse the single authenticated Supabase client across optional UI modules.
    supabaseClient() {
      return client();
    },

    whenReady() {
      return bootPromise || Promise.resolve();
    },

    async verifyAdminAccess() {
      client();
      try {
        // getUser() validates the token with the Auth server; getSession() only
        // reads the locally cached session and is insufficient for admin access.
        const { data, error } = await sb.auth.getUser();
        if (error || !data || !data.user) return false;
        sessionUser = data.user;
        await loadOwnProfile();
        return isAdmin();
      } catch (_) {
        return false;
      }
    },

    async syncPublicContent({ maxAge = 5000 } = {}) {
      client();
      if (publicSyncPromise) return publicSyncPromise;
      if (publicSyncedAt && now() - publicSyncedAt < Math.max(0, Number(maxAge) || 0)) return false;
      const before = publicCatalogVersion();
      const pending = refreshCatalog().then(() => publicCatalogVersion() !== before);
      publicSyncPromise = pending;
      try {
        return await pending;
      } finally {
        if (publicSyncPromise === pending) publicSyncPromise = null;
      }
    },

    publicSiteStats() {
      return { ...publicMetrics };
    },

    watchPublicSiteStats(listener) {
      if (typeof listener !== "function") return () => {};
      publicMetricListeners.add(listener);
      listener({ ...publicMetrics });
      startPublicMetrics();
      return () => publicMetricListeners.delete(listener);
    },

    watchAuthState(listener) {
      if (typeof listener !== "function") return () => {};
      authStateListeners.add(listener);
      return () => authStateListeners.delete(listener);
    },

    watchCommunityFeed(listener) {
      if (typeof listener !== "function") return () => {};
      communityListeners.add(listener);
      startCommunityRealtime();
      /* Refresh once on subscription so cached anonymous placeholders are
         replaced as soon as the public profile projection is available. */
      scheduleCommunityRefresh();
      return () => {
        communityListeners.delete(listener);
        if (!communityListeners.size && communityChannel) {
          const channel = communityChannel;
          communityChannel = null;
          communityStarting = false;
          Promise.resolve(sb.removeChannel(channel)).catch(() => {});
        }
      };
    },

    async init() {
      client();
      // Presence is site-wide: visitors who open a shared story/chapter link
      // directly must be counted too, not only visitors who render the home
      // page's resonance panel.
      startPublicMetrics();
      if (bootstrapped) return;
      const snap = readSnap();
      if (snap) applyCatalog(snap);
      if (!bootPromise) {
        /* Resolve the persisted Supabase session and the live profile before any
           cached public page is allowed to paint its account controls. */
        const authPending = (async () => {
          try {
            await settle(syncSession(), 3000, "phiên");
            if (sessionUser) {
              await settle(loadOwnProfile(), 3000, "hồ sơ");
              if (!(await rejectLockedAccount({ announce: true }))) startAccountStatusMonitor();
            }
          } catch (err) {
            console.warn("[VCBG auth restore]", err && err.message);
          }
        })();
        authReadyPromise = authPending;
        const pending = (async () => {
          await authPending;
          try {
            Promise.resolve(sb.rpc("publish_due_chapters")).then(
              () => {},
              () => {}
            );
          } catch (_) {}
          await refresh();
          bootstrapped = true;
        })();
        bootPromise = pending;
        pending.then(
          () => {},
          (err) => console.error("[VCBG boot]", err)
        );
        pending.then(
          () => {
            if (bootPromise === pending) bootPromise = null;
          },
          () => {
            if (bootPromise === pending) bootPromise = null;
          }
        );
      }
      /* Admin authorization must come from the live Supabase session/profile.
         Public pages may paint from the local story snapshot immediately, but an
         admin route must wait for syncSession() + loadOwnProfile() so a forged
         localStorage catalog can never unlock the admin UI. */
      const adminRoute = /^#\/admin(?:\/|\?|$)/.test(global.location.hash || "");
      /* Cached stories may render immediately, but account controls must wait
         until Supabase has restored the shared browser session. */
      try {
        await settle(authReadyPromise || Promise.resolve(), 6500, "phiên");
      } catch (_) {}
      if (cache.stories && cache.stories.length && !adminRoute) return;
      try {
        await settle(bootPromise || Promise.resolve(), 8000, "thư viện");
      } catch (err) {
        if (cache.stories && cache.stories.length) return;
        throw err;
      }
      bootstrapped = !!(cache.stories && cache.stories.length);
    },

    settings() {
      return cache.site_settings;
    },

    updateSettings(patch) {
      requireAdmin();
      Object.assign(cache.site_settings, patch);
      const row = {
        name: cache.site_settings.name,
        tagline: cache.site_settings.tagline,
        allow_comments: cache.site_settings.allow_comments,
        allow_registration: cache.site_settings.allow_registration,
        site_mode: cache.site_settings.site_mode,
        maintenance_message: cache.site_settings.maintenance_message,
        maintenance_until: cache.site_settings.maintenance_until,
        mode_reason: cache.site_settings.mode_reason,
        mode_updated_at: cache.site_settings.mode_updated_at,
        mode_updated_by: cache.site_settings.mode_updated_by,
        social: cache.site_settings.social,
        featured_quote: cache.site_settings.featured_quote,
        poll: cache.site_settings.poll,
      };
      persist(async () => {
        const { error } = await sb.from("site_settings").update(row).eq("id", 1);
        if (error) throw error;
      });
      return cache.site_settings;
    },

    async updateSiteMode(patch) {
      const admin = requireAdmin();
      const verified = await sb.auth.getUser();
      if (verified.error || !verified.data || !verified.data.user || verified.data.user.id !== admin.id) {
        const err = new Error("Phiên Admin đã hết hạn. Hãy đăng nhập lại.");
        err.code = "AUTH_REQUIRED";
        throw err;
      }
      const allowed = ["normal", "readonly", "maintenance"];
      const nextMode = allowed.includes(patch && patch.site_mode) ? patch.site_mode : "normal";
      const previous = { ...cache.site_settings };
      const row = {
        site_mode: nextMode,
        maintenance_message: nextMode === "maintenance" ? String(patch.maintenance_message || "").slice(0, 240) : "",
        maintenance_until: nextMode === "maintenance" ? (patch.maintenance_until || null) : null,
        mode_reason: String(patch.mode_reason || "").trim().slice(0, 160),
        mode_updated_at: new Date().toISOString(),
        mode_updated_by: admin.id,
      };
      Object.assign(cache.site_settings, row);
      const { data, error } = await sb.from("site_settings").update(row).eq("id", 1).select("site_mode,maintenance_message,maintenance_until,mode_reason,mode_updated_at,mode_updated_by").single();
      if (error) {
        cache.site_settings = previous;
        throwHttp(error, "Không thay đổi được trạng thái website.");
      }
      Object.assign(cache.site_settings, data || row);
      writeSnap();
      return cache.site_settings;
    },

    listGenres() {
      return cache.genres.slice();
    },
    listTags() {
      return cache.tags.slice();
    },

    async accessToken() {
      if (!sb) return "";
      const { data, error } = await sb.auth.getSession();
      if (error) throwHttp(error, "Không đọc được phiên quản trị.");
      return (data && data.session && data.session.access_token) || "";
    },

    async register({ email, password, display_name }) {
      if (!cache.site_settings.allow_registration) throw new Error("Hiện không mở đăng ký.");
      email = String(email || "").trim().toLowerCase();
      display_name = String(display_name || "").trim();
      if (!email || !email.includes("@")) throw new Error("Email không hợp lệ.");
      if (!password || password.length < 8) throw new Error("Mật khẩu cần ít nhất 8 ký tự.");
      if (!display_name) throw new Error("Cần tên hiển thị.");
      if (!hitRate("register:" + email, 5, 10 * 60 * 1000)) throw new Error("Thử lại sau ít phút.");
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { display_name } },
      });
      if (error) throwHttp(error, "Không đăng ký được.");
      sessionUser = (data && data.user) || (data && data.session && data.session.user) || null;
      if (!sessionUser) throw new Error("Đăng ký xong nhưng cần xác nhận email trước khi vào thư viện.");
      await sb.from("profiles").upsert({
        user_id: sessionUser.id,
        email,
        display_name,
        avatar: display_name.slice(0, 1).toUpperCase(),
        bio: "",
      });
      await refresh();
      return currentUser();
    },

    async loginWithGoogle({ redirectTo } = {}) {
      const fallback = location.origin + location.pathname;
      const { data, error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo || fallback,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throwHttp(error, "Không thể mở đăng nhập Google.");
      return data;
    },

    async loginWithGoogleIdToken({ token, nonce } = {}) {
      if (!token) throw new Error("Google chưa trả thông tin đăng nhập.");
      const credentials = { provider: "google", token };
      if (nonce) credentials.nonce = nonce;
      const { data, error } = await sb.auth.signInWithIdToken(credentials);
      if (error) throwHttp(error, "Không thể đăng nhập bằng Google.");
      sessionUser = data.user;
      try {
        await loadOwnProfile();
        if (!bootstrapped) await refresh();
      } catch (_) {}
      if (await rejectLockedAccount()) throw new Error(LOCKED_ACCOUNT_MESSAGE);
      startAccountStatusMonitor();
      return currentUser();
    },

    async login({ email, password }) {
      email = String(email || "").trim().toLowerCase();
      if (!hitRate("login:" + email, 8, 10 * 60 * 1000)) throw new Error("Quá nhiều lần thử. Đợi vài phút.");
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throwHttp(error, "Không thể đăng nhập. Vui lòng kiểm tra thông tin và thử lại.");
      sessionUser = data.user;
      try {
        await loadOwnProfile();
        if (!bootstrapped) await refresh();
        else await loadOwnProfile();
      } catch (err) {
        console.error("[VCBG login refresh]", err);
      }
      if (await rejectLockedAccount()) throw new Error(LOCKED_ACCOUNT_MESSAGE);
      const u = currentUser();
      if (!u) throw new Error("Không thể đăng nhập. Vui lòng thử lại.");
      startAccountStatusMonitor();
      return u;
    },

    logout() {
      sessionUser = null;
      stopAccountStatusMonitor();
      storeDel(SESSION_KEY);
      persist(async () => {
        await sb.auth.signOut();
      });
    },

    async requestReset(email) {
      email = String(email || "").trim().toLowerCase();
      if (!hitRate("reset:" + email, 3, 15 * 60 * 1000)) throw new Error("Đã gửi quá nhiều mã. Thử lại sau.");
      const redirectTo = location.origin + location.pathname + "#/quen-mat-khau";
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throwHttp(error, "Không gửi được email đặt lại mật khẩu.");
      return {
        ok: true,
        message: "Nếu email tồn tại, hộp thư sẽ có liên kết đặt lại mật khẩu trong vài phút.",
      };
    },

    async confirmReset({ password }) {
      if (!password || password.length < 8) throw new Error("Mật khẩu mới cần ít nhất 8 ký tự.");
      const { data, error } = await sb.auth.updateUser({ password });
      if (error) throwHttp(error, "Không đổi được mật khẩu. Mở lại từ liên kết trong email.");
      sessionUser = data.user;
      await refresh();
      return currentUser();
    },

    async updateProfile(patch) {
      const u = requireUser();
      if (patch.avatar === "vca:16" && u.role !== "admin") {
        throw new Error("Avatar này chỉ dành cho quản trị viên.");
      }
      const p = cache.profiles.find((x) => x.id === u.id);
      if (!p) throw new Error("Không tìm thấy hồ sơ.");
      const next = {
        display_name: patch.display_name ? String(patch.display_name).trim() : p.display_name,
        bio: patch.bio !== undefined ? String(patch.bio).slice(0, 400) : p.bio,
        avatar: patch.avatar !== undefined ? String(patch.avatar) : p.avatar,
      };
      const { error } = await sb.from("profiles").update(next).eq("user_id", u.id);
      if (error) throw publicError(error, "Không lưu được hồ sơ.");
      p.display_name = next.display_name;
      p.bio = next.bio;
      p.avatar = next.avatar;
      writeSnap();
      return currentUser();
    },

    listStories({ status, featured, upcoming, q, genre, tag, sort } = {}) {
      let list = cache.stories.filter(isStoryPublic);
      if (status) list = list.filter((s) => s.status === status);
      if (featured) list = list.filter((s) => s.featured);
      if (upcoming) list = list.filter((s) => s.upcoming);
      if (q) {
        const n = q.toLowerCase();
        list = list.filter((s) => {
          const genres = cache.story_genres
            .filter((x) => x.story_id === s.id)
            .map((x) => cache.genres.find((g) => g.id === x.genre_id)?.name || "");
          const tags = cache.story_tags
            .filter((x) => x.story_id === s.id)
            .map((x) => cache.tags.find((t) => t.id === x.tag_id)?.name || "");
          return (
            String(s.title || "").toLowerCase().includes(n) ||
            String(s.author || "").toLowerCase().includes(n) ||
            genres.join(" ").toLowerCase().includes(n) ||
            tags.join(" ").toLowerCase().includes(n)
          );
        });
      }
      if (genre) {
        const g = cache.genres.find((x) => x.slug === genre || x.id === genre || x.name === genre);
        if (g) list = list.filter((s) => cache.story_genres.some((x) => x.story_id === s.id && x.genre_id === g.id));
      }
      if (tag) {
        const t = cache.tags.find((x) => x.slug === tag || x.id === tag || x.name === tag);
        if (t) list = list.filter((s) => cache.story_tags.some((x) => x.story_id === s.id && x.tag_id === t.id));
      }
      const hydrated = list.map(hydrateStory);
      if (sort === "updated") hydrated.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
      else if (sort === "views") hydrated.sort((a, b) => b.stats.views - a.stats.views);
      else if (sort === "likes") hydrated.sort((a, b) => b.stats.likes - a.stats.likes);
      else if (sort === "rating") hydrated.sort((a, b) => b.stats.rating_avg - a.stats.rating_avg);
      else if (sort === "az") hydrated.sort((a, b) => a.title.localeCompare(b.title, "vi"));
      return hydrated;
    },

    getStoryBySlug(slug) {
      return hydrateStory(cache.stories.find((s) => s.slug === slug && isStoryPublic(s)));
    },
    getStory(id) {
      return hydrateStory(cache.stories.find((s) => s.id === id));
    },
    storyCommentCount(storyId) {
      return cache.comments.filter((c) => c.story_id === storyId && c.status !== "hidden").length;
    },
    storiesByAuthor(author, exceptId) {
      if (!author) return [];
      const n = String(author).trim().toLowerCase();
      return cache.stories
        .filter((s) => isStoryPublic(s) && s.id !== exceptId && String(s.author || "").trim().toLowerCase() === n)
        .map(hydrateStory);
    },
    searchSuggest(q, limit) {
      if (!q) return [];
      return this.listStories({ q }).slice(0, limit || 6);
    },

    listChapters(storyId, { includeUnpublished, sort } = {}) {
      let list = cache.chapters.filter((c) => c.story_id === storyId);
      if (!includeUnpublished) list = list.filter((c) => c.status === "published");
      list.sort((a, b) => (sort === "desc" ? b.number - a.number : a.number - b.number));
      return list;
    },
    getChapter(storyId, number) {
      return (
        cache.chapters.find(
          (c) => c.story_id === storyId && c.number === Number(number) && c.status === "published"
        ) || null
      );
    },
    getChapterById(id) {
      return cache.chapters.find((c) => c.id === id) || null;
    },
    async ensureChapterBody(ch) {
      if (!ch) return ch;
      requireUser();
      const fallbackBody = ch.body || ch.content || "";
      let { data, error } = await sb.from("chapters").select("id,content,updated_at").eq("id", ch.id).maybeSingle();
      if (error && /42703|column .* does not exist/i.test(String(error.message || ""))) {
        ({ data, error } = await sb.from("chapters").select("id,body,updated_at").eq("id", ch.id).maybeSingle());
      }
      if (error && fallbackBody) {
        ch.body = fallbackBody;
        return ch;
      }
      if (error) throwHttp(error, "Không tải được chương.");
      if (!data) throw new Error("Không tìm thấy nội dung chương.");
      ch.body = data.content != null && data.content !== "" ? data.content : data.body || "";
      ch.updated_at = toMs(data.updated_at) || ch.updated_at;
      return ch;
    },

    recordView(storyId, chapterId) {
      const u = currentUser();
      const key = (u ? u.id : "guest") + ":" + chapterId;
      const recent = cache.views.find((v) => v.key === key && now() - v.at < 30 * 60 * 1000);
      if (recent) return;
      const rec = { id: uid(), key, story_id: storyId, chapter_id: chapterId, user_id: u ? u.id : null, at: now() };
      cache.views.push(rec);
      persistBg(async () => {
        const { error } = await sb.from("views").insert({
          id: rec.id,
          key: rec.key,
          story_id: rec.story_id,
          chapter_id: rec.chapter_id,
          user_id: rec.user_id,
          at: iso(rec.at),
        });
        if (error) throw error;
      });
    },

    saveProgress(storyId, chapterId, chapterNumber, scroll) {
      const u = currentUser();
      if (!u) {
        const guest = JSON.parse(storeGet(GUEST_PROGRESS) || "{}");
        guest[storyId] = { chapter_id: chapterId, chapter_number: chapterNumber, scroll: scroll || 0, at: now() };
        storeSet(GUEST_PROGRESS, JSON.stringify(guest));
        return;
      }
      let rec = cache.reading_progress.find((p) => p.user_id === u.id && p.story_id === storyId);
      if (!rec) {
        rec = { id: u.id + ":" + storyId, user_id: u.id, story_id: storyId };
        cache.reading_progress.push(rec);
      }
      rec.chapter_id = chapterId;
      rec.chapter_number = chapterNumber;
      rec.scroll = scroll || 0;
      rec.at = now();
      const hist = {
        id: uid(),
        user_id: u.id,
        story_id: storyId,
        chapter_id: chapterId,
        chapter_number: chapterNumber,
        at: now(),
      };
      cache.reading_history.unshift(hist);
      cache.reading_history = cache.reading_history.slice(0, 400);
      persistBg(async () => {
        const { error } = await sb.from("reading_progress").upsert({
          user_id: rec.user_id,
          story_id: rec.story_id,
          chapter_id: rec.chapter_id,
          chapter_number: rec.chapter_number,
          scroll: rec.scroll,
          updated_at: iso(rec.at),
        });
        if (error) throw error;
        const { error: e2 } = await sb.from("reading_history").insert({
          id: hist.id,
          user_id: hist.user_id,
          story_id: hist.story_id,
          chapter_id: hist.chapter_id,
          chapter_number: hist.chapter_number,
          read_at: iso(hist.at),
        });
        if (e2) throw e2;
      });
    },

    getProgress(storyId) {
      const u = currentUser();
      if (!u) {
        const guest = JSON.parse(storeGet(GUEST_PROGRESS) || "{}");
        return guest[storyId] || null;
      }
      return cache.reading_progress.find((p) => p.user_id === u.id && p.story_id === storyId) || null;
    },

    readChapterIds(storyId) {
      const u = currentUser();
      if (!u) return [];
      return [...new Set(cache.reading_history.filter((h) => h.user_id === u.id && h.story_id === storyId).map((h) => h.chapter_id))];
    },

    toggleFavorite(storyId) {
      const u = requireUser();
      const i = cache.favorites.findIndex((f) => f.user_id === u.id && f.story_id === storyId);
      if (i >= 0) {
        const gone = cache.favorites.splice(i, 1)[0];
        persist(async () => {
          const { error } = await sb.from("favorites").delete().eq("user_id", gone.user_id).eq("story_id", gone.story_id);
          if (error) throw error;
        });
        return { on: false };
      }
      const rec = { id: u.id + ":" + storyId, user_id: u.id, story_id: storyId, at: now() };
      cache.favorites.push(rec);
      persist(async () => {
        const { error } = await sb.from("favorites").insert({
          user_id: rec.user_id,
          story_id: rec.story_id,
        });
        if (error) throw error;
      });
      return { on: true };
    },

    toggleFollow(storyId) {
      const u = requireUser();
      const i = cache.follows.findIndex((f) => f.user_id === u.id && f.story_id === storyId);
      if (i >= 0) {
        const gone = cache.follows.splice(i, 1)[0];
        persist(async () => {
          const { error } = await sb.from("follows").delete().eq("user_id", gone.user_id).eq("story_id", gone.story_id);
          if (error) throw error;
        });
        return { on: false };
      }
      const rec = { id: u.id + ":" + storyId, user_id: u.id, story_id: storyId, at: now() };
      cache.follows.push(rec);
      persist(async () => {
        const { error } = await sb.from("follows").insert({
          user_id: rec.user_id,
          story_id: rec.story_id,
        });
        if (error) throw error;
      });
      return { on: true };
    },

    isFavorite(storyId) {
      const u = currentUser();
      if (!u) return false;
      return cache.favorites.some((f) => f.user_id === u.id && f.story_id === storyId);
    },
    isFollow(storyId) {
      const u = currentUser();
      if (!u) return false;
      return cache.follows.some((f) => f.user_id === u.id && f.story_id === storyId);
    },

    library() {
      const u = requireUser();
      const favs = cache.favorites.filter((f) => f.user_id === u.id);
      const fols = cache.follows.filter((f) => f.user_id === u.id);
      const progress = cache.reading_progress.filter((p) => p.user_id === u.id);
      const history = cache.reading_history.filter((h) => h.user_id === u.id).slice(0, 40);
      return {
        favorites: favs.map((f) => ({
          ...f,
          story: hydrateStory(cache.stories.find((s) => s.id === f.story_id && isStoryPublic(s))),
          progress: progress.find((p) => p.story_id === f.story_id),
        })).filter((item) => item.story),
        follows: fols.map((f) => ({
          ...f,
          story: hydrateStory(cache.stories.find((s) => s.id === f.story_id && isStoryPublic(s))),
          progress: progress.find((p) => p.story_id === f.story_id),
        })).filter((item) => item.story),
        history: history.map((h) => ({
          ...h,
          story: hydrateStory(cache.stories.find((s) => s.id === h.story_id && isStoryPublic(s))),
        })).filter((item) => item.story),
        comments: cache.comments
          .filter((c) => c.user_id === u.id)
          .slice(0, 40)
          .map((c) => ({
            ...c,
            story: hydrateStory(cache.stories.find((s) => s.id === c.story_id && isStoryPublic(s))),
          })).filter((item) => item.story),
      };
    },

    rateStory(storyId, stars) {
      const u = requireUser();
      stars = Number(stars);
      if (stars < 1 || stars > 5) throw new Error("Đánh giá 1–5 sao.");
      if (!hitRate("rate:" + u.id + ":" + storyId, 6, 60 * 1000)) throw new Error("Bạn vừa đánh giá. Thử lại sau.");
      let rec = cache.ratings.find((r) => r.user_id === u.id && r.story_id === storyId);
      if (rec) rec.stars = stars;
      else {
        rec = { id: u.id + ":" + storyId, user_id: u.id, story_id: storyId, stars, at: now() };
        cache.ratings.push(rec);
      }
      persist(async () => {
        const { error } = await sb.from("ratings").upsert({
          user_id: rec.user_id,
          story_id: rec.story_id,
          stars: rec.stars,
        });
        if (error) throw error;
      });
      return storyStats(storyId);
    },

    myRating(storyId) {
      const u = currentUser();
      if (!u) return 0;
      return cache.ratings.find((r) => r.user_id === u.id && r.story_id === storyId)?.stars || 0;
    },

    toggleChapterLike(chapterId) {
      const u = requireUser();
      if (!hitRate("like:" + u.id, 20, 60 * 1000)) throw new Error("Thao tác quá nhanh.");
      const i = cache.chapter_likes.findIndex((l) => l.user_id === u.id && l.chapter_id === chapterId);
      if (i >= 0) {
        const gone = cache.chapter_likes.splice(i, 1)[0];
        persist(async () => {
          const { error } = await sb.from("chapter_likes").delete().eq("user_id", gone.user_id).eq("chapter_id", gone.chapter_id);
          if (error) throw error;
        });
        return { on: false, count: this.chapterLikeCount(chapterId) };
      }
      const rec = { id: u.id + ":" + chapterId, user_id: u.id, chapter_id: chapterId, at: now() };
      cache.chapter_likes.push(rec);
      persist(async () => {
        const { error } = await sb.from("chapter_likes").insert({
          user_id: rec.user_id,
          chapter_id: rec.chapter_id,
        });
        if (error) throw error;
      });
      return { on: true, count: this.chapterLikeCount(chapterId) };
    },

    likedChapter(chapterId) {
      const u = currentUser();
      if (!u) return false;
      return cache.chapter_likes.some((l) => l.user_id === u.id && l.chapter_id === chapterId);
    },
    chapterLikeCount(chapterId) {
      return cache.chapter_likes.filter((l) => l.chapter_id === chapterId).length;
    },

    listComments(chapterId) {
      const comments = cache.comments
        .filter((c) => c.chapter_id === chapterId && c.status !== "hidden")
        .sort((a, b) => b.created_at - a.created_at);
      return comments.map((c) => ({
        ...c,
        user: profileOf(c.user_id),
        liked: this.likedComment(c.id),
        like_count: (c.likes || []).length,
        replies: cache.comment_replies
          .filter((r) => r.comment_id === c.id && r.status !== "hidden")
          .sort((a, b) => a.created_at - b.created_at)
          .map((r) => ({ ...r, user: profileOf(r.user_id) })),
      }));
    },

    likedComment(commentId) {
      const u = currentUser();
      if (!u) return false;
      const c = cache.comments.find((x) => x.id === commentId);
      return !!(c && c.likes && c.likes.includes(u.id));
    },

    addComment({ chapterId, storyId, body, quote, para_key }) {
      const u = requireUser();
      if (!cache.site_settings.allow_comments) throw new Error("Bình luận đang tạm khóa.");
      body = String(body || "").trim();
      if (body.length < 2) throw new Error("Nội dung quá ngắn.");
      if (body.length > 2000) throw new Error("Tối đa 2000 ký tự.");
      if (!hitRate("cmt:" + u.id, 8, 60 * 1000)) throw new Error("Bạn bình luận quá nhanh.");
      const rec = {
        id: uid(),
        user_id: u.id,
        story_id: storyId,
        chapter_id: chapterId,
        body,
        quote: quote ? String(quote).slice(0, 500) : "",
        para_key: para_key ? String(para_key).slice(0, 40) : "",
        status: "visible",
        likes: [],
        created_at: now(),
      };
      cache.comments.unshift(rec);
      persist(async () => {
        const row = {
          id: rec.id,
          user_id: rec.user_id,
          story_id: rec.story_id,
          chapter_id: rec.chapter_id,
          body: rec.body,
          quote: rec.quote,
          status: rec.status,
        };
        if (rec.para_key) row.para_key = rec.para_key;
        const { error } = await sb.from("comments").insert(row);
        if (error) throw error;
      });
      return rec;
    },

    replyComment(commentId, body) {
      const u = requireUser();
      body = String(body || "").trim();
      if (body.length < 1) throw new Error("Nội dung trống.");
      if (!hitRate("cmt:" + u.id, 8, 60 * 1000)) throw new Error("Bạn bình luận quá nhanh.");
      const parent = cache.comments.find((c) => c.id === commentId);
      if (!parent) throw new Error("Không tìm thấy bình luận.");
      const rec = { id: uid(), comment_id: commentId, user_id: u.id, body, status: "visible", created_at: now() };
      cache.comment_replies.push(rec);
      persist(async () => {
        const { error } = await sb.from("comment_replies").insert({
          id: rec.id,
          comment_id: rec.comment_id,
          user_id: rec.user_id,
          body: rec.body,
          status: rec.status,
        });
        if (error) throw error;
      });
      return rec;
    },

    deleteOwnComment(commentId) {
      const u = requireUser();
      const i = cache.comments.findIndex((c) => c.id === commentId);
      if (i < 0) throw new Error("Không tìm thấy.");
      if (cache.comments[i].user_id !== u.id && u.role !== "admin") throw new Error("Không thể xóa bình luận của người khác.");
      cache.comment_replies = cache.comment_replies.filter((r) => r.comment_id !== commentId);
      cache.comments.splice(i, 1);
      persist(async () => {
        const { error } = await sb.from("comments").delete().eq("id", commentId);
        if (error) throw error;
      });
    },

    deleteOwnReply(replyId) {
      const u = requireUser();
      const i = cache.comment_replies.findIndex((r) => r.id === replyId);
      if (i < 0) throw new Error("Không tìm thấy.");
      if (cache.comment_replies[i].user_id !== u.id && u.role !== "admin") throw new Error("Không thể xóa.");
      cache.comment_replies.splice(i, 1);
      persist(async () => {
        const { error } = await sb.from("comment_replies").delete().eq("id", replyId);
        if (error) throw error;
      });
    },

    likeComment(commentId) {
      const u = requireUser();
      const c = cache.comments.find((x) => x.id === commentId);
      if (!c) throw new Error("Không tìm thấy.");
      c.likes = c.likes || [];
      const i = c.likes.indexOf(u.id);
      if (i >= 0) {
        c.likes.splice(i, 1);
        persist(async () => {
          const { error } = await sb.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", u.id);
          if (error) throw error;
        });
      } else {
        c.likes.push(u.id);
        persist(async () => {
          const { error } = await sb.from("comment_likes").insert({ comment_id: commentId, user_id: u.id });
          if (error) throw error;
        });
      }
      return { on: c.likes.includes(u.id), count: c.likes.length };
    },

    adminStats() {
      requireAdmin();
      return {
        stories: cache.stories.length,
        chapters: cache.chapters.length,
        members: cache.users.length,
        comments: cache.comments.length,
        views: cache.views.length,
        recent: cache.stories
          .slice()
          .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
          .slice(0, 8)
          .map(hydrateStory),
      };
    },

    adminListStories() {
      requireAdmin();
      return cache.stories
        .slice()
        .sort((a, b) => {
          const pa = Number(a.home_priority);
          const pb = Number(b.home_priority);
          const aPrioritized = Number.isFinite(pa) && pa > 0;
          const bPrioritized = Number.isFinite(pb) && pb > 0;
          if (aPrioritized !== bPrioritized) return aPrioritized ? -1 : 1;
          if (aPrioritized && pa !== pb) return pa - pb;
          return (b.updated_at || 0) - (a.updated_at || 0);
        })
        .map(hydrateStory);
    },

    async refreshAdminEngagements() {
      requireAdmin();
      const [favorites, ratings] = await Promise.all([
        loadTable("favorites", (q) => q.order("created_at", { ascending: false })),
        loadTable("ratings", (q) => q.order("created_at", { ascending: false })),
      ]);
      cache.favorites = (favorites || []).map((f) => ({
        ...f,
        id: f.id || f.user_id + ":" + f.story_id,
        at: toMs(f.at || f.created_at),
      }));
      cache.ratings = (ratings || []).map((r) => ({
        ...r,
        id: r.id || r.user_id + ":" + r.story_id,
        at: toMs(r.at || r.created_at),
      }));
      return this.adminEngagements();
    },

    adminEngagements() {
      requireAdmin();
      const decorate = (row, type) => ({
        ...row,
        type,
        user: profileOf(row.user_id),
        story: cache.stories.find((story) => story.id === row.story_id) || null,
      });
      return {
        favorites: cache.favorites.map((row) => decorate(row, "favorite")),
        ratings: cache.ratings.map((row) => decorate(row, "rating")),
      };
    },

    async setStoryHomePriority(id, value) {
      requireAdmin();
      const story = cache.stories.find((item) => item.id === id);
      if (!story) throw new Error("Không tìm thấy truyện.");
      const parsed = Number(value);
      const nextPriority = Number.isInteger(parsed) && parsed >= 1 && parsed <= 99 ? parsed : null;
      const { data, error } = await sb
        .from("stories")
        .update({ home_priority: nextPriority })
        .eq("id", story.id)
        .select("id,home_priority")
        .single();
      if (error) throw publicError(error, "Không lưu được thứ tự ưu tiên.");
      story.home_priority = Number(data && data.home_priority) > 0 ? Number(data.home_priority) : null;
      writeSnap();
      return hydrateStory(story);
    },

    async setStoryVisibility(id, visible) {
      requireAdmin();
      const story = cache.stories.find((item) => item.id === id);
      if (!story) throw new Error("Không tìm thấy truyện.");
      const published = !!visible;
      const { data, error } = await sb
        .from("stories")
        .update({ published, updated_at: new Date().toISOString() })
        .eq("id", story.id)
        .select("id,published,updated_at")
        .single();
      if (error) throw publicError(error, published ? "Không hiện lại được truyện." : "Không ẩn được truyện.");
      story.published = data.published !== false;
      story.updated_at = toMs(data.updated_at) || now();
      writeSnap();
      return hydrateStory(story);
    },

    async upsertStory(data) {
      requireAdmin();
      const t = now();
      let story = data.id ? cache.stories.find((s) => s.id === data.id) : null;
      const isNewStory = !story;
      if (!story) {
        story = { id: uid(), created_at: t, views_seed: 0 };
      }
      story.title = String(data.title || "").trim();
      if (!story.title) throw new Error("Cần tên truyện.");
      story.slug = uniqueSlug(data.slug ? slugify(data.slug) : slugify(story.title), story.id);
      story.author = String(data.author || "").trim();
      story.editor = String(data.editor || "").trim();
      story.synopsis = String(data.synopsis || "");
      if (data.description != null) story.description = String(data.description || "");
      let status = data.status || "ongoing";
      let upcoming = status === "upcoming";
      if (upcoming) {
        status = "ongoing";
      }
      if (status !== "ongoing" && status !== "completed" && status !== "paused") status = "ongoing";
      story.status = status;
      story.featured = !!data.featured;
      story.upcoming = upcoming;
      story.published = data.published !== false;
      const priority = Number(data.home_priority);
      story.home_priority = Number.isInteger(priority) && priority >= 1 && priority <= 99 ? priority : null;
      story.accent = data.accent || "#8a6a4a";
      let tiktokIntroUrl = String(data.tiktok_intro_url || "").trim();
      if (tiktokIntroUrl) {
        let tiktokHost = "";
        try { tiktokHost = new URL(tiktokIntroUrl).hostname.toLowerCase(); } catch (_) {}
        const allowedTikTokHosts = ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vt.tiktok.com", "vm.tiktok.com"];
        if (!allowedTikTokHosts.includes(tiktokHost)) throw new Error("Liên kết này không thuộc TikTok.");
        if (!/\/video\/\d{10,}(?:[/?#]|$)/i.test(tiktokIntroUrl)) {
          const { data: resolved, error: resolveError } = await sb.functions.invoke("resolve-tiktok-link", { body: { url: tiktokIntroUrl } });
          if (resolveError || !resolved?.url || !resolved?.post_id) throw new Error("Không mở được link TikTok rút gọn. Hãy thử sao chép lại link chia sẻ.");
          tiktokIntroUrl = String(resolved.url);
        }
      }
      story.tiktok_intro_url = tiktokIntroUrl;
      if (data.cover_file) {
        const optimized = await optimizeCoverFile(data.cover_file);
        // Use an immutable versioned object name. This avoids Storage upsert
        // requiring UPDATE/SELECT on an older cover and prevents stale CDN images.
        const path = story.id + "-" + t + ".webp";
        const { error: uploadError } = await sb.storage.from("covers").upload(path, optimized, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: false,
        });
        if (uploadError) {
          const raw = String(uploadError.message || "");
          if (/object exceeded|maximum allowed size|too large|payload too large|413/i.test(raw)) {
            throw new Error("Ảnh bìa vượt giới hạn tải lên. Website đã thử nén ảnh; hãy chọn ảnh khác nếu lỗi vẫn còn.");
          }
          throw publicError(uploadError, "Không tải được ảnh bìa.");
        }
        story.cover = cfg().supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/public/covers/" + path + "?v=" + t;
      }
      if (!data.cover_file && data.cover) story.cover = data.cover;
      if (!story.cover) story.cover = "";
      story.updated_at = t;
      if (isNewStory) cache.stories.push(story);
      cache.story_genres = cache.story_genres.filter((x) => x.story_id !== story.id);
      cache.story_tags = cache.story_tags.filter((x) => x.story_id !== story.id);
      (data.genre_ids || []).forEach((gid) => cache.story_genres.push({ story_id: story.id, genre_id: gid }));
      (data.tag_ids || []).forEach((tid) => cache.story_tags.push({ story_id: story.id, tag_id: tid }));
      const row = {
        id: story.id,
        slug: story.slug,
        title: story.title,
        author: story.author,
        editor: story.editor,
        synopsis: story.synopsis,
        description: story.description || "",
        status: story.status,
        featured: story.featured,
        upcoming: story.upcoming,
        accent: story.accent,
        cover_url: story.cover,
        home_priority: story.home_priority,
        tiktok_intro_url: story.tiktok_intro_url || null,
        published: story.published,
        updated_at: iso(story.updated_at),
      };
      const gRows = (data.genre_ids || []).map((gid) => ({ story_id: story.id, genre_id: gid }));
      const tRows = (data.tag_ids || []).map((tid) => ({ story_id: story.id, tag_id: tid }));
      try {
        await persist(async () => {
          const { error } = await sb.from("stories").upsert(row);
          if (error) throw error;
          await sb.from("story_genres").delete().eq("story_id", story.id);
          await sb.from("story_tags").delete().eq("story_id", story.id);
          if (gRows.length) {
            const { error: e2 } = await sb.from("story_genres").insert(gRows);
            if (e2) throw e2;
          }
          if (tRows.length) {
            const { error: e3 } = await sb.from("story_tags").insert(tRows);
            if (e3) throw e3;
          }
        });
      } catch (err) {
        if (isNewStory) {
          cache.stories = cache.stories.filter((s) => s.id !== story.id);
          cache.story_genres = cache.story_genres.filter((x) => x.story_id !== story.id);
          cache.story_tags = cache.story_tags.filter((x) => x.story_id !== story.id);
        }
        throw publicError(err, "Không lưu được truyện.");
      }
      return hydrateStory(story);
    },

    deleteStory(id) {
      requireAdmin();
      cache.stories = cache.stories.filter((s) => s.id !== id);
      const chIds = cache.chapters.filter((c) => c.story_id === id).map((c) => c.id);
      cache.chapters = cache.chapters.filter((c) => c.story_id !== id);
      cache.comments = cache.comments.filter((c) => c.story_id !== id);
      cache.favorites = cache.favorites.filter((f) => f.story_id !== id);
      cache.follows = cache.follows.filter((f) => f.story_id !== id);
      cache.ratings = cache.ratings.filter((r) => r.story_id !== id);
      cache.views = cache.views.filter((v) => v.story_id !== id);
      cache.chapter_likes = cache.chapter_likes.filter((l) => !chIds.includes(l.chapter_id));
      persist(async () => {
        const { error } = await sb.from("stories").delete().eq("id", id);
        if (error) throw error;
      });
    },

    async upsertChapter(data) {
      requireAdmin();
      const t = now();
      let ch = data.id ? cache.chapters.find((c) => c.id === data.id) : null;
      const isNew = !ch;
      if (!ch) {
        ch = { id: uid(), created_at: t };
        cache.chapters.push(ch);
      }
      ch.story_id = data.story_id;
      ch.number = Number(data.number);
      ch.title = String(data.title || "").trim();
      ch.body = String(data.body || "");
      ch.audio_title = String(data.audio_title || "").trim();
      try { ch.youtube_audio_url = normalizeYouTubeLink(data.youtube_audio_url); }
      catch (error) {
        if (isNew) cache.chapters = cache.chapters.filter((item) => item !== ch);
        throw error;
      }
      const wasPublished = !!ch.published_at;
      ch.status = data.status || "draft";
      ch.publish_at = data.publish_at || null;
      if (ch.status === "published" && !ch.published_at) ch.published_at = t;
      ch.updated_at = t;
      if (data.notify_edit) ch.notify_edit_at = t;
      const story = cache.stories.find((s) => s.id === ch.story_id);
      if (story) story.updated_at = t;
      const row = {
        id: ch.id,
        story_id: ch.story_id,
        number: ch.number,
        chapter_number: ch.number,
        title: ch.title,
        content: ch.body,
        audio_url: ch.audio_url || null,
        audio_cover_url: ch.audio_cover_url || null,
        audio_title: ch.audio_title || null,
        audio_duration_seconds: ch.audio_duration_seconds || null,
        youtube_audio_url: ch.youtube_audio_url || null,
        notify_edit_at: ch.notify_edit_at ? iso(ch.notify_edit_at) : null,
        status: ch.status,
        publish_at: iso(ch.publish_at),
        published_at: iso(ch.published_at),
        updated_at: iso(ch.updated_at),
      };
      // Chapter publishing is more important than the background online
      // counter. Pause heartbeats while saving, and retry only a confirmed 429
      // response so a temporary platform limit does not lose the editor's work.
      stopPublicPresence();
      try {
        await persist(() => retryRateLimited(async () => {
          const { error } = await sb.from("chapters").upsert(row);
          if (error) throw error;
          if (story) {
            const { error: storyError } = await sb.from("stories").update({ updated_at: iso(t) }).eq("id", story.id);
            if (storyError) throw storyError;
          }
        }));
      } finally {
        startPublicPresence();
      }
      return ch;
    },

    async deleteChapter(id) {
      requireAdmin();
      const chapter = cache.chapters.find((c) => c.id === id);
      if (!chapter) throw new Error("Không tìm thấy chương.");
      const { data, error } = await sb.from("chapters").delete().eq("id", id).select("id");
      if (error) throw publicError(error, "Không xóa được chương.");
      if (!(data || []).some((row) => row.id === id)) {
        throw new Error("Chương chưa được xóa. Vui lòng tải lại trang rồi thử lại.");
      }
      const commentIds = cache.comments.filter((c) => c.chapter_id === id).map((c) => c.id);
      cache.chapters = cache.chapters.filter((c) => c.id !== id);
      cache.comments = cache.comments.filter((c) => c.chapter_id !== id);
      cache.comment_replies = cache.comment_replies.filter((r) => !commentIds.includes(r.comment_id));
      cache.chapter_likes = cache.chapter_likes.filter((l) => l.chapter_id !== id);
      writeSnap();
      return chapter;
    },

    nextChapterNumber(storyId) {
      const nums = cache.chapters.filter((c) => c.story_id === storyId).map((c) => c.number);
      return nums.length ? Math.max(...nums) + 1 : 1;
    },

    adminComments() {
      requireAdmin();
      return cache.comments.map((c) => ({
        ...c,
        user: profileOf(c.user_id),
        story: cache.stories.find((s) => s.id === c.story_id),
        chapter: cache.chapters.find((ch) => ch.id === c.chapter_id),
        replies: cache.comment_replies.filter((r) => r.comment_id === c.id),
      }));
    },

    moderateComment(id, status) {
      requireAdmin();
      const c = cache.comments.find((x) => x.id === id);
      if (!c) throw new Error("Không tìm thấy.");
      if (status === "deleted") {
        cache.comment_replies = cache.comment_replies.filter((r) => r.comment_id !== id);
        cache.comments = cache.comments.filter((x) => x.id !== id);
        persist(async () => {
          const { error } = await sb.from("comments").delete().eq("id", id);
          if (error) throw error;
        });
      } else {
        c.status = status;
        persist(async () => {
          const { error } = await sb.from("comments").update({ status }).eq("id", id);
          if (error) throw error;
        });
      }
    },

    setCommentsAllowed(on) {
      this.updateSettings({ allow_comments: !!on });
    },

    adminUsers() {
      requireAdmin();
      return cache.users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        created_at: u.created_at,
        profile: profileOf(u.id),
      }));
    },

    setUserStatus(id, status) {
      const admin = requireAdmin();
      if (admin.id === id) throw new Error("Không thể khóa chính mình.");
      const user = cache.users.find((u) => u.id === id);
      const p = cache.profiles.find((x) => x.id === id);
      if (!user || !p) throw new Error("Không tìm thấy.");
      user.status = status;
      p.status = status;
      persist(async () => {
        const { error } = await sb.from("profiles").update({ status }).eq("user_id", id);
        if (error) throw error;
      });
    },

    setUserRole() {
      throw new Error("Website chỉ có một chủ sở hữu. Không thể cấp hoặc hạ quyền quản trị.");
    },

    ensureGenre(name) {
      requireAdmin();
      const slug = slugify(name);
      let g = cache.genres.find((x) => x.slug === slug);
      if (!g) {
        g = { id: uid(), name, slug };
        cache.genres.push(g);
        persist(async () => {
          const { error } = await sb.from("genres").insert(g);
          if (error) throw error;
        });
      }
      return g;
    },

    ensureTag(name) {
      requireAdmin();
      const slug = slugify(name);
      let t = cache.tags.find((x) => x.slug === slug);
      if (!t) {
        t = { id: uid(), name, slug };
        cache.tags.push(t);
        persist(async () => {
          const { error } = await sb.from("tags").insert(t);
          if (error) throw error;
        });
      }
      return t;
    },

    renameGenre(id, name) {
      requireAdmin();
      const g = cache.genres.find((x) => x.id === id);
      if (!g) throw new Error("Không tìm thấy phân loại.");
      g.name = String(name || "").trim();
      g.slug = slugify(g.name);
      persist(async () => {
        const { error } = await sb.from("genres").update({ name: g.name, slug: g.slug }).eq("id", id);
        if (error) throw error;
      });
      return g;
    },

    deleteGenre(id) {
      requireAdmin();
      cache.genres = cache.genres.filter((g) => g.id !== id);
      cache.story_genres = cache.story_genres.filter((x) => x.genre_id !== id);
      persist(async () => {
        const { error } = await sb.from("genres").delete().eq("id", id);
        if (error) throw error;
      });
    },

    renameTag(id, name) {
      requireAdmin();
      const t = cache.tags.find((x) => x.id === id);
      if (!t) throw new Error("Không tìm thấy tag.");
      t.name = String(name || "").trim();
      t.slug = slugify(t.name);
      persist(async () => {
        const { error } = await sb.from("tags").update({ name: t.name, slug: t.slug }).eq("id", id);
        if (error) throw error;
      });
      return t;
    },

    deleteTag(id) {
      requireAdmin();
      cache.tags = cache.tags.filter((t) => t.id !== id);
      cache.story_tags = cache.story_tags.filter((x) => x.tag_id !== id);
      persist(async () => {
        const { error } = await sb.from("tags").delete().eq("id", id);
        if (error) throw error;
      });
    },

    notifyFollowers(storyId, title, body, href) {
      persist(async () => {
        const { data, error } = await sb.from("follows").select("user_id").eq("story_id", storyId);
        if (error) throw error;
        const t = now();
        const rows = (data || []).map((f) => ({
          id: uid(),
          user_id: f.user_id,
          title,
          body,
          href,
          read: false,
        }));
        if (!rows.length) return;
        const { error: e2 } = await sb.from("notifications").insert(rows);
        if (e2) throw e2;
      });
    },

    myNotifications() {
      const u = requireUser();
      return cache.notifications.filter((n) => n.user_id === u.id).sort((a, b) => b.at - a.at).slice(0, 40);
    },

    unreadCount() {
      const u = currentUser();
      if (!u) return 0;
      return cache.notifications.filter((n) => n.user_id === u.id && !n.read).length;
    },

    markNotificationsRead() {
      const u = requireUser();
      cache.notifications.forEach((n) => {
        if (n.user_id === u.id) n.read = true;
      });
      persist(async () => {
        const { error } = await sb.from("notifications").update({ read: true }).eq("user_id", u.id).eq("read", false);
        if (error) throw error;
      });
    },

    weeklyRanking(limit) {
      const rows = cache.stories
        .filter(isStoryPublic)
        .map((s) => ({
          story: hydrateStory(s),
          week: Number((cache.story_stats[s.id] && cache.story_stats[s.id].week_views) || 0),
        }))
        .filter((r) => r.story)
        .sort((a, b) => b.week - a.week || b.story.stats.views - a.story.stats.views)
        .slice(0, limit || 3);
      const max = Math.max(1, ...rows.map((r) => r.week));
      return rows.map((r, i) => ({ rank: i + 1, story: r.story, week: r.week, pct: Math.round((r.week / max) * 100) }));
    },

    recentUpdates(limit) {
      const published = cache.chapters
        .filter((c) => c.status === "published")
        .sort((a, b) => (b.published_at || b.updated_at || 0) - (a.published_at || a.updated_at || 0));
      const seen = new Set();
      const items = [];
      published.forEach((c) => {
        if (seen.has(c.story_id) || items.length >= (limit || 6)) return;
        const story = hydrateStory(cache.stories.find((s) => s.id === c.story_id && isStoryPublic(s)));
        if (!story) return;
        seen.add(c.story_id);
        const kind = story.status === "completed" ? "done" : "new";
        items.push({
          kind,
          label: kind === "done" ? "Vừa hoàn thành" : "Chương mới",
          story,
          chapter: c,
          at: c.published_at || c.updated_at,
        });
      });
      return items;
    },

    recentComments(limit) {
      return this.communityFeed({ sort: "latest" }).slice(0, limit || 6);
    },
    communityFeed({ sort, storyId } = {}) {
      const DAY = 24 * 60 * 60 * 1000;
      const nowMs = now();
      const publicStoryIds = new Set(cache.stories.filter(isStoryPublic).map((story) => story.id));
      const comments = (cache.comments || []).filter((c) => c.status !== "hidden" && publicStoryIds.has(c.story_id));
      const talking = new Set();
      comments.forEach((c) => {
        if (nowMs - c.created_at < DAY) talking.add(c.user_id);
      });
      (cache.comment_replies || []).forEach((r) => {
        if (r.status !== "hidden" && nowMs - r.created_at < DAY) talking.add(r.user_id);
      });
      const counts = {};
      comments.forEach((c) => {
        counts[c.user_id] = (counts[c.user_id] || 0) + 1;
      });
      let list = comments.map((c) => {
        const story = cache.stories.find((s) => s.id === c.story_id);
        const chapter = cache.chapters.find((ch) => ch.id === c.chapter_id);
        const user = profileOf(c.user_id);
        const replies = (cache.comment_replies || [])
          .filter((r) => r.comment_id === c.id && r.status !== "hidden")
          .sort((a, b) => a.created_at - b.created_at)
          .map((r) => ({
            ...r,
            user: profileOf(r.user_id),
            staff: !!(profileOf(r.user_id) && normalizeRole(profileOf(r.user_id).role) === "admin"),
          }));
        const like_count = (c.likes || []).length;
        const n = counts[c.user_id] || 1;
        const level = Math.min(5, Math.max(1, 1 + Math.floor(n / 3)));
        return {
          ...c,
          story,
          chapter,
          user,
          replies,
          like_count,
          liked: this.likedComment(c.id),
          href: story && chapter ? "#/truyen/" + story.slug + "/chuong-" + chapter.number : story ? "#/truyen/" + story.slug : "#/",
          level,
          staff: !!(user && normalizeRole(user.role) === "admin"),
          hot: like_count >= 5 || replies.length >= 3,
          last_at: Math.max(c.created_at, ...replies.map((r) => r.created_at), 0),
        };
      });
      if (storyId) list = list.filter((c) => c.story_id === storyId);
      if (sort === "hot") list.sort((a, b) => b.like_count + b.replies.length * 2 - (a.like_count + a.replies.length * 2) || b.created_at - a.created_at);
      else if (sort === "talk") list.sort((a, b) => b.last_at - a.last_at);
      else list.sort((a, b) => b.created_at - a.created_at);
      return Object.assign(list, { total: comments.length, talking: talking.size });
    },

    addHomeComment(body) {
      const latest = this.recentUpdates(1)[0];
      if (!latest) throw new Error("Chưa có chương để gắn lời nhắn.");
      return this.addComment({ chapterId: latest.chapter.id, storyId: latest.story.id, body });
    },

    moodCatalog() {
      const wanted = [
        { slug: "chua-lanh", name: "Chữa lành", icon: "✦" },
        { slug: "day-dut", name: "Day dứt", icon: "◇" },
        { slug: "ngot-ngao", name: "Ngọt ngào", icon: "♡" },
        { slug: "lanh-lung", name: "Lạnh lùng", icon: "✻" },
        { slug: "co-phong", name: "Cổ phong", icon: "☾" },
        { slug: "truong-thanh", name: "Trưởng thành", icon: "◎" },
      ];
      return wanted.map((m) => {
        const t = cache.tags.find((x) => x.slug === m.slug);
        return { ...m, id: t ? t.id : null, exists: !!t };
      });
    },

    featuredQuote() {
      const q = cache.site_settings.featured_quote;
      if (!q) return null;
      const story = hydrateStory(cache.stories.find((s) => s.id === q.story_id && isStoryPublic(s)));
      const chapter = cache.chapters.find((c) => c.id === q.chapter_id);
      if (!story || !chapter) return null;
      return { text: q.text, story, chapter, href: "#/truyen/" + story.slug + "/chuong-" + chapter.number };
    },

    setFeaturedQuote({ text, story_id, chapter_id }) {
      requireAdmin();
      cache.site_settings.featured_quote = { text: String(text || "").trim(), story_id, chapter_id };
      this.updateSettings({ featured_quote: cache.site_settings.featured_quote });
      return this.featuredQuote();
    },

    pollState() {
      const poll = cache.site_settings.poll || { id: "poll_home", story_ids: [], title: "" };
      const u = currentUser();
      const votes = cache.poll_votes.filter((v) => v.poll_id === poll.id);
      const total = votes.length;
      const mine = u ? votes.find((v) => v.user_id === u.id) : null;
      const options = (poll.story_ids || [])
        .map((id) => {
          const story = hydrateStory(cache.stories.find((s) => s.id === id && isStoryPublic(s)));
          if (!story) return null;
          const count = votes.filter((v) => v.story_id === id).length;
          return { story, count, pct: total ? Math.round((count / total) * 100) : 0 };
        })
        .filter(Boolean);
      return { poll, options, total, mine };
    },

    setPollStories(story_ids, title) {
      requireAdmin();
      const next = (story_ids || []).slice(0, 6);
      const prev = (cache.site_settings.poll && cache.site_settings.poll.story_ids) || [];
      const changed = JSON.stringify(prev) !== JSON.stringify(next);
      cache.site_settings.poll = {
        id: changed ? "poll_" + Date.now().toString(36) : (cache.site_settings.poll && cache.site_settings.poll.id) || "poll_home",
        title: title || "Bạn muốn ViCam ưu tiên truyện nào?",
        story_ids: next,
      };
      if (changed) cache.poll_votes = cache.poll_votes.filter((v) => v.poll_id === cache.site_settings.poll.id);
      this.updateSettings({ poll: cache.site_settings.poll });
      return this.pollState();
    },

    votePoll(storyId) {
      const u = requireUser();
      const poll = cache.site_settings.poll;
      if (!poll || !(poll.story_ids || []).includes(storyId)) throw new Error("Truyện không nằm trong đợt bình chọn.");
      if (cache.poll_votes.some((v) => v.poll_id === poll.id && v.user_id === u.id))
        throw new Error("Bạn đã bình chọn đợt này.");
      if (!hitRate("poll:" + u.id, 3, 60 * 1000)) throw new Error("Thử lại sau.");
      const rec = { id: uid(), poll_id: poll.id, user_id: u.id, story_id: storyId, at: now() };
      cache.poll_votes.push(rec);
      persist(async () => {
        const { error } = await sb.from("poll_votes").insert({
          id: rec.id,
          poll_id: rec.poll_id,
          user_id: rec.user_id,
          story_id: rec.story_id,
        });
        if (error) throw error;
      });
      return this.pollState();
    },

    adminInbox() {
      requireAdmin();
      return cache.inbox.slice();
    },

    markInboxRead(id) {
      requireAdmin();
      const rec = cache.inbox.find((x) => x.id === id);
      if (rec) rec.read = true;
      persist(async () => {
        const { error } = await sb.from("inbox").update({ read: true }).eq("id", id);
        if (error) throw error;
      });
    },
  };

  global.VCBG = api;
})(window);
