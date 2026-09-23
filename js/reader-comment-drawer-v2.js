/* ViCamBachGiai — custom paragraph comment drawer v2 */
(function () {
  const REACTIONS = [
    ['like','👍'], ['love','❤️'], ['haha','😂'], ['wow','😮'], ['sad','😢'], ['angry','😡']
  ];
  const PAGE_SIZE = 20;
  let drawerView = { key:'', sort:'latest', visible:PAGE_SIZE, quoteOpen:false, expandedReplies:new Set() };
  let linkedCommentHandled = '';
  let linkedCommentTimer = 0;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  let sb = null;
  function client() {
    if (sb) return sb;
    try {
      if (window.supabase && window.VCBG_CONFIG) {
        sb = window.supabase.createClient(window.VCBG_CONFIG.supabaseUrl, window.VCBG_CONFIG.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
      }
    } catch (_) {}
    return sb;
  }
  function readerContext() {
    const page = $('.reader-page');
    if (!page || !window.VCBG) return null;
    const raw = (location.hash || '').replace(/^#/, '');
    const m = raw.match(/^\/truyen\/([^/?]+)\/chuong-(\d+)/);
    if (!m) return null;
    const story = VCBG.getStoryBySlug(m[1]);
    if (!story) return null;
    const ch = VCBG.getChapter(story.id, Number(m[2]));
    if (!ch) return null;
    return { page, story, ch };
  }
  function paragraphQuote(p) {
    if (!p) return '';
    const clone = p.cloneNode(true);
    clone.querySelectorAll('.p-bubble,.p-menu').forEach(n => n.remove());
    return String(clone.innerText || clone.textContent || '').replace(/\s+/g,' ').trim().slice(0,700);
  }
  function toast(msg) {
    const wrap = $('#toasts') || document.body;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }
  function relTime(ts) {
    const n = typeof ts === 'number' ? ts : Date.parse(ts || '') || 0;
    const d = Math.max(0, Date.now() - n);
    if (d < 60000) return 'vừa xong';
    if (d < 3600000) return Math.floor(d/60000) + ' phút';
    if (d < 86400000) return Math.floor(d/3600000) + ' giờ';
    return new Date(n).toLocaleDateString('vi-VN');
  }
  async function reactionState(commentIds) {
    const map = {};
    commentIds.forEach(id => map[id] = { counts:{}, mine:'' });
    const c = client();
    if (!c || !commentIds.length) return map;
    try {
      const chunks=[];
      for(let i=0;i<commentIds.length;i+=80) chunks.push(commentIds.slice(i,i+80));
      const rows=await Promise.all(chunks.map(async ids=>{
        const {data,error}=await c.from('comment_reactions').select('comment_id,user_id,reaction').in('comment_id',ids);
        if(error) throw error;
        return data||[];
      }));
      const data=rows.flat();
      let uid = '';
      try { const { data: s } = await c.auth.getSession(); uid = s && s.session && s.session.user ? s.session.user.id : ''; } catch (_) {}
      (data || []).forEach(r => {
        if (!map[r.comment_id]) map[r.comment_id] = { counts:{}, mine:'' };
        map[r.comment_id].counts[r.reaction] = (map[r.comment_id].counts[r.reaction] || 0) + 1;
        if (uid && r.user_id === uid) map[r.comment_id].mine = r.reaction;
      });
    } catch (_) {}
    return map;
  }
  async function setReaction(commentId, reaction) {
    const c = client();
    if (!c) throw new Error('Không kết nối được hệ thống cảm xúc.');
    const { data: sess } = await c.auth.getSession();
    const uid = sess && sess.session && sess.session.user && sess.session.user.id;
    if (!uid) throw new Error('Đăng nhập để thả cảm xúc.');
    const { data: existing } = await c.from('comment_reactions').select('id,reaction').eq('comment_id',commentId).eq('user_id',uid).maybeSingle();
    if (existing && existing.reaction === reaction) {
      const { error } = await c.from('comment_reactions').delete().eq('id', existing.id);
      if (error) throw error;
      return;
    }
    if (existing) {
      const { error } = await c.from('comment_reactions').update({reaction}).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await c.from('comment_reactions').insert({comment_id:commentId,user_id:uid,reaction});
      if (error) throw error;
    }
  }
  function avatar(user) {
    const name = (user && (user.display_name || user.profile && user.profile.display_name)) || 'Độc giả';
    const av = user && (user.avatar || user.profile && user.profile.avatar);
    if (av && /^https?:/i.test(av)) return `<img src="${esc(av)}" alt="">`;
    return `<span>${esc(String(av || name).slice(0,1).toUpperCase())}</span>`;
  }
  function renderThread(c, state, expandedReplies) {
    const u = c.user || {};
    const name = u.display_name || 'Độc giả';
    const st = state[c.id] || {counts:{},mine:''};
    const chips = REACTIONS.filter(([k]) => st.counts[k]).map(([k,e]) => `<button type="button" class="vc-react-chip${st.mine===k?' on':''}" data-react="${k}" data-cid="${c.id}">${e}<b>${st.counts[k]}</b></button>`).join('');
    const allReplies = c.replies || [];
    const repliesOpen = expandedReplies.has(String(c.id));
    const visibleReplies = repliesOpen ? allReplies : allReplies.slice(0,2);
    const replies = visibleReplies.map(r => `<div class="vc-reply">
      <div class="vc-thread-line"></div><div class="vc-avatar vc-avatar-sm">${avatar(r.user || {})}</div>
      <div class="vc-reply-body"><div class="vc-comment-meta"><b>${esc((r.user && r.user.display_name) || 'Độc giả')}</b><span>${relTime(r.created_at)}</span></div><p>${esc(r.body)}</p></div>
    </div>`).join('');
    return `<article class="vc-comment" data-comment-id="${c.id}">
      <div class="vc-avatar">${avatar(u)}</div>
      <div class="vc-comment-main">
        <div class="vc-comment-meta"><b>${esc(name)}</b><span>${relTime(c.created_at)}</span></div>
        <p>${esc(c.body)}</p>
        <div class="vc-comment-actions">
          <button type="button" class="vc-action vc-react-open" data-cid="${c.id}">♡ Cảm xúc</button>
          <button type="button" class="vc-action vc-reply-open" data-cid="${c.id}" data-name="${esc(name)}">Trả lời</button>
        </div>
        <div class="vc-react-summary">${chips}</div>
        <div class="vc-reaction-pop" data-pop="${c.id}">${REACTIONS.map(([k,e]) => `<button type="button" data-react="${k}" data-cid="${c.id}" class="${st.mine===k?'on':''}">${e}</button>`).join('')}</div>
        ${replies}
        ${allReplies.length > 2 ? `<button type="button" class="vc-more-replies" data-expand-replies="${c.id}">${repliesOpen ? 'Thu gọn trả lời' : `Xem thêm ${allReplies.length - 2} trả lời`}</button>` : ''}
      </div>
    </article>`;
  }
  function syncBubbleCount(paraKey, count) {
    if (!paraKey) return;
    const bubble = $(`.reader-page .r-p[data-pk="${CSS.escape(paraKey)}"] .p-bubble`);
    if (!bubble) return;
    bubble.classList.toggle('has', count > 0);
    bubble.dataset.count = count > 99 ? '99+' : (count ? String(count) : '');
    bubble.textContent = count ? String(count) : '';
    bubble.setAttribute('aria-label', count ? `Đoạn này có ${count} bình luận và phản hồi` : 'Bình luận đoạn');
  }
  function drawerKey(ctx, paraKey) {
    return String(ctx.ch.id) + ':' + String(paraKey || 'all');
  }
  function prepareDrawerView(ctx, paraKey) {
    const key = drawerKey(ctx, paraKey);
    if (drawerView.key !== key) drawerView = { key, sort:'latest', visible:PAGE_SIZE, quoteOpen:false, expandedReplies:new Set() };
    return drawerView;
  }
  function sortComments(list, reactions, mode) {
    return list.slice().sort((a,b) => {
      if (mode === 'popular') {
        const score = c => (c.replies || []).length + Object.values((reactions[c.id] || {}).counts || {}).reduce((n,v)=>n+Number(v||0),0);
        const diff = score(b) - score(a);
        if (diff) return diff;
      }
      return (Date.parse(b.created_at || '') || Number(b.created_at) || 0) - (Date.parse(a.created_at || '') || Number(a.created_at) || 0);
    });
  }
  async function openDrawer(ctx, quote, paraKey, options) {
    const host = $('#rDraw');
    if (!host) return;
    const view = prepareDrawerView(ctx, paraKey);
    const list0 = VCBG.listComments(ctx.ch.id) || [];
    const list = paraKey ? list0.filter(c => c.para_key === paraKey || (!c.para_key && c.quote === quote)) : list0;
    const state = await reactionState(list.map(c => c.id));
    const count = list.length + list.reduce((n,c)=>n+(c.replies||[]).length,0);
    const sorted = sortComments(list,state,view.sort);
    const targetCommentId = options && options.targetCommentId ? String(options.targetCommentId) : '';
    if (targetCommentId) {
      const targetIndex = sorted.findIndex(c => String(c.id) === targetCommentId);
      if (targetIndex >= 0) view.visible = Math.max(view.visible, targetIndex + 1);
      view.expandedReplies.add(targetCommentId);
    }
    const visible = sorted.slice(0,view.visible);
    syncBubbleCount(paraKey, count);
    host.innerHTML = `<div class="vc-comment-backdrop" data-vc-close></div>
      <aside class="vc-comment-drawer" role="dialog" aria-modal="true" aria-label="Bình luận">
        <div class="vc-signal-line"></div>
        <header class="vc-comment-head"><div><h3>Bình luận</h3><span>${count ? count + ' bình luận' : 'Chưa có bình luận'}</span></div><button type="button" class="vc-close" data-vc-close aria-label="Đóng">×</button></header>
        ${quote ? `<section class="vc-quote${view.quoteOpen?' is-open':''}"><div class="vc-quote-line"></div><div><p>${esc(quote)}</p><div class="vc-quote-meta"><a href="#/truyen/${esc(ctx.story.slug)}/chuong-${ctx.ch.number}${paraKey?'?para='+encodeURIComponent(paraKey):''}">${esc(ctx.story.title)} · Chương ${ctx.ch.number}${paraKey ? ' · ' + esc(paraKey.replace(/^p/,'Đoạn ')) : ''}</a><button type="button" data-toggle-quote>${view.quoteOpen?'Thu gọn':'Xem đầy đủ'}</button></div></div></section>` : ''}
        ${list.length ? `<nav class="vc-comment-sort" aria-label="Sắp xếp bình luận"><button type="button" data-comment-sort="latest" class="${view.sort==='latest'?'on':''}">Mới nhất</button><button type="button" data-comment-sort="popular" class="${view.sort==='popular'?'on':''}">Nổi bật</button></nav>` : ''}
        <div class="vc-thread-list">${list.length ? visible.map(c => renderThread(c,state,view.expandedReplies)).join('') + (visible.length < sorted.length ? `<button type="button" class="vc-load-more" data-load-more>Đang tải thêm…</button>` : `<div class="vc-list-end">Đã xem hết ${count} bình luận</div>`) : `<div class="vc-empty"><span>✦</span><b>Chưa có bình luận</b><p>Hãy là người đầu tiên để lại một tín hiệu ở đây.</p></div>`}</div>
        <div class="vc-composer-wrap">
          <div class="vc-replying" id="vcReplying" hidden></div>
          <form id="vcCommentForm" class="vc-composer">
            <textarea name="body" rows="1" maxlength="2000" placeholder="${VCBG.currentUser() ? 'Viết bình luận…' : 'Đăng nhập để bình luận'}" ${VCBG.currentUser() ? '' : 'disabled'}></textarea>
            <input type="hidden" name="parent" value="">
            <button type="submit" ${VCBG.currentUser() ? '' : 'disabled'} aria-label="Gửi">↑</button>
          </form>
        </div>
      </aside>`;
    document.documentElement.classList.add('vc-comment-open');
    const close = () => { host.innerHTML=''; document.documentElement.classList.remove('vc-comment-open'); };
    $$('[data-vc-close]',host).forEach(b => b.onclick = close);
    const ta = $('textarea', host);
    if (ta) ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.min(150,ta.scrollHeight)+'px';});

    $('[data-toggle-quote]',host)?.addEventListener('click', async () => {
      view.quoteOpen=!view.quoteOpen;
      await openDrawer(ctx,quote,paraKey,{scrollTop:$('.vc-thread-list',host)?.scrollTop||0});
    });
    $$('[data-comment-sort]',host).forEach(b => b.onclick = async () => {
      view.sort=b.dataset.commentSort; view.visible=PAGE_SIZE;
      await openDrawer(ctx,quote,paraKey);
    });
    $$('[data-expand-replies]',host).forEach(b => b.onclick = async () => {
      const id=String(b.dataset.expandReplies);
      if(view.expandedReplies.has(id)) view.expandedReplies.delete(id); else view.expandedReplies.add(id);
      await openDrawer(ctx,quote,paraKey,{scrollTop:$('.vc-thread-list',host)?.scrollTop||0});
    });
    let loadingMore=false;
    const threadList=$('.vc-thread-list',host);
    const loadMore=async()=>{
      if(loadingMore || view.visible>=sorted.length) return;
      loadingMore=true; const top=threadList.scrollTop; view.visible+=PAGE_SIZE;
      await openDrawer(ctx,quote,paraKey,{scrollTop:top});
    };
    $('[data-load-more]',host)?.addEventListener('click',loadMore);
    if(threadList){
      if(options && Number.isFinite(options.scrollTop)) requestAnimationFrame(()=>{threadList.scrollTop=options.scrollTop;});
      threadList.addEventListener('scroll',()=>{if(threadList.scrollHeight-threadList.scrollTop-threadList.clientHeight<180) loadMore();},{passive:true});
    }
    if (targetCommentId) {
      requestAnimationFrame(() => {
        const target = $(`.vc-comment[data-comment-id="${CSS.escape(targetCommentId)}"]`, host);
        if (!target) return;
        target.classList.add('is-notification-target');
        target.scrollIntoView({ behavior:'smooth', block:'center' });
        setTimeout(() => target.classList.remove('is-notification-target'), 3200);
      });
    }

    $$('.vc-react-open',host).forEach(b => b.onclick = () => {
      const pop = $(`.vc-reaction-pop[data-pop="${b.dataset.cid}"]`,host);
      $$('.vc-reaction-pop.is-open',host).forEach(x=>{if(x!==pop)x.classList.remove('is-open');});
      if (pop) pop.classList.toggle('is-open');
    });
    $$('[data-react]',host).forEach(b => b.onclick = async () => {
      try { await setReaction(b.dataset.cid,b.dataset.react); await openDrawer(ctx,quote,paraKey); }
      catch(e){ toast(e.message || 'Không thả được cảm xúc.'); }
    });
    $$('.vc-reply-open',host).forEach(b => b.onclick = () => {
      const f = $('#vcCommentForm',host); if (!f) return;
      f.parent.value = b.dataset.cid;
      const lab = $('#vcReplying',host); lab.hidden=false; lab.innerHTML=`Đang trả lời <b>${esc(b.dataset.name)}</b> <button type="button" id="vcCancelReply">×</button>`;
      $('#vcCancelReply',host).onclick=()=>{f.parent.value='';lab.hidden=true;};
      f.body.focus();
    });
    const form = $('#vcCommentForm',host);
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const body = form.body.value.trim(); if (!body) return;
      try {
        if (form.parent.value) VCBG.replyComment(form.parent.value,body);
        else VCBG.addComment({chapterId:ctx.ch.id,storyId:ctx.story.id,body,quote:quote||'',para_key:paraKey||''});
        form.body.value=''; toast(form.parent.value?'Đã trả lời.':'Đã đăng bình luận.');
        setTimeout(()=>openDrawer(ctx,quote,paraKey),120);
      } catch(err) { if (err.code==='AUTH_REQUIRED') { if(window.VCBGGoToLogin) window.VCBGGoToLogin(); else location.hash='#/dang-nhap'; } else toast(err.message); }
    };
  }

  let bubbleTimer = 0;
  function showBubble(p) {
    $$('.reader-page .r-p.is-comment-target').forEach(x=>x.classList.remove('is-comment-target'));
    p.classList.add('is-comment-target');
    clearTimeout(bubbleTimer);
    bubbleTimer=setTimeout(()=>p.classList.remove('is-comment-target'),2200);
  }
  function tryOpenLinkedComment() {
    clearTimeout(linkedCommentTimer);
    linkedCommentTimer = setTimeout(() => {
      const raw = (location.hash || '').replace(/^#/, '');
      const query = raw.split('?')[1] || '';
      const commentId = new URLSearchParams(query).get('comment') || '';
      if (!commentId) {
        linkedCommentHandled = '';
        return;
      }
      const key = raw.split('?')[0] + ':' + commentId;
      if (linkedCommentHandled === key) return;
      const ctx = readerContext();
      if (!ctx) return;
      const linkedComment = (VCBG.listComments(ctx.ch.id) || []).find(c => String(c.id) === String(commentId));
      if (!linkedComment) return;
      const requestedParaKey = new URLSearchParams(query).get('para') || '';
      const paraKey = requestedParaKey || String(linkedComment.para_key || '');
      const paragraph = paraKey ? $(`.reader-page .r-p[data-pk="${CSS.escape(paraKey)}"]`) : null;
      const quote = paragraph ? paragraphQuote(paragraph) : String(linkedComment.quote || '');
      linkedCommentHandled = key;
      if (paragraph) {
        showBubble(paragraph);
        paragraph.scrollIntoView({ behavior:'smooth', block:'center' });
      }
      openDrawer(ctx, quote, paraKey, { targetCommentId:commentId });
    }, 80);
  }
  window.addEventListener('hashchange', tryOpenLinkedComment);
  window.addEventListener('DOMContentLoaded', tryOpenLinkedComment, { once:true });
  const appRoot = document.getElementById('app');
  if (appRoot) new MutationObserver(tryOpenLinkedComment).observe(appRoot, { childList:true, subtree:true });
  tryOpenLinkedComment();
  document.addEventListener('click', function(e){
    const ctx = readerContext(); if (!ctx) return;
    const bubble = e.target.closest && e.target.closest('.p-bubble');
    if (bubble) {
      e.preventDefault(); e.stopImmediatePropagation();
      clearTimeout(bubbleTimer);
      const p=bubble.closest('p.r-p');
      openDrawer(ctx, paragraphQuote(p), p && p.dataset.pk || '');
      return;
    }
    const all = e.target.closest && e.target.closest('#btnCmtAll');
    if (all) {
      e.preventDefault(); e.stopImmediatePropagation(); openDrawer(ctx,'',''); return;
    }
    const p=e.target.closest && e.target.closest('.reader-page p.r-p');
    if (p && !e.target.closest('a,button')) { showBubble(p); }
  }, true);
})();
