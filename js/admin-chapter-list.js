(function () {
  "use strict";

  function statusLabel(status) {
    if (status === "published") return "Đã đăng";
    if (status === "scheduled") return "Hẹn giờ";
    return "Nháp";
  }

  function enhanceChapterManager() {
    if (!location.hash.startsWith("#/admin/chuong")) return;

    const pick = document.getElementById("stPick");
    if (!pick) return;

    const toolbar = pick.closest(".chapter-toolbar");
    const oldList = toolbar && toolbar.nextElementSibling;
    if (!toolbar || !oldList || !oldList.classList.contains("chapter-list")) return;

    const hasIntro = Array.from(oldList.querySelectorAll(".num")).some(function (node) {
      return node.textContent.trim() === "0";
    });
    if (!hasIntro) {
      const introButton = document.createElement("a");
      introButton.className = "btn btn-intro";
      introButton.href = "#/admin/chuong/moi?story=" + encodeURIComponent(pick.value) + "&intro=1";
      introButton.textContent = "+ Chương mở đầu";
      toolbar.appendChild(introButton);
    }

    const section = document.createElement("section");
    section.className = "admin-chapters";
    section.setAttribute("aria-label", "Quản lý chương");

    const searchLabel = document.createElement("label");
    searchLabel.className = "chapter-search";
    searchLabel.innerHTML = '<span class="sr-only">Tìm chương</span><input id="chapterSearch" type="search" placeholder="Tìm số hoặc tên chương…" autocomplete="off">';
    toolbar.appendChild(searchLabel);

    const scroll = document.createElement("div");
    scroll.className = "admin-chapter-scroll";
    scroll.tabIndex = 0;
    scroll.setAttribute("aria-label", "Danh sách chương, có thể cuộn");

    const list = document.createElement("ul");
    list.className = "admin-chapter-list";

    Array.from(oldList.children).forEach(function (oldRow) {
      const number = oldRow.querySelector(".num");
      const link = oldRow.querySelector("a");
      const remove = oldRow.querySelector("button[data-delch]");
      if (!number || !link || !remove) return;

      const raw = (link.textContent || "").trim();
      const splitAt = raw.lastIndexOf(" · ");
      const title = splitAt >= 0 ? raw.slice(0, splitAt).trim() : raw;
      const status = splitAt >= 0 ? raw.slice(splitAt + 3).trim() : "draft";

      const row = document.createElement("li");
      const isIntro = number.textContent.trim() === "0";
      row.className = "admin-chapter-row" + (isIntro ? " is-intro" : "");
      row.dataset.chapterSearch = ((isIntro ? "mở đầu mo dau " : number.textContent + " ") + title).toLocaleLowerCase("vi");

      number.className = "admin-chapter-number";
      number.textContent = isIntro ? "◇" : number.textContent;
      link.className = "admin-chapter-title";
      link.textContent = isIntro ? "Mở đầu" + (title ? " — " + title : "") : (title || "Chương " + number.textContent.trim());

      const badge = document.createElement("span");
      badge.className = "admin-chapter-status status-" + status;
      badge.textContent = statusLabel(status);

      remove.className = "admin-chapter-delete";
      remove.setAttribute("aria-label", isIntro ? "Xóa chương mở đầu" : "Xóa chương " + number.textContent.trim());
      row.append(number, link, badge, remove);
      list.appendChild(row);
    });

    const empty = document.createElement("p");
    empty.className = "admin-chapter-empty";
    empty.hidden = true;
    empty.textContent = "Không tìm thấy chương phù hợp.";

    scroll.append(list, empty);
    oldList.remove();
    toolbar.before(section);
    section.append(toolbar, scroll);

    const search = searchLabel.querySelector("input");
    search.addEventListener("input", function () {
      const query = search.value.trim().toLocaleLowerCase("vi");
      let visible = 0;
      list.querySelectorAll(".admin-chapter-row").forEach(function (row) {
        const match = !query || row.dataset.chapterSearch.includes(query);
        row.hidden = !match;
        if (match) visible += 1;
      });
      empty.hidden = visible !== 0;
    });
  }

  const observer = new MutationObserver(enhanceChapterManager);
  const root = document.getElementById("app");
  if (root) observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("hashchange", function () { setTimeout(enhanceChapterManager, 0); });
  enhanceChapterManager();
})();
