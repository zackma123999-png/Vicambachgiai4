/* ViCamBachGiai — canonical avatar library v2 (single source of truth). */
(function(){
  const OPTIONS=['Vịt vàng','Gấu trắng','Gấu nâu','Cánh cụt','Mèo xám','Cáo cam','Thỏ trắng','Capybara','Khủng long','Shiba','Gấu trúc','Gà con','Mèo đen','Nhím','Rái cá','Corgi','Sao Admin'];
  const FILES=['duck.png','white-bear.png','brown-bear.png','penguin.png','gray-cat.png','orange-fox.png','white-rabbit.png','capybara.png','dinosaur.png','shiba.png','panda.png','chick.png','black-cat.png','hedgehog.png','otter.png','corgi.png','admin-star.svg'];
  const ASSETS=FILES.map(name=>'avatars/v2/'+name);
  const ADMIN_AVATAR_INDEX=16;
  const PUBLIC_AVATAR_COUNT=16;
  function hash(s){let h=2166136261;for(const c of String(s||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
  function keyOf(u){return (u&&(u.user_id||u.id||u.email||u.display_name))||'guest'}
  function picked(a){const m=String(a||'').match(/^vca:(\d{1,2})$/);if(!m)return -1;const i=Number(m[1]);return i>=0&&i<ASSETS.length?i:-1}
  function indexFor(u){const p=picked(u&&u.avatar);return p>=0?p:hash(keyOf(u))%PUBLIC_AVATAR_COUNT}
  function srcByIndex(i){i=Number(i);return ASSETS[(i>=0&&i<ASSETS.length)?i:0]}
  function realAvatar(u){const a=u&&u.avatar?String(u.avatar):'';return /^(https?:|covers\/|brand\/)/i.test(a)?a:''}
  function srcFor(u){return realAvatar(u)||srcByIndex(indexFor(u||{}))}
  function exactSrcFor(u){const a=realAvatar(u);if(a)return a;const p=picked(u&&u.avatar);if(p>=0)return srcByIndex(p);return realAvatar({avatar:u&&u.google_avatar})}
  function decorate(el,u,admin){
    if(!el)return;const src=admin?srcByIndex(ADMIN_AVATAR_INDEX):srcFor(u||{});el.classList.add('vc-pool-avatar');el.classList.toggle('vc-admin-avatar',!!admin);
    if(el.tagName==='IMG'){if(el.getAttribute('src')!==src)el.src=src;return}
    let img=el.querySelector(':scope > img.vc-avatar-img');
    if(!img){el.textContent='';img=document.createElement('img');img.className='vc-avatar-img';img.alt='';img.loading='lazy';img.decoding='async';el.appendChild(img)}
    if(img.getAttribute('src')!==src)img.src=src;
  }
  function decorateExact(el,u){
    if(!el)return;const src=el.dataset.avatarFailed==='true'?'':exactSrcFor(u||{});el.classList.remove('vc-admin-avatar');
    if(!src){const letter=el.getAttribute('data-avatar-letter')||'?';if(el.textContent!==letter)el.textContent=letter;el.classList.remove('vc-pool-avatar');return}
    el.classList.add('vc-pool-avatar');let img=el.querySelector(':scope > img.vc-avatar-img');
    if(!img){el.textContent='';img=document.createElement('img');img.className='vc-avatar-img';img.alt='';img.loading='lazy';img.decoding='async';img.onerror=()=>{el.dataset.avatarFailed='true';el.classList.remove('vc-pool-avatar');el.textContent=el.getAttribute('data-avatar-letter')||'?'};el.appendChild(img)}
    if(img.getAttribute('src')!==src)img.src=src;
  }
  function feedMap(){const m={comments:{},replies:{}};try{const f=VCBG.communityFeed({sort:'latest',storyId:''})||[];f.forEach(c=>{m.comments[String(c.id)]=c.user||{};(c.replies||[]).forEach(r=>m.replies[String(r.id)]=r.user||{})})}catch(_){}return m}
  function drawerMap(){const m={};try{const raw=(location.hash||'').replace(/^#/,'');const mt=raw.match(/^\/truyen\/([^/?]+)\/chuong-(\d+)/);if(!mt)return m;const s=VCBG.getStoryBySlug(mt[1]);if(!s)return m;const ch=VCBG.getChapter(s.id,Number(mt[2]));if(!ch)return m;(VCBG.listComments(ch.id)||[]).forEach(c=>m[String(c.id)]=c.user||{})}catch(_){}return m}
  let busy=false;
  function sync(){if(busy)return;busy=true;requestAnimationFrame(()=>{busy=false;if(!window.VCBG)return;const me=VCBG.currentUser&&VCBG.currentUser();document.querySelectorAll('.avatar-chip').forEach(el=>decorate(el,me&&me.profile,me&&me.role==='admin'));const fm=feedMap();document.querySelectorAll('.sig-card[data-cid]').forEach(card=>decorate(card.querySelector(':scope > .sig-ava'),fm.comments[card.dataset.cid],!!card.querySelector(':scope > .sig-main > .sig-meta .sig-badge.staff')));document.querySelectorAll('.sig-reply[data-rid]').forEach(card=>decorate(card.querySelector(':scope > .sig-ava'),fm.replies[card.dataset.rid],!!card.querySelector(':scope > .sig-reply-body > .sig-meta .sig-badge.staff')));document.querySelectorAll('.sig-compose .sig-ava').forEach(el=>decorate(el,me&&me.profile,me&&me.role==='admin'));const dm=drawerMap();document.querySelectorAll('.vc-comment[data-comment-id]').forEach(card=>decorate(card.querySelector(':scope > .vc-avatar'),dm[card.dataset.commentId]));document.querySelectorAll('[data-avatar-user]').forEach(el=>decorate(el,{id:el.getAttribute('data-avatar-user')}));document.querySelectorAll('[data-member-avatar]').forEach(el=>decorateExact(el,{avatar:el.getAttribute('data-avatar-value')||'',google_avatar:el.getAttribute('data-google-avatar')||''}));});}
  window.VICAM_AVATARS={options:OPTIONS.slice(),assets:ASSETS.slice(),srcByIndex,srcFor,decorate,sync,indexFor,adminAvatarIndex:ADMIN_AVATAR_INDEX};
  new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('load',sync);window.addEventListener('hashchange',()=>setTimeout(sync,60));setTimeout(sync,30);
})();
