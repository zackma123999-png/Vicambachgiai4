/* ViCamBachGiai: reliable two-step password recovery for the hash-routed SPA.
   Step 1 sends a recovery link. Step 2 is shown only after Supabase creates a recovery session. */
(function () {
  if (!window.supabase || !window.VCBG_CONFIG) return;

  var cfg = window.VCBG_CONFIG;
  var initialHash = String(location.hash || "");
  var arrivedFromRecovery = /(?:^#|[&#])(?:access_token=|type=recovery)/i.test(initialHash) || /type=recovery/i.test(location.href);
  var RECOVERY_KEY = "vcbg.password.recovery.v1";

  var authClient;
  try {
    authClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  } catch (_) {
    return;
  }

  function markRecovery(on) {
    try {
      if (on) sessionStorage.setItem(RECOVERY_KEY, "1");
      else sessionStorage.removeItem(RECOVERY_KEY);
    } catch (_) {}
  }

  function isRecoveryMode() {
    try {
      return /(?:\?|&)recovery=1(?:&|$)/.test(String(location.hash || "")) || sessionStorage.getItem(RECOVERY_KEY) === "1";
    } catch (_) {
      return /(?:\?|&)recovery=1(?:&|$)/.test(String(location.hash || ""));
    }
  }

  function routeToReset() {
    markRecovery(true);
    if (location.hash !== "#/quen-mat-khau?recovery=1") {
      location.hash = "#/quen-mat-khau?recovery=1";
    }
  }

  if (arrivedFromRecovery) {
    /* Let Supabase consume/persist the recovery token before replacing the hash router value. */
    authClient.auth.getSession().then(function (res) {
      if (res && res.data && res.data.session) routeToReset();
      else setTimeout(function () {
        authClient.auth.getSession().then(function (again) {
          if (again && again.data && again.data.session) routeToReset();
        }).catch(function () {});
      }, 250);
    }).catch(function () {});
  }

  authClient.auth.onAuthStateChange(function (event) {
    if (event === "PASSWORD_RECOVERY") routeToReset();
  });

  function fieldFor(input) {
    return input && input.closest ? input.closest(".field") : null;
  }

  function prepareForgotForm() {
    if (!/^#\/quen-mat-khau(?:\?|$)/.test(String(location.hash || ""))) return;
    var form = document.getElementById("aForm");
    if (!form || form.dataset.resetFixed === "1") return;
    form.dataset.resetFixed = "1";

    var email = form.querySelector('input[name="email"]');
    var password = form.querySelector('input[name="password"]');
    var button = form.querySelector('button[type="submit"]');
    var hint = document.getElementById("aHint");
    var err = document.getElementById("aErr");
    var recovery = isRecoveryMode();

    if (recovery) {
      if (fieldFor(email)) fieldFor(email).style.display = "none";
      if (email) email.required = false;
      if (fieldFor(password)) fieldFor(password).style.display = "";
      if (password) {
        password.required = true;
        password.autocomplete = "new-password";
      }
      if (button) button.textContent = "Đổi mật khẩu";
      if (hint) hint.textContent = "Nhập mật khẩu mới để hoàn tất.";
    } else {
      if (fieldFor(password)) fieldFor(password).style.display = "none";
      if (password) {
        password.required = false;
        password.value = "";
      }
      if (email) email.required = true;
      if (button) button.textContent = "Gửi liên kết đặt lại";
      if (hint) hint.textContent = "Chúng tôi sẽ gửi một liên kết đặt lại mật khẩu tới email của bạn.";
    }

    /* Capture phase: prevent the old one-screen handler from calling updateUser before a recovery session exists. */
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (err) err.textContent = "";
      if (button) button.disabled = true;

      try {
        if (!isRecoveryMode()) {
          var address = String((email && email.value) || "").trim().toLowerCase();
          if (!address) throw new Error("Vui lòng nhập email.");
          if (button) button.textContent = "Đang gửi…";
          var redirectTo = location.origin + location.pathname;
          var sent = await authClient.auth.resetPasswordForEmail(address, { redirectTo: redirectTo });
          if (sent.error) throw sent.error;
          if (hint) hint.textContent = "Đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra Hộp thư đến và Spam.";
          if (button) button.textContent = "Gửi lại liên kết";
        } else {
          var pw = String((password && password.value) || "");
          if (pw.length < 8) throw new Error("Mật khẩu mới cần ít nhất 8 ký tự.");
          if (button) button.textContent = "Đang đổi…";
          var updated = await authClient.auth.updateUser({ password: pw });
          if (updated.error) throw updated.error;
          markRecovery(false);
          if (hint) hint.textContent = "Đã đổi mật khẩu thành công.";
          if (button) button.textContent = "Đã đổi mật khẩu";
          setTimeout(function () { location.hash = "#/"; }, 500);
        }
      } catch (e) {
        var msg = String((e && e.message) || "Không thực hiện được.");
        if (/Auth session missing/i.test(msg)) msg = "Liên kết đặt lại đã hết hạn hoặc chưa được mở. Hãy yêu cầu một liên kết mới.";
        if (err) err.textContent = msg;
      } finally {
        if (button) button.disabled = false;
        if (!isRecoveryMode() && button && button.textContent === "Đang gửi…") button.textContent = "Gửi liên kết đặt lại";
        if (isRecoveryMode() && button && button.textContent === "Đang đổi…") button.textContent = "Đổi mật khẩu";
      }
    }, true);
  }

  var obs = new MutationObserver(prepareForgotForm);
  obs.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", function () { setTimeout(prepareForgotForm, 0); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", prepareForgotForm);
  else prepareForgotForm();
})();
