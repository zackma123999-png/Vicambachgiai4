/* Admin-only synopsis formatting UI. Does not alter reader pages or other features. */
(function () {
  "use strict";

  function enhance() {
    if (!/^#\/admin\/truyen\//.test(location.hash)) return;
    var form = document.getElementById("stForm");
    if (!form || form.dataset.synopsisEditorReady === "1") return;
    var ta = form.querySelector('textarea[name="synopsis"]');
    if (!ta) return;
    form.dataset.synopsisEditorReady = "1";

    var shell = document.createElement("div");
    shell.className = "synopsis-editor-shell";
    shell.innerHTML = '<div class="synopsis-toolbar" role="toolbar" aria-label="Định dạng văn án">' +
      '<button type="button" data-se-cmd="bold" title="In đậm"><b>B</b></button>' +
      '<button type="button" data-se-cmd="italic" title="In nghiêng"><i>I</i></button>' +
      '<span class="se-sep"></span>' +
      '<button type="button" data-se-cmd="justifyLeft" title="Căn trái">≡←</button>' +
      '<button type="button" data-se-cmd="justifyCenter" title="Căn giữa">≡</button>' +
      '<button type="button" data-se-cmd="justifyRight" title="Căn phải">→≡</button>' +
      '<button type="button" data-se-cmd="justifyFull" title="Căn đều hai bên">☰</button>' +
      '<span class="se-sep"></span>' +
      '<select data-se-font title="Font chữ"><option value="Be Vietnam Pro">Sans</option><option value="Source Serif 4">Serif</option><option value="Cormorant Garamond">Cormorant</option></select>' +
      '<select data-se-size title="Cỡ chữ"><option value="2">Nhỏ</option><option value="3" selected>Vừa</option><option value="4">Lớn</option><option value="5">Rất lớn</option></select>' +
      '<select data-se-line title="Giãn dòng"><option value="1.4">Dòng 1.4</option><option value="1.6" selected>Dòng 1.6</option><option value="1.8">Dòng 1.8</option><option value="2">Dòng 2.0</option></select>' +
      '<select data-se-gap title="Khoảng cách đoạn"><option value="0">Đoạn 0</option><option value="8" selected>Đoạn 8</option><option value="16">Đoạn 16</option><option value="24">Đoạn 24</option></select>' +
      '<button type="button" data-se-cmd="removeFormat" title="Xóa định dạng">Tx</button>' +
      '</div><div class="synopsis-rich" contenteditable="true" role="textbox" aria-multiline="true"></div>' +
      '<div class="editor-hint">Định dạng chỉ dùng để soạn trong quản trị. Khi lưu, hệ thống chỉ ghi nội dung sạch để không bao giờ lộ mã HTML ngoài trang truyện.</div>';
    ta.style.display = "none";
    ta.parentNode.insertBefore(shell, ta.nextSibling);
    var ed = shell.querySelector(".synopsis-rich");

    function plainToHtml(text) {
      return String(text || "").split(/\n{2,}/).map(function (p) {
        return "<p>" + p.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>") + "</p>";
      }).join("");
    }

    function pasteToHtml(text) {
      return String(text || "")
        .replace(/\r\n?/g, "\n")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
    }

    function htmlToPlain(html) {
      var box = document.createElement("div");
      box.innerHTML = String(html || "");
      box.querySelectorAll("br").forEach(function (br) { br.replaceWith("\n"); });
      box.querySelectorAll("p,div,li,blockquote,h1,h2,h3,h4,h5,h6").forEach(function (el) {
        if (el.nextSibling) el.appendChild(document.createTextNode("\n\n"));
      });
      return String(box.textContent || "")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    var initial = ta.value || "";
    var hadHtml = /<\/?(?:p|div|span|br|b|strong|i|em|font)\b/i.test(initial);
    ed.innerHTML = hadHtml ? initial : plainToHtml(initial);

    /* Critical fix: never write rich HTML back into synopsis. */
    function sync() {
      ta.value = htmlToPlain(ed.innerHTML);
    }

    /* Clean legacy synopsis that already contains raw HTML as soon as admin opens it. */
    if (hadHtml) sync();

    function cmd(name, value) {
      ed.focus();
      try { document.execCommand(name, false, value || null); } catch (_) {}
      sync();
    }
    shell.querySelectorAll("[data-se-cmd]").forEach(function (b) {
      b.addEventListener("mousedown", function (e) { e.preventDefault(); cmd(b.dataset.seCmd); });
    });
    shell.querySelector("[data-se-font]").addEventListener("change", function () { cmd("fontName", this.value); });
    shell.querySelector("[data-se-size]").addEventListener("change", function () { cmd("fontSize", this.value); });
    shell.querySelector("[data-se-line]").addEventListener("change", function () {
      ed.style.lineHeight = this.value;
      ed.dataset.lineHeight = this.value;
      sync();
    });
    shell.querySelector("[data-se-gap]").addEventListener("change", function () {
      ed.style.setProperty("--synopsis-gap", this.value + "px");
      sync();
    });
    ed.addEventListener("paste", function (e) {
      e.preventDefault();
      var clip = e.clipboardData || window.clipboardData;
      var text = clip ? (clip.getData("text/plain") || clip.getData("text") || "") : "";
      try {
        document.execCommand("insertHTML", false, pasteToHtml(text));
      } catch (_) {
        document.execCommand("insertText", false, text);
      }
      sync();
    });
    ed.addEventListener("input", sync);
    form.addEventListener("submit", sync, true);
  }

  var css = document.createElement("style");
  css.textContent = '.synopsis-editor-shell{border:1px solid rgba(140,150,180,.24);border-radius:14px;overflow:hidden;background:#080d18}.synopsis-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px;border-bottom:1px solid rgba(140,150,180,.2);background:#0d1423}.synopsis-toolbar button,.synopsis-toolbar select{min-height:36px;border:1px solid rgba(150,140,230,.28);border-radius:9px;background:#10182a;color:#dfe5f3;padding:5px 9px;font:inherit}.synopsis-toolbar button{min-width:38px;cursor:pointer}.synopsis-toolbar button:hover{border-color:#9589e6;background:#171d35}.se-sep{width:1px;height:25px;background:rgba(150,160,190,.22);margin:0 2px}.synopsis-rich{min-height:240px;padding:18px 20px;outline:none;color:#e6e9f2;font-family:"Be Vietnam Pro",sans-serif;font-size:17px;line-height:1.6;overflow-wrap:anywhere}.synopsis-rich *{color:inherit!important;background-color:transparent!important}.synopsis-rich p,.synopsis-rich div{margin-top:0;margin-bottom:var(--synopsis-gap,8px)}.synopsis-editor-shell .editor-hint{padding:0 12px 10px}@media(max-width:640px){.synopsis-toolbar{gap:5px;padding:7px}.synopsis-toolbar button{min-width:36px}.synopsis-toolbar select{max-width:118px}.synopsis-rich{min-height:260px;padding:14px;font-size:16px}}';
  document.head.appendChild(css);

  var observer = new MutationObserver(enhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", function () { setTimeout(enhance, 0); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enhance); else enhance();
})();
