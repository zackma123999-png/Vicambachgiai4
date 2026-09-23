/* Keep the account-card avatar identical to the active header avatar. */
(function(){
  let queued=false;
  function sync(){
    queued=false;
    const preview=document.querySelector('.vc-avatar-account-preview');
    if(!preview)return;
    const chip=document.querySelector('img.avatar-chip,.avatar-chip img,.avatar-chip');
    let src='';
    if(chip){src=chip.currentSrc||chip.src||chip.querySelector?.('img')?.currentSrc||chip.querySelector?.('img')?.src||''}
    if(!src&&window.VCBG&&window.VICAM_AVATARS){const u=VCBG.currentUser&&VCBG.currentUser();if(u)src=VICAM_AVATARS.srcByIndex(VICAM_AVATARS.indexFor(u.profile||{}))}
    if(src&&preview.getAttribute('src')!==src)preview.src=src;
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(sync)}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  window.addEventListener('load',schedule);window.addEventListener('hashchange',()=>setTimeout(schedule,60));
  setTimeout(schedule,30);setTimeout(schedule,250);setTimeout(schedule,900);
})();
