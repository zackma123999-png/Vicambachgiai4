/* Compact in-site TikTok story introduction player. */
(function () {
  let dock = null, frame = null, ready = false, playing = false, muted = true;
  function esc(value) { const n = document.createElement("span"); n.textContent = String(value || ""); return n.innerHTML; }
  function command(type, value) {
    if (frame?.contentWindow) frame.contentWindow.postMessage({ type, value, "x-tiktok-player": true }, "https://www.tiktok.com");
  }
  function syncControls() {
    if (!dock) return;
    const play = dock.querySelector(".tiktok-story-play");
    const icon = play?.querySelector("span");
    const label = play?.querySelector("small");
    const sound = dock.querySelector(".tiktok-story-sound");
    if (play) play.disabled = !ready;
    if (icon) icon.textContent = playing ? "❚❚" : "▶";
    if (label) label.textContent = !ready ? "Đang tải…" : playing ? "Tạm dừng" : muted ? "Phát có tiếng" : "Tiếp tục phát";
    if (sound) {
      sound.disabled = !ready;
      sound.textContent = muted ? "🔇" : "🔊";
      sound.setAttribute("aria-label", muted ? "Bật tiếng" : "Tắt tiếng");
    }
  }
  function closePlayer() {
    if (dock) dock.remove();
    dock = frame = null; ready = playing = false; muted = true;
    document.body.classList.remove("has-tiktok-story-player");
  }
  function openPlayer(button) {
    const post = String(button.dataset.tiktokPost || "").replace(/\D/g, "");
    if (!post) return;
    closePlayer();
    const title = button.dataset.storyTitle || "Giới thiệu truyện";
    const author = button.dataset.storyAuthor || "TikTok";
    const cover = button.dataset.storyCover || "";
    dock = document.createElement("aside");
    dock.className = "tiktok-story-player is-open is-minimized";
    dock.setAttribute("aria-label", "Trình phát giới thiệu truyện từ TikTok");
    dock.innerHTML = `<div class="tiktok-story-preview">
      <button class="tiktok-story-minimize" type="button" aria-label="Thu nhỏ video">⌄</button>
      <iframe title="TikTok giới thiệu ${esc(title)}" src="https://www.tiktok.com/player/v1/${post}?autoplay=0&muted=0&loop=0&controls=1&progress_bar=1&play_button=1&volume_control=1&fullscreen_button=0&description=0&music_info=0&rel=0&native_context_menu=0" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe>
    </div>
    <div class="tiktok-story-tag">
      ${cover ? `<img src="${esc(cover)}" alt="">` : ""}
      <span class="tiktok-story-copy"><b>${esc(title)}</b><small>Giới thiệu từ TikTok · ${esc(author)}</small></span>
      <button class="tiktok-story-play" type="button" disabled><span aria-hidden="true">▶</span><small>Đang tải…</small></button>
      <button class="tiktok-story-sound" type="button" disabled aria-label="Bật tiếng">🔇</button>
      <button class="tiktok-story-video-toggle" type="button" aria-label="Mở video TikTok"><span aria-hidden="true">▣</span><small>Xem video</small></button>
      <button class="tiktok-story-close" type="button" aria-label="Đóng trình phát">×</button>
    </div>`;
    document.body.appendChild(dock);
    document.body.classList.add("has-tiktok-story-player");
    frame = dock.querySelector("iframe");
    frame.addEventListener("load", function () {
      window.setTimeout(function () {
        if (!dock || frame !== dock.querySelector("iframe") || ready) return;
        ready = true;
        syncControls();
      }, 900);
    }, { once: true });
    syncControls();
    requestAnimationFrame(() => dock && dock.classList.add("is-ready"));
  }
  window.addEventListener("message", function (event) {
    if (!frame || event.source !== frame.contentWindow || event.origin !== "https://www.tiktok.com") return;
    const message = event.data || {};
    if (!message["x-tiktok-player"]) return;
    if (message.type === "onPlayerReady") ready = true;
    else if (message.type === "onStateChange") playing = Number(message.value) === 1;
    else if (message.type === "onMute") muted = Boolean(message.value);
    else if (message.type === "onVolumeChange") muted = Number(message.value) <= 0;
    syncControls();
  });
  document.addEventListener("click", function (event) {
    const launch = event.target.closest(".medal-tiktok-button");
    if (launch) { event.preventDefault(); event.stopPropagation(); openPlayer(launch); return; }
    if (!dock) return;
    if (event.target.closest(".tiktok-story-close")) return closePlayer();
    if (event.target.closest(".tiktok-story-play")) {
      if (!ready) return;
      if (playing) command("pause", null);
      else { command("unMute", null); command("changeVolume", 100); command("play", null); muted = false; }
      syncControls(); return;
    }
    if (event.target.closest(".tiktok-story-sound")) {
      if (!ready) return;
      command(muted ? "unMute" : "mute", null);
      if (muted) command("changeVolume", 100);
      muted = !muted; syncControls(); return;
    }
    if (event.target.closest(".tiktok-story-minimize, .tiktok-story-video-toggle")) {
      dock.classList.toggle("is-minimized");
      const minimized = dock.classList.contains("is-minimized");
      const control = dock.querySelector(".tiktok-story-video-toggle");
      if (control) {
        control.setAttribute("aria-label", minimized ? "Mở video TikTok" : "Thu gọn video TikTok");
        const icon = control.querySelector("span"), label = control.querySelector("small");
        if (icon) icon.textContent = minimized ? "▣" : "⌄";
        if (label) label.textContent = minimized ? "Xem video" : "Thu gọn";
      }
    }
  });
  window.addEventListener("hashchange", closePlayer);
})();
