/* ViCamBachGiai — UI, router, reader, admin */
(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const app = () => $("#app");
  const esc = (s) => {
    return String(s == null ? "" : s)
      .replace(/&/g, "&" + "amp;")
      .replace(/</g, "&" + "lt;")
      .replace(/>/g, "&" + "gt;")
      .replace(/"/g, "&" + "quot;");
  };
  function tiktokPostId(value) {
    const match = String(value || "").trim().match(/(?:tiktok\.com\/[^?#]*\/video\/|^)(\d{10,})(?:[/?#]|$)/i);
    return match ? match[1] : "";
  }
  const ALLOWED = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "H2", "H3", "H4", "BLOCKQUOTE", "UL", "OL", "LI", "A", "IMG", "DIV", "SPAN", "HR"]);
  function cleanStyle(value) {
    const kept = [];
    String(value || "")
      .split(";")
      .forEach((part) => {
        const i = part.indexOf(":");
        if (i < 0) return;
        const prop = part.slice(0, i).trim().toLowerCase();
        const val = part.slice(i + 1).trim();
        if (!prop || !val) return;
        if (prop === "text-align" && /^(left|center|right|justify)$/i.test(val)) kept.push("text-align: " + val.toLowerCase());
        else if (/^margin(-(top|right|bottom|left))?$/.test(prop) && /^[0-9.]+(px|em|rem|%)$/i.test(val)) kept.push(prop + ": " + val);
        else if (prop === "line-height" && /^[0-9.]+(px|em|rem|%)?$/i.test(val)) kept.push("line-height: " + val);
        else if (prop === "text-indent" && /^-?[0-9.]+(px|em|rem|%)$/i.test(val)) kept.push("text-indent: " + val);
      });
    return kept.join("; ");
  }
  function sanitize(html) {
    const box = document.createElement("div");
    box.innerHTML = String(html || "");
    (function walk(n) {
      [...n.childNodes].forEach((c) => {
        if (c.nodeType === 1) {
          if (!ALLOWED.has(c.tagName)) {
            c.replaceWith(...c.childNodes);
            return;
          }
          [...c.attributes].forEach((a) => {
            if (a.name === "align" && /^(left|center|right|justify)$/i.test(a.value)) {
              const cur = c.getAttribute("style") || "";
              if (!/text-align\s*:/i.test(cur)) c.style.textAlign = a.value.toLowerCase();
              c.removeAttribute("align");
              return;
            }
            if (a.name === "style") {
              const cleaned = cleanStyle(a.value);
              if (cleaned) c.setAttribute("style", cleaned);
              else c.removeAttribute("style");
              return;
            }
            const ok =
              (c.tagName === "A" && a.name === "href" && /^(https?:|mailto:|#)/i.test(a.value)) ||
              (c.tagName === "IMG" && a.name === "src" && /^(data:image\/|covers\/|brand\/|https?:)/i.test(a.value)) ||
              a.name === "alt" ||
              a.name === "class";
            if (!ok) c.removeAttribute(a.name);
          });
          walk(c);
        }
      });
    })(box);
    return box.innerHTML;
  }
  function applyParaGap(html, gap) {
    const box = document.createElement("div");
    box.innerHTML = html || "";
    box.querySelectorAll("p").forEach((p) => {
      p.style.marginBottom = gap + "em";
    });
    return box.innerHTML;
  }
  function textToHtml(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/)
      .map((block) => {
        const lines = block.split("\n").map((l) => esc(l)).join("<br>");
        return "<p>" + (lines || "<br>") + "</p>";
      })
      .join("");
  }
  function toast(msg) {
    let wrap = $("#toasts");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "toasts";
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
  function fmtDate(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString("vi-VN");
  }
  function statusLabel(s) {
    return { ongoing: "Đang lên sóng", completed: "Đã hoàn thành", upcoming: "Sắp ra mắt" }[s] || s;
  }
  function storyStatusLabel(s) {
    return s && s.upcoming ? "Sắp ra mắt" : statusLabel(s && s.status);
  }
  function storyInfoText(s) {
    const raw = String((s && s.description) || "").trim();
    const syn = String((s && s.synopsis) || "").trim();
    if (raw && raw !== syn) return raw;
    const kinds = []
      .concat((s.genres || []).map((g) => g.name))
      .concat((s.tags || []).map((t) => t.name))
      .filter(Boolean);
    return [
      "Tên truyện: " + (s.title || "—"),
      "Tác giả: " + (s.author || "—"),
      kinds.length ? "Thể loại: " + kinds.join(", ") : "",
      "Tình trạng: " + storyStatusLabel(s),
      s.editor ? "Edit: " + s.editor : "",
      s.created_at ? "Ngày bắt đầu: " + fmtDate(s.created_at) : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  function formatStoryInfo(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line, i, arr) => line || (i && arr[i - 1]))
      .map((line) => {
        const m = line.match(/^([^:]{1,40}):\s*(.*)$/);
        if (m) return `<p><strong>${esc(m[1])}:</strong> ${esc(m[2] || "—")}</p>`;
        return line ? `<p>${esc(line)}</p>` : "<p><br></p>";
      })
      .join("");
  }
  function formatLandscapeInfo(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        const m = line.match(/^([^:]{1,60}):\s*(.*)$/);
        return !m || Boolean(String(m[2] || "").trim());
      })
      .map((line) => {
        const m = line.match(/^([^:]{1,60}):\s*(.*)$/);
        if (m) return `<p><strong>${esc(m[1])}:</strong> <span>${esc(m[2])}</span></p>`;
        return `<p class="landscape-info-line">${esc(line)}</p>`;
      })
      .join("");
  }
  function setMeta(title, desc) {
    document.title = title;
    let m = document.querySelector('meta[name="description"]');
    if (m) m.setAttribute("content", desc || "");
    let og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute("content", title);
  }
  let currentPath = "/";
  let navigating = false;

  function readLocationPath() {
    try {
      const h = (location.hash || "").replace(/^#/, "");
      if (h) return h.startsWith("/") ? h : "/" + h;
    } catch (_) {}
    return currentPath || "/";
  }

  function parseHash() {
    const raw = readLocationPath() || "/";
    currentPath = raw.startsWith("/") ? raw : "/" + raw;
    const [path, qs] = currentPath.split("?");
    const parts = path.split("/").filter(Boolean);
    const q = Object.fromEntries(new URLSearchParams(qs || ""));
    if (!parts.length) return { name: "home", q };
    if (parts[0] === "kham-pha") return { name: "explore", q };
    if (parts[0] === "tu-truyen") return { name: "library", q };
    if (parts[0] === "dang-nhap") return { name: "login", q };
    if (parts[0] === "dang-ky") return { name: "register", q };
    if (parts[0] === "quen-mat-khau") return { name: "forgot", q };
    if (parts[0] === "tai-khoan") return { name: "account", q };
    if (parts[0] === "thong-bao") return { name: "notifs", q };
    if (parts[0] === "hop-thu") return { name: "mailbox", q };
    if (parts[0] === "admin") return { name: "admin", parts, q };
    if (parts[0] === "truyen" && parts[1] && /^chuong-/.test(parts[2] || ""))
      return { name: "read", slug: parts[1], number: Number(String(parts[2]).replace("chuong-", "")), q };
    if (parts[0] === "truyen" && parts[1]) return { name: "story", slug: parts[1], q };
    return { name: "home", q };
  }
  function go(hash) {
    let path = String(hash || "/");
    if (path.startsWith("#")) path = path.slice(1);
    if (!path.startsWith("/")) path = "/" + path;
    currentPath = path;
    navigating = true;
    try {
      location.hash = "#" + path;
    } catch (_) {}
    const p = render();
    Promise.resolve(p).finally(() => {
      navigating = false;
    });
    return p;
  }

  const AUTH_RETURN_KEY = "vicambachgiai.auth.return.v1";

  function safeInternalPath(value) {
    let path = String(value || "").trim();
    if (path.startsWith("#")) path = path.slice(1);
    if (!path.startsWith("/") || path.startsWith("//")) return "";
    const name = path.split("?")[0];
    if (["/dang-nhap", "/dang-ky", "/quen-mat-khau"].includes(name)) return "";
    return path;
  }

  function authReturnSnapshot() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(AUTH_RETURN_KEY) || "null");
      if (!saved || !safeInternalPath(saved.path)) return null;
      if (Date.now() - Number(saved.at || 0) > 30 * 60 * 1000) {
        sessionStorage.removeItem(AUTH_RETURN_KEY);
        return null;
      }
      return saved;
    } catch (_) {
      return null;
    }
  }

  function rememberAuthReturn(next) {
    const path = safeInternalPath(next) || safeInternalPath(readLocationPath());
    if (!path) return "";
    try {
      sessionStorage.setItem(
        AUTH_RETURN_KEY,
        JSON.stringify({ path, scrollY: Math.max(0, Math.round(window.scrollY || 0)), at: Date.now() })
      );
    } catch (_) {}
    return path;
  }

  function loginPath(next) {
    const path = safeInternalPath(next);
    return "/dang-nhap" + (path ? "?next=" + encodeURIComponent(path) : "");
  }

  function goToLogin(next) {
    const path = rememberAuthReturn(next);
    return go(loginPath(path));
  }

  async function replaceRoute(path) {
    const target = safeInternalPath(path) || "/";
    currentPath = target;
    navigating = true;
    try {
      history.replaceState(null, "", location.pathname + location.search + "#" + target);
    } catch (_) {
      location.hash = "#" + target;
    }
    try {
      return await render();
    } finally {
      navigating = false;
    }
  }

  async function returnFromAuth(target) {
    const snapshot = authReturnSnapshot();
    const path = safeInternalPath(target) || (snapshot && safeInternalPath(snapshot.path)) || "/";
    const scrollY = snapshot && snapshot.path === path ? Number(snapshot.scrollY) || 0 : 0;
    try {
      sessionStorage.removeItem(AUTH_RETURN_KEY);
    } catch (_) {}
    await replaceRoute(path);
    if (scrollY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY);
        setTimeout(() => window.scrollTo(0, scrollY), 180);
      });
    }
  }

  window.VCBGGoToLogin = goToLogin;

  const READ_KEY = "vicambachgiai.reader.v2";
  function defaultReadSize() {
    const w = window.innerWidth || 390;
    if (w < 640) return 1.05;
    if (w < 1024) return 1.14;
    return 1.22;
  }
  function readPrefs() {
    const base = { theme: "dark", size: defaultReadSize(), font: "serif", autoScrollSpeed: 1, autoNext: false };
    try {
      const saved = JSON.parse(localStorage.getItem(READ_KEY) || "{}");
      if (saved.theme) base.theme = saved.theme;
      if (saved.size) base.size = Number(saved.size);
      if (saved.font === "sans" || saved.font === "serif") base.font = saved.font;
      if (Number(saved.autoScrollSpeed)) base.autoScrollSpeed = Math.min(1.5, Math.max(0.5, Number(saved.autoScrollSpeed)));
      if (typeof saved.autoNext === "boolean") base.autoNext = saved.autoNext;
      return base;
    } catch {
      return base;
    }
  }
  function savePrefs(p) {
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(p));
    } catch (_) {}
  }

  function coverImg(src, alt, eager) {
    const url = src || "";
    return `<div class="cover-frame"><img src="${esc(url)}" alt="${esc(alt || "")}" ${eager ? "" : 'loading="lazy"'} decoding="async"></div>`;
  }
  function logoHTML() {
    return `<a class="brand" href="#/" aria-label="ViCamBachGiai">
      <img class="brand-mark-img" src="brand/mark.png" alt="" width="42" height="47">
      <img class="brand-word-img" src="brand/word.png" alt="ViCamBachGiai" width="174" height="48">
    </a>`;
  }
  const SOCIAL_DEFAULTS = {
    youtube: "https://www.youtube.com",
    tiktok: "https://www.tiktok.com",
    facebook: "https://www.facebook.com",
    wattpad: "https://www.wattpad.com",
  };
  const SOCIAL_ICONS = {
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23 12.2s0-3.3-.4-4.8c-.2-.9-.9-1.6-1.8-1.8C19.1 5.2 12 5.2 12 5.2s-7.1 0-8.8.4c-.9.2-1.6.9-1.8 1.8C1 8.9 1 12.2 1 12.2s0 3.3.4 4.8c.2.9.9 1.6 1.8 1.8 1.7.4 8.8.4 8.8.4s7.1 0 8.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.5.4-4.8.4-4.8zM9.8 15.5V8.9l6.1 3.3-6.1 3.3z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14.5 3c.3 2.4 1.6 4.1 4 4.5v2.3c-1.4 0-2.7-.4-4-1.2v6.6c0 3.3-2.6 5.8-5.9 5.8S2.7 18.5 2.7 15.2c0-3.2 2.5-5.7 5.7-5.8v2.5c-1.8.1-3.2 1.6-3.2 3.4 0 1.9 1.5 3.4 3.4 3.4s3.4-1.5 3.4-3.4V3h2.5z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14.5 8.5V6.8c0-.7.5-1 1.2-1h1.8V3h-2.5C12.2 3 11 4.5 11 6.7v1.8H9v2.8h2V21h3.5v-9.7h2.4l.4-2.8h-2.8z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.3 2h9.4A5.3 5.3 0 0 1 22 7.3v9.4a5.3 5.3 0 0 1-5.3 5.3H7.3A5.3 5.3 0 0 1 2 16.7V7.3A5.3 5.3 0 0 1 7.3 2Zm-.2 2A3.1 3.1 0 0 0 4 7.1v9.8A3.1 3.1 0 0 0 7.1 20h9.8a3.1 3.1 0 0 0 3.1-3.1V7.1A3.1 3.1 0 0 0 16.9 4H7.1Zm10.4 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>',
    wattpad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.2 6.2c.8 0 1.4.3 1.8 1.1L8.4 12l2.3-4.7c.4-.8 1-1.1 1.8-1.1s1.4.3 1.8 1.1L16.6 12l2.4-4.7c.4-.8 1-1.1 1.8-1.1.9 0 1.5.7 1.5 1.6 0 .3 0 .5-.1.8l-3.2 8.1c-.4.9-1 1.3-1.9 1.3-.8 0-1.4-.4-1.8-1.2L13 12.4l-2.3 4.6c-.4.8-1 1.2-1.8 1.2-.9 0-1.5-.4-1.9-1.3L3.8 8.6c-.1-.3-.1-.5-.1-.8 0-.9.6-1.6 1.5-1.6z"/></svg>',
  };
  function socialStrip() {
    const so = (VCBG.settings() && VCBG.settings().social) || {};
    const items = [["tiktok", "TikTok"], ["instagram", "Instagram"], ["wattpad", "Wattpad"]];
    return `<nav class="social-strip" aria-label="Mạng xã hội">${items.map(([k, label]) => {
      const href = String(so[k] || "").trim();
      const active = /^https?:\/\//i.test(href);
      const inner = SOCIAL_ICONS[k];
      return active
        ? `<a class="social-ico is-active social-${k}" data-social="${k}" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${label}">${inner}</a>`
        : `<span class="social-ico is-disabled social-${k}" data-social="${k}" role="img" aria-label="${label} — chưa có liên kết" aria-disabled="true">${inner}</span>`;
    }).join("")}</nav>`;
  }
  function storyPills(s) {
    const bits = [storyStatusLabel(s)].concat((s.genres || []).slice(0, 1).map((g) => g.name));
    return bits.map((t) => `<span class="pill">${esc(t)}</span>`).join("");
  }
  function latestLine(s) {
    const ch = s.stats && s.stats.latest_chapter;
    if (!ch) return "Chưa có chương";
    return (ch.number ? ch.number + ". " : "") + (ch.title || ("Chương " + ch.number));
  }
  function fmtCount(n) {
    n = Number(n) || 0;
    if (n >= 10000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "K";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }
  function storyTitleFit(title) {
    const length = Array.from(String(title || "").trim()).length;
    if (length > 64) return "title-fit-xlong";
    if (length > 42) return "title-fit-long";
    if (length > 26) return "title-fit-medium";
    return "title-fit-short";
  }

  function storyCard(s, compact) {
    if (compact) {
      return `<a class="story-card compact" href="#/truyen/${esc(s.slug)}">
        ${coverImg(s.cover, "Bìa " + s.title)}
        <div class="meta"><h3>${esc(s.title)}</h3><div class="by">${esc(s.author)}</div></div>
      </a>`;
    }
    const latest = s.stats && s.stats.latest_chapter;
    const latestHref = latest ? `#/truyen/${esc(s.slug)}/chuong-${latest.number}` : `#/truyen/${esc(s.slug)}`;
    const rating = s.stats.rating_avg || 0;
    const kinds = []
      .concat([s.upcoming ? "Sắp ra mắt" : statusLabel(s.status)])
      .concat((s.genres || []).map((g) => g.name))
      .concat((s.tags || []).map((t) => t.name))
      .filter(Boolean);
    const shown = kinds.slice(0, 2);
    const extra = kinds.length - shown.length;
    return `<article class="wide-card ${storyTitleFit(s.title)}" data-slug="${esc(s.slug)}" style="--tone:${esc(s.accent || "#7c5cbf")}">
      <a class="wide-cover" href="#/truyen/${esc(s.slug)}">${coverImg(s.cover, "Bìa " + s.title)}</a>
      <div class="wide-body">
        <a class="wide-title" href="#/truyen/${esc(s.slug)}"><h3>${esc(s.title)}</h3><em>›</em></a>
        <p class="by">Tác giả: ${esc(s.author || "—")}</p>
        <div class="pill-row">${shown.map((t) => `<span class="pill">${esc(t)}</span>`).join("")}${extra > 0 ? `<span class="pill pill-more">+${extra}</span>` : ""}</div>
        <div class="wide-stats">
          <span><i class="stat-eye" aria-hidden="true"></i>${fmtCount(s.stats.views)}</span>
          <span>★ ${rating}</span>
          <span>▤ ${s.stats.chapter_count} chương</span>
        </div>
        <a class="wide-latest" href="${latestHref}">
          <span><i></i> Chương mới</span>
          <b>${esc(latestLine(s))}</b>
          <em>›</em>
        </a>
      </div>
    </article>`;
  }
  const mmIcons = {
    home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.5 12 4l8.5 6.5"/><path d="M5.5 9.3V19a1 1 0 0 0 1 1H10v-5a2 2 0 0 1 2-2 2 2 0 0 1 2 2v5h3.5a1 1 0 0 0 1-1V9.3"/></svg>`,
    compass: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.3"/><path d="M14.6 9.4 13 13l-3.6 1.6L11 11z"/></svg>`,
    shelf: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5v15M20 4.5v15M4 9.5h16M4 15.5h16"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4 19 6v6c0 4.3-3 7.1-7 8.6-4-1.5-7-4.3-7-8.6V6z"/></svg>`,
    mail: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="5.5" width="17.6" height="13" rx="2.2"/><path d="m4 7 8 6 8-6"/></svg>`,
    user: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="3.3"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg>`,
    login: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/><path d="M9 8l4 4-4 4M3 12h9.5"/></svg>`,
    pulse: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h3.6l2.1-6.2 4 12.4L15 12h6"/></svg>`
  };
  function header(active) {
    const u = VCBG.currentUser();
    const mode = effectiveSiteMode(VCBG.settings());
    const modeBanner = mode === "readonly" ? `<div class="site-readonly-banner" role="status">Website đang ở chế độ chỉ đọc — bạn vẫn có thể đọc truyện, nhưng các thao tác gửi dữ liệu đang tạm dừng.</div>` : "";
    const isAdmin = !!(u && VCBG.isAdmin());
    const admin = isAdmin ? `<a href="#/admin">Quản trị</a>` : "";
    const acc = u
      ? `<a class="icon-btn" href="#/thong-bao" aria-label="Thông báo"></a>
         <a class="avatar-chip" href="#/tai-khoan" title="${esc(u.profile.display_name)}">${esc(u.profile.avatar)}</a>`
      : `<a class="btn btn-login" href="#/dang-nhap">Đăng nhập</a>`;
    const mmLink = (href, icon, label) => `<a class="mm-item" href="${href}">${mmIcons[icon]}<span>${label}</span></a>`;
    return `${modeBanner}<header class="site-header">
      <div class="header-inner">
        ${logoHTML()}
        <nav class="nav-links">
          <a class="${active === "home" ? "on" : ""}" href="#/">Trang chủ</a>
          <a href="#/kham-pha">Khám phá</a>
          <a href="#/tu-truyen">Tủ truyện</a>
          ${admin}
        </nav>
        <form class="head-search" id="headSearch" role="search">
          <button type="button" class="icon-btn search-toggle" id="btnSearch" aria-label="Tìm truyện" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"></circle><path d="m16 16 4.2 4.2"></path></svg></button>
          <span class="search-ico" aria-hidden="true">⌕</span>
          <input id="qLive" type="search" placeholder="Tìm truyện..." autocomplete="off">
        </form>
        ${acc}
        <button class="icon-btn menu-btn" id="btnMenu" aria-label="Menu" aria-expanded="false"><span class="menu-btn-bars" aria-hidden="true"><i></i><i></i><i></i></span></button>
      </div>
      <div id="searchBox" class="search-panel" hidden></div>
    </header>
    <div id="mobileMenu" class="mobile-menu" hidden>
      <div class="mm-group">
        ${mmLink("#/", "home", "Trang chủ")}
        ${mmLink("#/kham-pha", "compass", "Khám phá")}
        ${mmLink("#/tu-truyen", "shelf", "Tủ truyện")}
        <button type="button" class="mm-item" id="menuResonanceBtn">${mmIcons.pulse}<span>Cộng hưởng</span><i class="mm-item-dot" aria-hidden="true"></i></button>
      </div>
      ${isAdmin || u ? `<div class="mm-group">
        ${isAdmin ? mmLink("#/admin", "shield", "Quản trị") : ""}
        ${u ? mmLink("#/hop-thu", "mail", "Hộp thư") : ""}
      </div>` : ""}
      <div class="mm-group">
        ${u ? mmLink("#/tai-khoan", "user", "Tài khoản") : mmLink("#/dang-nhap", "login", "Đăng nhập")}
      </div>
    </div>`;
  }
  function footer() {
    const st = VCBG.settings();
    const social = st.social || {};
    const links = [
      ["youtube", "YouTube"],
      ["tiktok", "TikTok"],
      ["facebook", "Facebook"],
      ["wattpad", "Wattpad"],
    ].filter(([k]) => social[k]);
    return `<footer class="site-footer foot2">
      <div class="foot2-rule foot2-rule-top"></div>
      <div class="wrap foot2-body">
        ${logoHTML()}
        <p class="foot2-kicker">Thư viện Bách Hợp</p>
        <p class="foot2-desc">Nơi lưu giữ những câu chuyện tôi yêu thích và những <br class="foot2-brk">bản dịch được thực hiện bằng tất cả sự trân trọng.</p>
        <div class="foot2-acts">
          <button type="button" class="foot2-act foot2-act-msg" id="btnMsg"><svg viewBox="0 0 24 24" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg><span class="foot2-act-t"><small>Liên hệ</small><b>Gửi lời nhắn</b></span></button>
          <button type="button" class="foot2-act foot2-act-report" id="btnReport"><svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="3" x2="5" y2="21"></line><path d="M5 4 19 9.5 5 15Z"></path></svg><span class="foot2-act-t"><small>Hỗ trợ</small><b>Báo lỗi nội dung</b></span></button>
        </div>
        <div class="foot2-section">
          <h4>Khám phá</h4>
          <a href="#/">Trang chủ</a>
          <a href="#/kham-pha">Khám phá</a>
          <a href="#/tu-truyen">Tủ truyện</a>
        </div>
        ${links.length ? `<div class="foot2-section">
          <h4>Cộng đồng</h4>
          ${links.map(([k, l]) => `<a class="foot2-social-${k}" href="${esc(social[k])}" target="_blank" rel="noopener">${l}</a>`).join("")}
        </div>` : ""}
      </div>
      <div class="foot2-rule"></div>
      <p class="foot2-copy">© ${new Date().getFullYear()} ViCamBachGiai · Bản dịch thuộc về người thực hiện · Vui lòng không đăng lại.</p>
    </footer>`;
  }
  function fmtRel(ts) {
    if (!ts) return "";
    const d = Date.now() - Number(ts);
    if (d < 60 * 1000) return "vừa xong";
    if (d < 60 * 60 * 1000) return Math.floor(d / 60000) + " phút trước";
    if (d < 24 * 60 * 60 * 1000) return Math.floor(d / 3600000) + " giờ trước";
    if (d < 7 * 24 * 60 * 60 * 1000) return Math.floor(d / 86400000) + " ngày trước";
    return fmtDate(ts);
  }
  function avatarHTML(user, cls) {
    const name = (user && (user.display_name || user.email)) || "Ẩn danh";
    const letter = String(name).trim().slice(0, 1).toUpperCase() || "?";
    const src = user && user.avatar && String(user.avatar).length > 2 ? user.avatar : "";
    if (src && /^(https?:|data:|covers\/|brand\/)/i.test(src)) {
      return `<span class="${cls || "sig-ava"}"><img src="${esc(src)}" alt=""></span>`;
    }
    return `<span class="${cls || "sig-ava"}">${esc(letter)}</span>`;
  }
  function resonancePanel() {
    const stats = VCBG.publicSiteStats ? VCBG.publicSiteStats() : {};
    const value = (key) => (Number.isFinite(stats[key]) ? fmtCount(stats[key]) : "—");
    const metricIcons = {
      members: `<svg viewBox="0 0 32 32"><circle cx="11" cy="10" r="4"/><circle cx="22" cy="12" r="3.2"/><path d="M3.5 27c.5-6.2 3.2-9.3 7.5-9.3s7 3.1 7.5 9.3M17 27c.3-4.7 2.2-7 5.4-7 3.1 0 5.2 2.3 5.6 7"/></svg>`,
      views: `<svg viewBox="0 0 32 32"><path d="M2.8 16s4.8-8 13.2-8 13.2 8 13.2 8-4.8 8-13.2 8S2.8 16 2.8 16Z"/><circle cx="16" cy="16" r="3.8"/></svg>`
    };
    const metric = (key, label, icon) => `<div class="res-table-row res-metric-${icon}">
      <span class="res-line-icon" aria-hidden="true">${metricIcons[icon]}</span>
      <span class="res-metric-label">${label}</span>
      <b data-res="${key}">${value(key)}</b>
    </div>`;
    const online = Number(stats.online) || 0;
    const ratio = online ? Math.round(((Number(stats.online_members) || 0) / online) * 100) : 0;
    return `<section class="wrap resonance res-editorial-final" id="mat-do-cong-huong" aria-labelledby="resTitle">
      <header class="res-head">
        <div class="res-kicker"><i aria-hidden="true"></i><span>LIVE RESONANCE</span><b aria-hidden="true"></b></div>
        <div class="res-title-line"><h2 id="resTitle">Mật độ cộng hưởng</h2><time id="resTime" class="res-updated">vừa cập nhật</time></div>
      </header>
      <div class="res-summary">
        <div class="res-summary-cell res-live">
          <b data-res="online">${value("online")}</b>
          <strong>ĐANG TRỰC TUYẾN</strong>
          <small><span data-res="online_guests">${value("online_guests")}</span> vãng lai / <span data-res="online_members">${value("online_members")}</span> thành viên</small>
          <div class="res-ratio-bar"><div class="res-ratio-fill" id="resRatio" style="width:${ratio}%"></div></div>
        </div>
        <div class="res-summary-cell res-visits">
          <b data-res="visits_today">${value("visits_today")}</b>
          <strong>LƯỢT GHÉ HÔM NAY</strong>
        </div>
      </div>
      <div class="res-table-body">
        ${metric("members", "Thành viên", "members")}
        ${metric("total_views", "Tổng lượt xem", "views")}
      </div>
    </section>`;
  }
  function recommendationPanel() {
    const weekly = VCBG.weeklyRanking ? VCBG.weeklyRanking(5) : [];
    const ranked = weekly.length ? weekly : VCBG.listStories({ sort: "views" }).slice(0, 5).map((story, i) => ({ rank: i + 1, story, week: 0 }));
    if (!ranked.length) return "";
    const tones = ["gold", "lavender", "sapphire", "jade", "coral"];
    return `<section class="wrap medal-picks" aria-labelledby="medalPicksTitle">
      <header class="medal-picks-head">
        <span class="medal-picks-emblem" aria-hidden="true">✦</span>
        <div><small>BẢNG VINH DANH</small><h2 id="medalPicksTitle">Kim Bài Đề Cử</h2><p>STORIES · PEOPLE · MORE WORLDS</p></div>
      </header>
      <div class="medal-picks-list">
        ${ranked.map((row, i) => {
          const s = row.story;
          const visits = Number(row.week) || 0;
          const storyHref = `#/truyen/${esc(s.slug)}`;
          return `<article class="medal-pick medal-pick-${tones[i]}" data-medal-index="${i}" tabindex="0" aria-label="Hạng ${i + 1}: ${esc(s.title)}">
            <strong class="medal-pick-rank">${String(i + 1).padStart(2, "0")}</strong>
            <a class="medal-pick-cover" href="${storyHref}" aria-label="Mở truyện ${esc(s.title)}">${coverImg(s.cover, "Bìa " + s.title)}</a>
            <a class="medal-pick-copy" href="${storyHref}"><b title="${esc(s.title)}">${esc(s.title)}</b><small>${esc(s.author || "—")}</small></a>
            <span class="medal-pick-status">${esc(storyStatusLabel(s))}</span>
            <span class="medal-pick-stats">
              <span><i class="stat-eye" aria-hidden="true"></i><b>${fmtCount(s.stats.views)}</b><small>lượt đọc</small></span>
              <span><i aria-hidden="true">♧</i><b>${fmtCount(visits)}</b><small>ghé thăm tuần này</small></span>
            </span>
            <span class="medal-pick-speed" aria-hidden="true"></span>
            <span class="medal-pick-checker" aria-hidden="true"></span>
            <span class="medal-pick-border-beam" aria-hidden="true"></span>
          </article>`;
        }).join("")}
      </div>
    </section>`;
  }
  function openResonanceModal() {
    if ($("#resModalHost")) return;
    const host = document.createElement("div");
    host.id = "resModalHost";
    host.innerHTML = `<div class="res-modal-bg" id="resModalBg"></div>
      <div class="res-modal" id="resModalBox" role="dialog" aria-modal="true" aria-labelledby="resTitle">
        <button type="button" class="r-ico res-modal-close" id="resModalClose" aria-label="Đóng">×</button>
        ${resonancePanel()}
      </div>`;
    document.body.appendChild(host);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const close = () => {
      host.remove();
      window.removeEventListener("hashchange", close);
      document.removeEventListener("keydown", onKey);
    };
    $("#resModalBg").onclick = close;
    $("#resModalClose").onclick = close;
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", close, { once: true });
    return close;
  }
  function watchResonanceStats() {
    if (!VCBG.watchPublicSiteStats || window.__vcbgResonanceWatching) return;
    window.__vcbgResonanceWatching = true;
    VCBG.watchPublicSiteStats((stats) => {
      $$('[data-res]').forEach((el) => {
        const n = stats[el.dataset.res];
        el.textContent = Number.isFinite(n) ? fmtCount(n) : "—";
      });
      const ratio = $("#resRatio");
      if (ratio) ratio.style.width = (stats.online ? Math.round((stats.online_members / stats.online) * 100) : 0) + "%";
      const times = $$(".res-updated");
      if (times.length && stats.updated_at) {
        const updated = new Date(stats.updated_at);
        times.forEach((time) => {
          time.textContent = updated.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) + " · vừa cập nhật";
          time.dateTime = updated.toISOString();
        });
      }
    });
  }
  function homeLower() {
    const q = new URLSearchParams((location.hash.split("?")[1] || "").replace(/#.*$/, ""));
    const sort = ["latest", "hot", "talk"].includes(q.get("sig")) ? q.get("sig") : "latest";
    const storyId = q.get("sigstory") || "";
    const feed = VCBG.communityFeed({ sort, storyId });
    const shown = feed;
    const stories = VCBG.listStories({ sort: "updated" });
    const me = VCBG.currentUser();
    const tab = (id, lab) =>
      `<button type="button" class="sig-tab${sort === id ? " on" : ""}" data-sig="${id}">${lab}</button>`;
    const replyHTML = (c, r, hidden) => {
      const who = (r.user && r.user.display_name) || "Ẩn danh";
      const parent = (c.user && c.user.display_name) || "bạn";
      return `<article class="sig-reply${hidden ? " is-more" : ""}" data-rid="${esc(r.id)}">
        ${avatarHTML(r.user, "sig-ava sm")}
        <div class="sig-reply-body">
          <div class="sig-meta">
            <b>${esc(who)}</b>
            ${r.staff ? `<span class="sig-badge staff">ViCam</span>` : ""}
            <time>${esc(fmtRel(r.created_at))}</time>
          </div>
          <p class="sig-to">Trả lời ${esc(parent)}</p>
          <p class="sig-text">${esc(r.body)}</p>
          <div class="sig-acts">
            <button type="button" class="sig-act" data-reply="${esc(c.id)}" data-to="${esc(who)}">Trả lời</button>
          </div>
        </div>
      </article>`;
    };
    const signalTones = ["violet", "cyan", "coral", "gold"];
    const cardHTML = (c, index) => {
      const who = (c.user && c.user.display_name) || "Ẩn danh";
      const replies = c.replies || [];
      const firstR = replies.slice(0, 1);
      const rest = replies.slice(1);
      const tone = signalTones[index % signalTones.length];
      return `<article class="sig-card sig-tone-${tone}" data-cid="${esc(c.id)}">
        ${avatarHTML(c.user)}
        <div class="sig-main">
          <div class="sig-meta">
            <b>${esc(who)}</b>
            <time>${esc(fmtRel(c.created_at))}</time>
            ${c.hot ? `<span class="sig-hot">★ Đang được chú ý</span>` : ""}
          </div>
          ${c.story ? `<a class="sig-story-tag" href="${esc(c.href)}">${esc(c.story.title)}</a>` : ""}
          ${
            c.quote
              ? `<blockquote class="sig-quote"><span aria-hidden="true">“</span><p>${esc(c.quote)}</p></blockquote>`
              : ""
          }
          <p class="sig-text">${esc(c.body)}</p>
          <div class="sig-acts">
            <button type="button" class="sig-chip${c.liked ? " on" : ""}" data-like="${esc(c.id)}" aria-pressed="${c.liked}">${c.like_count || 0}</button>
            <button type="button" class="sig-act" data-reply="${esc(c.id)}" data-to="${esc(who)}">Trả lời</button>
            <button type="button" class="sig-act" data-quote="${esc(c.id)}">Trích dẫn</button>
            ${me && me.id !== c.user_id ? `<button type="button" class="sig-act" data-report-comment="bình luận ${esc(c.id)}" data-story-title="${esc((c.story && c.story.title) || "Bình luận")}">Báo cáo</button>` : ""}
          </div>
          ${firstR.map((r) => replyHTML(c, r, false)).join("")}
          ${rest.map((r) => replyHTML(c, r, true)).join("")}
          ${
            rest.length
              ? `<button type="button" class="sig-more-replies" data-more="${esc(c.id)}">Xem ${rest.length} phản hồi khác ▾</button>`
              : ""
          }
        </div>
      </article>`;
    };
    return `<section class="wrap sig-wrap" id="tin-hieu">
      <article class="sig-board">
        <header class="sig-head">
          <div class="sig-brand">
            <div class="sig-brand-copy">
              <span class="sig-eyebrow">READER PULSE</span>
              <div class="sig-title-row">
                <h2>Tín hiệu độc giả</h2>
                <span class="sig-waveform" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
              </div>
              <p>Những cảm xúc vừa được gửi lại.</p>
            </div>
          </div>
          <span class="sig-live-count"><i></i>${feed.total || 0} bình luận gần đây</span>
        </header>
        <div class="sig-tools">
          <div class="sig-tabs">
            ${tab("latest", "Mới nhất")}
            ${tab("hot", "Nhiều tương tác")}
            ${tab("talk", "Đang thảo luận")}
          </div>
          <label class="sig-filter">
            <span class="sr-only">Chọn truyện</span>
            <select id="sigStory">
              <option value="">Tất cả truyện</option>
              ${stories.map((s) => `<option value="${esc(s.id)}" ${s.id === storyId ? "selected" : ""}>${esc(s.title)}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="sig-list" id="sigList">${
          shown.length
            ? shown
                .map((c, i) => cardHTML(c, i).replace('class="sig-card', `class="sig-card${i >= 5 ? " is-hidden" : ""}`))
                .join("")
            : `<div class="sig-empty"><b>Chưa có tín hiệu mới</b><span>Hãy mở đầu cuộc trò chuyện.</span></div>`
        }</div>
        ${shown.length > 5 ? `<button type="button" class="sig-more" id="sigMore">Xem thêm bình luận ▾</button>` : ""}
        <div class="sig-compose">
          ${avatarHTML(me && me.profile)}
          <button type="button" class="sig-fake" id="sigOpen">${me ? "Chia sẻ cảm nghĩ của bạn…" : "Đăng nhập để chia sẻ cảm nghĩ…"}</button>
          <button type="button" class="sig-send" id="sigJoin" aria-label="Tham gia trò chuyện">➤</button>
        </div>
        ${me ? "" : `<p class="sig-login"><a href="#/dang-nhap">Đăng nhập</a> để bình luận và tham gia thảo luận cùng cộng đồng ViCam.</p>`}
      </article>
    </section>`;
  }
  function openSignalBox(opts) {
    opts = opts || {};
    const me = VCBG.currentUser();
    if (!me) {
      goToLogin();
      return;
    }
    const stories = VCBG.listStories({ sort: "updated" });
    const host = document.createElement("div");
    host.className = "sig-host";
    host.innerHTML = `<div class="drawer-bg" id="sigBg"></div>
      <aside class="drawer bottom sig-drawer" role="dialog" aria-labelledby="sigBoxTitle">
        <div class="drawer-pad">
          <div class="drawer-head">
            <h3 id="sigBoxTitle">${opts.replyTo ? "Trả lời " + esc(opts.replyTo) : opts.quote ? "Trích dẫn" : "Tham gia trò chuyện"}</h3>
            <button type="button" class="r-ico" id="sigClose" aria-label="Đóng">×</button>
          </div>
          ${opts.quote ? `<blockquote class="sig-quote"><p>“${esc(opts.quote)}”</p></blockquote>` : ""}
          <form id="sigForm">
            ${
              opts.commentId
                ? ""
                : `<div class="field"><label>Truyện</label>
              <select name="story_id" required>
                <option value="">Chọn truyện</option>
                ${stories
                  .map((s) => {
                    const chs = VCBG.listChapters(s.id);
                    const last = chs[chs.length - 1];
                    return `<option value="${esc(s.id)}" data-ch="${last ? esc(last.id) : ""}">${esc(s.title)}</option>`;
                  })
                  .join("")}
              </select></div>`
            }
            <div class="field"><label>Nội dung</label>
              <textarea name="body" required maxlength="2000" placeholder="Viết cảm nghĩ của bạn…">${esc(opts.seed || "")}</textarea>
            </div>
            <button class="btn btn-cyan" type="submit">Gửi</button>
          </form>
        </div>
      </aside>`;
    document.body.appendChild(host);
    const close = () => host.remove();
    $("#sigBg").onclick = close;
    $("#sigClose").onclick = close;
    $("#sigForm").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        if (opts.commentId) {
          VCBG.replyComment(opts.commentId, fd.get("body"));
          toast("Đã trả lời.");
        } else {
          const sid = fd.get("story_id");
          const sel = e.target.querySelector("select[name=story_id]");
          const opt = sel && sel.selectedOptions[0];
          let chId = opt && opt.dataset.ch;
          if (!chId) {
            const chs = VCBG.listChapters(sid);
            chId = chs.length ? chs[chs.length - 1].id : "";
          }
          if (!chId) throw new Error("Truyện chưa có chương để gắn bình luận.");
          VCBG.addComment({
            chapterId: chId,
            storyId: sid,
            body: fd.get("body"),
            quote: opts.quote || "",
          });
          toast("Đăng bình luận thành công.");
        }
        close();
        go(location.hash || "/");
      } catch (err) {
        if (err.code === "AUTH_REQUIRED") goToLogin();
        else toast(err.message);
      }
    };
    const ta = host.querySelector("textarea");
    if (ta) ta.focus();
  }
  function bindLowerHome(skipCommunityWatch) {
    const setSig = (patch) => {
      const p = new URLSearchParams((location.hash.split("?")[1] || "").replace(/#.*$/, ""));
      Object.keys(patch).forEach((k) => {
        if (patch[k]) p.set(k, patch[k]);
        else p.delete(k);
      });
      const q = p.toString();
      const nextHash = "#/" + (q ? "?" + q : "");
      if (location.hash !== nextHash) history.replaceState(null, "", nextHash);

      const current = $("#tin-hieu");
      if (!current) return;
      const holder = document.createElement("div");
      holder.innerHTML = homeLower();
      const fresh = holder.firstElementChild;
      if (!fresh) return;
      current.replaceWith(fresh);
      bindLowerHome(true);
    };
    $$("[data-sig]").forEach((b) => {
      b.onclick = () => setSig({ sig: b.dataset.sig });
    });
    const storySel = $("#sigStory");
    if (storySel)
      storySel.onchange = () => setSig({ sigstory: storySel.value });
    const more = $("#sigMore");
    if (more)
      more.onclick = () => {
        const hidden = $$(".sig-card.is-hidden");
        hidden.slice(0, 6).forEach((el) => el.classList.remove("is-hidden"));
        if (!$$(".sig-card.is-hidden").length) more.remove();
      };
    const open = () => openSignalBox({});
    if ($("#sigOpen")) $("#sigOpen").onclick = open;
    if ($("#sigJoin")) $("#sigJoin").onclick = open;
    bindSignalActs();
    const openInbox = (type) => {
      const mode = type === "report" ? "report" : "message";
      const query = new URLSearchParams({ compose: mode });
      const source = safeInternalPath(readLocationPath());
      if (mode === "report" && source && source !== "/") query.set("source", source);
      const target = "/hop-thu?" + query.toString();
      if (!VCBG.currentUser()) {
        toast("Vui lòng đăng nhập để gửi và nhận phản hồi trong hộp thư.");
        goToLogin(target);
        return;
      }
      go(target);
    };
    const bm = $("#btnMsg");
    const br = $("#btnReport");
    if (bm) bm.onclick = () => openInbox("message");
    if (br) br.onclick = () => openInbox("report");
    const qp = new URLSearchParams((location.hash.split("?")[1] || "").replace(/#.*$/, ""));
    if (qp.get("sig") || qp.get("sigstory")) {
      const board = $("#tin-hieu");
      if (board) board.scrollIntoView({ block: "start" });
    }
    const signalBoard = $("#tin-hieu");
    if (!signalBoard) {
      if (typeof window.__vcbgCommunityUnwatch === "function") window.__vcbgCommunityUnwatch();
      window.__vcbgCommunityUnwatch = null;
    } else if (!skipCommunityWatch && VCBG.watchCommunityFeed) {
      if (typeof window.__vcbgCommunityUnwatch === "function") window.__vcbgCommunityUnwatch();
      window.__vcbgCommunityUnwatch = VCBG.watchCommunityFeed(() => {
        window.clearTimeout(window.__vcbgCommunityPaintTimer);
        window.__vcbgCommunityPaintTimer = window.setTimeout(() => {
          if (parseHash().name !== "home") return;
          const current = $("#tin-hieu");
          if (!current) return;
          const holder = document.createElement("div");
          holder.innerHTML = homeLower();
          const fresh = holder.firstElementChild;
          if (!fresh) return;
          current.replaceWith(fresh);
          bindLowerHome(true);
        }, 60);
      });
    }
  }
  function bindSignalActs() {
    $$("[data-like]").forEach((b) => {
      if (b.closest(".sig-board"))
        b.onclick = () => {
          try {
            const r = VCBG.likeComment(b.dataset.like);
            b.textContent = r.count;
            b.classList.toggle("on", r.on);
            b.setAttribute("aria-pressed", r.on);
          } catch (e) {
            if (e.code === "AUTH_REQUIRED") goToLogin();
            else toast(e.message);
          }
        };
    });
    $$("[data-reply]").forEach((b) => {
      if (b.closest(".sig-board"))
        b.onclick = () => openSignalBox({ commentId: b.dataset.reply, replyTo: b.dataset.to || "" });
    });
    $$("[data-quote]").forEach((b) => {
      b.onclick = () => {
        const card = b.closest(".sig-card");
        const text = card && card.querySelector(".sig-text");
        openSignalBox({ quote: text ? text.textContent : "" });
      };
    });
    $$("[data-more]").forEach((b) => {
      b.onclick = () => {
        const card = b.closest(".sig-card");
        if (!card) return;
        card.querySelectorAll(".sig-reply.is-more").forEach((n) => n.classList.remove("is-more"));
        b.remove();
      };
    });
  }
  function bindChrome() {
    watchResonanceStats();
    const menu = $("#btnMenu");
    const drawer = $("#mobileMenu");
    if (menu && drawer) {
      const closeMenu = () => {
        drawer.hidden = true;
        drawer.classList.remove("is-open");
        menu.setAttribute("aria-expanded", "false");
      };
      const openMenu = () => {
        drawer.hidden = false;
        drawer.classList.add("is-open");
        menu.setAttribute("aria-expanded", "true");
      };
      closeMenu();
      menu.onclick = (e) => {
        e.stopPropagation();
        closeSearch();
        if (drawer.classList.contains("is-open")) closeMenu();
        else openMenu();
      };
      $$("a", drawer).forEach((a) => (a.onclick = () => closeMenu()));
      const menuRes = $("#menuResonanceBtn", drawer);
      if (menuRes) menuRes.onclick = () => { closeMenu(); openResonanceModal(); };
    }
    const searchForm = $("#headSearch");
    const searchBtn = $("#btnSearch");
    const closeSearch = () => {
      if (searchForm) searchForm.classList.remove("is-open");
      if (searchBtn) searchBtn.setAttribute("aria-expanded", "false");
    };
    if (searchBtn && searchForm) {
      searchBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = searchForm.classList.toggle("is-open");
        searchBtn.setAttribute("aria-expanded", open ? "true" : "false");
        document.querySelector(".site-header")?.classList.toggle("is-searching", open);
        if (open && $("#qLive")) $("#qLive").focus();
        else if (box) { box.hidden = true; box.innerHTML = ""; }
      };
    }
    const input = $("#qLive");
    const box = $("#searchBox");
    const paintHits = (q) => {
      if (!box) return;
      if (!q) {
        box.hidden = true;
        box.innerHTML = "";
        return;
      }
      const hits = VCBG.searchSuggest(q, 6);
      box.hidden = false;
      box.innerHTML = hits.length
        ? hits
            .map(
              (s) =>
                `<a class="search-hit" href="#/truyen/${esc(s.slug)}"><img src="${esc(s.cover)}" alt=""><div><b>${esc(s.title)}</b><div class="sub">${esc(s.author)}</div></div></a>`
            )
            .join("")
        : `<div class="empty">Không có kết quả.</div>`;
    };
    if (input) {
      input.oninput = () => paintHits(input.value.trim());
      input.onfocus = () => paintHits(input.value.trim());
    }
    const form = $("#headSearch");
    if (form)
      form.onsubmit = (e) => {
        e.preventDefault();
        const q = ($("#qLive") && $("#qLive").value.trim()) || "";
        go("/kham-pha" + (q ? "?q=" + encodeURIComponent(q) : ""));
      };
    $$("[data-fav]").forEach((b) => {
      b.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const r = VCBG.toggleFavorite(b.getAttribute("data-fav"));
          toast(r.on ? "Đã thêm vào tủ truyện." : "Đã xóa khỏi tủ truyện.");
          if (b.classList.contains("wide-heart")) {
            b.textContent = r.on ? "♥" : "♡";
            b.setAttribute("aria-pressed", r.on);
            b.setAttribute("aria-label", r.on ? "Bỏ lưu" : "Lưu trữ");
          } else {
            b.textContent = r.on ? "♥ Đã lưu" : "♡ Lưu trữ";
          }
        } catch (err) {
          if (err.code === "AUTH_REQUIRED") goToLogin();
          else toast(err.message);
        }
      };
    });
    bindLowerHome();
  }
  function railStatusIcon(tone) {
    if (tone === "violet") {
      return `<span class="rail-status-icon rail-status-icon-complete" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path class="rail-icon-medal" d="M12 2.8l2 1.15 2.3-.15.95 2.1 2 1.15-.35 2.3 1.25 1.95-1.55 1.75-.05 2.3-2.2.65-1.35 1.85-2.2-.65-2.2.65L9.25 16l-2.2-.65-.05-2.3L5.45 11.3 6.7 9.35l-.35-2.3 2-1.15.95-2.1 2.3.15L12 2.8Z"/>
          <path class="rail-icon-check" d="m8.4 10.7 2.2 2.2 4.8-5"/>
          <path class="rail-icon-ribbon" d="m9.2 16.1-.8 5 3.6-2 3.6 2-.8-5"/>
        </svg>
      </span>`;
    }
    if (tone === "blue") {
      return `<span class="rail-status-icon rail-status-icon-upcoming" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <g class="rail-icon-hourglass">
            <path class="rail-icon-hourglass-frame" d="M6 3h12M6 21h12M7.5 3c0 4.2 1.9 5.9 4.5 9-2.6 3.1-4.5 4.8-4.5 9m9-18c0 4.2-1.9 5.9-4.5 9 2.6 3.1 4.5 4.8 4.5 9"/>
            <path class="rail-icon-sand-top" d="M9 6h6l-3 4Z"/>
            <path class="rail-icon-sand-bottom" d="m9 18 3-4 3 4Z"/>
            <path class="rail-icon-sand-stream" d="M12 9.5v5"/>
          </g>
        </svg>
      </span>`;
    }
    return `<span class="rail-status-icon rail-status-icon-live" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path class="rail-wave rail-wave-1" d="M3 10v4"/>
        <path class="rail-wave rail-wave-2" d="M7.5 7v10"/>
        <path class="rail-wave rail-wave-3" d="M12 4v16"/>
        <path class="rail-wave rail-wave-4" d="M16.5 7v10"/>
        <path class="rail-wave rail-wave-5" d="M21 10v4"/>
      </svg>
    </span>`;
  }
  function rail(title, list, tone) {
    if (!list || !list.length) return "";
    return `<section class="rail-panel tone-${tone || "cyan"}">
      <div class="rail-head">
        <h2>${railStatusIcon(tone)}<span>${esc(title)}</span></h2>
        <span class="count">${list.length} truyện</span>
        <span class="rail-swipe-cue" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
      <div class="rail" data-rail>${list.map((s) => storyCard(s)).join("")}</div>
    </section>`;
  }
  function homePrioritySort(list) {
    return (list || []).slice().sort((a, b) => {
      const pa = Number(a.home_priority);
      const pb = Number(b.home_priority);
      const aPrioritized = Number.isFinite(pa) && pa > 0;
      const bPrioritized = Number.isFinite(pb) && pb > 0;
      if (aPrioritized !== bPrioritized) return aPrioritized ? -1 : 1;
      if (aPrioritized && pa !== pb) return pa - pb;
      return (b.updated_at || 0) - (a.updated_at || 0);
    });
  }
  function previewStation(stories) {
    const list = (stories || []).filter(Boolean);
    if (!list.length) return "";
    const playableLead = list.find((story) => tiktokPostId(story.tiktok_intro_url));
    const lead = playableLead || list[0];
    const ordered = [lead].concat(list.filter((story) => story.id !== lead.id));
    const previewAttrs = (story) => {
      const postId = tiktokPostId(story.tiktok_intro_url);
      const teaser = String(story.synopsis || "").replace(/\s+/g, " ").trim().slice(0, 220);
      const label = ((story.genres || [])[0] || (story.tags || [])[0] || {}).name || "Truyện mới";
      return `data-preview-post="${esc(postId)}" data-preview-title="${esc(story.title)}" data-preview-author="${esc(story.author || "")}" data-preview-cover="${esc(story.cover || "")}" data-preview-label="${esc(label)}" data-preview-status="${esc(storyStatusLabel(story))}" data-preview-teaser="${esc(teaser)}"`;
    };
    const leadPost = tiktokPostId(lead.tiktok_intro_url);
    const leadTeaser = String(lead.synopsis || "").replace(/\s+/g, " ").trim();
    const leadLabel = ((lead.genres || [])[0] || (lead.tags || [])[0] || {}).name || "Truyện mới";
    return `<section class="wrap preview-station" id="tram-preview" aria-labelledby="previewStationTitle">
      <header class="preview-station-head">
        <span class="preview-station-signal" aria-hidden="true"><i></i><i></i><i></i></span>
        <div><small>STORY TEASER</small><h2 id="previewStationTitle">TRẠM PREVIEW</h2><p>Teaser TikTok phát ngay trong khung</p></div>
        <span class="preview-station-count">${list.length} tín hiệu</span>
      </header>
      <div class="preview-station-stage" data-preview-stage ${previewAttrs(lead)}>
        <div class="preview-station-media">
          ${lead.cover ? `<img class="preview-station-backdrop" src="${esc(lead.cover)}" alt="" aria-hidden="true"><img class="preview-station-poster" src="${esc(lead.cover)}" alt="Bìa ${esc(lead.title)}">` : `<span class="preview-station-no-cover" aria-hidden="true">V</span>`}
          ${leadPost
            ? `<button class="preview-station-play" type="button" ${previewAttrs(lead)} aria-label="Phát teaser ${esc(lead.title)} ngay tại đây"><span aria-hidden="true">▶</span><small>Phát tại đây</small></button>`
            : `<span class="preview-station-pending"><i aria-hidden="true"></i>Teaser đang chuẩn bị</span>`}
        </div>
        <div class="preview-station-copy">
          <span class="preview-station-now"><i aria-hidden="true"></i>${leadPost ? "Sẵn sàng phát" : "Đang chuẩn bị"}</span>
          <h3>${esc(lead.title)}</h3>
          <p class="preview-station-author">${esc(lead.author || "Chưa cập nhật tác giả")}</p>
          <div class="preview-station-pills"><span>${esc(storyStatusLabel(lead))}</span><span>${esc(leadLabel)}</span></div>
          <p class="preview-station-teaser">${esc(leadTeaser || "Một câu chuyện mới đang được chuẩn bị tại ViCamBachGiai.")}</p>
        </div>
      </div>
      <div class="preview-station-rail" aria-label="Danh sách teaser">
        ${ordered.map((story, index) => {
          const postId = tiktokPostId(story.tiktok_intro_url);
          const label = ((story.genres || [])[0] || (story.tags || [])[0] || {}).name || "Truyện mới";
          return `<button class="preview-station-card${story.id === lead.id ? " is-active" : ""}${postId ? "" : " is-pending"}" type="button" data-preview-index="${index}" ${previewAttrs(story)} aria-current="${story.id === lead.id ? "true" : "false"}" aria-label="Chọn truyện ${esc(story.title)}">
            <span class="preview-station-thumb">${story.cover ? `<img src="${esc(story.cover)}" alt="">` : `<b aria-hidden="true">V</b>`}<i aria-hidden="true">${postId ? "▶" : "…"}</i></span>
            <span class="preview-station-card-copy"><small>${String(index + 1).padStart(2, "0")} · ${esc(storyStatusLabel(story))}</small><b>${esc(story.title)}</b><em>${esc(story.author || (postId ? "Sẵn sàng phát" : "Đang chuẩn bị"))}</em></span>
          </button>`;
        }).join("")}
      </div>
      <div class="preview-station-progress" aria-label="Vị trí truyện">
        ${ordered.map((story, index) => `<button type="button" class="${story.id === lead.id ? "is-active" : ""}" data-preview-progress="${index}" aria-label="Chọn truyện ${index + 1}" aria-current="${story.id === lead.id ? "true" : "false"}"></button>`).join("")}
      </div>
    </section>`;
  }
  function pageHome() {
    const featured = VCBG.listStories({ featured: true });
    const ongoing = homePrioritySort(VCBG.listStories({ status: "ongoing" }).filter((s) => !s.upcoming));
    const updated = VCBG.listStories({ sort: "updated" }).filter((s) => !s.upcoming);
    const done = homePrioritySort(VCBG.listStories({ status: "completed" }).filter((s) => !s.upcoming));
    const soon = homePrioritySort(VCBG.listStories({ upcoming: true }));
    const previewStories = homePrioritySort(VCBG.listStories({ sort: "updated" }).filter((story) => tiktokPostId(story.tiktok_intro_url)));
    const slideMap = new Map();
    featured.concat(ongoing, updated, done, soon).forEach((s) => {
      if (s && s.id && !slideMap.has(s.id)) slideMap.set(s.id, s);
    });
    const slides = Array.from(slideMap.values());
    const tags = VCBG.listTags();
    setMeta("ViCamBachGiai — Thư viện Bách Hợp", VCBG.settings().tagline);
    const banner = slides;
    const stackCards = banner
      .map((s, idx) => {
        const chips = []
          .concat((s.genres || []).map((g) => g.name))
          .concat((s.tags || []).map((t) => t.name))
          .filter(Boolean)
          .slice(0, 2);
        const first = VCBG.listChapters(s.id, { sort: "asc" })[0];
        const readHref = first ? `#/truyen/${esc(s.slug)}/chuong-${first.number}` : `#/truyen/${esc(s.slug)}`;
        const syn = String(s.synopsis || "").replace(/\s+/g, " ").trim();
        const badge = s.upcoming ? "Sắp ra mắt" : statusLabel(s.status);
        return `<article class="stack-card${idx === 0 ? " is-active" : ""}" data-i="${idx}" data-d="${idx}" style="--tone:${esc(s.accent || "#7c5cbf")}">
          <img class="stack-cover" src="${esc(s.cover)}" alt="${esc(s.title)}" ${idx < 3 ? "" : "loading=\"lazy\""}>
          <div class="stack-shade"></div>
          <div class="stack-body">
            <p class="stack-badge">${esc(badge)}</p>
            <h2 class="stack-title">${esc(s.title)}</h2>
            <p class="stack-chips">${chips.map((c) => `<span>${esc(c)}</span>`).join("")}</p>
            <p class="stack-syn">${esc(syn)}</p>
            <div class="stack-actions">
              <a class="btn btn-cyan" href="${readHref}">Đọc ngay →</a>
              <a class="btn btn-ghost" href="#/truyen/${esc(s.slug)}">Chi tiết</a>
            </div>
          </div>
        </article>`;
      })
      .join("");
    const dots = banner
      .map((_, idx) => `<button type="button" data-dot="${idx}" class="${idx === 0 ? "on" : ""}" aria-label="Thẻ ${idx + 1}"></button>`)
      .join("");
    app().innerHTML =
      header("home") +
      `<section class="hero stack-hero" id="hero" aria-roledescription="carousel">
        <button type="button" class="stack-arrow stack-prev" data-dir="-1" aria-label="Thẻ trước">‹</button>
        <div class="stack-stage" id="stackStage">${stackCards}</div>
        <button type="button" class="stack-arrow stack-next" data-dir="1" aria-label="Thẻ sau">›</button>
        <div class="hero-nav"><div class="hero-dots">${dots}</div></div>
      </section>
      <div class="wrap">${socialStrip()}</div>
      <div class="wrap home-signal-label"><span>Thư Viện Tín Hiệu</span></div>
      <div class="wrap rails">
        ${rail("Đang lên sóng", ongoing, "cyan")}
        ${rail("Đã hoàn thành", done, "violet")}
        ${rail("Sắp ra mắt", soon, "blue")}
      </div>
      ${recommendationPanel()}
      ${previewStation(previewStories)}
      ${homeLower()}` +
      footer();
    bindChrome();
    const deck = banner;
    const n = deck.length;
    const heroEl = $("#hero");
    if (!heroEl || !n) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const HOLD = 3000;
    let i = 0;
    let timer = null;
    let paused = false;
    const rel = (k) => {
      let d = k - i;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      return d;
    };
    const preload = (idx) => {
      const s = deck[idx];
      if (!s || !s.cover) return;
      const im = new Image();
      im.src = s.cover;
    };
    const place = () => {
      const tone = (deck[i] && deck[i].accent) || "#7c5cbf";
      heroEl.style.setProperty("--hero-tone", tone);
      $$(".stack-card", heroEl).forEach((el, k) => {
        const d = rel(k);
        const abs = Math.abs(d);
        el.dataset.d = String(d);
        el.style.setProperty("--d", d);
        el.style.setProperty("--abs", abs);
        el.classList.toggle("is-active", d === 0);
        el.classList.toggle("is-side", abs > 0 && abs <= 2);
        el.style.zIndex = String(50 - abs);
        el.setAttribute("aria-hidden", d === 0 ? "false" : "true");
      });
      $$("[data-dot]", heroEl).forEach((el, k) => el.classList.toggle("on", k === i));
      preload((i + 1) % n);
      preload((i + n - 1) % n);
      preload((i + 2) % n);
    };
    const stop = () => {
      clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      stop();
      if (paused || n < 2) return;
      timer = setTimeout(() => go(1), HOLD);
    };
    const go = (dir) => {
      if (n < 2) return;
      const next = (((i + dir) % n) + n) % n;
      if (next === i) return;
      i = next;
      place();
      schedule();
    };
    $$("[data-dot]", heroEl).forEach((b) => {
      b.onclick = () => {
        const t = Number(b.dataset.dot);
        if (t === i) return;
        const fwd = (t - i + n) % n;
        const back = (i - t + n) % n;
        go(fwd <= back ? fwd : -back);
      };
    });
    $$("[data-dir]", heroEl).forEach((b) => {
      b.onclick = () => go(Number(b.dataset.dir));
    });
    $$(".stack-card", heroEl).forEach((el, k) => {
      el.onclick = (ev) => {
        if (el.classList.contains("is-active")) return;
        if (ev.target.closest("a,button")) return;
        const fwd = (k - i + n) % n;
        const back = (i - k + n) % n;
        go(fwd <= back ? fwd : -back);
      };
    });
    heroEl.addEventListener("mouseenter", () => {
      if (window.matchMedia("(hover: hover)").matches) {
        paused = true;
        stop();
      }
    });
    heroEl.addEventListener("mouseleave", () => {
      paused = false;
      schedule();
    });
    let sx = 0;
    let sy = 0;
    heroEl.addEventListener(
      "touchstart",
      (e) => {
        sx = e.changedTouches[0].clientX;
        sy = e.changedTouches[0].clientY;
      },
      { passive: true }
    );
    heroEl.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      },
      { passive: true }
    );
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        paused = true;
        stop();
      } else {
        paused = false;
        schedule();
      }
    });
    place();
    schedule();
  }
  function section(title, list) {
    if (!list || !list.length) return "";
    return `<section class="wrap section"><h2>${esc(title)}</h2><div class="card-grid">${list.map((s) => storyCard(s, true)).join("")}</div></section>`;
  }

  function pageExplore(route) {
    const q = route.q.q || "";
    const genre = route.q.genre || "";
    const tag = route.q.tag || "";
    const sort = route.q.sort || "updated";
    const list = VCBG.listStories({ q, genre, tag, sort }).filter((s) => (route.q.status ? s.status === route.q.status : true));
    setMeta("Khám phá — ViCamBachGiai", "Tìm truyện Bách Hợp theo bối cảnh và mạch chuyện.");
    app().innerHTML =
      header() +
      `<main class="wrap" style="padding:1.2rem 1rem 2rem">
        <h1 class="hero-title" style="font-size:1.8rem">Khám phá</h1>
        <form id="exForm" class="chapter-toolbar">
          <input name="q" value="${esc(q)}" placeholder="Tìm tên, tác giả…" style="flex:1;min-width:140px;background:#171512;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:.55rem .7rem">
          <select name="genre">${optList(VCBG.listGenres(), genre, "Bối cảnh")}</select>
          <select name="tag">${optList(VCBG.listTags(), tag, "Mạch chuyện")}</select>
          <select name="sort">
            <option value="updated" ${sort === "updated" ? "selected" : ""}>Mới cập nhật</option>
            <option value="views" ${sort === "views" ? "selected" : ""}>Đọc nhiều</option>
            <option value="likes" ${sort === "likes" ? "selected" : ""}>Yêu thích</option>
            <option value="rating" ${sort === "rating" ? "selected" : ""}>Đánh giá</option>
          </select>
          <button class="btn btn-primary" type="submit">Lọc</button>
        </form>
        <div class="card-grid">${list.length ? list.map((s) => storyCard(s, true)).join("") : ""}</div>
        ${list.length ? "" : `<div class="empty">Không tìm thấy truyện phù hợp.</div>`}
      </main>` +
      footer();
    bindChrome();
    $("#exForm").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const p = new URLSearchParams();
      ["q", "genre", "tag", "sort"].forEach((k) => {
        if (fd.get(k)) p.set(k, fd.get(k));
      });
      go("/kham-pha?" + p.toString());
    };
  }
  function optList(items, cur, label) {
    return `<option value="">${esc(label)}</option>` + items.map((x) => `<option value="${esc(x.slug)}" ${x.slug === cur ? "selected" : ""}>${esc(x.name)}</option>`).join("");
  }

  function pageStory(route) {
    const s = VCBG.getStoryBySlug(route.slug);
    if (!s) {
      app().innerHTML = header() + `<div class="empty">Không tìm thấy truyện.</div>` + footer();
      bindChrome();
      return;
    }
    setMeta(s.title + " — ViCamBachGiai", s.synopsis.slice(0, 160));
    const sortDesc = route.q.sort === "desc";
    const chs = VCBG.listChapters(s.id, { sort: sortDesc ? "desc" : "asc" });
    const prog = VCBG.getProgress(s.id);
    const readIds = VCBG.readChapterIds(s.id);
    const qch = (route.q.chuong || "").toLowerCase();
    const filtered = qch
      ? chs.filter((c) => String(c.number) === qch || (c.number === 0 && ["mở đầu", "mo dau"].includes(qch)) || (c.title || "").toLowerCase().includes(qch))
      : chs;
    const groupSize = 50;
    const groups = [];
    if (filtered.length) {
      const intro = filtered.find((c) => c.number === 0);
      const numbered = filtered.filter((c) => c.number > 0);
      if (numbered.length) {
        const nums = numbered.map((c) => c.number);
        const minN = Math.min(...nums);
        const maxN = Math.max(...nums);
        const startG = Math.floor((minN - 1) / groupSize) * groupSize + 1;
        for (let a = startG; a <= maxN; a += groupSize) {
          const b = a + groupSize - 1;
          const items = numbered.filter((c) => c.number >= a && c.number <= b);
          if (items.length) groups.push({ a, b, items });
        }
      }
      if (intro) {
        if (!groups.length) groups.push({ a: 0, b: 0, items: [intro] });
        else if (sortDesc) groups[groups.length - 1].items.push(intro);
        else groups[0].items.unshift(intro);
      }
    }
    const gIdx = Math.min(groups.length ? groups.length - 1 : 0, Math.max(0, Number(route.q.g || 0)));
    const slice = groups[gIdx] ? groups[gIdx].items : [];
    const first = VCBG.listChapters(s.id, { sort: "asc" })[0];
    const last = VCBG.listChapters(s.id, { sort: "asc" }).slice(-1)[0];
    const cont = prog
      ? chs.find((c) => c.id === prog.chapter_id) || chs.find((c) => c.number === prog.chapter_number)
      : first;
    const readHref = cont ? "#/truyen/" + s.slug + "/chuong-" + cont.number : "";
    const readLabel = prog && cont && first && cont.number !== first.number ? "Đọc tiếp" : "Đọc truyện";
    const latestHref = last ? "#/truyen/" + s.slug + "/chuong-" + last.number : "";
    const mine = VCBG.myRating(s.id);
    const fav = VCBG.isFavorite(s.id);
    const fol = VCBG.isFollow(s.id);
    const commentsN = VCBG.storyCommentCount(s.id);
    const sameAuthor = VCBG.storiesByAuthor(s.author, s.id);
    const relatedStories = VCBG.listStories({ sort: "updated" })
      .filter((o) => o.id !== s.id && !sameAuthor.some((a) => a.id === o.id));
    const tab = ["intro", "toc", "rate"].includes(route.q.tab) ? route.q.tab : "intro";
    const qs = (extra) => {
      const p = new URLSearchParams();
      p.set("tab", extra.tab || tab);
      if (extra.sort || (sortDesc && extra.sort !== "asc")) p.set("sort", extra.sort || "desc");
      if (extra.chuong || qch) p.set("chuong", extra.chuong != null ? extra.chuong : route.q.chuong || "");
      if (extra.g != null) p.set("g", String(extra.g));
      else if (route.q.g) p.set("g", route.q.g);
      [...p.keys()].forEach((k) => { if (!p.get(k)) p.delete(k); });
      const str = p.toString();
      return "#/truyen/" + s.slug + (str ? "?" + str : "");
    };
    const tagItems = [].concat(s.genres || []).concat(s.tags || []);
    const titleLength = Array.from(String(s.title || "")).length;
    const titleSizeClass = titleLength >= 32 ? "title-very-long" : titleLength >= 18 ? "title-long" : "";
    const tagShown = tagItems.slice(0, 3);
    const tagExtra = tagItems.length - tagShown.length;
    const tagsLine = tagShown
      .map((t) => {
        const kind = (s.genres || []).some((g) => g.id === t.id) ? "genre" : "tag";
        return `<a class="chip" href="#/kham-pha?${kind}=${esc(t.slug)}">${esc(t.name)}</a>`;
      })
      .join("") + (tagExtra > 0 ? `<span class="chip chip-more">+${tagExtra}</span>` : "");
    const infoText = storyInfoText(s);
    const introHtml = `<article class="intro-card">
        <h2 class="intro-title">Giới thiệu</h2>
        <div class="intro-body is-clamp" id="introBody">${esc(s.synopsis).replace(/\n/g, "<br>")}</div>
        <button type="button" class="intro-more" id="btnMore" hidden>Đọc tiếp tóm tắt →</button>
      </article>
      <article class="info-card">
        <h2 class="info-title">Thông tin truyện</h2>
        <div class="info-body" id="infoBody">${formatStoryInfo(infoText)}</div>
        <button type="button" class="info-more" id="btnInfoMore" hidden>Xem chi tiết đầy đủ</button>
      </article>
      ${sameAuthor.length ? `<section class="same-author">
        <div class="same-head">
          <h3>Cùng tác giả</h3>
          <span>${sameAuthor.length} truyện</span>
        </div>
        <div class="same-rail">${sameAuthor.map((o) => `<a class="same-card" href="#/truyen/${esc(o.slug)}">
          ${coverImg(o.cover, o.title)}
          <b>${esc(o.title)}</b>
          <small>${esc(o.author || "—")}</small>
          <em>${esc(storyStatusLabel(o))}</em>
        </a>`).join("")}</div>
      </section>` : ""}
      ${relatedStories.length ? `<section class="same-author recommended-stories">
        <div class="same-head">
          <h3>Đề xuất tác giả khác</h3>
          <span>${relatedStories.length} truyện</span>
        </div>
        <div class="same-rail">${relatedStories.map((o) => `<a class="same-card" href="#/truyen/${esc(o.slug)}">
          ${coverImg(o.cover, o.title)}
          <b>${esc(o.title)}</b>
          <small>${esc(o.author || "—")}</small>
          <em>${esc(storyStatusLabel(o))}</em>
        </a>`).join("")}</div>
      </section>` : ""}`;
    const sideStoryCard = (o) => `<a class="story-side-card" href="#/truyen/${esc(o.slug)}">
        ${coverImg(o.cover, o.title)}
        <span class="story-side-copy"><b>${esc(o.title)}</b><small>${esc(o.author || "—")}</small><em>${esc(storyStatusLabel(o))}</em></span>
      </a>`;
    const landscapeSidebar = `<aside class="story-landscape-sidebar" aria-label="Truyện liên quan">
        <div class="story-side-scroll">
          ${sameAuthor.length ? `<section class="story-side-section">
            <h2>Cùng tác giả</h2>
            <div class="story-side-list">${sameAuthor.map(sideStoryCard).join("")}</div>
          </section>` : ""}
          ${relatedStories.length ? `<section class="story-side-section story-side-other">
            <h2>Đề xuất khác</h2>
            <div class="story-side-list">${relatedStories.map(sideStoryCard).join("")}</div>
          </section>` : ""}
        </div>
      </aside>`;
    const tocHtml = `<div class="toc-box">
        <div class="toc-head">
          <strong>${filtered.length} chương</strong>
          <input id="chFind" placeholder="Số hoặc tên chương" value="${esc(route.q.chuong || "")}">
          <a class="btn btn-ghost" href="${qs({ sort: sortDesc ? "asc" : "desc", tab: "toc" })}">${sortDesc ? "Cũ → mới" : "Mới → cũ"}</a>
        </div>
        ${groups.length > 1 ? `<div class="toc-groups">${groups.map((g, i) => `<a class="${i === gIdx ? "on" : ""}" href="${qs({ tab: "toc", g: i })}">${g.a}–${g.b}</a>`).join("")}</div>` : ""}
        <ul class="chapter-list${slice.length > 5 ? " is-scrollable" : ""}">${slice.map((c) => `<li><a href="#/truyen/${esc(s.slug)}/chuong-${c.number}" class="${readIds.includes(c.id) ? "read" : ""}">
          <span class="num ${c.number === 0 ? "intro-num" : ""}">${c.number === 0 ? "◇" : c.number}</span><span>${esc(c.number === 0 ? (c.title || "Mở đầu") : (c.title || "Chương " + c.number))}</span>
          <span class="num">${fmtDate(c.published_at || c.updated_at)}</span></a></li>`).join("")}</ul>
      </div>`;
    const rateHtml = `<div class="rate-box">
        <p>Đánh giá truyện</p>
        <div class="stars" id="rate">${[1,2,3,4,5].map((n) => `<button type="button" data-star="${n}">${n <= mine ? "★" : "☆"}</button>`).join("")}</div>
        <p class="sub">${s.stats.rating_avg || "—"}★ · ${s.stats.rating_count} lượt · ${commentsN} bình luận</p>
      </div>`;
    app().innerHTML =
      header() +
      `<main class="wrap story-page">
        <div class="story-detail-layout ${tab === "intro" ? "is-intro" : "is-secondary"}">
        <div class="story-detail-primary">
        <section class="story-top">
          <div class="story-hero">
            <div class="story-cover">${coverImg(s.cover, "Bìa " + s.title, true)}</div>
            <div class="story-info">
              <div class="story-copy">
                <div class="badge">${esc(s.upcoming ? "Sắp ra mắt" : statusLabel(s.status))}</div>
                <h1 class="${titleSizeClass}">${esc(s.title)}</h1>
                <p class="by">Tác giả: <span>${esc(s.author || "—")}</span></p>
                <div class="tags">${tagsLine}</div>
              </div>
              <aside class="story-landscape-meta" aria-label="Thông tin truyện">
                <h2>Thông tin truyện</h2>
                <div class="landscape-info-body">${formatLandscapeInfo(infoText)}</div>
              </aside>
              <div class="story-metrics" role="list">
                <div class="metric" role="listitem"><span class="metric-ico" aria-hidden="true">👁</span><b>${s.stats.views || 0}</b><small>Lượt xem</small></div>
                <div class="metric" role="listitem"><span class="metric-ico" aria-hidden="true">★</span><b>${s.stats.rating_avg || 0}</b><small>Đánh giá</small></div>
                <div class="metric" role="listitem"><span class="metric-ico" aria-hidden="true">▤</span><b>${s.stats.chapter_count || 0}</b><small>Chương</small></div>
                <div class="metric" role="listitem"><span class="metric-ico heart" aria-hidden="true">♡</span><b>${s.stats.likes || 0}</b><small>Yêu thích</small></div>
              </div>
              <div class="story-acts">
                ${readHref ? `<a class="btn btn-cyan" href="${readHref}">${readLabel}</a>` : `<span class="btn" disabled>Chưa có chương</span>`}
                                <button class="btn btn-ghost" id="btnFol">♡ ${fol ? "Đã thả tim" : "Thả tim"}</button>
<button class="btn btn-ghost" id="btnFav">${fav ? "Đã lưu" : "Lưu trữ"}</button>
              </div>
            </div>
          </div>
        </section>
        <nav class="story-tabs" aria-label="Phần truyện">
          <a class="${tab === "intro" ? "on" : ""}" href="${qs({ tab: "intro" })}">Tóm tắt</a>
          <a class="${tab === "toc" ? "on" : ""}" href="${qs({ tab: "toc" })}">Mục lục</a>
          <a class="${tab === "rate" ? "on" : ""}" href="${qs({ tab: "rate" })}">Đánh giá</a>
        </nav>
        <section class="story-tab">${tab === "intro" ? introHtml : tab === "toc" ? tocHtml : rateHtml}</section>
        </div>
        ${tab === "intro" ? landscapeSidebar : ""}
        </div>
      </main>
      <div class="story-dock">
        ${latestHref ? `<a class="btn btn-cyan dock-read" href="${latestHref}">Chương mới</a>` : ""}
        <button class="btn btn-ghost dock-fav" type="button" id="btnShareStory">Chia sẻ</button>
      </div>` +
      footer();
    bindChrome();
    const more = $("#btnMore");
    const introBody = $("#introBody");
    if (more && introBody) {
      const syncMore = () => {
        const overflow = introBody.scrollHeight > introBody.clientHeight + 2;
        more.hidden = !overflow && introBody.classList.contains("is-clamp");
      };
      requestAnimationFrame(syncMore);
      more.onclick = () => {
        const on = introBody.classList.toggle("is-clamp");
        more.textContent = on ? "Đọc tiếp tóm tắt →" : "Thu gọn ↑";
        more.hidden = false;
      };
    }
    const infoMore = $("#btnInfoMore");
    const infoBody = $("#infoBody");
    if (infoMore && infoBody) {
      const syncInfo = () => {
        const overflow = infoBody.scrollHeight > infoBody.clientHeight + 4;
        infoMore.hidden = !overflow && infoBody.classList.contains("is-clamp");
      };
      requestAnimationFrame(syncInfo);
      infoMore.onclick = () => {
        const on = infoBody.classList.toggle("is-clamp");
        infoMore.textContent = on ? "Xem chi tiết đầy đủ" : "Thu gọn";
        infoMore.hidden = false;
      };
    }
    const toggleFav = () => {
      try {
        const r = VCBG.toggleFavorite(s.id);
        toast(r.on ? "Đã thêm vào tủ truyện." : "Đã xóa khỏi tủ truyện.");
        if ($("#btnFav")) $("#btnFav").textContent = r.on ? "Đã lưu" : "Lưu trữ";
      } catch (e) {
        if (e.code === "AUTH_REQUIRED") goToLogin();
        else toast(e.message);
      }
    };
    if ($("#btnFav")) $("#btnFav").onclick = toggleFav;
    if ($("#btnShareStory")) {
      $("#btnShareStory").onclick = async () => {
        // Never share the current address verbatim: OAuth providers may put
        // short-lived credentials in the query/hash during sign-in.
        const publicPath = location.pathname.replace(/\/index\.html$/i, "/") || "/";
        const shareUrl = location.origin + publicPath + "#/truyen/" + encodeURIComponent(String(s.slug || ""));
        const shareData = {
          title: s.title + " — ViCamBachGiai",
          text: "Đọc " + s.title + " trên ViCamBachGiai",
          url: shareUrl,
        };
        try {
          if (navigator.share) await navigator.share(shareData);
          else {
            await navigator.clipboard.writeText(shareUrl);
            toast("Đã sao chép liên kết truyện.");
          }
        } catch (e) {
          if (e && e.name !== "AbortError") toast("Chưa thể chia sẻ liên kết.");
        }
      };
    }
    if ($("#btnFol"))
      $("#btnFol").onclick = () => {
        try {
          const r = VCBG.toggleFollow(s.id);
          toast(r.on ? "Đã thả tim truyện." : "Đã bỏ thả tim.");
          $("#btnFol").textContent = r.on ? "♥ Đã thả tim" : "♡ Thả tim";
        } catch (e) {
          if (e.code === "AUTH_REQUIRED") goToLogin();
          else toast(e.message);
        }
      };
    $$("#rate [data-star]").forEach((b) => {
      b.onclick = () => {
        try {
          VCBG.rateStory(s.id, Number(b.dataset.star));
          toast("Đã ghi đánh giá.");
          pageStory(Object.assign({}, route, { q: Object.assign({}, route.q, { tab: "rate" }) }));
        } catch (e) {
          if (e.code === "AUTH_REQUIRED") goToLogin();
          else toast(e.message);
        }
      };
    });
    const find = $("#chFind");
    if (find)
      find.onchange = () => {
        const v = find.value.trim();
        go("/truyen/" + s.slug + "?tab=toc" + (v ? "&chuong=" + encodeURIComponent(v) : ""));
      };
  }

  async function pageRead(route) {
    if (!VCBG.currentUser()) {
      goToLogin(`/truyen/${route.slug}/chuong-${route.number}`);
      return;
    }
    const s = VCBG.getStoryBySlug(route.slug);
    if (!s) {
      app().innerHTML = `<div class="empty">Không tìm thấy truyện.</div>`;
      return;
    }
    const ch = VCBG.getChapter(s.id, route.number);
    if (!ch) {
      app().innerHTML = header() + `<div class="empty">Chương chưa xuất bản hoặc không tồn tại.</div>` + footer();
      bindChrome();
      return;
    }
    try {
      await VCBG.ensureChapterBody(ch);
    } catch (err) {
      app().innerHTML = header() + `<div class="empty">${esc(err.message || "Không tải được chương.")}</div>` + footer();
      bindChrome();
      return;
    }
    const all = VCBG.listChapters(s.id);
    const idx = all.findIndex((c) => c.id === ch.id);
    const prev = all[idx - 1];
    const next = all[idx + 1];
    const prefs = readPrefs();
    setMeta(`${s.title} — ${ch.number === 0 ? "Mở đầu" : "Chương " + ch.number} | ViCamBachGiai`, (ch.title || s.title) + " — đọc trên ViCamBachGiai.");
    VCBG.recordView(s.id, ch.id);
    const liked = VCBG.likedChapter(ch.id);
    const likeN = VCBG.chapterLikeCount(ch.id);
    const lastProg = VCBG.getProgress(s.id);
    if (!lastProg || lastProg.chapter_id !== ch.id) {
      VCBG.saveProgress(s.id, ch.id, ch.number, 0);
    }
    const comments = VCBG.listComments(ch.id);
    const rating = VCBG.getStory(s.id);
    const ratingAvg = (rating && rating.stats && rating.stats.rating_avg) || 0;
    const ratingN = (rating && rating.stats && rating.stats.rating_count) || 0;
    const mine = VCBG.myRating(s.id);
    const favOn = VCBG.isFavorite(s.id);
    const bodyHtml = decorateParagraphs(sanitize(ch.body), comments);
    // The player is part of the public reading experience. Uploading and
    // editing audio remain protected inside the Admin chapter editor.
    const audioHtml = chapterAudioPlayer(ch, s);
    const chLabel = `${ch.number === 0 ? "Mở đầu" : "Chương " + ch.number}${ch.title ? " · " + esc(ch.title) : ""}`;
    app().innerHTML = `<div class="reader-page" id="reader" data-theme="${esc(prefs.theme)}" data-font="${esc(prefs.font || "serif")}" style="--rsize:${prefs.size}rem">
      <header class="reader-chrome reader-top" id="rTop">
        <a class="r-ico" href="#/truyen/${esc(s.slug)}" aria-label="Về trang truyện">←</a>
        <div class="r-head-copy">
          <div class="r-story">${esc(s.title)}</div>
          <div class="r-sub">${chLabel}</div>
        </div>
        <button class="r-ico" id="btnBm" aria-label="Bookmark" aria-pressed="${favOn}">${favOn ? "★" : "☆"}</button>
        <button class="r-ico" id="btnSet" aria-label="Cỡ chữ và nền">Aa</button>
        <div class="r-progress"><span id="rBar"></span></div>
        <span class="r-pct" id="rPct">0%</span>
      </header>
      <article class="reader-body" id="rbody">
        <h2>${ch.number === 0 ? "Mở đầu" : "Chương " + ch.number}${ch.title ? ": " + esc(ch.title) : ""}</h2>
        <div class="r-orn" aria-hidden="true"></div>
        ${audioHtml}
        ${bodyHtml}
        <section class="r-engage" id="rEngage">
          <button type="button" id="btnLikeCh" class="${liked ? "on" : ""}"><span>♡</span><b>Thích chương này</b><em>${likeN}</em></button>
          <button type="button" id="btnRate"><span>☆</span><b>Đánh giá</b><em>${ratingAvg ? ratingAvg + " ★" : "—"}</em></button>
          <button type="button" id="btnCmtAll"><span>💬</span><b>Bình luận</b><em>${comments.length}</em></button>
        </section>
      </article>
      <nav class="reader-chrome reader-bot" id="rBot">
        ${prev ? `<a class="r-nav" href="#/truyen/${esc(s.slug)}/chuong-${prev.number}">‹ ${prev.number === 0 ? "Mở đầu" : "Chương trước"}</a>` : `<span class="r-nav is-off">‹ Chương trước</span>`}
        <button type="button" class="r-toc" id="btnToc" aria-label="Mục lục"><span></span></button>
        ${next ? `<a class="r-nav r-nav-r" href="#/truyen/${esc(s.slug)}/chuong-${next.number}">${ch.number === 0 ? "Chương 1" : "Chương sau"} ›</a>` : `<span class="r-nav r-nav-r is-off">Chương sau ›</span>`}
      </nav>
      <button type="button" class="auto-scroll-float" id="autoScrollFloat" aria-label="Tạm dừng tự cuộn" hidden><span>Ⅱ</span><b>TỰ CUỘN</b><em>1.0×</em></button>
      <div id="rDraw"></div>
    </div>`;
    const page = $("#reader");
    const body = $("#rbody");
    if (lastProg && lastProg.chapter_id === ch.id && lastProg.scroll) {
      requestAnimationFrame(() => window.scrollTo(0, lastProg.scroll));
    }
    let hideT;
    const immerse = (on) => page.classList.toggle("is-immersed", on);
    immerse(true);
    const bump = () => {
      immerse(false);
      clearTimeout(hideT);
      hideT = setTimeout(() => immerse(true), 3000);
    };
    const updateProg = () => {
      const el = document.documentElement;
      const max = Math.max(1, el.scrollHeight - el.clientHeight);
      const pct = Math.min(100, Math.round((window.scrollY / max) * 100));
      const bar = $("#rBar");
      const lab = $("#rPct");
      if (bar) bar.style.width = pct + "%";
      if (lab) lab.textContent = pct + "%";
    };
    page.onclick = (e) => {
      if (e.target.closest("a,button,.drawer,.drawer-bg,#rDraw,.p-bubble,.p-menu,.r-engage")) return;
      if (window.getSelection && String(window.getSelection()).trim()) return;
      bump();
    };
    let progT = 0;
    window.onscroll = () => {
      updateProg();
      if (!page.classList.contains("is-immersed")) immerse(true);
      clearTimeout(hideT);
      clearTimeout(progT);
      progT = setTimeout(() => VCBG.saveProgress(s.id, ch.id, ch.number, window.scrollY), 400);
    };
    updateProg();
    bindChapterAudio();
    const autoScroll = createAutoScroll(page, next ? `#/truyen/${esc(s.slug)}/chuong-${next.number}` : "");
    $("#btnSet").onclick = (e) => {
      e.stopPropagation();
      openSettings(page, autoScroll);
    };
    $("#btnToc").onclick = (e) => {
      e.stopPropagation();
      openToc(s, all, ch.number);
    };
    $("#btnBm").onclick = (e) => {
      e.stopPropagation();
      try {
        const r = VCBG.toggleFavorite(s.id);
        $("#btnBm").textContent = r.on ? "★" : "☆";
        $("#btnBm").setAttribute("aria-pressed", r.on);
        toast(r.on ? "Đã lưu vào tủ truyện." : "Đã bỏ lưu.");
      } catch (err) {
        if (err.code === "AUTH_REQUIRED") goToLogin();
        else toast(err.message);
      }
    };
    $("#btnLikeCh").onclick = () => {
      try {
        const r = VCBG.toggleChapterLike(ch.id);
        $("#btnLikeCh").classList.toggle("on", r.on);
        $("#btnLikeCh").querySelector("em").textContent = r.count;
      } catch (err) {
        if (err.code === "AUTH_REQUIRED") goToLogin();
        else toast(err.message);
      }
    };
    $("#btnRate").onclick = () => {
      if (!VCBG.currentUser()) return goToLogin();
      overlay(
        `<div class="aa-pad">
          <p class="set-lab">Đánh giá truyện</p>
          <div class="aa-row">${[1, 2, 3, 4, 5]
            .map((n) => `<button type="button" class="aa-chip${mine === n ? " on" : ""}" data-star="${n}">${"★".repeat(n)}</button>`)
            .join("")}</div>
        </div>`,
        "sheet"
      );
      $$("[data-star]").forEach((b) => {
        b.onclick = () => {
          try {
            const st = VCBG.rateStory(s.id, Number(b.dataset.star));
            $("#btnRate").querySelector("em").textContent = (st.rating_avg || 0) + " ★";
            toast("Đã ghi đánh giá.");
            $("#rDraw").innerHTML = "";
          } catch (err) {
            toast(err.message);
          }
        };
      });
    };
    $("#btnCmtAll").onclick = () => openComments(s, ch, "", "");
    bindParagraphComments(s, ch, comments);
  }
  function chapterAudioPlayer(ch, story) {
    const cover = story.cover || ch.audio_cover_url || "brand/mark.png";
    const videoId = youtubeVideoId(ch.youtube_audio_url);
    const title = ch.audio_title || (ch.number === 0 ? "Bản nghe phần mở đầu" : `Bản nghe chương ${ch.number}`);
    return `<section class="chapter-youtube-audio${videoId ? "" : " is-empty"}" data-chapter-audio ${videoId ? `data-youtube-id="${esc(videoId)}"` : ""}>
      <button type="button" class="chapter-youtube-bar" data-audio-toggle aria-expanded="false" ${videoId ? "" : "disabled"}>
        <span class="chapter-youtube-cover" style="--audio-cover:url('${esc(cover)}')" aria-hidden="true"><i>${videoId ? "▶" : "♪"}</i></span>
        <span class="chapter-youtube-copy"><small>${videoId ? "NGHE TRÊN YOUTUBE" : "BẢN NGHE"}</small><strong>${esc(videoId ? title : "Chưa có bản nghe")}</strong></span>
        <span class="chapter-youtube-action" data-audio-action>${videoId ? "Mở trình phát" : "Chưa cập nhật"}</span>
        <span class="chapter-youtube-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="chapter-youtube-player" data-audio-player hidden></div>
    </section>`;
  }
  function youtubeVideoId(value) {
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
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
    } catch (_) {
      return "";
    }
  }
  function bindChapterAudio() {
    $$('[data-chapter-audio]').forEach((box) => {
      const toggle = box.querySelector('[data-audio-toggle]');
      const player = box.querySelector('[data-audio-player]');
      const action = box.querySelector('[data-audio-action]');
      const videoId = box.dataset.youtubeId;
      if (!toggle || !player || !videoId) return;
      toggle.onclick = (event) => {
        event.stopPropagation();
        const open = toggle.getAttribute("aria-expanded") === "true";
        if (open) {
          player.replaceChildren();
          player.hidden = true;
          box.classList.remove("is-open");
          toggle.setAttribute("aria-expanded", "false");
          action.textContent = "Mở trình phát";
          return;
        }
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`;
        iframe.title = `Trình phát ${action.closest("button").querySelector("strong").textContent}`;
        iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.setAttribute("allowfullscreen", "");
        player.replaceChildren(iframe);
        player.hidden = false;
        box.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
        action.textContent = "Thu gọn & dừng";
        requestAnimationFrame(() => player.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      };
    });
  }
  function decorateParagraphs(html, comments) {
    const box = document.createElement("div");
    box.innerHTML = html || "";
    const counts = {};
    (comments || []).forEach((c) => {
      const k = c.para_key || hashQuote(c.quote);
      if (!k) return;
      counts[k] = (counts[k] || 0) + 1 + (Array.isArray(c.replies) ? c.replies.length : 0);
    });
    let n = 0;
    box.querySelectorAll("p").forEach((p) => {
      const key = "p" + n++;
      p.dataset.pk = key;
      p.classList.add("r-p");
      const nC = counts[key] || counts[hashQuote(p.textContent)] || 0;
      const bub = document.createElement("button");
      bub.type = "button";
      bub.className = "p-bubble" + (nC ? " has" : "");
      bub.dataset.pk = key;
      bub.dataset.count = nC > 99 ? "99+" : String(nC || "");
      bub.setAttribute("aria-label", nC ? `Đoạn này có ${nC} bình luận và phản hồi` : "Bình luận đoạn");
      bub.textContent = nC ? String(nC) : "";
      p.appendChild(bub);
    });
    return box.innerHTML;
  }
  function hashQuote(q) {
    const t = String(q || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
    return "q" + (h >>> 0).toString(36);
  }
  function bindParagraphComments(s, ch, comments) {
    const body = $("#rbody");
    if (!body) return;
    const closeMenu = () => $$(".p-menu").forEach((n) => n.remove());
    body.addEventListener("click", (e) => {
      const bub = e.target.closest(".p-bubble");
      if (bub) {
        e.stopPropagation();
        const p = bub.closest("p");
        const key = p && p.dataset.pk;
        const quote = p ? p.childNodes[0] && p.childNodes[0].textContent : "";
        openComments(s, ch, String(quote || "").trim().slice(0, 500), key);
        return;
      }
    });
    let holdT;
    body.addEventListener("pointerdown", (e) => {
      const p = e.target.closest("p.r-p");
      if (!p || e.target.closest(".p-bubble,a,button")) return;
      holdT = setTimeout(() => {
        closeMenu();
        const menu = document.createElement("div");
        menu.className = "p-menu";
        menu.innerHTML = `<button type="button" data-act="cmt">Bình luận</button><button type="button" data-act="quote">Trích dẫn</button>`;
        p.appendChild(menu);
        menu.onclick = (ev) => {
          ev.stopPropagation();
          const act = ev.target.dataset.act;
          const quote = String(p.innerText || "").replace(/\d+$/, "").trim().slice(0, 500);
          closeMenu();
          if (act) openComments(s, ch, quote, p.dataset.pk);
        };
      }, 420);
    });
    body.addEventListener("pointerup", () => clearTimeout(holdT));
    body.addEventListener("pointercancel", () => clearTimeout(holdT));
    if (window.__vcbgSel) document.removeEventListener("selectionchange", window.__vcbgSel);
    let selT = 0;
    window.__vcbgSel = () => {
      clearTimeout(selT);
      selT = setTimeout(() => {
      const sel = window.getSelection();
      const t = sel && String(sel).trim();
      $$(".quote-pop").forEach((n) => n.remove());
      if (!t || t.length < 4 || !body.contains(sel.anchorNode)) return;
      const r = sel.getRangeAt(0).getBoundingClientRect();
      const pop = document.createElement("div");
      pop.className = "p-menu quote-pop";
      pop.innerHTML = `<button type="button" data-act="cmt">Bình luận</button><button type="button" data-act="quote">Trích dẫn</button>`;
      pop.style.left = Math.max(8, r.left + window.scrollX) + "px";
      pop.style.top = r.top + window.scrollY - 44 + "px";
      pop.onclick = (ev) => {
        const p = sel.anchorNode && sel.anchorNode.parentElement && sel.anchorNode.parentElement.closest("p.r-p");
        openComments(s, ch, t.slice(0, 500), p && p.dataset.pk);
        $$(".quote-pop").forEach((n) => n.remove());
      };
      document.body.appendChild(pop);
      }, 180);
    };
    document.addEventListener("selectionchange", window.__vcbgSel);
  }
  function overlay(html, side, onClose) {
    const host = $("#rDraw") || app();
    const kind = side === "settings" ? "settings" : side === "sheet" ? "sheet" : side === "side" ? "side" : "sheet";
    host.innerHTML = `<div class="drawer-bg" id="obg"></div><aside class="drawer ${kind}" role="dialog">${html}</aside>`;
    const close = () => {
      host.innerHTML = "";
      if (typeof onClose === "function") onClose();
    };
    $("#obg").onclick = close;
    const x = $("#btnCloseDraw");
    if (x) x.onclick = close;
    return close;
  }
  function createAutoScroll(page, nextHref) {
    const pill = $("#autoScrollFloat");
    const scroller = document.scrollingElement || document.documentElement;
    const speeds = { 0.5: 12, 0.75: 18, 1: 26, 1.25: 36, 1.5: 48 };
    let running = false;
    let raf = 0;
    let last = 0;
    let carry = 0;
    let oldScrollBehavior = "";
    let behaviorChanged = false;
    let speed = readPrefs().autoScrollSpeed || 1;
    const paint = () => {
      if (!pill) return;
      pill.hidden = !running;
      const em = pill.querySelector("em");
      if (em) em.textContent = String(speed) + "×";
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      carry = 0;
      if (behaviorChanged) {
        scroller.style.scrollBehavior = oldScrollBehavior;
        behaviorChanged = false;
      }
      paint();
    };
    const step = (now) => {
      if (!running || !document.body.contains(page)) return stop();
      if (!last) last = now;
      const dt = Math.min(40, now - last);
      last = now;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      if (scroller.scrollTop >= max - 2) {
        stop();
        const pref = readPrefs();
        if (pref.autoNext && nextHref) location.hash = nextHref.slice(1);
        return;
      }
      // Mobile Safari rounds sub-pixel scrollBy values down to zero. Keep the
      // remainder and move by whole pixels so slow speeds remain visible.
      carry += (speeds[speed] || speeds[1]) * dt / 1000;
      if (carry >= 1) {
        const pixels = Math.floor(carry);
        carry -= pixels;
        // The site uses smooth scrolling globally. Repeated scrollBy calls can
        // keep restarting that animation on iOS, making the page look frozen.
        // Update the real scrolling element directly while auto-scroll runs.
        scroller.scrollTop = Math.min(max, scroller.scrollTop + pixels);
      }
      raf = requestAnimationFrame(step);
    };
    const start = () => {
      if (running) return;
      running = true;
      last = 0;
      carry = 0;
      oldScrollBehavior = scroller.style.scrollBehavior;
      scroller.style.scrollBehavior = "auto";
      behaviorChanged = true;
      paint();
      raf = requestAnimationFrame(step);
    };
    const setSpeed = (value) => {
      speed = Math.min(1.5, Math.max(0.5, Number(value) || 1));
      const p = readPrefs();
      p.autoScrollSpeed = speed;
      savePrefs(p);
      paint();
    };
    if (pill) pill.onclick = (e) => { e.stopPropagation(); stop(); };
    const userStops = () => { if (running) stop(); };
    page.addEventListener("touchstart", (e) => { if (!e.target.closest("#autoScrollFloat")) userStops(); }, { passive: true });
    page.addEventListener("wheel", userStops, { passive: true });
    return { start, stop, setSpeed, isRunning: () => running };
  }

  function openSettings(page, autoScroll) {
    const p = readPrefs();
    const speedOptions = [0.5, 0.75, 1, 1.25, 1.5];
    page.classList.add("settings-open");
    const closeSettings = overlay(
      `<div class="aa-pad aa-settings">
        <div class="aa-tabs" role="tablist" aria-label="Cài đặt đọc">
          <button type="button" class="on" data-setting-tab="text">Chữ</button>
          <button type="button" data-setting-tab="theme">Nền</button>
          <button type="button" data-setting-tab="scroll">Tự cuộn</button>
        </div>
        <section class="aa-panel on" data-setting-panel="text">
          <p class="set-lab">Cỡ chữ</p>
          <div class="aa-row">
            <button type="button" class="aa-chip" data-sz="-">A−</button>
            <button type="button" class="aa-chip" data-sz="+">A+</button>
          </div>
          <p class="set-lab">Kiểu chữ</p>
          <div class="aa-row">
            <button type="button" class="aa-chip${p.font !== "sans" ? " on" : ""}" data-ft="serif">Serif</button>
            <button type="button" class="aa-chip${p.font === "sans" ? " on" : ""}" data-ft="sans">Sans</button>
          </div>
        </section>
        <section class="aa-panel" data-setting-panel="theme">
          <p class="set-lab">Màu nền đọc</p>
          <div class="aa-row">
            <button type="button" class="aa-chip${p.theme === "dark" ? " on" : ""}" data-th="dark">Tối</button>
            <button type="button" class="aa-chip${p.theme === "light" ? " on" : ""}" data-th="light">Sáng</button>
            <button type="button" class="aa-chip${p.theme === "sepia" ? " on" : ""}" data-th="sepia">Kem</button>
          </div>
        </section>
        <section class="aa-panel" data-setting-panel="scroll">
          <div class="auto-scroll-setting">
            <div class="auto-scroll-setting-head"><div><b>Tự cuộn văn bản</b><small>Đọc rảnh tay, không cần vuốt màn hình</small></div><button type="button" class="auto-scroll-toggle${autoScroll && autoScroll.isRunning() ? " on" : ""}" id="autoScrollToggle">${autoScroll && autoScroll.isRunning() ? "Dừng" : "Bắt đầu"}</button></div>
            <p class="set-lab">Tốc độ tự cuộn</p>
            <div class="auto-speed-row">${speedOptions.map((v) => `<button type="button" class="auto-speed${Number(p.autoScrollSpeed) === v ? " on" : ""}" data-auto-speed="${v}">${v}×</button>`).join("")}</div>
            <label class="auto-next"><span><b>Hết chương tự chuyển chương tiếp</b></span><input type="checkbox" id="autoNext" ${p.autoNext ? "checked" : ""}><i></i></label>
          </div>
        </section>
      </div>`,
      "settings",
      () => page.classList.remove("settings-open")
    );
    $$('[data-setting-tab]').forEach((tab) => {
      tab.onclick = () => {
        $$('[data-setting-tab]').forEach((x) => x.classList.toggle("on", x === tab));
        $$('[data-setting-panel]').forEach((panel) => panel.classList.toggle("on", panel.dataset.settingPanel === tab.dataset.settingTab));
      };
    });
    const apply = () => {
      savePrefs(p);
      page.dataset.theme = p.theme;
      page.dataset.font = p.font || "serif";
      page.style.setProperty("--rsize", p.size + "rem");
      $$(".aa-chip[data-th]").forEach((b) => b.classList.toggle("on", b.dataset.th === p.theme));
      $$(".aa-chip[data-ft]").forEach((b) => b.classList.toggle("on", b.dataset.ft === (p.font || "serif")));
    };
    $$("[data-sz]").forEach(
      (b) =>
        (b.onclick = () => {
          p.size = Math.min(1.7, Math.max(0.95, +(p.size + (b.dataset.sz === "+" ? 0.08 : -0.08)).toFixed(2)));
          apply();
        })
    );
    $$("[data-th]").forEach(
      (b) =>
        (b.onclick = () => {
          p.theme = b.dataset.th;
          apply();
        })
    );
    $$("[data-ft]").forEach(
      (b) =>
        (b.onclick = () => {
          p.font = b.dataset.ft;
          apply();
        })
    );
    $$("[data-auto-speed]").forEach((b) => {
      b.onclick = () => {
        p.autoScrollSpeed = Number(b.dataset.autoSpeed);
        savePrefs(p);
        if (autoScroll) autoScroll.setSpeed(p.autoScrollSpeed);
        $$("[data-auto-speed]").forEach((x) => x.classList.toggle("on", x === b));
      };
    });
    const autoNext = $("#autoNext");
    if (autoNext) autoNext.onchange = () => {
      p.autoNext = autoNext.checked;
      savePrefs(p);
    };
    const autoToggle = $("#autoScrollToggle");
    if (autoToggle && autoScroll) autoToggle.onclick = () => {
      if (autoScroll.isRunning()) autoScroll.stop();
      else {
        autoScroll.setSpeed(p.autoScrollSpeed);
        autoScroll.start();
        closeSettings();
      }
    };
  }
  function openToc(s, all, cur) {
    overlay(
      `<div class="aa-pad toc-pad">
        <div class="drawer-head">
          <h3>Mục lục</h3>
          <button type="button" class="r-ico" id="btnCloseDraw" aria-label="Đóng">×</button>
        </div>
        <ul class="chapter-list">${all
          .map(
            (c) =>
              `<li class="${c.number === 0 ? "intro-toc-row" : ""}"><a class="${c.number === cur ? "on" : ""}" href="#/truyen/${esc(s.slug)}/chuong-${c.number}"><span class="num">${c.number === 0 ? "◇" : c.number}</span><span>${esc(c.number === 0 ? (c.title || "Mở đầu") : (c.title || ""))}</span></a></li>`
          )
          .join("")}</ul>
      </div>`,
      "sheet"
    );
  }
  function openComments(s, ch, quote, paraKey) {
    const u = VCBG.currentUser();
    let list = VCBG.listComments(ch.id);
    if (paraKey) {
      list = list.filter((c) => c.para_key === paraKey || hashQuote(c.quote) === paraKey);
    }
    overlay(
      `<div class="aa-pad toc-pad">
        <div class="drawer-head">
          <h3>${paraKey ? "Bình luận đoạn" : "Bình luận chương " + ch.number}</h3>
          <button type="button" class="r-ico" id="btnCloseDraw" aria-label="Đóng">×</button>
        </div>
        ${
          u
            ? `<form id="cForm">
          ${quote ? `<div class="quote-ref" id="qRef">${esc(quote)}</div>` : ""}
          <textarea name="body" required maxlength="2000" placeholder="Viết bình luận…"></textarea>
          <button class="btn btn-primary" type="submit" style="margin-top:.5rem">Gửi</button>
        </form>`
            : `<p><a href="#/dang-nhap">Đăng nhập</a> để bình luận.</p>`
        }
        <div id="cList">${renderComments(list, s)}</div>
      </div>`,
      "side"
    );
    const form = $("#cForm");
    if (form)
      form.onsubmit = (e) => {
        e.preventDefault();
        try {
          VCBG.addComment({ chapterId: ch.id, storyId: s.id, body: form.body.value, quote, para_key: paraKey || "" });
          toast("Đăng bình luận thành công.");
          openComments(s, ch, "", paraKey || "");
        } catch (err) {
          toast(err.message);
        }
      };
    bindCommentActs(s, ch);
  }
  function renderComments(list, s) {
    if (!list.length) return `<div class="empty">Chưa có bình luận.</div>`;
    const me = VCBG.currentUser();
    return list
      .map(
        (c) => `<article class="comment" data-id="${c.id}">
        ${c.quote ? `<div class="quote-ref">${esc(c.quote)}</div>` : ""}
        <b>${esc((c.user && c.user.display_name) || "Ẩn danh")}</b>
        <p>${esc(c.body)}</p>
        <div class="action-row">
          <button class="btn btn-ghost" data-like="${c.id}">♥ ${c.like_count || 0}</button>
          ${me ? `<button class="btn btn-ghost" data-reply="${c.id}">Trả lời</button>` : ""}
          ${me && me.id !== c.user_id ? `<button class="btn btn-ghost" data-report-comment="bình luận ${esc(c.id)}" data-story-title="${esc(s.title || "Bình luận")}">⚑ Báo cáo</button>` : ""}
          ${me && (me.id === c.user_id || VCBG.isAdmin()) ? `<button class="btn btn-ghost" data-del="${c.id}">Xóa</button>` : ""}
        </div>
        ${(c.replies || [])
          .map(
            (r) =>
              `<div class="comment" style="margin-left:1rem"><b>${esc((r.user && r.user.display_name) || "")}</b><p>${esc(r.body)}</p>
              ${me && (me.id === r.user_id || VCBG.isAdmin()) ? `<button class="btn btn-ghost" data-delr="${r.id}">Xóa</button>` : ""}</div>`
          )
          .join("")}
      </article>`
      )
      .join("");
  }
  function bindCommentActs(s, ch) {
    $$("[data-like]").forEach(
      (b) =>
        (b.onclick = () => {
          try {
            const r = VCBG.likeComment(b.dataset.like);
            b.textContent = "♥ " + r.count;
          } catch (e) {
            toast(e.message);
          }
        })
    );
    $$("[data-del]").forEach(
      (b) =>
        (b.onclick = () => {
          VCBG.deleteOwnComment(b.dataset.del);
          toast("Đã xóa bình luận.");
          openComments(s, ch, "");
        })
    );
    $$("[data-delr]").forEach(
      (b) =>
        (b.onclick = () => {
          VCBG.deleteOwnReply(b.dataset.delr);
          openComments(s, ch, "");
        })
    );
    $$("[data-reply]").forEach(
      (b) =>
        (b.onclick = () => {
          const body = prompt("Trả lời:");
          if (!body) return;
          try {
            VCBG.replyComment(b.dataset.reply, body);
            toast("Đã trả lời.");
            openComments(s, ch, "");
          } catch (e) {
            toast(e.message);
          }
        })
    );
  }

  function needUser(next) {
    if (!VCBG.currentUser()) {
      goToLogin(next);
      return false;
    }
    return true;
  }
  function pageAuth(kind) {
    const authRoute = parseHash();
    const savedReturn = authReturnSnapshot();
    const returnTarget =
      safeInternalPath(authRoute.q && authRoute.q.next) ||
      (savedReturn && safeInternalPath(savedReturn.path)) ||
      "";
    /* If auth finishes after a route transition, leave the login page
       automatically instead of asking an already signed-in user to sign in again. */
    if (VCBG.currentUser()) {
      returnFromAuth(returnTarget || "/");
      return;
    }
    setMeta("Đăng nhập — ViCamBachGiai", "Đăng nhập ViCamBachGiai bằng Google.");
    app().innerHTML =
      header() +
      `<main class="wrap auth-page auth-google-only" style="max-width:30rem;padding:2rem 1rem">
        <button class="auth-back" id="authBack" type="button" aria-label="Quay lại trang trước">← Quay lại trang trước</button>
        <section class="auth-login-content" aria-labelledby="authTitle">
          <h1 class="hero-title" id="authTitle">Đăng nhập</h1>
          <p class="auth-google-intro">Lưu truyện, bình luận và tiếp tục đọc trên mọi thiết bị.</p>
          <div class="auth-google-block">
            <div class="auth-google-choice">
              <div class="auth-google-copy"><strong>Chọn tài khoản Google</strong><span>Chạm biểu tượng G để tiếp tục</span></div>
              <div class="auth-google-direct" id="googleAuth" role="button" tabindex="0" aria-live="polite"><span class="google-g-mark" aria-hidden="true">G</span><span>Đăng nhập bằng Google</span></div>
            </div>
            <button type="button" class="auth-google-retry" id="googleRetry" hidden>Tải lại trang</button>
          </div>
          <p class="auth-google-note">ViCamBachGiai chỉ nhận tên, email và ảnh đại diện.</p>
          <p class="auth-error" id="aErr"></p>
        </section>
      </main>` +
      footer();
    bindChrome();
    const back = $("#authBack");
    if (back) {
      back.onclick = () => {
        if (returnTarget) returnFromAuth(returnTarget);
        else if (history.length > 1) history.back();
        else returnFromAuth("/");
      };
    }
    const showErr = (msg) => {
      const el = $("#aErr");
      if (el) el.textContent = msg || "";
      if (msg) toast(msg);
    };
    const googleBtn = $("#googleAuth");
    const retryBtn = $("#googleRetry");
    if (retryBtn) retryBtn.onclick = () => location.reload();
    if (googleBtn) {
      let attempts = 0;
      const mountGoogle = async () => {
        if (!googleBtn.isConnected) return;
        if (!(window.google && google.accounts && google.accounts.id)) {
          attempts += 1;
          if (attempts >= 50) {
            googleBtn.textContent = "Google chưa tải được trên trình duyệt này.";
            if (retryBtn) retryBtn.hidden = false;
            showErr("Kiểm tra mạng hoặc mở trang bằng Safari rồi tải lại.");
            return;
          }
          setTimeout(mountGoogle, 200);
          return;
        }
        const rawNonce = crypto.randomUUID
          ? crypto.randomUUID()
          : Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) => n.toString(16).padStart(2, "0")).join("");
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawNonce));
        const hashedNonce = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
        googleBtn.textContent = "";
        google.accounts.id.disableAutoSelect();
        google.accounts.id.initialize({
          client_id: "726540465981-pg5i7fnr26ljb0cpi22su28b1lhc4f6b.apps.googleusercontent.com",
          nonce: hashedNonce,
          auto_select: false,
          itp_support: true,
          callback: async (response) => {
            showErr("");
            rememberAuthReturn(returnTarget || "/");
            googleBtn.classList.add("is-busy");
            try {
              await VCBG.loginWithGoogleIdToken({ token: response.credential, nonce: rawNonce });
              toast("Đăng nhập thành công.");
              await returnFromAuth(returnTarget || "/");
            } catch (err) {
              googleBtn.classList.remove("is-busy");
              showErr(err.message || "Không thể đăng nhập bằng Google.");
            }
          },
        });
        google.accounts.id.renderButton(googleBtn, {
          type: "icon",
          theme: "outline",
          size: "large",
          shape: "circle",
        });
      };
      mountGoogle().catch((err) => {
        googleBtn.textContent = "Google chưa tải được trên trình duyệt này.";
        if (retryBtn) retryBtn.hidden = false;
        showErr(err.message || "Không thể khởi tạo đăng nhập Google.");
      });
    }

  }
  function pageLibrary() {
    if (!needUser()) return;
    const lib = VCBG.library();
    setMeta("Tủ truyện — ViCamBachGiai", "Truyện đã lưu trên ViCamBachGiai.");
    const block = (title, items, kind) =>
      `<section class="section"><h2>${title}</h2>${
        items.length
          ? `<div class="card-grid">${items
              .map((x) => {
                const s = x.story;
                if (!s) return "";
                const p = x.progress;
                return `<div>${storyCard(s, true)}${p ? `<a class="btn btn-ghost" href="#/truyen/${esc(s.slug)}/chuong-${p.chapter_number}">Đọc tiếp ch. ${p.chapter_number}</a>` : ""}${
                  kind === "fav"
                    ? `<button class="btn btn-ghost" data-unfav="${s.id}">Xóa khỏi tủ</button>`
                    : ""
                }</div>`;
              })
              .join("")}</div>`
          : `<div class="empty">Chưa có.</div>`
      }</section>`;
    app().innerHTML =
      header() +
      `<main class="wrap" style="padding:1.2rem 1rem 2rem">
        <h1 class="hero-title" style="font-size:1.8rem">Tủ truyện</h1>
        ${block("Yêu thích", lib.favorites, "fav")}
        ${block("Đang theo dõi", lib.follows)}
        <section class="section"><h2>Lịch sử đọc</h2>
          <ul class="chapter-list">${lib.history
            .map(
              (h) =>
                h.story
                  ? `<li><a href="#/truyen/${esc(h.story.slug)}/chuong-${h.chapter_number}"><span class="num">${h.chapter_number}</span><span>${esc(h.story.title)}</span><span class="num">${fmtDate(h.at)}</span></a></li>`
                  : ""
            )
            .join("")}</ul>
        </section>
        <section class="section"><h2>Bình luận của bạn</h2>
          ${lib.comments.map((c) => `<p>${esc(c.body)} — <a href="#/truyen/${esc((c.story && c.story.slug) || "")}">${esc((c.story && c.story.title) || "")}</a></p>`).join("") || `<div class="empty">Chưa có.</div>`}
        </section>
      </main>` +
      footer();
    bindChrome();
    $$("[data-unfav]").forEach(
      (b) =>
        (b.onclick = () => {
          VCBG.toggleFavorite(b.dataset.unfav);
          toast("Đã xóa khỏi tủ truyện.");
          pageLibrary();
        })
    );
  }
  function pageAccount() {
    if (!needUser()) return;
    const u = VCBG.currentUser();
    setMeta("Tài khoản — ViCamBachGiai", "Hồ sơ độc giả.");
    app().innerHTML =
      header() +
      `<main class="wrap" style="max-width:32rem;padding:1.4rem 1rem">
        <h1 class="hero-title" style="font-size:1.8rem">${esc(u.profile.display_name)}</h1>
        <p>${esc(u.email)} · ${VCBG.isAdmin() ? "Quản trị viên" : "Người đọc"}</p>
        <p><a class="btn btn-ghost" href="${VCBG.isAdmin() ? "#/admin/hop-thu" : "#/hop-thu"}">✉ Mở hộp thư</a></p>
        <form id="pForm">
          <div class="field"><label>Tên hiển thị</label><input name="display_name" value="${esc(u.profile.display_name)}"></div>
          <div class="field"><label>Giới thiệu</label><textarea name="bio">${esc(u.profile.bio || "")}</textarea></div>
          <button class="btn btn-primary">Lưu hồ sơ</button>
        </form>
        <p style="margin-top:1rem"><button class="btn btn-ghost" id="out">Đăng xuất</button></p>
      </main>` +
      footer();
    bindChrome();
    $("#pForm").onsubmit = async (e) => {
      e.preventDefault();
      const button = e.target.querySelector('button[type="submit"],button:not([type])');
      try {
        if (button) button.disabled = true;
        await VCBG.updateProfile(Object.fromEntries(new FormData(e.target)));
        toast("Đã lưu hồ sơ.");
        render();
      } catch (err) {
        toast(err.message || "Không lưu được hồ sơ.");
      } finally {
        if (button) button.disabled = false;
      }
    };
    $("#out").onclick = () => {
      VCBG.logout();
      toast("Đã đăng xuất.");
      go("/");
    };
  }
  function pageNotifs() {
    if (!needUser()) return;
    setMeta("Thông báo — ViCamBachGiai", "Trung tâm cập nhật truyện và tương tác.");
    app().innerHTML =
      header() +
      `<main class="wrap vc-notification-page">
        <section id="vcNotificationCenter" aria-live="polite">
          <div class="vc-notif-empty"><span>◇</span><b>Đang tải thông báo…</b></div>
        </section>
      </main>` +
      footer();
    bindChrome();
  }

  function pageMailbox() {
    if (!needUser()) return;
    setMeta("Hộp thư — ViCamBachGiai", "Trao đổi riêng giữa thành viên và quản trị viên.");
    app().innerHTML =
      header() +
      `<main class="wrap vc-mailbox-page">
        <section id="vcMailbox" aria-live="polite">
          <div class="vc-notif-empty"><span>✉</span><b>Đang mở hộp thư…</b></div>
        </section>
      </main>` +
      footer();
    bindChrome();
  }

  async function needAdmin() {
    const u = VCBG.currentUser();
    if (!u) {
      goToLogin();
      return false;
    }
    // A cached browser session is not enough for the admin screen. Revalidate
    // the signed-in user with Supabase before rendering any management UI.
    const allowed = await VCBG.verifyAdminAccess();
    if (!allowed) {
      toast("Phiên quản trị không hợp lệ hoặc đã hết hạn.");
      go("/");
      return false;
    }
    return true;
  }
  function adminNav(on) {
    const links = [
      ["", "Tổng quan"],
      ["/truyen", "Truyện"],
      ["/chuong", "Chương"],
      ["/binh-luan", "Bình luận"],
      ["/tuong-tac", "Đánh giá & yêu thích"],
      ["/thanh-vien", "Thành viên"],
      ["/phan-loai", "Phân loại"],
      ["/trang-chu", "Trang chủ"],
      ["/hop-thu", "Hộp thư"],
      ["/van-hanh", "Vận hành"],
      ["/cai-dat", "Cài đặt"],
    ];
    return `<nav class="admin-nav">${links
      .map(([h, l]) => `<a class="${on === h ? "on" : ""}" href="#/admin${h}">${l}</a>`)
      .join("")}</nav>`;
  }
  async function pageAdmin(route) {
    if (!(await needAdmin())) return;
    const sub = route.parts[1] || "";
    setMeta("Quản trị — ViCamBachGiai", "Bảng điều khiển.");
    if (sub === "truyen" && route.parts[2] === "moi") return adminStoryForm(null);
    if (sub === "truyen" && route.parts[2]) return adminStoryForm(route.parts[2]);
    if (sub === "chuong" && route.parts[2] === "moi") return adminChapterForm(null, route.q.story, route.q.intro === "1");
    if (sub === "chuong" && route.parts[2]) return adminChapterForm(route.parts[2]);
    if (sub === "tuong-tac") {
      try {
        await VCBG.refreshAdminEngagements();
      } catch (error) {
        toast(error.message || "Không tải được đánh giá và lượt yêu thích.");
      }
    }
    let body = "";
    if (!sub) {
      const st = VCBG.adminStats();
      body = `<div class="card-grid">
        ${kpi("Truyện", st.stories)}${kpi("Chương", st.chapters)}${kpi("Thành viên", st.members)}${kpi("Bình luận", st.comments)}${kpi("Lượt đọc", st.views)}
      </div>
      <h2>Cập nhật gần đây</h2>
      <ul class="chapter-list">${st.recent.map((s) => `<li><a href="#/admin/truyen/${s.id}"><span></span><span>${esc(s.title)}</span><span>${fmtDate(s.updated_at)}</span></a></li>`).join("")}</ul>`;
    } else if (sub === "truyen") {
      const list = VCBG.adminListStories();
      body = `<section class="admin-home-priority-intro">
          <div><span class="admin-home-priority-star">★</span><h2>Ưu tiên hiển thị trên trang chủ</h2></div>
          <p>Chọn số nhỏ để truyện đứng trước trong dãy thẻ của đúng nhóm trạng thái. Để “Không ưu tiên” nếu muốn trở về thứ tự cập nhật bình thường.</p>
        </section>
        <p><a class="btn btn-primary" href="#/admin/truyen/moi">Thêm truyện</a></p>
        <div class="admin-priority-actions">
          <p id="prioritySaveState" aria-live="polite">Chọn thứ tự rồi bấm lưu để áp dụng trên trang chủ.</p>
          <button class="btn btn-primary" type="button" id="saveHomePriorities" disabled>Lưu thứ tự ưu tiên</button>
        </div>
        <div class="table-wrapper"><table class="admin-story-table" style="width:100%;border-collapse:collapse">
        <thead><tr><th>Tên</th><th>Trạng thái</th><th>Hiển thị</th><th>Ưu tiên</th><th>Chương</th><th></th></tr></thead>
        <tbody>${list
          .map(
            (s) =>
              `<tr>
                <td><a href="#/admin/truyen/${s.id}">${esc(s.title)}</a></td>
                <td>${esc(storyStatusLabel(s))}</td>
                <td><span class="admin-visibility-badge ${s.published === false ? "is-hidden" : "is-public"}">${s.published === false ? "Đang ẩn" : "Công khai"}</span></td>
                <td><select class="admin-priority-select" data-home-priority="${s.id}" data-initial-priority="${s.home_priority || ""}" aria-label="Ưu tiên hiển thị của ${esc(s.title)}">
                  <option value="" ${s.home_priority ? "" : "selected"}>Không ưu tiên</option>
                  ${Array.from({ length: 20 }, (_, i) => i + 1)
                    .map((n) => `<option value="${n}" ${Number(s.home_priority) === n ? "selected" : ""}>Ưu tiên ${n}</option>`)
                    .join("")}
                </select></td>
                <td>${s.stats.chapter_count}</td>
                <td><a href="#/admin/chuong/moi?story=${s.id}">+ Chương</a> · <button type="button" data-story-visibility="${s.id}" data-visible="${s.published === false ? "false" : "true"}">${s.published === false ? "Hiện lại" : "Ẩn"}</button> · <button data-delst="${s.id}">Xóa</button></td>
              </tr>`
          )
          .join("")}</tbody></table></div>`;
    } else if (sub === "chuong") {
      const stories = VCBG.adminListStories();
      const sid = route.q.story || (stories[0] && stories[0].id);
      const chs = sid ? VCBG.listChapters(sid, { includeUnpublished: true, sort: "desc" }) : [];
      body = `<div class="chapter-toolbar">
        <select id="stPick">${stories.map((s) => `<option value="${s.id}" ${s.id === sid ? "selected" : ""}>${esc(s.title)}</option>`).join("")}</select>
        <a class="btn btn-primary" href="#/admin/chuong/moi?story=${sid || ""}">Chương mới</a>
      </div>
      <ul class="chapter-list">${chs
        .map(
          (c) =>
            `<li class="row"><span class="num">${c.number}</span><a href="#/admin/chuong/${c.id}">${esc(c.title || "")} · ${esc(c.status)}</a>
            <button data-delch="${c.id}">Xóa</button></li>`
        )
        .join("")}</ul>`;
    } else if (sub === "binh-luan") {
      const cm = VCBG.adminComments();
      body = `<label><input type="checkbox" id="lockC" ${VCBG.settings().allow_comments ? "" : "checked"}> Khóa bình luận toàn site</label>
        ${cm
          .map(
            (c) =>
              `<article class="comment"><b>${esc((c.user && c.user.display_name) || "")}</b> · ${esc((c.story && c.story.title) || "")} ch.${c.chapter ? c.chapter.number : "?"}
              <p>${esc(c.body)}</p>
              <button data-hide="${c.id}">Ẩn</button> <button data-kill="${c.id}">Xóa</button></article>`
          )
          .join("")}`;
    } else if (sub === "tuong-tac") {
      const engagement = VCBG.adminEngagements();
      const type = ["rating", "favorite"].includes(route.q.type) ? route.q.type : "all";
      const storyId = String(route.q.story || "");
      const query = String(route.q.q || "").trim().toLowerCase();
      const combined = engagement.ratings.concat(engagement.favorites).filter((item) => {
        if (type !== "all" && item.type !== type) return false;
        if (storyId && item.story_id !== storyId) return false;
        if (!query) return true;
        const user = item.user || {};
        const story = item.story || {};
        return [user.display_name, user.email, story.title].some((value) => String(value || "").toLowerCase().includes(query));
      }).sort((a, b) => (b.at || 0) - (a.at || 0));
      const pageSize = 30;
      const pages = Math.max(1, Math.ceil(combined.length / pageSize));
      const page = Math.min(pages, Math.max(1, Number(route.q.p) || 1));
      const shown = combined.slice((page - 1) * pageSize, page * pageSize);
      const filterHref = (nextType, nextPage) => {
        const params = new URLSearchParams();
        if (nextType && nextType !== "all") params.set("type", nextType);
        if (storyId) params.set("story", storyId);
        if (route.q.q) params.set("q", route.q.q);
        if (nextPage && nextPage > 1) params.set("p", nextPage);
        return "#/admin/tuong-tac" + (params.toString() ? "?" + params.toString() : "");
      };
      const stories = VCBG.adminListStories();
      body = `<section class="engagement-admin">
        <div class="engagement-head">
          <div><h2>Đánh giá & yêu thích</h2><p>Xem chính xác thành viên đã tương tác với từng truyện.</p></div>
          <div class="engagement-kpis"><span><b>${engagement.ratings.length}</b> lượt đánh giá</span><span><b>${engagement.favorites.length}</b> lượt yêu thích</span></div>
        </div>
        <div class="engagement-tabs" role="navigation" aria-label="Loại tương tác">
          <a class="${type === "all" ? "on" : ""}" href="${filterHref("all", 1)}">Tất cả</a>
          <a class="${type === "rating" ? "on" : ""}" href="${filterHref("rating", 1)}">★ Đánh giá</a>
          <a class="${type === "favorite" ? "on" : ""}" href="${filterHref("favorite", 1)}">♡ Yêu thích</a>
        </div>
        <form id="engagementFilter" class="engagement-filter">
          <input type="hidden" name="type" value="${esc(type)}">
          <select name="story" aria-label="Lọc theo truyện">
            <option value="">Tất cả truyện</option>
            ${stories.map((story) => `<option value="${story.id}" ${story.id === storyId ? "selected" : ""}>${esc(story.title)}</option>`).join("")}
          </select>
          <input name="q" value="${esc(route.q.q || "")}" placeholder="Tìm tên, Gmail hoặc truyện" aria-label="Tìm tương tác">
          <button type="submit">Lọc</button>
        </form>
        <p class="engagement-result">${combined.length} kết quả</p>
        <div class="engagement-list-scroll">
          <ul class="engagement-list">${shown.length ? shown.map((item) => {
            const user = item.user || {};
            const story = item.story || {};
            const identity = user.display_name || user.email || "Thành viên không xác định";
            const letter = String(identity).trim().slice(0, 1).toUpperCase() || "?";
            return `<li class="engagement-row">
              <span class="member-avatar" data-member-avatar data-avatar-value="${esc(user.avatar || "")}" data-google-avatar="${esc(user.google_avatar || "")}" data-avatar-letter="${esc(letter)}" aria-hidden="true">${esc(letter)}</span>
              <div class="engagement-person"><strong>${esc(identity)}</strong><span>${esc(user.email || "Không còn hồ sơ thành viên")}</span></div>
              <div class="engagement-story"><b>${esc(story.title || "Truyện đã bị xoá")}</b><span>${item.type === "rating" ? `<i class="engagement-stars">${"★".repeat(Number(item.stars) || 0)}${"☆".repeat(Math.max(0, 5 - (Number(item.stars) || 0)))}</i> ${Number(item.stars) || 0}/5` : '<i class="engagement-heart">♥</i> Đã yêu thích'}</span></div>
              <time datetime="${item.at ? new Date(item.at).toISOString() : ""}">${fmtDate(item.at)}</time>
            </li>`;
          }).join("") : '<li class="engagement-empty">Không có tương tác phù hợp.</li>'}</ul>
        </div>
        <nav class="member-pager" aria-label="Trang tương tác">
          ${page > 1 ? `<a href="${filterHref(type, page - 1)}">‹ Trước</a>` : "<span></span>"}
          <b>Trang ${page}/${pages}</b>
          ${page < pages ? `<a href="${filterHref(type, page + 1)}">Sau ›</a>` : "<span></span>"}
        </nav>
      </section>`;
    } else if (sub === "thanh-vien") {
      const ownerId = VCBG.currentUser().id;
      const memberQuery = String(route.q.q || "").trim().toLowerCase();
      const allMembers = VCBG.adminUsers().filter((u) => {
        if (!memberQuery) return true;
        return [u.profile.display_name, u.email].some((value) => String(value || "").toLowerCase().includes(memberQuery));
      });
      const memberPageSize = 25;
      const memberPages = Math.max(1, Math.ceil(allMembers.length / memberPageSize));
      const memberPage = Math.min(memberPages, Math.max(1, Number(route.q.p) || 1));
      const shownMembers = allMembers.slice((memberPage - 1) * memberPageSize, memberPage * memberPageSize);
      const memberHref = (page) => "#/admin/thanh-vien?p=" + page + (memberQuery ? "&q=" + encodeURIComponent(memberQuery) : "");
      body = `<section class="member-admin">
        <div class="member-admin-head">
          <div><h2>Thành viên</h2><p>${allMembers.length} tài khoản · 25 tài khoản mỗi trang</p></div>
          <form id="memberSearch" class="member-search">
            <input name="q" value="${esc(route.q.q || "")}" placeholder="Tìm tên hoặc Gmail" aria-label="Tìm thành viên">
            <button type="submit">Tìm</button>
          </form>
        </div>
        <div class="member-list-scroll">
          <ul class="member-list">${shownMembers
            .map((u) => {
              const isOwner = u.id === ownerId;
              return `<li class="member-row${isOwner ? " is-owner" : ""}">
                <div class="member-person">
                  <span class="member-avatar" data-member-avatar data-avatar-value="${esc((u.profile && u.profile.avatar) || "")}" data-google-avatar="${esc((u.profile && u.profile.google_avatar) || "")}" data-avatar-letter="${esc(String((u.profile && u.profile.display_name) || u.email || "?").trim().slice(0, 1).toUpperCase())}" aria-hidden="true">${esc(String((u.profile && u.profile.display_name) || u.email || "?").trim().slice(0, 1).toUpperCase())}</span>
                  <div class="member-identity"><strong>${esc(u.profile.display_name)}</strong><span>${esc(u.email)}</span></div>
                </div>
                <div class="member-state">${isOwner ? '<b class="owner-badge">Chủ sở hữu</b>' : `<span>${u.status === "banned" ? "Đã khóa" : "Đang hoạt động"}</span>`}</div>
                <div class="member-actions">${isOwner ? '<span class="owner-protected">Được bảo vệ</span>' : `<button type="button" data-ban="${u.id}">${u.status === "banned" ? "Mở khóa" : "Khóa"}</button>`}</div>
              </li>`;
            })
            .join("")}</ul>
        </div>
        <nav class="member-pager" aria-label="Trang thành viên">
          ${memberPage > 1 ? `<a href="${memberHref(memberPage - 1)}">‹ Trước</a>` : "<span></span>"}
          <b>Trang ${memberPage}/${memberPages}</b>
          ${memberPage < memberPages ? `<a href="${memberHref(memberPage + 1)}">Sau ›</a>` : "<span></span>"}
        </nav>
      </section>`;
    } else if (sub === "phan-loai") {
      body = `<h3>Bối cảnh</h3>
        <form id="gAdd" class="chapter-toolbar"><input name="name" placeholder="Bối cảnh mới" required><button class="btn btn-primary">Thêm</button></form>
        <ul>${VCBG.listGenres()
          .map((g) => `<li>${esc(g.name)} <button data-rg="${g.id}">Sửa</button> <button data-dg="${g.id}">Xóa</button></li>`)
          .join("")}</ul>
        <h3>Mạch chuyện / motif</h3>
        <form id="tAdd" class="chapter-toolbar"><input name="name" placeholder="Tag mới" required><button class="btn btn-primary">Thêm</button></form>
        <ul>${VCBG.listTags()
          .map((t) => `<li>${esc(t.name)} <button data-rt="${t.id}">Sửa</button> <button data-dt="${t.id}">Xóa</button></li>`)
          .join("")}</ul>`;
    } else if (sub === "trang-chu") {
      const stories = VCBG.adminListStories();
      const quote = VCBG.featuredQuote();
      const poll = VCBG.pollState();
      const qStory = quote ? quote.story.id : "";
      const qChs = qStory ? VCBG.listChapters(qStory, { includeUnpublished: true }) : [];
      body = `<h2>Câu lưu lại</h2>
        <form id="qForm">
          <div class="field"><label>Truyện</label>
            <select name="story_id" id="qStory">${stories.map((s) => `<option value="${s.id}" ${s.id === qStory ? "selected" : ""}>${esc(s.title)}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Chương</label>
            <select name="chapter_id">${qChs.map((c) => `<option value="${c.id}" ${quote && quote.chapter.id === c.id ? "selected" : ""}>${c.number}. ${esc(c.title || "")}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Nội dung trích dẫn</label><textarea name="text">${esc(quote ? quote.text : "")}</textarea></div>
          <button class="btn btn-cyan">Lưu câu</button>
        </form>
        <h2>Đợt bình chọn</h2>
        <form id="pollForm">
          <div class="field"><label>Tiêu đề</label><input name="title" value="${esc(poll.poll.title || "")}"></div>
          <p>Chọn tối đa 6 truyện:</p>
          ${stories
            .map(
              (s) =>
                `<label><input type="checkbox" name="sid" value="${s.id}" ${(poll.poll.story_ids || []).includes(s.id) ? "checked" : ""}> ${esc(s.title)}</label>`
            )
            .join("<br>")}
          <p><button class="btn btn-cyan">Lưu đợt bình chọn</button></p>
        </form>`;
    } else if (sub === "hop-thu") {
      const box = VCBG.adminInbox();
      const gmailReplyUrl = (message) => {
        const recipient = String(message.email || "").trim();
        const subject = "ViCamBachGiai phản hồi: " + (message.type === "report" ? "Báo lỗi nội dung" : "Lời nhắn");
        const greeting = "Chào " + (String(message.name || "").trim() || "bạn") + ",";
        const original = String(message.body || "").trim();
        const replyBody = greeting + "\n\n\n\n---\nTin nhắn đã gửi tới ViCamBachGiai:\n" + original;
        return "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(recipient) +
          "&su=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(replyBody);
      };
      const legacy = box.length ? `<section class="section"><h2>Lời nhắn và báo lỗi cũ</h2><p class="sub">Đây là dữ liệu một chiều từng nhận từ khách chưa đăng nhập. Không thể trả lời trong website vì không có tài khoản người nhận.</p>${box.map((m) => `<article class="comment">
        <b>${esc(m.type === "report" ? "Báo lỗi" : "Lời nhắn")}</b> · ${esc(m.name)} · ${esc(m.email)}
        ${m.story ? `<p class="sub">${esc(m.story)}</p>` : ""}<p>${esc(m.body)}</p><small>${fmtDate(m.at)}</small>
        ${m.email ? `<p><a class="btn btn-ghost" href="${esc(gmailReplyUrl(m))}" target="_blank" rel="noopener noreferrer">Trả lời bằng Gmail</a></p>` : ""}
      </article>`).join("")}</section>` : "";
      body = `<section id="vcAdminMailbox" aria-live="polite"><div class="vc-notif-empty"><span>✉</span><b>Đang mở hộp thư…</b></div></section>${legacy}`;
    } else if (sub === "van-hanh") {
      const st = VCBG.settings();
      const effective = effectiveSiteMode(st);
      body = `<section class="site-ops" data-current-mode="${esc(effective)}">
        <div class="site-ops-head">
          <div><small>TRẠNG THÁI WEBSITE</small><h2>${effective === "normal" ? "Đang hoạt động bình thường" : effective === "readonly" ? "Đang ở chế độ chỉ đọc" : "Đang bảo trì"}</h2></div>
          <span class="site-mode-pill is-${esc(effective)}">${effective === "normal" ? "ĐANG MỞ" : effective === "readonly" ? "CHỈ ĐỌC" : "BẢO TRÌ"}</span>
        </div>
        <div class="site-mode-actions" aria-label="Đổi trạng thái website">
          <button type="button" data-site-mode="normal" class="site-mode-action is-normal ${effective === "normal" ? "is-current" : ""}" ${effective === "normal" ? "disabled" : ""}>Mở website</button>
          <button type="button" data-site-mode="readonly" class="site-mode-action is-readonly ${effective === "readonly" ? "is-current" : ""}" ${effective === "readonly" ? "disabled" : ""}>Chỉ đọc</button>
          <button type="button" data-site-mode="maintenance" class="site-mode-action is-maintenance ${effective === "maintenance" ? "is-current" : ""}" ${effective === "maintenance" ? "disabled" : ""}>Bảo trì</button>
        </div>
      </section>`;
    } else if (sub === "cai-dat") {
      const st = VCBG.settings();
      const so = st.social || {};
      body = `<form id="setF">
        <div class="field"><label>Tên website</label><input name="name" value="${esc(st.name)}"></div>
        <div class="field"><label>Khẩu hiệu</label><input name="tagline" value="${esc(st.tagline)}"></div>
        <div class="field"><label>YouTube</label><input name="youtube" value="${esc(so.youtube || "")}"></div>
        <div class="field"><label>TikTok</label><input name="tiktok" value="${esc(so.tiktok || "")}"></div>
        <div class="field"><label>Instagram</label><input name="instagram" value="${esc(so.instagram || "")}"></div>
        <div class="field"><label>Facebook</label><input name="facebook" value="${esc(so.facebook || "")}"></div>
        <div class="field"><label>Wattpad</label><input name="wattpad" value="${esc(so.wattpad || "")}"></div>
        <label><input type="checkbox" name="allow_registration" ${st.allow_registration ? "checked" : ""}> Cho phép đăng ký</label>
        <label><input type="checkbox" name="allow_comments" ${st.allow_comments ? "checked" : ""}> Cho phép bình luận</label>
        <p><button class="btn btn-primary">Lưu</button></p>
      </form>`;
    }
    app().innerHTML =
      header() +
      `<main class="wrap admin-shell">${adminNav("/" + sub === "/" ? "" : "/" + sub)}<div>${body}</div></main>` +
      footer();
    bindChrome();
    bindAdmin(route);
  }
  function kpi(l, n) {
    return `<div class="kpi"><b>${n}</b>${esc(l)}</div>`;
  }
  function bindAdmin(route) {
    const pick = $("#stPick");
    if (pick) pick.onchange = () => go("/admin/chuong?story=" + pick.value);
    const prioritySelects = $$("[data-home-priority]");
    const prioritySaveButton = $("#saveHomePriorities");
    const prioritySaveState = $("#prioritySaveState");
    const markPriorityDirty = () => {
      const changed = prioritySelects.some((select) => String(select.value || "") !== String(select.dataset.initialPriority || ""));
      if (prioritySaveButton) prioritySaveButton.disabled = !changed;
      if (prioritySaveState) prioritySaveState.textContent = changed
        ? "Có thay đổi chưa lưu."
        : "Thứ tự hiện tại đã được lưu.";
    };
    prioritySelects.forEach((select) => {
      select.onchange = markPriorityDirty;
    });
    if (prioritySaveButton) {
      prioritySaveButton.onclick = async () => {
        const chosen = prioritySelects.map((select) => String(select.value || "")).filter(Boolean);
        const duplicated = chosen.find((value, index) => chosen.indexOf(value) !== index);
        if (duplicated) {
          toast("Ưu tiên " + duplicated + " đang được chọn cho nhiều truyện. Hãy chọn số khác nhau.");
          if (prioritySaveState) prioritySaveState.textContent = "Chưa lưu: có số ưu tiên bị trùng.";
          return;
        }
        const changed = prioritySelects.filter((select) => String(select.value || "") !== String(select.dataset.initialPriority || ""));
        if (!changed.length) {
          markPriorityDirty();
          return;
        }
        prioritySaveButton.disabled = true;
        prioritySaveButton.textContent = "Đang lưu…";
        prioritySelects.forEach((select) => { select.disabled = true; });
        try {
          for (const select of changed) {
            await VCBG.setStoryHomePriority(select.dataset.homePriority, select.value);
            select.dataset.initialPriority = String(select.value || "");
          }
          if (prioritySaveState) prioritySaveState.textContent = "Đã lưu và áp dụng trên trang chủ.";
          toast("Đã lưu thứ tự ưu tiên.");
          await render();
        } catch (error) {
          prioritySelects.forEach((select) => { select.disabled = false; });
          prioritySaveButton.disabled = false;
          prioritySaveButton.textContent = "Lưu thứ tự ưu tiên";
          if (prioritySaveState) prioritySaveState.textContent = "Lưu chưa thành công. Vui lòng thử lại.";
          toast(error.message || "Không lưu được thứ tự ưu tiên.");
        }
      };
    }
    $$("[data-story-visibility]").forEach((button) => {
      button.onclick = async () => {
        const isVisible = button.dataset.visible !== "false";
        const action = isVisible ? "ẩn" : "hiện lại";
        if (isVisible && !confirm("Ẩn truyện này khỏi toàn bộ website? Dữ liệu và các chương vẫn được giữ nguyên.")) return;
        button.disabled = true;
        button.textContent = "Đang " + action + "…";
        try {
          await VCBG.setStoryVisibility(button.dataset.storyVisibility, !isVisible);
          toast(isVisible ? "Đã ẩn truyện khỏi website." : "Đã hiện lại truyện trên website.");
          await render();
        } catch (error) {
          button.disabled = false;
          button.textContent = isVisible ? "Ẩn" : "Hiện lại";
          toast(error.message || "Không đổi được trạng thái hiển thị.");
        }
      };
    });
    $$("[data-delst]").forEach(
      (b) =>
        (b.onclick = () => {
          if (confirm("Xóa truyện và toàn bộ chương?")) {
            VCBG.deleteStory(b.dataset.delst);
            toast("Đã xóa truyện.");
            render();
          }
        })
    );
    $$("[data-delch]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (confirm("Xóa chương này? Nội dung và bình luận trong chương cũng sẽ bị xóa.")) {
            const originalText = b.textContent;
            b.disabled = true;
            b.textContent = "Đang xóa…";
            try {
              await VCBG.deleteChapter(b.dataset.delch);
              toast("Đã xóa chương.");
              await render();
            } catch (error) {
              b.disabled = false;
              b.textContent = originalText;
              toast(error.message || "Không xóa được chương.");
            }
          }
        })
    );
    const lock = $("#lockC");
    if (lock)
      lock.onchange = () => {
        VCBG.setCommentsAllowed(!lock.checked);
        toast(lock.checked ? "Đã khóa bình luận." : "Đã mở bình luận.");
      };
    $$("[data-hide]").forEach(
      (b) =>
        (b.onclick = () => {
          VCBG.moderateComment(b.dataset.hide, "hidden");
          toast("Đã ẩn.");
          render();
        })
    );
    $$("[data-kill]").forEach(
      (b) =>
        (b.onclick = () => {
          VCBG.moderateComment(b.dataset.kill, "deleted");
          toast("Đã xóa.");
          render();
        })
    );
    $$("[data-ban]").forEach(
      (b) =>
        (b.onclick = () => {
          try {
            const u = VCBG.adminUsers().find((x) => x.id === b.dataset.ban);
            VCBG.setUserStatus(b.dataset.ban, u.status === "banned" ? "active" : "banned");
            render();
          } catch (e) {
            toast(e.message);
          }
        })
    );
    const memberSearch = $("#memberSearch");
    if (memberSearch)
      memberSearch.onsubmit = (e) => {
        e.preventDefault();
        const q = String(new FormData(memberSearch).get("q") || "").trim();
        go("/admin/thanh-vien" + (q ? "?q=" + encodeURIComponent(q) : ""));
      };
    const engagementFilter = $("#engagementFilter");
    if (engagementFilter)
      engagementFilter.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(engagementFilter);
        const params = new URLSearchParams();
        if (fd.get("type") && fd.get("type") !== "all") params.set("type", fd.get("type"));
        if (fd.get("story")) params.set("story", fd.get("story"));
        if (String(fd.get("q") || "").trim()) params.set("q", String(fd.get("q")).trim());
        go("/admin/tuong-tac" + (params.toString() ? "?" + params.toString() : ""));
      };
    const gAdd = $("#gAdd");
    if (gAdd)
      gAdd.onsubmit = (e) => {
        e.preventDefault();
        VCBG.ensureGenre(new FormData(gAdd).get("name"));
        toast("Đã thêm bối cảnh.");
        render();
      };
    const tAdd = $("#tAdd");
    if (tAdd)
      tAdd.onsubmit = (e) => {
        e.preventDefault();
        VCBG.ensureTag(new FormData(tAdd).get("name"));
        toast("Đã thêm tag.");
        render();
      };
    $$("[data-rg]").forEach(
      (b) =>
        (b.onclick = () => {
          const n = prompt("Tên mới");
          if (n) {
            VCBG.renameGenre(b.dataset.rg, n);
            render();
          }
        })
    );
    $$("[data-dg]").forEach(
      (b) =>
        (b.onclick = () => {
          VCBG.deleteGenre(b.dataset.dg);
          render();
        })
    );
    $$("[data-rt]").forEach(
      (b) =>
        (b.onclick = () => {
          const n = prompt("Tên mới");
          if (n) {
            VCBG.renameTag(b.dataset.rt, n);
            render();
          }
        })
    );
    $$("[data-dt]").forEach(
      (b) =>
        (b.onclick = () => {
          VCBG.deleteTag(b.dataset.dt);
          render();
        })
    );
    const setF = $("#setF");
    if (setF)
      setF.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(setF);
        VCBG.updateSettings({
          name: fd.get("name"),
          tagline: fd.get("tagline"),
          allow_registration: setF.allow_registration.checked,
          allow_comments: setF.allow_comments.checked,
          social: {
            youtube: fd.get("youtube") || "",
            tiktok: fd.get("tiktok") || "",
            instagram: fd.get("instagram") || "",
            facebook: fd.get("facebook") || "",
            wattpad: fd.get("wattpad") || "",
          },
        });
        toast("Đã lưu cài đặt.");
      };
    const modeButtons = $$('[data-site-mode]');
    if (modeButtons.length) {
      modeButtons.forEach((button) => { button.onclick = async () => {
        const selected = button.dataset.siteMode;
        modeButtons.forEach((item) => { item.disabled = true; });
        const oldText = button.textContent;
        button.textContent = "Đang đổi…";
        try {
          await VCBG.updateSiteMode({
            site_mode: selected,
            maintenance_message: selected === "maintenance" ? "Website đang được bảo trì. Vui lòng quay lại sau." : "",
            maintenance_until: null,
            mode_reason: selected === "normal" ? "Mở website thủ công" : selected === "readonly" ? "Bật chỉ đọc thủ công" : "Bật bảo trì thủ công",
          });
          toast(selected === "normal" ? "Website đang hoạt động bình thường." : selected === "readonly" ? "Đã bật chế độ chỉ đọc." : "Đã bật chế độ bảo trì.");
          await render();
        } catch (error) {
          button.textContent = oldText;
          modeButtons.forEach((item) => { item.disabled = item.classList.contains("is-current"); });
          if (error && error.code === "AUTH_REQUIRED") {
            toast("Phiên Admin đã hết hạn. Hãy đăng nhập lại.");
            goToLogin("/admin/van-hanh");
          } else toast(error.message || "Không thay đổi được trạng thái.");
        }
      }; });
    }
    const qForm = $("#qForm");
    if (qForm)
      qForm.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(qForm);
        try {
          VCBG.setFeaturedQuote({
            text: fd.get("text"),
            story_id: fd.get("story_id"),
            chapter_id: fd.get("chapter_id"),
          });
          toast("Đã lưu câu lưu lại.");
        } catch (err) {
          toast(err.message);
        }
      };
    const pollForm = $("#pollForm");
    if (pollForm)
      pollForm.onsubmit = (e) => {
        e.preventDefault();
        const ids = $$("[name=sid]:checked").map((x) => x.value).slice(0, 6);
        VCBG.setPollStories(ids, new FormData(pollForm).get("title"));
        toast("Đã lưu đợt bình chọn.");
        render();
      };
  }
  function adminStoryForm(id) {
    const s = id ? VCBG.getStory(id) : { title: "", slug: "", author: "", editor: "", synopsis: "", description: "", status: "ongoing", featured: false, upcoming: false, published: true, home_priority: null, accent: "#8a6a4a", cover: "", tiktok_intro_url: "", genres: [], tags: [] };
    const selectedStatus = s.upcoming ? "upcoming" : s.status;
    const gids = (s.genres || []).map((g) => g.id);
    const tids = (s.tags || []).map((t) => t.id);
    app().innerHTML =
      header() +
      `<main class="wrap admin-shell">${adminNav("/truyen")}<div>
        <h1>${id ? "Sửa truyện" : "Thêm truyện"}</h1>
        <form id="stForm">
          <div class="field"><label>Tên</label><input name="title" required value="${esc(s.title)}"></div>
          <div class="field"><label>Slug</label><input name="slug" value="${esc(s.slug || "")}"></div>
          <div class="field"><label>Tác giả</label><input name="author" value="${esc(s.author || "")}"></div>
          <div class="field"><label>Editor / Dịch giả</label><input name="editor" value="${esc(s.editor || "")}"></div>
          <div class="field"><label>Văn án / Giới thiệu</label><textarea name="synopsis" rows="8">${esc(s.synopsis || "")}</textarea></div>
          <div class="field"><label>Thông tin truyện</label>
            <textarea name="description" rows="12" placeholder="Dán cả khối thông tin vào đây, mỗi dòng một mục. Ví dụ:&#10;Tên truyện: …&#10;Tác giả: …&#10;Thể loại: …&#10;Nhân vật chính: …&#10;CP phụ: …">${esc((s.description && s.description !== s.synopsis ? s.description : "") || "")}</textarea>
            <p class="editor-hint">Một ô duy nhất. Xuống dòng tự do, không cần thêm từng trường.</p>
          </div>
          <div class="field"><label>Trạng thái</label>
            <select name="status">
              <option value="ongoing" ${selectedStatus === "ongoing" ? "selected" : ""}>Đang lên sóng</option>
              <option value="completed" ${selectedStatus === "completed" ? "selected" : ""}>Đã hoàn thành</option>
              <option value="upcoming" ${selectedStatus === "upcoming" ? "selected" : ""}>Sắp ra mắt</option>
            </select>
          </div>
          <label class="admin-story-visibility-toggle"><input type="checkbox" name="published" ${s.published === false ? "" : "checked"}> <span><b>Hiển thị truyện trên website</b><small>Tắt mục này để ẩn toàn bộ truyện và các chương khỏi thành viên, khách và đường dẫn đọc trực tiếp. Dữ liệu vẫn được giữ nguyên trong quản trị.</small></span></label>
          <div class="field admin-story-priority-field"><label>Ưu tiên trên trang chủ</label>
            <select name="home_priority">
              <option value="" ${s.home_priority ? "" : "selected"}>Không ưu tiên</option>
              ${Array.from({ length: 20 }, (_, i) => i + 1)
                .map((n) => `<option value="${n}" ${Number(s.home_priority) === n ? "selected" : ""}>Ưu tiên ${n}</option>`)
                .join("")}
            </select>
            <p class="editor-hint">Số càng nhỏ càng đứng trước trong dãy thẻ của đúng trạng thái. Không ảnh hưởng banner hoặc Kim Bài Đề Cử.</p>
          </div>
          <label><input type="checkbox" name="featured" ${s.featured ? "checked" : ""}> Nổi bật (banner)</label>
          <div class="field"><label>Video TikTok cho TRẠM PREVIEW</label>
            <input name="tiktok_intro_url" type="url" inputmode="url" value="${esc(s.tiktok_intro_url || "")}" placeholder="https://www.tiktok.com/@ten/video/1234567890123456789">
            <p class="editor-hint">Mọi truyện đang hiển thị trên website có link TikTok hợp lệ sẽ xuất hiện trong TRẠM PREVIEW và phát ngay tại đó. Chấp nhận link TikTok công khai hoặc link chia sẻ rút gọn <b>vt.tiktok.com/…</b>.</p>
          </div>
          <div class="field"><label>Màu chủ đạo banner</label><input name="accent" value="${esc(s.accent || "#8a6a4a")}"></div>
          <div class="field"><label>Bìa</label><input type="file" id="coverFile" accept="image/*">
            <p class="editor-hint" id="coverStatus">Có thể chọn ảnh dung lượng lớn từ điện thoại. Website sẽ tự chuyển sang WebP và giảm xuống dung lượng an toàn.</p>
            <div class="detail-cover" id="coverPreview" style="margin-top:.6rem">${s.cover ? coverImg(s.cover, "Bìa") : ""}</div>
          </div>
          <fieldset class="field"><legend>Bối cảnh</legend>
            ${VCBG.listGenres()
              .map((g) => `<label><input type="checkbox" name="genre" value="${g.id}" ${gids.includes(g.id) ? "checked" : ""}> ${esc(g.name)}</label>`)
              .join(" ")}
          </fieldset>
          <fieldset class="field"><legend>Mạch chuyện</legend>
            ${VCBG.listTags()
              .map((t) => `<label><input type="checkbox" name="tag" value="${t.id}" ${tids.includes(t.id) ? "checked" : ""}> ${esc(t.name)}</label>`)
              .join(" ")}
          </fieldset>
          <button class="btn btn-primary">Lưu truyện</button>
        </form>
      </div></main>` +
      footer();
    bindChrome();
    let cover = s.cover || "";
    let coverFile = null;
    let coverPreviewUrl = "";
    $("#coverFile").onchange = () => {
      const f = $("#coverFile").files[0];
      if (!f) return;
      coverFile = f;
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      coverPreviewUrl = URL.createObjectURL(f);
      const preview = $("#coverPreview");
      if (preview) preview.innerHTML = coverImg(coverPreviewUrl, "Bìa đã chọn");
      const status = $("#coverStatus");
      if (status) {
        const mb = Math.max(0.01, f.size / 1024 / 1024).toFixed(2);
        status.textContent = "Đã chọn " + f.name + " · " + mb + " MB. Ảnh sẽ được tự xoay, chuyển WebP và nén khi lưu.";
      }
      toast("Đã chọn bìa; website sẽ tự tối ưu khi lưu.");
    };
    $("#stForm").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = e.target.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = coverFile ? "Đang tối ưu ảnh…" : "Đang lưu…";
      }
      try {
        const rec = await VCBG.upsertStory({
          id: id && id !== "moi" ? id : undefined,
          title: fd.get("title"),
          slug: fd.get("slug"),
          author: fd.get("author"),
          editor: fd.get("editor"),
          synopsis: fd.get("synopsis"),
          description: fd.get("description"),
          status: fd.get("status"),
          featured: e.target.featured.checked,
          published: e.target.published.checked,
          home_priority: fd.get("home_priority"),
          tiktok_intro_url: fd.get("tiktok_intro_url"),
          upcoming: fd.get("status") === "upcoming",
          accent: fd.get("accent"),
          cover,
          cover_file: coverFile,
          genre_ids: $$("[name=genre]:checked").map((x) => x.value),
          tag_ids: $$("[name=tag]:checked").map((x) => x.value),
        });
        toast("Đã lưu truyện.");
        go("/admin/truyen/" + rec.id);
      } catch (err) {
        toast(err.message || "Không lưu được truyện.");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Lưu truyện";
        }
      }
    };
  }
  let editorTimer = null;
  async function adminChapterForm(id, storyId, isIntro) {
    const ch = id ? VCBG.getChapterById(id) : null;
    if (ch) {
      try {
        await VCBG.ensureChapterBody(ch);
      } catch (err) {
        toast(err.message || "Không tải được nội dung chương.");
      }
    }
    const stories = VCBG.adminListStories();
    const sid = (ch && ch.story_id) || storyId || (stories[0] && stories[0].id);
    const num = ch ? ch.number : isIntro ? 0 : sid ? VCBG.nextChapterNumber(sid) : 1;
    const introMode = num === 0;
    const tools = [
      ["undo", "Hoàn tác", "↶"],
      ["redo", "Làm lại", "↷"],
      ["bold", "Đậm", "B"],
      ["italic", "Nghiêng", "I"],
      ["underline", "Gạch chân", "U"],
      ["strike", "Gạch ngang", "S"],
      ["h2", "Tiêu đề lớn", "H2"],
      ["h3", "Tiêu đề nhỏ", "H3"],
      ["p", "Đoạn văn", "¶"],
      ["quote", "Trích dẫn", "“ ”"],
      ["ul", "Danh sách", "•"],
      ["ol", "Đánh số", "1."],
      ["left", "Căn trái", "⬅"],
      ["center", "Căn giữa", "↔"],
      ["right", "Căn phải", "➡"],
      ["justify", "Căn đều", "☰"],
      ["gap-", "Giãn đoạn hẹp", "¶−"],
      ["gap+", "Giãn đoạn rộng", "¶+"],
      ["link", "Chèn liên kết", "🔗"],
      ["img", "Chèn ảnh", "🖼"],
      ["clear", "Xóa định dạng", "Tx"],
    ];
    app().innerHTML =
      header() +
      `<main class="wrap admin-shell">${adminNav("/chuong")}<div>
        <h1>${ch ? (introMode ? "Sửa chương mở đầu" : "Sửa chương") : (introMode ? "Chương mở đầu" : "Chương mới")}</h1>
        <form id="chForm">
          <div class="field"><label>Truyện</label>
            <select name="story_id">${stories.map((s) => `<option value="${s.id}" ${s.id === sid ? "selected" : ""}>${esc(s.title)}</option>`).join("")}</select>
          </div>
          ${introMode ? `<div class="field intro-type-field"><label>Loại chương</label><div class="intro-type-value">◇ Mở đầu <small>Hiển thị trước Chương 1</small></div><input name="number" type="hidden" value="0"></div>` : `<div class="field"><label>Số chương</label><input name="number" type="number" min="1" value="${num}"></div>`}
          <div class="field"><label>Tiêu đề</label><input name="title" value="${esc((ch && ch.title) || "")}"></div>
          <section class="admin-audio-box admin-youtube-audio-box">
            <div class="admin-audio-head"><div class="admin-youtube-mark" aria-hidden="true">▶</div><div><b>Bản nghe YouTube của chương</b><small>Chỉ lưu liên kết, không tải video lên Supabase. Độc giả bấm thanh mảnh để mở trình phát ngay trong trang.</small></div></div>
            <div class="field"><label>Liên kết YouTube</label><input name="youtube_audio_url" type="url" inputmode="url" value="${esc((ch && ch.youtube_audio_url) || "")}" placeholder="https://youtu.be/… hoặc https://www.youtube.com/watch?v=…"></div>
            <div class="field"><label>Tên hiển thị</label><input name="audio_title" value="${esc((ch && ch.audio_title) || "")}" placeholder="Ví dụ: Nghe chương 12"></div>
            <p class="admin-youtube-note">Có thể dùng video Công khai hoặc Không công khai. Để trống liên kết nếu chương chưa có bản nghe.</p>
          </section>
          <div class="editor-toolbar" role="toolbar" aria-label="Định dạng văn bản">
            ${tools.map(([c, t, lab]) => `<button type="button" data-cmd="${c}" title="${esc(t)}">${lab}</button>`).join("")}
          </div>
          <div class="editor-shell">
            <div class="editor-area" id="ed" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Dán hoặc viết nội dung chương…"></div>
          </div>
          <input id="chapterImageFile" class="chapter-image-file" type="file" accept="image/*" aria-label="Chọn ảnh chèn vào chương">
          <p class="editor-hint">Dán từ Word/web được giữ đoạn văn, bỏ màu chữ rác. Ảnh nên dưới 2MB.</p>
          <div class="field"><label>Trạng thái</label>
            <select name="status">
              <option value="draft" ${ch && ch.status === "draft" ? "selected" : ""}>Nháp</option>
              <option value="published" ${!ch || ch.status === "published" ? "selected" : ""}>Xuất bản</option>
              <option value="scheduled" ${ch && ch.status === "scheduled" ? "selected" : ""}>Hẹn giờ</option>
            </select>
          </div>
          ${ch && ch.status === "published" ? `<label class="notify-edit-toggle"><input name="notify_edit" type="checkbox"><span><b>Gửi thông báo về lần chỉnh sửa này</b><small>Chỉ bật khi nội dung thay đổi đáng kể; sửa lỗi nhỏ không cần gửi.</small></span></label>` : ""}
          <div class="field"><label>Hẹn giờ xuất bản</label><input name="publish_at" type="datetime-local" value="${ch && ch.publish_at ? new Date(ch.publish_at).toISOString().slice(0, 16) : ""}"></div>
          <button class="btn btn-primary" type="submit">Lưu chương</button>
        </form>
      </div></main>` +
      footer();
    bindChrome();
    const ed = $("#ed");
    const chapterImageFile = $("#chapterImageFile");
    let savedEditorRange = null;
    let edGap = 0.9;
    if (ch && ch.body) {
      ed.innerHTML = sanitize(ch.body);
      const firstP = ed.querySelector("p");
      const mb = firstP && firstP.style && firstP.style.marginBottom;
      const n = mb ? parseFloat(mb) : NaN;
      if (Number.isFinite(n)) edGap = Math.min(2.2, Math.max(0.4, n));
    }
    ed.style.setProperty("--ed-gap", edGap + "em");
    const key = "vicambachgiai.autosave." + (id || "new");
    try {
      const saved = localStorage.getItem(key);
      if (saved && !ch && saved.length < 400000) ed.innerHTML = saved;
    } catch (_) {}
    if (editorTimer) clearInterval(editorTimer);
    editorTimer = setInterval(() => {
      if (!ed.isConnected) {
        clearInterval(editorTimer);
        editorTimer = null;
        return;
      }
      const html = ed.innerHTML;
      if (html.length > 400000) return;
      try {
        localStorage.setItem(key, html);
      } catch (_) {}
    }, 8000);
    const run = (cmd, val) => {
      ed.focus();
      try {
        document.execCommand(cmd, false, val);
      } catch (_) {}
    };
    const focusEditor = () => {
      try { ed.focus({ preventScroll: true }); } catch (_) { ed.focus(); }
      const sel = window.getSelection && window.getSelection();
      if (!sel || (sel.anchorNode && ed.contains(sel.anchorNode))) return;
      try {
        const range = document.createRange();
        range.selectNodeContents(ed);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
    };
    const rememberEditorRange = () => {
      const sel = window.getSelection && window.getSelection();
      if (!sel || !sel.rangeCount || !sel.anchorNode || !ed.contains(sel.anchorNode)) return;
      try { savedEditorRange = sel.getRangeAt(0).cloneRange(); } catch (_) {}
    };
    const restoreEditorRange = () => {
      const sel = window.getSelection && window.getSelection();
      if (!sel || !savedEditorRange) {
        focusEditor();
        return;
      }
      try {
        sel.removeAllRanges();
        sel.addRange(savedEditorRange);
      } catch (_) {
        focusEditor();
      }
    };
    ed.addEventListener("keyup", rememberEditorRange);
    ed.addEventListener("mouseup", rememberEditorRange);
    ed.addEventListener("touchend", rememberEditorRange);
    ed.addEventListener("input", rememberEditorRange);
    ed.addEventListener("click", (e) => {
      if (e.target === ed) requestAnimationFrame(focusEditor);
    });
    const insertHtml = (html) => {
      restoreEditorRange();
      ed.focus();
      try {
        document.execCommand("insertHTML", false, html);
      } catch (_) {
        ed.insertAdjacentHTML("beforeend", html);
      }
      rememberEditorRange();
    };
    const shrinkImage = (file, cb) => {
      if (!file) return;
      if (file.size > 6 * 1024 * 1024) {
        toast("Ảnh quá lớn. Chọn ảnh dưới 6MB.");
        return;
      }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1400;
        let w = img.width;
        let h = img.height;
        if (w > max) {
          h = Math.round((h * max) / w);
          w = max;
        }
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        cb(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        toast("Không đọc được ảnh.");
      };
      img.src = url;
    };
    chapterImageFile.onchange = () => {
      const file = chapterImageFile.files && chapterImageFile.files[0];
      if (!file) return;
      toast("Đang xử lý ảnh…");
      shrinkImage(file, (src) => {
        insertHtml('<p><img src="' + src + '" alt=""></p><p><br></p>');
        chapterImageFile.value = "";
        toast("Đã chèn ảnh vào chương.");
      });
    };
    ed.addEventListener("paste", (e) => {
      e.preventDefault();
      const clip = e.clipboardData || window.clipboardData;
      const files = clip && clip.files;
      if (files && files[0] && /^image\//.test(files[0].type)) {
        shrinkImage(files[0], (src) => insertHtml('<p><img src="' + src + '" alt=""></p>'));
        return;
      }
      const text = (clip && (clip.getData("text/plain") || clip.getData("text"))) || "";
      insertHtml(textToHtml(text));
    });
    $$("[data-cmd]").forEach((b) => {
      b.onclick = () => {
        const c = b.dataset.cmd;
        if (c === "undo") run("undo");
        else if (c === "redo") run("redo");
        else if (c === "bold") run("bold");
        else if (c === "italic") run("italic");
        else if (c === "underline") run("underline");
        else if (c === "strike") run("strikeThrough");
        else if (c === "h2") run("formatBlock", "H2");
        else if (c === "h3") run("formatBlock", "H3");
        else if (c === "p") run("formatBlock", "P");
        else if (c === "quote") run("formatBlock", "BLOCKQUOTE");
        else if (c === "ul") run("insertUnorderedList");
        else if (c === "ol") run("insertOrderedList");
        else if (c === "left") run("justifyLeft");
        else if (c === "center") run("justifyCenter");
        else if (c === "right") run("justifyRight");
        else if (c === "justify") run("justifyFull");
        else if (c === "gap-") {
          edGap = Math.max(0.4, +(edGap - 0.15).toFixed(2));
          ed.style.setProperty("--ed-gap", edGap + "em");
        } else if (c === "gap+") {
          edGap = Math.min(2.2, +(edGap + 0.15).toFixed(2));
          ed.style.setProperty("--ed-gap", edGap + "em");
        }
        else if (c === "clear") run("removeFormat");
        else if (c === "link") {
          const sel = window.getSelection && window.getSelection();
          const hasText = sel && !sel.isCollapsed && ed.contains(sel.anchorNode) && ed.contains(sel.focusNode);
          if (!hasText) {
            toast("Hãy bôi đen đoạn chữ cần gắn liên kết.");
            focusEditor();
            return;
          }
          const u = prompt("URL liên kết");
          if (u) run("createLink", u);
        } else if (c === "img") {
          rememberEditorRange();
          chapterImageFile.value = "";
          chapterImageFile.click();
        }
      };
    });
    $("#chForm").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const at = fd.get("publish_at") ? new Date(fd.get("publish_at")).getTime() : null;
      const saveButton = e.target.querySelector('[type="submit"]');
      try {
        saveButton.disabled = true;
        saveButton.textContent = "Đang lưu…";
        await VCBG.upsertChapter({
          id: ch ? ch.id : undefined,
          story_id: fd.get("story_id"),
          number: fd.get("number"),
          title: fd.get("title"),
          audio_title: fd.get("audio_title"),
          youtube_audio_url: fd.get("youtube_audio_url"),
          body: sanitize(applyParaGap(ed.innerHTML, edGap)),
          status: fd.get("status"),
          publish_at: at,
          notify_edit: fd.get("notify_edit") === "on",
        });
        try {
          localStorage.removeItem(key);
        } catch (_) {}
        toast(fd.get("status") === "published" ? "Xuất bản thành công." : "Đã lưu chương.");
        go("/admin/chuong?story=" + fd.get("story_id"));
      } catch (err) {
        toast(err.message || "Không lưu được chương.");
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Lưu chương";
      }
    };
  }

  let renderLock = Promise.resolve();
  async function render() {
    const mine = renderLock.then(runRender);
    renderLock = mine.catch(() => {});
    return mine;
  }
  let backgroundInitWatchStarted = false;
  function paintShell() {
    if (app().querySelector(".site-header")) return;
    app().innerHTML =
      header() +
      `<main class="wrap"><div class="empty" id="bootEmpty">Đang mở thư viện…<p><button type="button" class="btn btn-cyan" id="bootRetry">Thử lại</button></p></div></main>` +
      footer();
    bindChrome();
    const retry = $("#bootRetry");
    if (retry) retry.onclick = () => location.reload();
  }
  async function runRender() {
    paintShell();
    const watchdog = setTimeout(() => {
      const empty = $("#bootEmpty");
      if (empty && empty.isConnected) {
        empty.innerHTML =
          'Mạng chậm hoặc chưa tải xong.<p><button type="button" class="btn btn-cyan" id="bootRetry">Thử lại</button></p>';
        const retry = $("#bootRetry");
        if (retry) retry.onclick = () => location.reload();
      }
    }, 9000);
    const route = parseHash();
    /* A route that is both public (no login required, unlike /doc, /thu-vien,
       /tai-khoan, /admin…) and content-driven can paint immediately once any
       story data is on hand — a real cached catalog, or the bundled hero
       snapshot on a brand-new device — instead of sitting on the boot screen.
       VCBG.init() keeps running in the background and triggers one more
       render once it settles, so the placeholder set is replaced by the real
       catalog and the account state finishes resolving. Every other route
       always waits: they decide what to show from the live Supabase session,
       never from a device-local snapshot.
       This must never let a device paint real content while the site is
       actually under maintenance. The device only knows this from its own
       last confirmed site_mode (VCBG.cachedSiteMode()) — if that says
       "maintenance", or this device has never confirmed a mode at all, the
       shortcut is skipped and the real check below decides, same as any
       other route. */
    const PUBLIC_CONTENT_ROUTES = new Set(["home", "explore", "story"]);
    const cachedMode = (VCBG.cachedSiteMode && VCBG.cachedSiteMode()) || null;
    const canPaintNow =
      PUBLIC_CONTENT_ROUTES.has(route.name) &&
      !!(VCBG.listStories && VCBG.listStories().length) &&
      cachedMode !== "maintenance" &&
      cachedMode !== null;
    if (canPaintNow) {
      /* Attach the follow-up render only once per page load: VCBG.init() is
         idempotent and resolves instantly once bootstrapped, so re-attaching
         this on every subsequent render() call would re-render forever. */
      if (!backgroundInitWatchStarted) {
        backgroundInitWatchStarted = true;
        VCBG.init().then(
          () => render(),
          (e) => console.error("[VCBG background init]", e)
        );
      }
    } else {
      try {
        await VCBG.init();
      } catch (e) {
        clearTimeout(watchdog);
        app().innerHTML =
          header() +
          `<div class="empty">Không khởi tạo được dữ liệu: ${esc(e.message)}<p><button type="button" class="btn btn-cyan" id="bootRetry">Thử lại</button></p></div>` +
          footer();
        bindChrome();
        const retry = $("#bootRetry");
        if (retry) retry.onclick = () => location.reload();
        return;
      }
    }
    clearTimeout(watchdog);
    /* The homepage must not stay on the bundled/local fallback catalog forever.
       But when a live catalog is already cached (returning visit), there is no
       need to block the first paint on a fresh network round trip: paint now,
       sync in the background, and re-render only if something actually changed.
       Only a cold start with nothing cached still waits, since there is no
       content to show otherwise. */
    if ((route.name === "home" || route.name === "story" || route.name === "read") && VCBG.syncPublicContent) {
      const hasCachedStories = !!(VCBG.listStories && VCBG.listStories().length);
      if (hasCachedStories) {
        VCBG.syncPublicContent({ maxAge: 5000 })
          .then((changed) => {
            if (changed) render();
          })
          .catch((error) => {
            console.warn("[VCBG content sync]", error && error.message);
          });
      } else {
        try {
          await VCBG.syncPublicContent({ maxAge: 5000 });
        } catch (error) {
          console.warn("[VCBG content sync]", error && error.message);
        }
      }
    }
    const pendingAuthReturn = authReturnSnapshot();
    if (route.name === "home" && VCBG.currentUser() && pendingAuthReturn) {
      await returnFromAuth(pendingAuthReturn.path);
      return;
    }
    window.scrollTo(0, 0);
    try {
      const mode = effectiveSiteMode(VCBG.settings());
      if (mode === "maintenance" && !VCBG.isAdmin()) {
        pageMaintenance();
        return;
      }
      if (route.name === "home") pageHome();
      else if (route.name === "explore") pageExplore(route);
      else if (route.name === "story") pageStory(route);
      else if (route.name === "read") await pageRead(route);
      else if (route.name === "login") pageAuth("login");
      else if (route.name === "register") pageAuth("register");
      else if (route.name === "forgot") pageAuth("forgot");
      else if (route.name === "library") pageLibrary();
      else if (route.name === "account") pageAccount();
      else if (route.name === "notifs") pageNotifs();
      else if (route.name === "mailbox") pageMailbox();
      else if (route.name === "admin") await pageAdmin(route);
      else pageHome();
    } catch (err) {
      console.error("[VCBG render]", err);
      app().innerHTML =
        header() +
        `<div class="empty">Không mở được trang: ${esc(err.message || "lỗi không xác định.")}</div>` +
        footer();
      bindChrome();
    }
  }

  function effectiveSiteMode(settings) {
    const st = settings || {};
    const mode = ["normal", "readonly", "maintenance"].includes(st.site_mode) ? st.site_mode : "normal";
    if (mode === "maintenance" && st.maintenance_until) {
      const expiry = Date.parse(st.maintenance_until);
      if (Number.isFinite(expiry) && expiry <= Date.now()) return "normal";
    }
    return mode;
  }

  function pageMaintenance() {
    const st = VCBG.settings() || {};
    const until = st.maintenance_until && Date.parse(st.maintenance_until) > Date.now()
      ? `<p class="maintenance-until">Dự kiến mở lại: <b>${fmtDate(st.maintenance_until)}</b></p>` : "";
    setMeta("Đang bảo trì — ViCamBachGiai", "Website đang được bảo trì.");
    app().innerHTML = `<main class="maintenance-page">
      <section class="maintenance-card" role="status" aria-live="polite">
        <div class="maintenance-emblem" aria-hidden="true">
          <img src="brand/mark.png" alt="">
        </div>
        <img class="maintenance-wordmark" src="brand/word.png" alt="ViCamBachGiai">
        <p>${esc(st.maintenance_message || "Website đang được bảo trì. Vui lòng quay lại sau.")}</p>
        ${until}
        <small class="maintenance-note">ViCamBachGiai sẽ sớm trở lại</small>
        <div class="maintenance-admin">
          <button type="button" class="maintenance-admin-toggle" id="maintAdminToggle" aria-expanded="false">Đăng nhập</button>
          <div class="maintenance-admin-panel" id="maintAdminPanel" hidden>
            <div class="auth-google-direct" id="maintGoogleAuth" role="button" tabindex="0" aria-live="polite">
              <span class="google-g-mark" aria-hidden="true">G</span><span>Đăng nhập bằng Google</span>
            </div>
            <p class="maintenance-admin-err" id="maintAuthErr"></p>
          </div>
        </div>
      </section>
    </main>`;

    const toggle = $("#maintAdminToggle");
    const panel = $("#maintAdminPanel");
    let mounted = false;
    if (toggle && panel) {
      toggle.onclick = () => {
        panel.hidden = !panel.hidden;
        toggle.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
        if (!panel.hidden && !mounted) {
          mounted = true;
          mountMaintenanceGoogle();
        }
      };
    }

    function showMaintErr(msg) {
      const el = $("#maintAuthErr");
      if (el) el.textContent = msg || "";
    }

    async function mountMaintenanceGoogle() {
      const btn = $("#maintGoogleAuth");
      if (!btn) return;
      let attempts = 0;
      const tryMount = async () => {
        if (!btn.isConnected) return;
        if (!(window.google && google.accounts && google.accounts.id)) {
          attempts += 1;
          if (attempts >= 50) {
            btn.textContent = "Google chưa tải được trên trình duyệt này.";
            return;
          }
          setTimeout(tryMount, 200);
          return;
        }
        const rawNonce = crypto.randomUUID
          ? crypto.randomUUID()
          : Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) => n.toString(16).padStart(2, "0")).join("");
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawNonce));
        const hashedNonce = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
        btn.textContent = "";
        google.accounts.id.disableAutoSelect();
        google.accounts.id.initialize({
          client_id: "726540465981-pg5i7fnr26ljb0cpi22su28b1lhc4f6b.apps.googleusercontent.com",
          nonce: hashedNonce,
          auto_select: false,
          itp_support: true,
          callback: async (response) => {
            showMaintErr("");
            btn.classList.add("is-busy");
            try {
              await VCBG.loginWithGoogleIdToken({ token: response.credential, nonce: rawNonce });
              toast(VCBG.isAdmin() ? "Mời admin vào!" : "Vui lòng quay lại khi ViCamBachGiai đã sẵn sàng.");
              await render();
            } catch (err) {
              btn.classList.remove("is-busy");
              showMaintErr(err.message || "Không thể đăng nhập bằng Google.");
            }
          },
        });
        google.accounts.id.renderButton(btn, { type: "icon", theme: "outline", size: "large", shape: "circle" });
      };
      tryMount().catch((err) => {
        btn.textContent = "Google chưa tải được trên trình duyệt này.";
        showMaintErr(err.message || "Không thể khởi tạo đăng nhập Google.");
      });
    }
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (href.startsWith("#/dang-nhap")) {
      e.preventDefault();
      const raw = href.slice(1);
      const query = raw.split("?")[1] || "";
      const next = new URLSearchParams(query).get("next") || "";
      goToLogin(next);
      return;
    }
    if (href.startsWith("#/")) {
      e.preventDefault();
      go(href);
    }
  });
  window.addEventListener("hashchange", () => {
    if (navigating) return;
    currentPath = readLocationPath();
    render();
  });
  window.addEventListener("vcbg:account-blocked", (event) => {
    const message = (event.detail && event.detail.message) || "Tài khoản đã bị khóa, không thể đăng nhập website.";
    toast(message);
    goToLogin("/");
  });
  let resumeSyncTimer = 0;
  function syncVisibleContent() {
    if (!/^#\/truyen\//.test(location.hash || "") || !VCBG.syncPublicContent) return;
    clearTimeout(resumeSyncTimer);
    resumeSyncTimer = setTimeout(async () => {
      try {
        const changed = await VCBG.syncPublicContent({ maxAge: 0 });
        if (changed) await render();
      } catch (_) {}
    }, 120);
  }
  window.addEventListener("pageshow", (event) => { if (event.persisted) syncVisibleContent(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncVisibleContent(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  async function boot() {
    let authRenderTimer = 0;
    if (VCBG.watchAuthState) {
      VCBG.watchAuthState(() => {
        clearTimeout(authRenderTimer);
        authRenderTimer = setTimeout(() => render(), 0);
      });
    }
    await render();
    const liveReady = VCBG.backgroundReady || VCBG.whenReady;
    if (liveReady) {
      liveReady.call(VCBG)
        .then(() => render())
        .catch(() => {});
    }
  }
})();
