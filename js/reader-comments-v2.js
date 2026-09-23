/* ViCamBachGiai reader comments v2.
   Uses the existing VCBG comment API and adds shared paragraph reactions. */
(function () {
  var reactionMap = { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡' };
  var rxClient = null;
  var activeCtx = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function ago(ts) {
    var t = Number(ts) || Date.parse(ts || '') || 0;
    if (!t) return '';
    var d = Math.max(0, Date.now() - t);
    var m = Math.floor(d / 60000);
    if (m < 1) return 'vừa xong';
    if (m < 60) return m + ' phút trước';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' giờ trước';
    var day = Math.floor(h / 24);
    if (day < 30) return day + ' ngày trước';
    return new Date(t).toLocaleDateString('vi-VN');
  }
  function initials(name) {
    var a = String(name || 'ĐG').trim().split(/\s+/).filter(Boolean);
    return (a.length > 1 ? a[0][0] + a[a.length - 1][0] : (a[0] || 'ĐG').slice(0,2)).toUpperCase();
  }
  function avatarHtml(user) {
    var name = (user && user.display_name) || 'Độc giả';
    var av = user && user.avatar;
    if (av && /^(https?:|data:image\/)/i.test(av)) return '<span class="vc-cmt-avatar"><img src="' + esc(av) + '" alt=""></span>';
    return '<span class="vc-cmt-avatar">' + esc(initials(name)) + '</span>';
  }
  function currentRoute() {
    var raw = (location.hash || '').replace(/^#/, '');
    var path = raw.split('?')[0];
    var m = path.match(/^\/truyen\/([^/]+)\/chuong-(\d+)/);
    if (!m || !window.VCBG) return null;
    var s = VCBG.getStoryBySlug(decodeURIComponent(m[1]));
    if (!s) return null;
    var ch = VCBG.getChapter(s.id, Number(m[2]));
    if (!ch) return null;
    return { story: s, chapter: ch };
  }
  function getRxClient() {
    if (rxClient) return rxClient;
    try {
      if (window.supabase && window.VCBG_CONFIG) {
        rxClient = window.supabase.createClient(VCBG_CONFIG.supabaseUrl, VCBG_CONFIG.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
        });
      }
    } catch (_) {}
    return rxClient;
  }
  function normalizeCommentList(list, paraKey) {
    list = (list || []).slice();
    if (paraKey) list = list.filter(function (c) { return c.para_key === paraKey; });
    return list.sort(function (a,b) { return (Number(b.created_at)||0) - (Number(a.created_at)||0); });
  }
  function quoteFromParagraph(p) {
    if (!p) return '';
    var clone = p.cloneNode(true);
    clone.querySelectorAll('.p-bubble,.p-menu').forEach(function (n) { n.remove(); });
    return String(clone.innerText || clone.textContent || '').replace(/\s+/g,' ').trim().slice(0,1200);
  }
  function renderReply(r) {
    var u = r.user || {};
    return '<div class="vc-cmt-reply">' +
      '<div class="vc-cmt-who"><b>' + esc(u.display_name || 'Độc giả') + '</b><span class="vc-cmt-time">' + esc(ago(r.created_at)) + '</span></div>' +
      '<div class="vc-cmt-body">' + esc(r.body || '') + '</div>' +
    '</div>';
  }
  function renderComment(c) {
    var me = VCBG.currentUser && VCBG.currentUser();
    var u = c.user || {};
    var canDelete = me && (me.id === c.user_id || (VCBG.isAdmin && VCBG.isAdmin()));
    return '<article class="vc-cmt-item" data-cid="' + esc(c.id) + '">' +
      avatarHtml(u) +
      '<div class="vc-cmt-who"><b>' + esc(u.display_name || 'Độc giả') + '</b><span class="vc-cmt-time">' + esc(ago(c.created_at)) + '</span></div>' +
      '<div class="vc-cmt-body">' + esc(c.body || '') + '</div>' +
      '<div class="vc-cmt-actions">' +
        '<button type="button" data-vlike="' + esc(c.id) + '">♥ ' + Number(c.like_count || (c.likes && c.likes.length) || 0) + '</button>' +
        (me ? '<button type="button" data-vreply="' + esc(c.id) + '">Trả lời</button>' : '') +
        (canDelete ? '<button type="button" data-vdel="' + esc(c.id) + '">Xóa</button>' : '') +
      '</div>' +
      '<div class="vc-cmt-replies">' + (c.replies || []).map(renderReply).join('') + '</div>' +
      '<div class="vc-reply-slot"></div>' +
    '</article>';
  }
  function panelHtml(ctx) {
    var list = normalizeCommentList(VCBG.listComments(ctx.chapter.id), ctx.paraKey);
    var quote = ctx.quote || '';
    var title = 'Bình luận';
    return '<div class="vc-cmt-backdrop" data-vclose></div>' +
      '<section class="vc-cmt-panel" role="dialog" aria-modal="true" aria-label="Bình luận">' +
        '<div class="vc-cmt-grab"></div>' +
        '<header class="vc-cmt-head"><h3>💬 ' + title + '</h3><span class="vc-cmt-count">' + list.length + ' bình luận</span><button class="vc-cmt-close" type="button" data-vclose aria-label="Đóng">×</button></header>' +
        '<div class="vc-cmt-scroll">' +
          (quote ? '<div class="vc-cmt-quote"><p>“' + esc(quote) + '”</p><div class="vc-cmt-meta"><span>' + esc(ctx.story.title) + '</span><span>·</span><span>Chương ' + ctx.chapter.number + '</span>' + (ctx.paraKey ? '<span>·</span><span>' + esc(ctx.paraKey.replace(/^p/,'Đoạn ')) + '</span>' : '') + '<button class="vc-cmt-expand" type="button">Mở rộng</button></div></div>' : '') +
          (ctx.paraKey ? '<div class="vc-react-wrap"><span class="vc-react-label">Cảm xúc</span><div class="vc-reactions">' + Object.keys(reactionMap).map(function(k){ return '<button class="vc-reaction" type="button" data-rx="' + k + '" aria-label="' + k + '">' + reactionMap[k] + '</button>'; }).join('') + '</div><span class="vc-react-summary" id="vcRxSummary"></span></div>' : '') +
          '<div class="vc-cmt-list-head"><span>' + list.length + ' bình luận</span><span>Mới nhất</span></div>' +
          '<div id="vcCmtList">' + (list.length ? list.map(renderComment).join('') : '<div class="vc-cmt-empty">Chưa có bình luận ở đây. Bạn có thể là người đầu tiên.</div>') + '</div>' +
        '</div>' +
        (VCBG.currentUser && VCBG.currentUser() ? '<form class="vc-cmt-compose" id="vcCmtForm"><textarea name="body" maxlength="2000" rows="1" required placeholder="Viết bình luận…"></textarea><button class="vc-cmt-send" type="submit" aria-label="Gửi">➤</button></form>' : '<a class="vc-cmt-login" href="#/dang-nhap">Đăng nhập để bình luận</a>') +
      '</section>';
  }
  function closePanel() {
    var host = document.querySelector('#vcCommentsHost');
    if (host) host.remove();
    activeCtx = null;
  }
  async function loadReactions(ctx) {
    if (!ctx.paraKey) return;
    var client = getRxClient();
    if (!client) return;
    try {
      var res = await client.from('paragraph_reactions').select('reaction,user_id').eq('chapter_id', ctx.chapter.id).eq('para_key', ctx.paraKey);
      if (res.error) return;
      var rows = res.data || [];
      var counts = {};
      rows.forEach(function(r){ counts[r.reaction] = (counts[r.reaction] || 0) + 1; });
      var me = VCBG.currentUser && VCBG.currentUser();
      var mine = me && rows.find(function(r){ return r.user_id === me.id; });
      document.querySelectorAll('.vc-reaction').forEach(function(b){ b.classList.toggle('on', !!(mine && mine.reaction === b.dataset.rx)); });
      var sum = document.querySelector('#vcRxSummary');
      if (sum) {
        var bits = Object.keys(reactionMap).filter(function(k){ return counts[k]; }).map(function(k){ return reactionMap[k] + ' ' + counts[k]; });
        sum.textContent = bits.join('  ');
      }
    } catch (_) {}
  }
  async function setReaction(ctx, reaction) {
    var me = VCBG.currentUser && VCBG.currentUser();
    if (!me) { location.hash = '#/dang-nhap'; return; }
    var client = getRxClient();
    if (!client) return;
    try {
      var old = await client.from('paragraph_reactions').select('reaction').eq('chapter_id',ctx.chapter.id).eq('para_key',ctx.paraKey).eq('user_id',me.id).maybeSingle();
      if (old.data && old.data.reaction === reaction) {
        await client.from('paragraph_reactions').delete().eq('chapter_id',ctx.chapter.id).eq('para_key',ctx.paraKey).eq('user_id',me.id);
      } else {
        await client.from('paragraph_reactions').upsert({ chapter_id:ctx.chapter.id, para_key:ctx.paraKey, user_id:me.id, reaction:reaction }, { onConflict:'chapter_id,para_key,user_id' });
      }
      loadReactions(ctx);
    } catch (_) {}
  }
  function refreshList(ctx) {
    var list = normalizeCommentList(VCBG.listComments(ctx.chapter.id), ctx.paraKey);
    var box = document.querySelector('#vcCmtList');
    if (box) box.innerHTML = list.length ? list.map(renderComment).join('') : '<div class="vc-cmt-empty">Chưa có bình luận ở đây. Bạn có thể là người đầu tiên.</div>';
    var counts = document.querySelectorAll('.vc-cmt-count,.vc-cmt-list-head span:first-child');
    counts.forEach(function(n){ n.textContent = list.length + ' bình luận'; });
    bindPanelActions(ctx);
  }
  function updateBubble(ctx) {
    if (!ctx.paraKey) return;
    var count = normalizeCommentList(VCBG.listComments(ctx.chapter.id), ctx.paraKey).length;
    var b = document.querySelector('.reader-page .r-p[data-pk="' + CSS.escape(ctx.paraKey) + '"] .p-bubble');
    if (b) { b.textContent = count ? String(count) : ''; b.classList.toggle('has', !!count); }
  }
  function bindPanelActions(ctx) {
    document.querySelectorAll('[data-vlike]').forEach(function(b){
      b.onclick = function(){
        try { var r = VCBG.likeComment(b.dataset.vlike); b.textContent = '♥ ' + r.count; b.classList.toggle('on', r.on); } catch(e) { if (e && e.code === 'AUTH_REQUIRED') location.hash='#/dang-nhap'; }
      };
    });
    document.querySelectorAll('[data-vreply]').forEach(function(b){
      b.onclick = function(){
        var item = b.closest('.vc-cmt-item');
        var slot = item.querySelector('.vc-reply-slot');
        slot.innerHTML = '<form class="vc-reply-box"><input maxlength="1000" required placeholder="Viết trả lời…"><button>Gửi</button></form>';
        var f = slot.querySelector('form'); var inp = slot.querySelector('input'); inp.focus();
        f.onsubmit = function(e){ e.preventDefault(); try { VCBG.replyComment(b.dataset.vreply, inp.value); refreshList(ctx); } catch(err){} };
      };
    });
    document.querySelectorAll('[data-vdel]').forEach(function(b){
      b.onclick = function(){ try { VCBG.deleteOwnComment(b.dataset.vdel); refreshList(ctx); updateBubble(ctx); } catch(_){} };
    });
  }
  function openPanel(ctx) {
    closePanel();
    activeCtx = ctx;
    var reader = document.querySelector('.reader-page');
    if (!reader) return;
    var host = document.createElement('div');
    host.id = 'vcCommentsHost';
    host.innerHTML = panelHtml(ctx);
    reader.appendChild(host);
    host.querySelectorAll('[data-vclose]').forEach(function(n){ n.onclick = closePanel; });
    var exp = host.querySelector('.vc-cmt-expand');
    if (exp) exp.onclick = function(){ var q = host.querySelector('.vc-cmt-quote'); var on = q.classList.toggle('is-open'); exp.textContent = on ? 'Thu gọn' : 'Mở rộng'; };
    host.querySelectorAll('.vc-reaction').forEach(function(b){ b.onclick = function(){ setReaction(ctx,b.dataset.rx); }; });
    var form = host.querySelector('#vcCmtForm');
    if (form) {
      var ta = form.querySelector('textarea');
      ta.addEventListener('input', function(){ ta.style.height='auto'; ta.style.height=Math.min(128,ta.scrollHeight)+'px'; });
      form.onsubmit = function(e){
        e.preventDefault();
        var val = ta.value.trim(); if (!val) return;
        try {
          VCBG.addComment({ chapterId:ctx.chapter.id, storyId:ctx.story.id, body:val, quote:ctx.quote || '', para_key:ctx.paraKey || '' });
          ta.value=''; ta.style.height=''; refreshList(ctx); updateBubble(ctx);
        } catch(err) { if (err && err.code === 'AUTH_REQUIRED') location.hash='#/dang-nhap'; }
      };
    }
    bindPanelActions(ctx);
    loadReactions(ctx);
  }

  document.addEventListener('click', function(e){
    var bubble = e.target.closest && e.target.closest('.reader-page .p-bubble');
    if (bubble) {
      var r = currentRoute(); var p = bubble.closest('p.r-p');
      if (!r || !p) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      openPanel({ story:r.story, chapter:r.chapter, paraKey:p.dataset.pk || '', quote:quoteFromParagraph(p) });
      return;
    }
    var all = e.target.closest && e.target.closest('.reader-page #btnCmtAll');
    if (all) {
      var rr = currentRoute(); if (!rr) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      openPanel({ story:rr.story, chapter:rr.chapter, paraKey:'', quote:'' });
    }
  }, true);

  window.addEventListener('hashchange', closePanel);
})();
