/* ViCamBachGiai — responsive private member/admin mailbox. */
(function () {
  let channel = null;
  let channelKey = "";
  let painting = false;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  const api = () => window.VCBG && VCBG.supabaseClient && VCBG.supabaseClient();
  const current = () => window.VCBG && VCBG.currentUser && VCBG.currentUser();
  const isAdmin = () => !!(window.VCBG && VCBG.isAdmin && VCBG.isAdmin());
  const params = () => new URLSearchParams((location.hash.split("?")[1] || "").replace(/#.*$/, ""));
  const mailboxRoute = () => /^#\/(?:hop-thu|admin\/hop-thu)(?:\?|$)/.test(location.hash);
  const baseRoute = (admin) => admin ? "#/admin/hop-thu" : "#/hop-thu";

  function toast(message) {
    if (typeof window.toast === "function") return window.toast(message);
    const wrap = $("#toasts");
    if (!wrap) return;
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    wrap.appendChild(node);
    setTimeout(() => node.remove(), 3000);
  }

  function dateTime(v) {
    if (!v) return "";
    const d = new Date(v);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString("vi-VN", { hour:"2-digit", minute:"2-digit" });
    return d.toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit", year:"2-digit" });
  }

  function fullDate(v) {
    return v ? new Date(v).toLocaleString("vi-VN", { dateStyle:"short", timeStyle:"short" }) : "";
  }

  function initials(name) {
    const words = String(name || "TV").trim().split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || "TV").slice(0, 2)).toUpperCase();
  }

  function avatarHtml(profile, admin) {
    let src = "";
    if (admin) src = "avatars/v2/admin-star.svg";
    else if (window.VICAM_AVATARS && VICAM_AVATARS.srcFor) src = VICAM_AVATARS.srcFor(profile || {});
    else if (profile && /^https?:/i.test(profile.avatar || "")) src = profile.avatar;
    const name = admin ? "Quản trị viên" : ((profile && (profile.display_name || profile.email)) || "Thành viên");
    return '<span class="vc-mail-avatar" aria-hidden="true">' + (src ? '<img src="' + esc(src) + '" alt="">' : esc(initials(name))) + '</span>';
  }

  async function loadThreads() {
    const out = await api().from("conversation_threads")
      .select("id,member_id,subject,status,created_at,updated_at,profiles!conversation_threads_member_id_fkey(display_name,email,avatar)")
      .order("updated_at", { ascending:false });
    if (out.error) throw out.error;
    return out.data || [];
  }

  async function loadAllMessages() {
    const out = await api().from("conversation_messages")
      .select("id,thread_id,sender_id,body,created_at")
      .order("created_at", { ascending:true });
    if (out.error) throw out.error;
    return out.data || [];
  }

  async function loadUnread(userId) {
    const out = await api().from("notifications")
      .select("conversation_id")
      .eq("user_id", userId)
      .eq("read", false)
      .not("conversation_id", "is", null);
    if (out.error) throw out.error;
    return new Set((out.data || []).map((row) => String(row.conversation_id)));
  }

  async function markThreadRead(threadId, userId) {
    if (!threadId) return;
    const out = await api().from("notifications").update({ read:true })
      .eq("user_id", userId).eq("conversation_id", threadId).eq("read", false);
    if (out.error) console.warn("[mailbox read]", out.error.message);
  }

  async function createThread(subject, body) {
    const user = current();
    if (!user) throw new Error("Cần đăng nhập để gửi tin nhắn.");
    const created = await api().from("conversation_threads")
      .insert({ member_id:user.id, created_by:user.id, subject:subject.trim().slice(0, 120) })
      .select("id").single();
    if (created.error) throw created.error;
    const sent = await api().from("conversation_messages")
      .insert({ thread_id:created.data.id, sender_id:user.id, body:body.trim() });
    if (sent.error) throw sent.error;
    location.hash = "#/hop-thu?thread=" + created.data.id;
  }

  async function sendMessage(threadId, body, button) {
    body = String(body || "").trim();
    if (!body) return;
    button.disabled = true;
    const out = await api().from("conversation_messages").insert({ thread_id:threadId, sender_id:current().id, body });
    button.disabled = false;
    if (out.error) throw out.error;
    await paint(true);
  }

  function subscribe(userId) {
    const key = String(userId || "");
    if (channel && channelKey === key) return;
    if (channel && api()) api().removeChannel(channel);
    channel = null;
    channelKey = key;
    if (!key || !api()) return;
    channel = api().channel("vc-mailbox-" + key)
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"conversation_messages" }, () => paint(true))
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"conversation_threads" }, () => paint(true))
      .subscribe();
  }

  function groupMessages(messages) {
    const grouped = {};
    messages.forEach((message) => {
      (grouped[message.thread_id] || (grouped[message.thread_id] = [])).push(message);
    });
    return grouped;
  }

  function threadCard(thread, messages, unread, adminView, activeId, me) {
    const profile = thread.profiles || {};
    const peerName = adminView ? (profile.display_name || profile.email || "Thành viên") : "Quản trị viên";
    const list = messages[thread.id] || [];
    const last = list[list.length - 1];
    const preview = last ? last.body : "Chưa có tin nhắn";
    const answered = !!(last && (adminView ? last.sender_id === me.id : last.sender_id !== me.id));
    const search = [peerName, thread.subject, preview].join(" ").toLowerCase();
    return '<a href="' + baseRoute(adminView) + '?thread=' + esc(thread.id) + '" class="vc-mail-thread' + (thread.id === activeId ? ' on' : '') + '"' +
      ' data-unread="' + (unread.has(String(thread.id)) ? 'true' : 'false') + '" data-answered="' + (answered ? 'true' : 'false') + '" data-search="' + esc(search) + '">' +
      avatarHtml(profile, !adminView) +
      '<span class="vc-mail-thread-copy"><span class="vc-mail-thread-line"><b>' + esc(peerName) + '</b><time>' + esc(dateTime((last && last.created_at) || thread.updated_at)) + '</time></span>' +
      '<strong>' + esc(thread.subject) + '</strong><span class="vc-mail-preview">' + esc(preview) + '</span></span>' +
      (unread.has(String(thread.id)) ? '<i class="vc-mail-unread" aria-label="Chưa đọc"></i>' : '') + '</a>';
  }

  function applyThreadFilters(host) {
    const query = String($("[data-mail-search]", host)?.value || "").trim().toLowerCase();
    const activeFilter = $("[data-mail-filter].on", host)?.dataset.mailFilter || "all";
    let shown = 0;
    $$(".vc-mail-thread", host).forEach((card) => {
      const matchQuery = !query || (card.dataset.search || "").includes(query);
      const matchFilter = activeFilter === "all" ||
        (activeFilter === "unread" && card.dataset.unread === "true") ||
        (activeFilter === "answered" && card.dataset.answered === "true");
      card.hidden = !(matchQuery && matchFilter);
      if (!card.hidden) shown += 1;
    });
    const empty = $("[data-mail-filter-empty]", host);
    if (empty) empty.hidden = shown > 0;
  }

  async function paint(force) {
    if (painting || !mailboxRoute() || !current() || !api()) return;
    const adminView = isAdmin() && /^#\/admin\/hop-thu/.test(location.hash);
    const host = $(adminView ? "#vcAdminMailbox" : "#vcMailbox");
    if (!host) return;
    const me = current();
    const paintKey = location.hash + ":" + me.id;
    if (!force && host.dataset.mailReady === paintKey) return;
    painting = true;
    try {
      const [threads, allMessages, unread] = await Promise.all([loadThreads(), loadAllMessages(), loadUnread(me.id)]);
      const messages = groupMessages(allMessages);
      const requestedId = params().get("thread") || "";
      let activeId = requestedId || (threads[0] && threads[0].id) || "";
      if (activeId && !threads.some((thread) => thread.id === activeId)) activeId = threads[0] ? threads[0].id : "";
      const active = threads.find((thread) => thread.id === activeId);
      const activeMessages = active ? (messages[active.id] || []) : [];
      const showChatOnMobile = !!requestedId;
      const wideScreen = window.matchMedia("(min-width: 761px)").matches;
      if (active && (showChatOnMobile || wideScreen)) {
        unread.delete(String(active.id));
        markThreadRead(active.id, me.id);
      }
      const activeProfile = (active && active.profiles) || {};
      const peerName = active ? (adminView ? (activeProfile.display_name || activeProfile.email || "Thành viên") : "Quản trị viên") : "";
      const composeMode = !adminView ? params().get("compose") : "";
      const composeSource = composeMode === "report" ? String(params().get("source") || "").slice(0, 500) : "";
      const composeDraft = composeMode ? String(params().get("draft") || "").slice(0, 1500) : "";
      const composeTitle = composeMode === "report" ? "Báo lỗi nội dung" : "Gửi lời nhắn";
      const composePlaceholder = composeMode === "report"
        ? "Mô tả lỗi bạn gặp phải…"
        : "Viết nội dung bạn muốn gửi đến quản trị viên…";
      const composeSourceSuffix = composeSource ? "\n\nTrang gặp lỗi: " + composeSource : "";
      const composeBodyLimit = Math.max(100, 2000 - composeSourceSuffix.length);

      host.innerHTML = '<div class="vc-mail-head"><div><small>TRAO ĐỔI RIÊNG</small><h1>Hộp thư</h1></div>' +
        (!adminView ? '<button type="button" class="btn btn-primary" data-mail-new>+ Tin nhắn mới</button>' : '') + '</div>' +
        '<div class="vc-mail-layout ' + (showChatOnMobile ? 'is-chat-view' : 'is-list-view') + '">' +
          '<aside class="vc-mail-threads-pane"><div class="vc-mail-tools"><label class="vc-mail-search"><span>⌕</span><input type="search" data-mail-search placeholder="Tìm người hoặc nội dung" aria-label="Tìm cuộc trò chuyện"></label>' +
          '<div class="vc-mail-filters"><button type="button" class="on" data-mail-filter="all">Tất cả</button><button type="button" data-mail-filter="unread">Chưa đọc</button><button type="button" data-mail-filter="answered">Đã trả lời</button></div></div>' +
          '<div class="vc-mail-threads">' + (threads.length ? threads.map((thread) => threadCard(thread, messages, unread, adminView, (showChatOnMobile || wideScreen) ? activeId : "", me)).join('') : '<div class="vc-mail-empty">Chưa có cuộc trò chuyện.</div>') +
          '<div class="vc-mail-empty" data-mail-filter-empty hidden>Không tìm thấy cuộc trò chuyện phù hợp.</div></div></aside>' +
          '<section class="vc-mail-conversation">' + (active ?
            '<header><a class="vc-mail-back" href="' + baseRoute(adminView) + '" aria-label="Quay lại hộp thư">‹</a>' + avatarHtml(activeProfile, !adminView) + '<div><b>' + esc(peerName) + '</b><span>' + esc(active.subject) + '</span></div></header>' +
            '<div class="vc-mail-messages">' + (activeMessages.length ? activeMessages.map((message) => '<article class="vc-mail-message ' + (message.sender_id === me.id ? 'mine' : '') + '"><p>' + esc(message.body) + '</p><time>' + esc(fullDate(message.created_at)) + '</time></article>').join('') : '<div class="vc-mail-empty vc-mail-no-message"><b>Chưa có nội dung</b><span>Bạn có thể bắt đầu cuộc trò chuyện ở bên dưới.</span></div>') + '</div>' +
            (active.status === 'open' ? '<form class="vc-mail-compose"><textarea name="body" rows="1" maxlength="2000" required placeholder="Nhập tin nhắn…" aria-label="Nội dung tin nhắn"></textarea><button type="submit" aria-label="Gửi tin nhắn">↑</button></form>' : '<p class="vc-mail-closed">Cuộc trò chuyện đã đóng.</p>')
            : '<div class="vc-mail-empty vc-mail-welcome"><span>✦</span><b>' + (adminView ? 'Chưa có thư cần trả lời' : 'Chưa có cuộc trò chuyện') + '</b><p>' + (adminView ? 'Thư mới của thành viên sẽ xuất hiện tại đây.' : 'Chọn “Tin nhắn mới” để liên hệ quản trị viên.') + '</p></div>') + '</section></div>' +
        (!adminView ? '<div class="vc-mail-dialog" data-mail-dialog hidden><button type="button" class="vc-mail-dialog-bg" data-mail-dialog-close aria-label="Đóng"></button><section role="dialog" aria-modal="true" aria-labelledby="vcMailNewTitle"><header><h2 id="vcMailNewTitle">' + esc(composeMode ? composeTitle : "Tin nhắn mới") + '</h2><button type="button" data-mail-dialog-close aria-label="Đóng">×</button></header><form>' +
          (composeSource ? '<p class="vc-mail-source"><b>Trang đang báo lỗi:</b> ' + esc(composeSource) + '</p><input type="hidden" name="source" value="' + esc(composeSource) + '">' : '') +
          '<label>Chủ đề<input name="subject" maxlength="120" required placeholder="Bạn muốn trao đổi về việc gì?" value="' + esc(composeMode ? composeTitle : "") + '"></label><label>Nội dung<textarea name="body" maxlength="' + composeBodyLimit + '" rows="5" required placeholder="' + esc(composeMode ? composePlaceholder : "Viết nội dung cần gửi…") + '">' + esc(composeDraft) + '</textarea></label><button class="btn btn-primary" type="submit">Gửi và mở hội thoại</button></form></section></div>' : '');

      const shell = host.closest(".admin-shell");
      if (shell) shell.classList.add("vc-mail-admin-shell");
      const newButton = $("[data-mail-new]", host);
      const dialog = $("[data-mail-dialog]", host);
      const openComposer = () => {
        if (!dialog) return;
        dialog.hidden = false;
        const subject = $('[name="subject"]', dialog);
        const body = $('[name="body"]', dialog);
        if (composeMode && subject && !subject.value) subject.value = composeTitle;
        (composeMode && body ? body : subject || body)?.focus();
      };
      if (newButton && dialog) newButton.onclick = openComposer;
      $$("[data-mail-dialog-close]", host).forEach((button) => button.onclick = () => { if (dialog) dialog.hidden = true; });
      const newForm = $(".vc-mail-dialog form", host);
      if (newForm) newForm.onsubmit = async (event) => {
        event.preventDefault();
        const button = $('button[type="submit"]', newForm);
        button.disabled = true;
        try {
          const data = new FormData(newForm);
          const body = String(data.get("body") || "").trim() + composeSourceSuffix;
          await createThread(String(data.get("subject") || ""), body);
        } catch (error) {
          toast(error.message || "Không gửi được tin nhắn.");
          button.disabled = false;
        }
      };
      const form = $(".vc-mail-compose", host);
      if (form) {
        const textarea = $("textarea", form);
        textarea.addEventListener("input", () => { textarea.style.height = "auto"; textarea.style.height = Math.min(120, textarea.scrollHeight) + "px"; });
        form.onsubmit = (event) => {
          event.preventDefault();
          sendMessage(active.id, new FormData(form).get("body"), $("button", form)).catch((error) => toast(error.message || "Không gửi được tin nhắn."));
        };
      }
      const search = $("[data-mail-search]", host);
      if (search) search.oninput = () => applyThreadFilters(host);
      $$("[data-mail-filter]", host).forEach((button) => button.onclick = () => {
        $$("[data-mail-filter]", host).forEach((item) => item.classList.toggle("on", item === button));
        applyThreadFilters(host);
      });
      const list = $(".vc-mail-messages", host);
      if (list) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
      if (composeMode && dialog && host.dataset.mailComposeOpened !== location.hash) {
        host.dataset.mailComposeOpened = location.hash;
        openComposer();
      }
      host.dataset.mailReady = paintKey;
      subscribe(me.id);
    } catch (error) {
      host.innerHTML = '<div class="vc-notif-empty"><span>!</span><b>Không mở được hộp thư</b><p>' + esc(error.message || "Vui lòng thử lại.") + '</p></div>';
    } finally {
      painting = false;
    }
  }

  function schedule() { setTimeout(() => paint(false), 30); }
  window.addEventListener("hashchange", schedule);
  window.addEventListener("load", schedule);
  window.addEventListener("resize", schedule);
  new MutationObserver(() => { if (mailboxRoute() && ($("#vcMailbox") || $("#vcAdminMailbox"))) schedule(); }).observe(document.documentElement, { childList:true, subtree:true });
})();
