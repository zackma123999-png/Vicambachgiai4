/* ViCamBachGiai — three-source account avatar picker. */
(function () {
  const BUCKET = "user-avatars";
  const MAX_INPUT = 20 * 1024 * 1024;
  const TARGET_BYTES = 100 * 1024;

  function isAccount() { return /^\/?tai-khoan(?:\?|$)/.test((location.hash || "").replace(/^#/, "")); }
  function esc(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function notify(message) { if (window.toast) window.toast(message); else alert(message); }
  function close() {
    const back = document.querySelector(".vc-avatar-picker-backdrop");
    if (!back) return;
    if (back.dataset.previewUrl) URL.revokeObjectURL(back.dataset.previewUrl);
    back.remove();
  }
  function customPath(userId) { return String(userId) + "/avatar"; }
  function isCustomAvatar(value) { return /\/storage\/v1\/object\/public\/user-avatars\//i.test(String(value || "")); }
  function isGoogleAvatar(value) { return /^https:\/\/[^/]*googleusercontent\.com\//i.test(String(value || "")); }
  function currentSource(profile) {
    const avatar = String((profile && profile.avatar) || "");
    if (isCustomAvatar(avatar)) return "upload";
    if (isGoogleAvatar(avatar) || (profile && profile.google_avatar && avatar === profile.google_avatar)) return "google";
    return "library";
  }
  async function decodeImage(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file); } catch (_) {}
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Điện thoại không đọc được định dạng ảnh này.")); };
      img.src = url;
    });
  }
  function canvasBlob(canvas, quality) { return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality)); }
  async function compressAvatar(file) {
    if (!file || !/^image\//i.test(file.type || "")) throw new Error("Hãy chọn một tệp hình ảnh.");
    if (file.size > MAX_INPUT) throw new Error("Ảnh gốc quá lớn. Hãy chọn ảnh dưới 20 MB.");
    const image = await decodeImage(file);
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    if (!width || !height) throw new Error("Không đọc được kích thước ảnh.");
    const side = Math.min(width, height);
    const sx = (width - side) / 2;
    const sy = (height - side) / 2;
    let best = null;
    for (const size of [256, 224, 192]) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#111522";
      context.fillRect(0, 0, size, size);
      context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
      for (const quality of [.82, .7, .58, .46]) {
        const blob = await canvasBlob(canvas, quality);
        if (!blob) continue;
        best = blob;
        if (blob.size <= TARGET_BYTES) {
          if (typeof image.close === "function") image.close();
          return blob;
        }
      }
    }
    if (typeof image.close === "function") image.close();
    if (!best || best.size > 145 * 1024) throw new Error("Không thể nén ảnh đủ nhỏ. Hãy chọn ảnh khác.");
    return best;
  }
  function setSource(back, source) {
    back.querySelectorAll("[data-avatar-source]").forEach((button) => {
      const on = button.dataset.avatarSource === source;
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-selected", on ? "true" : "false");
    });
    back.querySelectorAll("[data-avatar-panel]").forEach((panel) => { panel.hidden = panel.dataset.avatarPanel !== source; });
  }
  function selectChoice(back, choice, preview) {
    back._avatarChoice = choice;
    back.querySelectorAll(".vc-avatar-option,.vc-avatar-google-card,.vc-avatar-upload-card").forEach((item) => item.classList.remove("is-selected"));
    if (preview) preview.classList.add("is-selected");
    back.querySelector(".vc-avatar-save").disabled = false;
  }
  async function deleteUploadedAvatar(sb, userId) {
    const { error } = await sb.storage.from(BUCKET).remove([
      customPath(userId),
      String(userId) + "/avatar.webp"
    ]);
    if (error && !/not found/i.test(error.message || "")) throw error;
  }
  async function saveChoice(back) {
    const choice = back._avatarChoice;
    if (!choice || !window.VCBG) return;
    const me = VCBG.currentUser();
    if (!me) throw new Error("Phiên đăng nhập đã hết hạn.");
    const oldAvatar = String((me.profile && me.profile.avatar) || "");
    const sb = VCBG.supabaseClient();
    let nextAvatar = "";
    if (choice.type === "upload") {
      const path = customPath(me.id);
      const { error } = await sb.storage.from(BUCKET).upload(path, choice.blob, {
        contentType: choice.blob.type || "image/webp",
        cacheControl: "3600",
        upsert: true
      });
      if (error) throw new Error("Không tải được avatar. " + (error.message || ""));
      const result = sb.storage.from(BUCKET).getPublicUrl(path);
      nextAvatar = result.data.publicUrl + "?v=" + Date.now();
      await VCBG.updateProfile({ avatar: nextAvatar });
    } else {
      nextAvatar = choice.value;
      await VCBG.updateProfile({ avatar: nextAvatar });
      if (isCustomAvatar(oldAvatar)) {
        try { await deleteUploadedAvatar(sb, me.id); }
        catch (error) { console.warn("[VCBG avatar cleanup]", error && error.message); }
      }
    }
    if (window.VICAM_AVATARS) VICAM_AVATARS.sync();
    document.querySelectorAll(".vc-avatar-account-preview").forEach((preview) => {
      preview.src = nextAvatar.indexOf("vca:") === 0 ? VICAM_AVATARS.srcByIndex(Number(nextAvatar.split(":")[1])) : nextAvatar;
    });
  }
  function openPicker() {
    if (!window.VCBG || !VCBG.currentUser() || !window.VICAM_AVATARS) return;
    close();
    const me = VCBG.currentUser();
    const isAdmin = me.role === "admin";
    const profile = me.profile || {};
    const googleAvatar = String(profile.google_avatar || "");
    const adminIndex = Number.isInteger(VICAM_AVATARS.adminAvatarIndex) ? VICAM_AVATARS.adminAvatarIndex : -1;
    const opts = (VICAM_AVATARS.options || []).map((name, index) => ({ name, index })).filter((item) => item.index !== adminIndex || isAdmin);
    const googleCard = googleAvatar
      ? '<button type="button" class="vc-avatar-google-card" data-use-google><img src="' + esc(googleAvatar) + '" alt="Ảnh Google"><span><b>Ảnh tài khoản Google</b><small>Dùng ảnh đang gắn với tài khoản đăng nhập</small></span><i>Chọn</i></button>'
      : '<div class="vc-avatar-google-card is-disabled"><span class="vc-avatar-google-fallback">G</span><span><b>Chưa có ảnh Google</b><small>Tài khoản Google này không cung cấp ảnh đại diện</small></span></div>';
    const back = document.createElement("div");
    back.className = "vc-avatar-picker-backdrop";
    back.innerHTML = '<section class="vc-avatar-picker" role="dialog" aria-modal="true" aria-label="Đổi avatar">' +
      '<header><div><h2>Đổi avatar</h2><p>Chọn một trong ba nguồn ảnh đại diện</p></div><button type="button" class="vc-avatar-close" aria-label="Đóng">×</button></header>' +
      '<div class="vc-avatar-sources" role="tablist" aria-label="Nguồn avatar"><button type="button" data-avatar-source="google" role="tab"><b>G</b><span>Ảnh Google</span></button><button type="button" data-avatar-source="library" role="tab"><b>✦</b><span>Kho ViCam</span></button><button type="button" data-avatar-source="upload" role="tab"><b>＋</b><span>Ảnh của tôi</span></button></div>' +
      '<div class="vc-avatar-panels"><section class="vc-avatar-panel" data-avatar-panel="google">' + googleCard + '</section>' +
      '<section class="vc-avatar-panel" data-avatar-panel="library"><div class="vc-avatar-grid">' + opts.map((item) => '<button type="button" class="vc-avatar-option' + (item.index === adminIndex ? ' is-admin-only' : '') + '" data-i="' + item.index + '" aria-label="' + esc(item.name) + '"><img src="' + esc(VICAM_AVATARS.srcByIndex(item.index)) + '" alt=""><span>' + esc(item.name) + '</span>' + (item.index === adminIndex ? '<small>Chỉ quản trị</small>' : '') + '</button>').join("") + '</div></section>' +
      '<section class="vc-avatar-panel" data-avatar-panel="upload"><button type="button" class="vc-avatar-upload-card"><span class="vc-avatar-upload-preview">＋</span><span><b>Chọn ảnh từ điện thoại</b><small>Web tự cắt vuông và nén xuống dưới 100 KB</small></span><i>Chọn ảnh</i></button><input class="vc-avatar-file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden><p class="vc-avatar-upload-note">Ảnh cũ sẽ tự xoá khi bạn chuyển sang nguồn khác. Mỗi tài khoản chỉ lưu một ảnh cá nhân.</p></section></div>' +
      '<footer><span>Avatar được đồng bộ ở tài khoản và bình luận.</span><button type="button" class="vc-avatar-save" disabled>Lưu avatar</button></footer></section>';
    document.body.appendChild(back);
    setSource(back, currentSource(profile));
    back.querySelector(".vc-avatar-close").onclick = close;
    back.onclick = (event) => { if (event.target === back) close(); };
    back.querySelectorAll("[data-avatar-source]").forEach((button) => { button.onclick = () => setSource(back, button.dataset.avatarSource); });
    const useGoogle = back.querySelector("[data-use-google]");
    if (useGoogle) useGoogle.onclick = () => selectChoice(back, { type: "google", value: googleAvatar }, useGoogle);
    back.querySelectorAll(".vc-avatar-option").forEach((button) => {
      button.onclick = () => {
        const index = Number(button.dataset.i);
        if (index === adminIndex && me.role !== "admin") return notify("Avatar này chỉ dành cho quản trị viên.");
        selectChoice(back, { type: "library", value: "vca:" + index }, button);
      };
    });
    const fileInput = back.querySelector(".vc-avatar-file");
    const uploadCard = back.querySelector(".vc-avatar-upload-card");
    uploadCard.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      uploadCard.classList.add("is-busy");
      uploadCard.querySelector("i").textContent = "Đang nén…";
      try {
        const blob = await compressAvatar(file);
        if (back.dataset.previewUrl) URL.revokeObjectURL(back.dataset.previewUrl);
        const url = URL.createObjectURL(blob);
        back.dataset.previewUrl = url;
        const preview = uploadCard.querySelector(".vc-avatar-upload-preview");
        preview.textContent = "";
        preview.style.backgroundImage = 'url("' + url.replace(/"/g, "%22") + '")';
        uploadCard.querySelector("i").textContent = Math.max(1, Math.round(blob.size / 1024)) + " KB";
        selectChoice(back, { type: "upload", blob }, uploadCard);
      } catch (error) {
        uploadCard.querySelector("i").textContent = "Chọn lại";
        notify(error.message || "Không xử lý được ảnh.");
      } finally { uploadCard.classList.remove("is-busy"); }
    };
    back.querySelector(".vc-avatar-save").onclick = async (event) => {
      const button = event.currentTarget;
      if (!back._avatarChoice) return;
      button.disabled = true;
      button.textContent = "Đang lưu…";
      try {
        await saveChoice(back);
        close();
        notify("Đã đổi avatar.");
      } catch (error) {
        button.disabled = false;
        button.textContent = "Lưu avatar";
        notify(error.message || "Không đổi được avatar.");
      }
    };
  }
  function inject() {
    if (!isAccount() || !window.VCBG || !VCBG.currentUser() || document.querySelector(".vc-avatar-account")) return;
    const main = document.querySelector("#app main.wrap");
    if (!main) return;
    const user = VCBG.currentUser();
    const srcNow = window.VICAM_AVATARS ? VICAM_AVATARS.srcFor(user.profile || {}) : "";
    const sourceLabels = { google: "Ảnh Google", library: "Kho ViCamBachGiai", upload: "Ảnh từ điện thoại" };
    const card = document.createElement("section");
    card.className = "vc-avatar-account";
    card.innerHTML = '<img class="vc-avatar-account-preview" src="' + esc(srcNow) + '" alt="Avatar"><div class="vc-avatar-account-copy"><strong>Avatar</strong><span>' + sourceLabels[currentSource(user.profile)] + ' · dùng cho tài khoản và bình luận</span></div><button type="button" class="vc-avatar-account-btn">Đổi avatar</button>';
    const firstP = main.querySelector(":scope > p");
    if (firstP) firstP.insertAdjacentElement("afterend", card); else main.prepend(card);
    card.querySelector(".vc-avatar-account-btn").onclick = openPicker;
  }
  new MutationObserver(() => setTimeout(inject, 0)).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => setTimeout(inject, 50));
  window.addEventListener("load", () => setTimeout(inject, 80));
  setTimeout(inject, 120);
})();
