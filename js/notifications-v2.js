/* ViCamBachGiai — realtime notification center v4. */
(function () {
  let sb = null;
  let userId = "";
  let items = [];
  let realtimeChannel = null;
  let deletingAll = false;
  let renderScheduled = false;
  let filter = "all";
  let realtimeRefreshTimer = 0;
  let realtimePaused = false;
  let clearConfirmUntil = 0;
  let clearConfirmTimer = 0;
  let editingAnnouncementId = "";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);

  function client() {
    if (sb) return sb;
    if (window.VCBG && typeof window.VCBG.supabaseClient === "function") {
      sb = window.VCBG.supabaseClient();
      return sb;
    }
    const cfg = window.VCBG_CONFIG || {};
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { fetch: (input, init) => fetch(input, Object.assign({}, init, { cache: "no-store" })) }
    });
    return sb;
  }

  function kind(type) {
    if (["new_story", "new_chapter", "saved_chapter", "chapter_edit"].includes(type)) return "story";
    if (["comment_reply", "mention", "new_comment", "comment_report", "comment_moderation"].includes(type)) return "comment";
    return "system";
  }

  function icon(type) {
    if (type === "new_story") return "✦";
    if (type === "new_chapter" || type === "saved_chapter") return "▤";
    if (type === "chapter_edit") return "✎";
    if (type === "comment_reply") return "↩";
    if (type === "mention") return "@";
    if (type === "new_comment") return "◌";
    if (type === "comment_report") return "⚑";
    if (type === "comment_moderation") return "!";
    return "◆";
  }

  function relative(ts) {
    const d = new Date(ts || Date.now());
    const diff = Math.max(0, Date.now() - d.getTime());
    if (diff < 60000) return "Vừa xong";
    if (diff < 3600000) return Math.floor(diff / 60000) + " phút trước";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " giờ trước";
    if (diff < 604800000) return Math.floor(diff / 86400000) + " ngày trước";
    return d.toLocaleDateString("vi-VN");
  }

  function unreadCount() {
    return items.filter((n) => !n.read).length;
  }

  function showToast(message) {
    let wrap = $("#toasts");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "toasts";
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    const el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function scheduleRefresh() {
    if (realtimePaused) return;
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = setTimeout(() => refresh(), 180);
  }

  function resetClearConfirmation() {
    clearConfirmUntil = 0;
    clearTimeout(clearConfirmTimer);
    $$('[data-notif-clear]').forEach((button) => {
      button.disabled = false;
      button.textContent = "Xóa tất cả";
    });
  }

  function bellSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a6 6 0 0 0-6 6v3.45c0 1.88-.72 3.68-2.02 5.04l-.69.72A1.05 1.05 0 0 0 4.05 19h15.9a1.05 1.05 0 0 0 .76-1.79l-.69-.72A7.33 7.33 0 0 1 18 11.45V8a6 6 0 0 0-6-6Zm-2.38 18a2.5 2.5 0 0 0 4.76 0H9.62Z"/></svg>';
  }

  function renderBell() {
    const a = $('a[href="#/thong-bao"]');
    if (!a) return;
    const count = unreadCount();
    a.classList.add("vc-notification-bell");
    a.classList.toggle("has-unread", count > 0);
    a.setAttribute("aria-label", count ? count + " thông báo chưa đọc" : "Thông báo");
    a.setAttribute("aria-haspopup", "dialog");
    a.setAttribute("aria-expanded", $("#vcNotifPopover") ? "true" : "false");
    a.innerHTML = bellSvg() + (count ? '<span class="vc-notification-badge">' + (count > 99 ? "99+" : count) + "</span>" : "");
    if (a.dataset.vcBound) return;
    a.dataset.vcBound = "1";
    a.addEventListener("click", function (event) {
      if (/^#\/thong-bao(?:\?|$)/.test(location.hash)) {
        event.preventDefault();
        event.stopPropagation();
        closePopover();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      togglePopover(a);
    });
  }

  function itemHtml(n, compact) {
    const cls = "vc-notif-card vc-kind-" + kind(n.notification_type) + (!n.read ? " is-unread" : "") + (compact ? " is-compact" : "");
    const targetHref = n.conversation_id
      ? (window.VCBG && VCBG.isAdmin && VCBG.isAdmin() ? "#/admin/hop-thu?thread=" : "#/hop-thu?thread=") + n.conversation_id
      : (n.notification_type === "manual" && (!n.href || n.href === "#/") ? "#/hop-thu" : (n.href || "#/thong-bao"));
    return '<article class="' + cls + '" data-notif-id="' + esc(n.id) + '">' +
      '<span class="vc-notif-icon" aria-hidden="true">' + esc(icon(n.notification_type)) + '</span>' +
      '<a class="vc-notif-copy" href="' + esc(targetHref) + '" data-notif-open="' + esc(n.id) + '">' +
        '<span class="vc-notif-line"><b>' + esc(n.title || "Thông báo") + '</b>' + (!n.read ? '<i class="vc-notif-new">Mới</i>' : "") + '</span>' +
        '<p>' + esc(n.body || "") + '</p>' +
        '<time datetime="' + esc(n.created_at || "") + '">' + esc(relative(n.created_at)) + '</time>' +
      '</a>' +
      (compact ? "" : '<button type="button" class="vc-notif-delete" data-notif-delete="' + esc(n.id) + '" aria-label="Xóa thông báo">×</button>') +
    '</article>';
  }

  function closePopover() {
    const pop = $("#vcNotifPopover");
    if (pop) pop.remove();
    const bell = $(".vc-notification-bell");
    if (bell) bell.setAttribute("aria-expanded", "false");
  }

  function closeDetail() {
    const detail = $("#vcNotifDetail");
    if (detail) detail.remove();
  }

  function openDetail(notification) {
    if (!notification) return;
    closePopover();
    closeDetail();
    const targetHref = notification.conversation_id
      ? (window.VCBG && VCBG.isAdmin && VCBG.isAdmin() ? "#/admin/hop-thu?thread=" : "#/hop-thu?thread=") + notification.conversation_id
      : "";
    const contentHref = notification.href && notification.href !== "#/" ? notification.href : "";
    const canReply = notification.notification_type === "manual" || !!notification.conversation_id;
    const modal = document.createElement("div");
    modal.id = "vcNotifDetail";
    modal.className = "vc-notif-detail-bg";
    modal.innerHTML = '<section class="vc-notif-detail" role="dialog" aria-modal="true" aria-labelledby="vcNotifDetailTitle">' +
      '<header><span class="vc-notif-icon vc-kind-' + kind(notification.notification_type) + '">' + esc(icon(notification.notification_type)) + '</span>' +
      '<button type="button" data-notif-detail-close aria-label="Đóng">×</button></header>' +
      '<small>THÔNG BÁO</small><h2 id="vcNotifDetailTitle">' + esc(notification.title || "Thông báo") + '</h2>' +
      '<div class="vc-notif-detail-body">' + esc(notification.body || "Không có nội dung.") + '</div>' +
      '<time datetime="' + esc(notification.created_at || "") + '">' + esc(relative(notification.created_at)) + '</time>' +
      '<footer>' +
        (contentHref ? '<a class="btn btn-ghost" href="' + esc(contentHref) + '" data-notif-detail-link>Đi đến nội dung</a>' : '') +
        (canReply ? '<a class="btn btn-primary" href="' + esc(targetHref || "#/hop-thu") + '" data-notif-detail-link>Trả lời</a>' : '') +
      '</footer></section>';
    document.body.appendChild(modal);
    $('[data-notif-detail-close]', modal).onclick = closeDetail;
    modal.addEventListener("click", (event) => { if (event.target === modal) closeDetail(); });
    $$('[data-notif-detail-link]', modal).forEach((link) => link.addEventListener("click", closeDetail));
  }

  function togglePopover(anchor) {
    if ($("#vcNotifPopover")) {
      closePopover();
      return;
    }
    const pop = document.createElement("section");
    pop.id = "vcNotifPopover";
    pop.className = "vc-notif-popover";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Thông báo gần đây");
    const recent = items.slice(0, 5);
    pop.innerHTML = '<header><div><small>TRUNG TÂM TÍN HIỆU</small><h3>Thông báo</h3></div><div class="vc-notif-pop-actions">' +
      (unreadCount() ? '<button type="button" data-notif-read-all>Đánh dấu đã đọc</button>' : "") +
      '<button type="button" class="vc-notif-pop-close" data-notif-close aria-label="Đóng thông báo">×</button></div></header>' +
      '<div class="vc-notif-pop-list">' + (recent.length ? recent.map((n) => itemHtml(n, true)).join("") : '<div class="vc-notif-empty"><span>◇</span><b>Chưa có thông báo</b><p>Các cập nhật mới sẽ xuất hiện tại đây.</p></div>') + '</div>' +
      '<a class="vc-notif-view-all" href="#/thong-bao">Xem tất cả thông báo <span>→</span></a>';
    document.body.appendChild(pop);
    anchor.setAttribute("aria-expanded", "true");
    const rect = anchor.getBoundingClientRect();
    pop.style.setProperty("--bell-right", Math.max(12, window.innerWidth - rect.right) + "px");
    bindActions(pop);
  }

  function filteredItems() {
    if (filter === "unread") return items.filter((n) => !n.read);
    if (filter === "story") return items.filter((n) => kind(n.notification_type) === "story");
    if (filter === "comment") return items.filter((n) => kind(n.notification_type) === "comment");
    return items;
  }

  function renderCenter() {
    const host = $("#vcNotificationCenter");
    if (!host) return;
    host.dataset.vcNotifReady = "1";
    const shown = filteredItems();
    host.innerHTML = '<section class="vc-notif-hero">' +
      '<div class="vc-notif-hero-icon">' + bellSvg() + (unreadCount() ? '<span>' + unreadCount() + '</span>' : "") + '</div>' +
      '<div><small>TRUNG TÂM TÍN HIỆU</small><h1>Thông báo</h1><p>' + (unreadCount() ? 'Bạn có ' + unreadCount() + ' thông báo chưa đọc.' : 'Bạn đã xem hết các cập nhật mới.') + '</p></div>' +
      '<div class="vc-notif-hero-actions">' +
        (unreadCount() ? '<button type="button" class="btn btn-ghost" data-notif-read-all>Đánh dấu tất cả đã đọc</button>' : "") +
        (items.length ? '<button type="button" class="btn btn-ghost" data-notif-clear>Xóa tất cả</button>' : "") +
      '</div></section>' +
      '<nav class="vc-notif-filters" aria-label="Lọc thông báo">' +
        [['all','Tất cả'],['unread','Chưa đọc'],['story','Truyện'],['comment','Bình luận']].map((x) => '<button type="button" data-notif-filter="' + x[0] + '" class="' + (filter === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join("") +
      '</nav>' +
      '<div class="vc-notif-list">' + (shown.length ? shown.map((n) => itemHtml(n, false)).join("") : '<div class="vc-notif-empty"><span>◇</span><b>Không có thông báo phù hợp</b><p>Hãy thử chọn một nhóm khác.</p></div>') + '</div>';
    bindActions(host);
  }

  async function markOne(id) {
    const n = items.find((x) => x.id === id);
    if (!n || n.read) return;
    n.read = true;
    renderBell(); renderCenter();
    const out = await client().from("notifications").update({ read: true }).eq("id", id);
    if (out.error) refresh();
  }

  async function markAll() {
    if (!userId) return;
    items.forEach((n) => { n.read = true; });
    closePopover(); renderBell(); renderCenter();
    const out = await client().from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    if (out.error) refresh();
  }

  async function removeOne(id) {
    const out = await client().from("notifications").delete().eq("id", id);
    if (!out.error) {
      items = items.filter((n) => n.id !== id);
      closePopover(); renderBell(); renderCenter();
    } else {
      showToast("Không thể xóa thông báo. Vui lòng thử lại.");
    }
  }

  async function clearAll() {
    if (!userId || deletingAll) return;
    if (Date.now() > clearConfirmUntil) {
      clearConfirmUntil = Date.now() + 4000;
      $$('[data-notif-clear]').forEach((button) => {
        button.textContent = "Chạm lần nữa để xác nhận";
      });
      clearConfirmTimer = setTimeout(resetClearConfirmation, 4000);
      return;
    }

    clearTimeout(clearConfirmTimer);
    clearConfirmUntil = 0;
    deletingAll = true;
    realtimePaused = true;
    clearTimeout(realtimeRefreshTimer);
    $$('[data-notif-clear]').forEach((button) => {
      button.disabled = true;
      button.textContent = "Đang xóa…";
    });
    unsubscribe();

    try {
      const hadItems = items.length > 0;
      const out = await client().from("notifications").delete({ count: "exact" }).eq("user_id", userId);
      if (out.error) throw out.error;
      if (hadItems && Number(out.count) === 0) throw new Error("No notifications were deleted");
      items = [];
      closePopover(); renderBell(); renderCenter();
      showToast("Đã xóa tất cả thông báo.");
    } catch (error) {
      console.error("Could not clear notifications", error);
      showToast("Không thể xóa thông báo. Vui lòng thử lại.");
      await refresh();
    } finally {
      deletingAll = false;
      realtimePaused = false;
      if (userId) subscribe();
    }
  }

  function bindActions(root) {
    $$('[data-notif-open]', root).forEach((a) => a.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const notification = items.find((n) => String(n.id) === String(a.dataset.notifOpen));
      markOne(a.dataset.notifOpen);
      openDetail(notification);
    }));
    $$('[data-notif-delete]', root).forEach((b) => b.addEventListener("click", () => removeOne(b.dataset.notifDelete)));
    $$('[data-notif-read-all]', root).forEach((b) => b.addEventListener("click", markAll));
    $$('[data-notif-clear]', root).forEach((b) => b.addEventListener("click", clearAll));
    $$('[data-notif-close]', root).forEach((b) => b.addEventListener("click", closePopover));
    $$('.vc-notif-view-all', root).forEach((a) => a.addEventListener("click", closePopover));
    $$('[data-notif-filter]', root).forEach((b) => b.addEventListener("click", () => { filter = b.dataset.notifFilter; renderCenter(); }));
  }

  async function refresh() {
    const api = client();
    if (!api) return;
    const session = await api.auth.getSession();
    const nextId = session.data && session.data.session && session.data.session.user && session.data.session.user.id;
    if (!nextId) {
      userId = ""; items = []; closePopover(); renderBell(); renderCenter(); unsubscribe();
      return;
    }
    if (nextId !== userId) {
      userId = nextId;
      subscribe();
    }
    const out = await api.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
    if (!out.error) items = out.data || [];
    renderBell(); renderCenter();
  }

  function unsubscribe() {
    clearTimeout(realtimeRefreshTimer);
    if (realtimeChannel && sb) sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  function subscribe() {
    unsubscribe();
    if (!userId || !client()) return;
    realtimeChannel = client().channel("vc-notifications-" + userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: "user_id=eq." + userId }, scheduleRefresh)
      .subscribe();
  }

  function adminNav() {
    const nav = $(".admin-nav");
    if (!nav || nav.querySelector('[href="#/admin/thong-bao"]')) return;
    const a = document.createElement("a");
    a.href = "#/admin/thong-bao"; a.textContent = "Thông báo";
    const inbox = nav.querySelector('[href="#/admin/hop-thu"]');
    inbox ? nav.insertBefore(a, inbox) : nav.appendChild(a);
  }

  function announcementId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const value = Math.random() * 16 | 0;
      return (char === "x" ? value : (value & 3 | 8)).toString(16);
    });
  }

  async function loadAdminAnnouncements(host) {
    const list = $("#vcAdminNotifHistory", host);
    if (!list) return;
    list.innerHTML = '<div class="vc-admin-notif-empty">Đang tải thông báo đã gửi…</div>';
    const threads = await client().from("conversation_threads")
      .select("id,announcement_id,subject,created_at,updated_at")
      .not("announcement_id", "is", null)
      .order("created_at", { ascending: false });
    if (threads.error) {
      list.innerHTML = '<div class="vc-admin-notif-empty">Không tải được danh sách thông báo.</div>';
      return;
    }
    const threadRows = threads.data || [];
    if (!threadRows.length) {
      list.innerHTML = '<div class="vc-admin-notif-empty">Chưa có thông báo nào được gửi bằng phiên bản mới.</div>';
      return;
    }
    const ids = Array.from(new Set(threadRows.map((row) => row.announcement_id).filter(Boolean)));
    const messages = await client().from("conversation_messages")
      .select("announcement_id,body,created_at")
      .in("announcement_id", ids)
      .order("created_at", { ascending: true });
    if (messages.error) {
      list.innerHTML = '<div class="vc-admin-notif-empty">Không tải được nội dung thông báo.</div>';
      return;
    }
    const groups = new Map();
    threadRows.forEach((thread) => {
      if (!groups.has(thread.announcement_id)) groups.set(thread.announcement_id, {
        id: thread.announcement_id, title: thread.subject, body: "", created_at: thread.created_at, recipients: 0
      });
      groups.get(thread.announcement_id).recipients += 1;
    });
    (messages.data || []).forEach((message) => {
      const group = groups.get(message.announcement_id);
      if (group && !group.body) group.body = message.body;
    });
    list.innerHTML = Array.from(groups.values()).map((item) => '<article class="vc-admin-notif-card" data-announcement-card="' + esc(item.id) + '">' +
      '<div class="vc-admin-notif-copy"><h3>' + esc(item.title || "Thông báo") + '</h3><p>' + esc(item.body) + '</p>' +
      '<small>' + esc(relative(item.created_at)) + ' · ' + item.recipients + ' người nhận</small></div>' +
      '<div class="vc-admin-notif-actions"><button type="button" class="btn btn-ghost" data-announcement-edit="' + esc(item.id) + '">Chỉnh sửa</button>' +
      '<button type="button" class="btn btn-ghost vc-danger" data-announcement-delete="' + esc(item.id) + '">Xóa</button></div></article>').join("");

    $$('[data-announcement-edit]', list).forEach((button) => button.addEventListener("click", () => {
      const item = groups.get(button.dataset.announcementEdit);
      const form = $("form", host);
      if (!item || !form) return;
      editingAnnouncementId = item.id;
      $('[name="title"]', form).value = item.title;
      $('[name="body"]', form).value = item.body;
      $("[data-announcement-audience]", form).hidden = true;
      $("[data-announcement-submit]", form).textContent = "Lưu chỉnh sửa";
      $("[data-announcement-cancel]", form).hidden = false;
      $("[data-announcement-heading]", host).textContent = "Chỉnh sửa thông báo";
      $("[data-body-count]", form).textContent = item.body.length + " ký tự";
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }));

    $$('[data-announcement-delete]', list).forEach((button) => button.addEventListener("click", async () => {
      if (button.dataset.confirm !== "1") {
        button.dataset.confirm = "1";
        button.textContent = "Xác nhận xóa";
        setTimeout(() => { if (button.isConnected) { button.dataset.confirm = ""; button.textContent = "Xóa"; } }, 4000);
        return;
      }
      button.disabled = true;
      button.textContent = "Đang xóa…";
      const out = await client().rpc("delete_manual_announcement", { p_announcement_id: button.dataset.announcementDelete });
      if (out.error) {
        button.disabled = false;
        button.textContent = "Xóa";
        if (window.toast) toast(out.error.message || "Không xóa được thông báo.");
        return;
      }
      if (editingAnnouncementId === button.dataset.announcementDelete) $("[data-announcement-cancel]", host).click();
      if (window.toast) toast("Đã xóa thông báo khỏi các tài khoản nhận.");
      loadAdminAnnouncements(host);
    }));
  }

  function adminPage() {
    if (!/^#\/admin\/thong-bao(?:\?|$)/.test(location.hash) || !window.VCBG || !VCBG.isAdmin()) return;
    const host = $(".admin-shell>div");
    if (!host || host.querySelector("#vcAdminNotif")) return;
    $$(".admin-nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#/admin/thong-bao"));
    const users = VCBG.adminUsers ? VCBG.adminUsers() : [];
    const stories = VCBG.adminListStories ? VCBG.adminListStories() : [];
    host.innerHTML = '<section class="vc-admin-notification" id="vcAdminNotif"><h1 data-announcement-heading>Gửi thông báo</h1><p class="sub">Gửi thông báo thủ công đến tất cả thành viên, một thành viên hoặc độc giả theo dõi một truyện.</p><form>' +
      '<div data-announcement-audience><div class="field"><label>Người nhận</label><select name="audience"><option value="all">Tất cả thành viên</option><option value="user">Một thành viên</option><option value="story">Người theo dõi một truyện</option></select></div>' +
      '<div class="field vc-target-user" hidden><label>Thành viên</label><select name="user_id">' + users.filter((u) => u.role !== "admin").map((u) => '<option value="' + esc(u.id) + '">' + esc(u.profile.display_name) + ' · ' + esc(u.email) + '</option>').join("") + '</select></div>' +
      '<div class="field vc-target-story" hidden><label>Truyện</label><select name="story_id">' + stories.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.title) + '</option>').join("") + '</select></div></div>' +
      '<div class="field"><label>Tiêu đề</label><input name="title" maxlength="100" required></div><div class="field"><label>Nội dung</label><textarea name="body" required></textarea><small class="vc-body-count" data-body-count>0 ký tự</small></div>' +
      '<p class="sub">Thông báo sẽ mở thành một cuộc trò chuyện riêng để thành viên có thể trả lời.</p><div class="vc-admin-form-actions"><button class="btn btn-primary" type="submit" data-announcement-submit>Gửi và mở hội thoại</button><button class="btn btn-ghost" type="button" data-announcement-cancel hidden>Hủy chỉnh sửa</button></div></form>' +
      '<section class="vc-admin-notif-history"><h2>Thông báo đã gửi</h2><div id="vcAdminNotifHistory"></div></section></section>';
    const form = $("form", host), audience = form.audience;
    const toggle = () => { $(".vc-target-user", form).hidden = audience.value !== "user"; $(".vc-target-story", form).hidden = audience.value !== "story"; };
    audience.onchange = toggle; toggle();
    const bodyField = $('[name="body"]', form);
    bodyField.addEventListener("input", () => { $("[data-body-count]", form).textContent = bodyField.value.length + " ký tự"; });
    $("[data-announcement-cancel]", form).onclick = () => {
      editingAnnouncementId = "";
      form.reset(); toggle();
      $("[data-announcement-audience]", form).hidden = false;
      $("[data-announcement-submit]", form).textContent = "Gửi và mở hội thoại";
      $("[data-announcement-cancel]", form).hidden = true;
      $("[data-announcement-heading]", host).textContent = "Gửi thông báo";
      $("[data-body-count]", form).textContent = "0 ký tự";
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('button[type="submit"]', form); btn.disabled = true;
      try {
        const fd = new FormData(form), aud = fd.get("audience");
        const title = String(fd.get("title") || "").trim();
        const body = String(fd.get("body") || "").trim();
        if (!title || !body) throw new Error("Vui lòng nhập đủ tiêu đề và nội dung.");
        if (editingAnnouncementId) {
          const updated = await client().rpc("update_manual_announcement", {
            p_announcement_id: editingAnnouncementId, p_title: title, p_body: body
          });
          if (updated.error) throw updated.error;
          if (window.toast) toast("Đã cập nhật thông báo cho tất cả người nhận.");
          $("[data-announcement-cancel]", form).click();
          await loadAdminAnnouncements(host);
          return;
        }
        let ids = [];
        if (aud === "user") ids = [fd.get("user_id")];
        else if (aud === "story") {
          const q = await client().from("follows").select("user_id").eq("story_id", fd.get("story_id"));
          if (q.error) throw q.error;
          ids = (q.data || []).map((x) => x.user_id);
        } else ids = users.filter((u) => u.status === "active" && u.role !== "admin").map((u) => u.id);
        ids = Array.from(new Set(ids.filter(Boolean)));
        if (!ids.length) throw new Error("Không có thành viên phù hợp.");
        const session = await client().auth.getSession();
        const adminId = session.data && session.data.session && session.data.session.user.id;
        if (!adminId) throw new Error("Phiên đăng nhập đã hết hạn.");
        const batchId = announcementId();
        const created = await client().from("conversation_threads")
          .insert(ids.map((member_id) => ({ member_id, created_by: adminId, subject: title, announcement_id: batchId })))
          .select("id,member_id");
        if (created.error) throw created.error;
        const messages = (created.data || []).map((thread) => ({ thread_id: thread.id, sender_id: adminId, body, announcement_id: batchId }));
        const sent = await client().from("conversation_messages").insert(messages);
        if (sent.error) throw sent.error;
        const selfNotify = await client().from("notifications").insert({
          user_id: adminId, notification_type: "manual", title, body,
          href: "#/admin/thong-bao", announcement_id: batchId, read: false
        });
        if (selfNotify.error) console.error("[admin self notification]", selfNotify.error);
        if (window.toast) toast("Đã gửi đến " + messages.length + " tài khoản.");
        form.reset(); toggle(); $("[data-body-count]", form).textContent = "0 ký tự";
        await loadAdminAnnouncements(host);
      } catch (err) {
        if (window.toast) toast(err.message || "Không gửi được thông báo.");
      } finally { btn.disabled = false; }
    };
    loadAdminAnnouncements(host);
  }

  // Content reports continue as private two-way mailbox conversations.
  function bindReportButtons() {
    $$('[data-report-comment]:not([data-report-bound])').forEach((b) => {
      b.dataset.reportBound = "1";
      b.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation();
        const source = location.hash.replace(/^#/, "") || "/";
        const baseTarget = "/hop-thu?compose=report&source=" + encodeURIComponent(source);
        if (!window.VCBG || !VCBG.currentUser()) {
          if (window.VCBGGoToLogin) window.VCBGGoToLogin(baseTarget);
          else location.hash = "#/dang-nhap";
          return;
        }
        const reason = prompt("Lý do báo cáo bình luận:");
        if (!reason || !reason.trim()) return;
        const draft = "Báo cáo bình luận " + b.dataset.reportComment + " trong “" + (b.dataset.storyTitle || "Bình luận") + "”: " + reason.trim();
        location.hash = "#" + baseTarget + "&draft=" + encodeURIComponent(draft);
      });
    });
  }

  function run() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      renderBell(); renderCenter(); adminNav(); adminPage(); bindReportButtons();
    });
  }

  function needsRun() {
    if ($('a[href="#/thong-bao"]:not([data-vc-bound])')) return true;
    const center = $("#vcNotificationCenter");
    if (center && !center.dataset.vcNotifReady) return true;
    if ($(".admin-nav") && !$('.admin-nav [href="#/admin/thong-bao"]')) return true;
    if (/^#\/admin\/thong-bao(?:\?|$)/.test(location.hash) && !$("#vcAdminNotif")) return true;
    return !!$('[data-report-comment]:not([data-report-bound])');
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#vcNotifPopover") && !e.target.closest(".vc-notification-bell")) closePopover();
  });
  window.addEventListener("resize", closePopover);
  window.addEventListener("hashchange", () => { closePopover(); closeDetail(); setTimeout(run, 40); });
  new MutationObserver(() => { if (needsRun()) run(); }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("load", () => { run(); refresh(); });
  setTimeout(() => { run(); refresh(); }, 100);
  setInterval(refresh, 60000);
})();
