/* ViCamBachGiai — quick cover flip before following a story link. */
(function(){
  var busy=false;
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');

  document.addEventListener('click',function(event){
    if(busy||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    var frame=event.target.closest&&event.target.closest('.cover-frame');
    if(!frame)return;
    var link=frame.closest('a[href^="#/truyen/"]');
    if(!link)return;
    if(reduce&&reduce.matches)return;
    var image=frame.querySelector('img');
    if(!image)return;

    var rect=frame.getBoundingClientRect();
    if(rect.width<24||rect.height<36)return;
    event.preventDefault();
    busy=true;

    var stage=document.createElement('div');
    stage.className='vc-card-flip-stage';
    var card=document.createElement('div');
    card.className='vc-card-flip-card';
    card.style.setProperty('--flip-left',rect.left+'px');
    card.style.setProperty('--flip-top',rect.top+'px');
    card.style.setProperty('--flip-width',rect.width+'px');
    card.style.setProperty('--flip-height',rect.height+'px');
    card.style.setProperty('--flip-radius',getComputedStyle(frame).borderRadius||'10px');
    var clone=image.cloneNode(false);
    clone.removeAttribute('loading');
    card.appendChild(clone);
    stage.appendChild(card);
    document.body.appendChild(stage);

    window.setTimeout(function(){
      location.href=link.getAttribute('href');
      window.setTimeout(function(){stage.remove();busy=false},80);
    },230);
  },true);
})();
