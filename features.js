// ══════════════════════════════════════════════════════════════════════
// FEATURES.JS — loaded after script.js on every page.
//   • dark mode toggle          • toast notifications (+ undo for deletes)
//   • image loading polish      • birthday banner (index)
//   • "/" search shortcut       • tab-in-URL + back-to-top (character page)
//   • print / save-as-PDF sheet (character page)
// Nothing here is required by script.js, so a problem in this file can never
// stop characters from loading or saving.
// ══════════════════════════════════════════════════════════════════════

(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const bootTime = Date.now();

  // ════════════════════════════════════════════════════════════════════
  // DARK MODE
  // The saved choice wins; otherwise the system setting. (Each page also has a tiny
  // inline script in <head> that sets data-theme before first paint, so there's no flash.)
  // ════════════════════════════════════════════════════════════════════
  const THEME_KEY = "oc_theme";
  const systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function savedTheme() { try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; } }
  function currentTheme() { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; }

  function setTheme(t, save) {
    document.documentElement.dataset.theme = t;
    if (save) { try { localStorage.setItem(THEME_KEY, t); } catch (_) {} }
    updateToggle();
  }

  function updateToggle() {
    const b = document.getElementById("theme-toggle");
    if (!b) return;
    const dark = currentTheme() === "dark";
    b.textContent = dark ? "☀" : "☾";
    b.title = dark ? "Switch to light mode" : "Switch to dark mode";
    b.setAttribute("aria-label", b.title);
  }

  function injectThemeToggle() {
    if (document.getElementById("theme-toggle")) return;
    const host = $(".nav-right") || $(".char-nav");
    if (!host) return;
    const b = document.createElement("button");
    b.id = "theme-toggle";
    b.type = "button";
    b.className = "nav-settings-btn theme-toggle";
    b.addEventListener("click", () => {
      const root = document.documentElement;
      root.classList.add("theme-anim");
      setTheme(currentTheme() === "dark" ? "light" : "dark", true);
      setTimeout(() => root.classList.remove("theme-anim"), 400);
    });
    const dot = host.querySelector("#sync-status");
    if (dot) host.insertBefore(b, dot); else host.appendChild(b);
    updateToggle();
  }

  if (!document.documentElement.dataset.theme) {
    setTheme(savedTheme() || (systemDark && systemDark.matches ? "dark" : "light"), false);
  }
  if (systemDark && systemDark.addEventListener) {
    systemDark.addEventListener("change", e => { if (!savedTheme()) setTheme(e.matches ? "dark" : "light", false); });
  }

  // ════════════════════════════════════════════════════════════════════
  // TOASTS
  // toast(message, { type: info|success|warn|error, duration, key, action:{label,onClick} })
  // ════════════════════════════════════════════════════════════════════
  const keyed = new Map();
  let container = null;

  function ensureContainer() {
    if (container && document.body.contains(container)) return container;
    container = document.createElement("div");
    container.id = "toast-container";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
    return container;
  }

  function toast(message, o) {
    o = o || {};
    message = String(message == null ? "" : message);
    const type = o.type || "info";
    if (o.key && keyed.has(o.key)) keyed.get(o.key).dismiss(true);

    const c = ensureContainer();
    const el = document.createElement("div");
    el.className = "toast toast--" + type;
    el.setAttribute("role", type === "error" ? "alert" : "status");

    const text = document.createElement("span");
    text.className = "toast-msg";
    text.textContent = message;
    el.appendChild(text);

    let timer = null, gone = false;
    const dismiss = instant => {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      if (o.key && keyed.get(o.key) === el) keyed.delete(o.key);
      el.classList.remove("show");
      if (instant) el.remove(); else setTimeout(() => el.remove(), 250);
    };
    el.dismiss = dismiss;

    if (o.action) {
      const a = document.createElement("button");
      a.type = "button";
      a.className = "toast-action";
      a.textContent = o.action.label;
      a.addEventListener("click", () => { dismiss(); try { o.action.onClick(); } catch (e) { console.error(e); } });
      el.appendChild(a);
    }
    const x = document.createElement("button");
    x.type = "button";
    x.className = "toast-close";
    x.setAttribute("aria-label", "Dismiss");
    x.textContent = "✕";
    x.addEventListener("click", () => dismiss());
    el.appendChild(x);

    c.appendChild(el);
    while (c.children.length > 4) c.firstElementChild.remove();
    if (o.key) keyed.set(o.key, el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));

    const dur = o.duration != null ? o.duration : Math.min(10000, 3200 + message.length * 45);
    if (dur > 0) {
      timer = setTimeout(dismiss, dur);
      el.addEventListener("mouseenter", () => clearTimeout(timer));
      el.addEventListener("mouseleave", () => { if (!gone) timer = setTimeout(dismiss, 1800); });
    }
    return el;
  }
  window.toast = toast;

  // Every alert() in the site becomes a non-blocking toast (confirm() stays a real dialog,
  // because those need an answer).
  let lastSaveFail = 0;
  window.alert = function (msg) {
    if (Date.now() - lastSaveFail < 3000 && keyed.has("save")) keyed.get("save").dismiss(true);
    toast(msg, { type: "warn" });
  };

  // "Saved ✓" / "couldn't save" feedback for every save.
  let internal = 0;            // >0 while a save is part of delete/undo (no "Saved" toast, no undo dismissal)
  let undoEl = null;

  function dismissUndo() { if (undoEl) { undoEl.dismiss(); undoEl = null; } }

  if (typeof window.saveCharacters === "function") {
    const origSave = window.saveCharacters;
    window.saveCharacters = async function () {
      if (!internal) dismissUndo();            // any other edit makes the undo stale
      const ok = await origSave.apply(this, arguments);
      if (ok === false) {
        lastSaveFail = Date.now();
        toast("Couldn't save — check your connection and the sync dot.", { type: "error", key: "save", duration: 7000 });
      } else if (!internal && Date.now() - bootTime > 1800) {
        const synced = typeof isConnected === "function" && isConnected();
        toast(synced ? "Saved & synced ✓" : "Saved on this device ✓", { type: "success", key: "save", duration: 1700 });
      }
      return ok;
    };
  }

  // ── Undo for deletes ────────────────────────────────────────────────
  const UNDO_KEY = "oc_undo_delete";
  const clone = x => JSON.parse(JSON.stringify(x));

  function showUndo(message, restore) {
    dismissUndo();
    undoEl = toast(message, {
      type: "info",
      duration: 9000,
      action: {
        label: "Undo",
        onClick: async () => {
          undoEl = null;
          try { await restore(); } catch (e) { console.error(e); toast("Couldn't undo that.", { type: "error" }); }
        },
      },
    });
  }

  async function restoreSnapshot(snapshot, label) {
    internal++;
    let ok;
    try { ok = await window.saveCharacters(snapshot); } finally { internal--; }
    const grid = document.getElementById("char-sections-container");
    if (grid && typeof renderIndexSections === "function") renderIndexSections(grid);
    toast(ok === false ? "Restored here, but syncing failed." : label + " restored ✓", { type: ok === false ? "warn" : "success" });
  }

  if (typeof window.deleteCharacter === "function") {
    const origDelete = window.deleteCharacter;
    window.deleteCharacter = async function (id) {
      const before = getCharacters();
      const gone = before.find(c => c.id === id);
      const snapshot = clone(before);
      // On the character page the site navigates to the index right after deleting,
      // so the snapshot is parked in sessionStorage and the index offers the undo.
      try { sessionStorage.setItem(UNDO_KEY, JSON.stringify({ t: Date.now(), name: gone ? gone.name || "Character" : "Character", snapshot })); } catch (_) {}
      internal++;
      try { await origDelete.apply(this, arguments); } finally { internal--; }
      const deleted = getCharacters().length < before.length;
      if (!deleted) { try { sessionStorage.removeItem(UNDO_KEY); } catch (_) {} return; }
      if (!document.getElementById("char-name")) {            // still on the index
        try { sessionStorage.removeItem(UNDO_KEY); } catch (_) {}
        showUndo(`"${gone ? gone.name || "Character" : "Character"}" deleted`, () => restoreSnapshot(snapshot, "Character"));
      }
    };
  }

  if (typeof window.deleteStory === "function") {
    const origDeleteStory = window.deleteStory;
    window.deleteStory = async function (charId, storyId) {
      const snapshot = clone(getCharacters());
      const owner = snapshot.find(c => c.id === charId);
      const story = owner && (owner.stories || []).find(s => s.id === storyId);
      const had = owner ? (owner.stories || []).length : 0;
      internal++;
      try { await origDeleteStory.apply(this, arguments); } finally { internal--; }
      const now = (getCharacters().find(c => c.id === charId) || {}).stories;
      if (story && now && now.length < had) {
        showUndo(`"${story.title || "Story"}" deleted`, async () => {
          await restoreSnapshot(snapshot, "Story");
          if (typeof renderStories === "function" && typeof pageCharId === "function" && pageCharId()) renderStories(pageCharId());
        });
      }
    };
  }

  function offerPendingUndo() {
    let p = null;
    try { p = JSON.parse(sessionStorage.getItem(UNDO_KEY) || "null"); sessionStorage.removeItem(UNDO_KEY); } catch (_) {}
    if (!p || !Array.isArray(p.snapshot) || Date.now() - p.t > 60000) return;
    if (getCharacters().length >= p.snapshot.length) return;
    showUndo(`"${p.name}" deleted`, () => restoreSnapshot(p.snapshot, "Character"));
  }

  // ════════════════════════════════════════════════════════════════════
  // IMAGE LOADING POLISH
  // lazy loading + shimmer while loading + graceful fallback for broken URLs
  // ════════════════════════════════════════════════════════════════════
  const AVATAR_CLASSES = [
    ["rel-avatar", "rel-avatar-placeholder"],
    ["tree-sb-avatar", "tree-sb-avatar-placeholder"],
    ["mini-avatar", "mini-avatar-placeholder"],
  ];

  function polishImg(img) {
    if (img.dataset.polished) return;
    if (img.closest("#print-sheet, .lightbox, svg")) return;
    img.dataset.polished = "1";
    if (!img.hasAttribute("loading")) img.loading = "lazy";
    img.decoding = "async";

    const holder = img.parentElement;
    if (!holder) return;
    const isLoaded = () => img.complete && img.naturalWidth > 0;
    const isBroken = () => img.complete && img.naturalWidth === 0 && !!img.getAttribute("src");

    const ok = () => {
      holder.classList.remove("img-loading", "img-broken-holder");
      img.classList.remove("img-broken");
    };
    const fail = () => {
      holder.classList.remove("img-loading");
      // small round avatars / index cards get a letter placeholder like the "no image" case
      const avatar = AVATAR_CLASSES.find(([cls]) => img.classList.contains(cls));
      const isCard = holder.classList.contains("char-card-img-wrap");
      if (avatar || isCard) {
        const ph = document.createElement("div");
        const letter = ((img.alt || "?").trim()[0] || "?").toUpperCase();
        if (avatar) { ph.className = img.className + " " + avatar[1]; ph.textContent = "?"; }
        else { ph.className = "char-card-placeholder"; ph.textContent = letter; }
        img.replaceWith(ph);
        return;
      }
      img.classList.add("img-broken");
      holder.classList.add("img-broken-holder");
    };

    img.addEventListener("load", ok);
    img.addEventListener("error", fail);

    if (isLoaded()) ok();
    else if (isBroken()) fail();
    else if (img.getAttribute("src")) holder.classList.add("img-loading");
  }

  function polishAll(root) {
    if (root.nodeType !== 1) return;
    if (root.tagName === "IMG") polishImg(root);
    root.querySelectorAll && root.querySelectorAll("img").forEach(polishImg);
  }

  function startImagePolish() {
    polishAll(document.body);
    new MutationObserver(muts => {
      muts.forEach(m => m.addedNodes.forEach(polishAll));
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ════════════════════════════════════════════════════════════════════
  // BIRTHDAYS
  // ════════════════════════════════════════════════════════════════════
  const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  // "March 14", "14 Mar", "14th of March 1998", "14.03.1998", "14/03", "1998-03-14"  ->  { month: 0-11, day: 1-31 | null }
  // Numeric dates are read as DD/MM (like the stats page); MM/DD is used when the second number can't be a month.
  function parseBirthday(raw) {
    const b = String(raw || "").trim().toLowerCase();
    if (!b) return null;

    const mi = MONTH_KEYS.findIndex(m => new RegExp("\\b" + m).test(b));
    if (mi >= 0) {
      const nums = [...b.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\b/g)].map(m => +m[1]).filter(n => n >= 1 && n <= 31);
      return { month: mi, day: nums.length ? nums[0] : null };
    }

    let m = b.match(/^(\d{4})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})/);
    if (m) {
      const mo = +m[2], d = +m[3];
      return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? { month: mo - 1, day: d } : null;
    }
    m = b.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})/);
    if (m) {
      let d = +m[1], mo = +m[2];
      if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
      return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? { month: mo - 1, day: d } : null;
    }
    return null;
  }
  window.parseBirthday = parseBirthday;

  const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  function occurrence(year, month, day) {
    if (month === 1 && day === 29 && !isLeap(year)) day = 28;
    return new Date(year, month, day);
  }
  const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const BDAY_DISMISS_KEY = "oc_bday_dismissed";
  const BDAY_WINDOW = 14;            // days ahead shown as "coming up"

  function renderBirthdayBanner(filter) {
    const grid = document.getElementById("char-sections-container");
    if (!grid || !grid.parentElement) return;
    let el = document.getElementById("birthday-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "birthday-banner";
      grid.parentElement.insertBefore(el, grid.parentElement.firstChild);
    }
    el.innerHTML = "";
    if (filter) return;                                    // hide while searching

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let dismissed = null;
    try { dismissed = localStorage.getItem(BDAY_DISMISS_KEY); } catch (_) {}
    if (dismissed === dayKey(today)) return;

    const todayList = [], soonList = [];
    getCharacters().filter(c => !c.mini).forEach(c => {
      const b = parseBirthday(c.birthday);
      if (!b || b.day == null) return;
      let occ = occurrence(today.getFullYear(), b.month, b.day);
      if (occ < today) occ = occurrence(today.getFullYear() + 1, b.month, b.day);
      const diff = Math.round((occ - today) / 86400000);
      if (diff === 0) todayList.push({ c, occ, diff });
      else if (diff <= BDAY_WINDOW) soonList.push({ c, occ, diff });
    });
    if (!todayList.length && !soonList.length) return;
    soonList.sort((a, b) => a.diff - b.diff || (a.c.name || "").localeCompare(b.c.name || ""));
    todayList.sort((a, b) => (a.c.name || "").localeCompare(b.c.name || ""));

    const link = c => `<a href="character.html?id=${encodeURIComponent(c.id)}">${escHtml(c.name || "Unnamed")}</a>`;
    const joinNames = arr => arr.length < 2 ? arr.join("") : arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
    const when = d => d === 1 ? "tomorrow" : `in ${d} days`;

    const lines = [];
    if (todayList.length) {
      lines.push(`<div class="bday-line">Happy birthday, ${joinNames(todayList.map(x => link(x.c)))}! 🎉</div>`);
    }
    if (soonList.length) {
      const shown = soonList.slice(0, 4).map(x =>
        `${link(x.c)} <span class="bday-when">(${escHtml(x.occ.toLocaleDateString(undefined, { month: "short", day: "numeric" }))}, ${when(x.diff)})</span>`);
      const more = soonList.length > 4 ? ` <span class="bday-when">+ ${soonList.length - 4} more</span>` : "";
      lines.push(`<div class="bday-line">${todayList.length ? "Also coming up" : "Coming up"}: ${shown.join(" · ")}${more}</div>`);
    }

    el.innerHTML = `
      <div class="bday-banner${todayList.length ? " bday-banner--today" : ""}" role="status">
        <span class="bday-emoji">${todayList.length ? "🎂" : "🎈"}</span>
        <div class="bday-text">${lines.join("")}</div>
        <button type="button" class="bday-close" aria-label="Hide until tomorrow" title="Hide until tomorrow">✕</button>
      </div>`;
    el.querySelector(".bday-close").addEventListener("click", () => {
      try { localStorage.setItem(BDAY_DISMISS_KEY, dayKey(today)); } catch (_) {}
      el.innerHTML = "";
    });
  }

  // keep the banner in sync every time the index re-renders (initial load, GitHub sync, search…)
  if (typeof window.renderIndexSections === "function") {
    const origRender = window.renderIndexSections;
    window.renderIndexSections = function (container, filter) {
      const out = origRender.apply(this, arguments);
      try { renderBirthdayBanner(filter); } catch (e) { console.error(e); }
      return out;
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // SEARCH SHORTCUT  ( "/" focuses the search box, Esc clears it )
  // ════════════════════════════════════════════════════════════════════
  function initSearchShortcut() {
    const input = document.getElementById("search-input");
    if (!input) return;
    input.title = "Search names, nicknames, fandoms, occupations…  (press / to focus)";
    document.addEventListener("keydown", e => {
      const t = e.target;
      const typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (document.querySelector(".editor-overlay.open")) return;
        e.preventDefault();
        input.focus();
        input.select();
      } else if (e.key === "Escape" && t === input) {
        if (input.value) { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); }
        else input.blur();
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // CHARACTER PAGE: remember the Overview tab in the URL, back-to-top
  // ════════════════════════════════════════════════════════════════════
  const OV_TABS = ["overview", "details", "relationships", "tree", "stories"];

  function initTabHash() {
    if (!document.getElementById("tab-overview")) return;
    const clickTab = name => { const b = document.getElementById("tab-" + name); if (b) b.click(); };
    OV_TABS.forEach(name => {
      document.getElementById("tab-" + name)?.addEventListener("click", () => {
        try { history.replaceState(null, "", name === "overview" ? location.pathname + location.search : "#" + name); } catch (_) {}
      });
    });
    const fromHash = () => { const h = location.hash.slice(1); if (OV_TABS.includes(h)) clickTab(h); };
    fromHash();
    window.addEventListener("hashchange", fromHash);
  }

  function initBackToTop() {
    if (document.querySelector(".web-wrap")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "to-top";
    b.textContent = "↑";
    b.title = "Back to top";
    b.setAttribute("aria-label", "Back to top");
    b.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    document.body.appendChild(b);
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { b.classList.toggle("show", window.scrollY > 600); ticking = false; });
    }, { passive: true });
  }

  // ════════════════════════════════════════════════════════════════════
  // PRINT / SAVE AS PDF
  // Builds a clean, light-themed sheet (always light, even in dark mode) that is the
  // only thing the print stylesheet shows.
  // ════════════════════════════════════════════════════════════════════
  const PRINT_KEY = "oc_print_opts";
  const PRINT_DEFAULTS = { refs: true, basics: true, appearance: true, details: true, story: true, relationships: true, links: true };
  const PRINT_LABELS = [
    ["refs", "Reference sheets"],
    ["basics", "Basic info (age, pronouns, …)"],
    ["appearance", "Appearance"],
    ["details", "Details"],
    ["story", "Overview & background"],
    ["relationships", "Relationships"],
    ["links", "Links"],
  ];

  function loadPrintOpts() {
    try { return { ...PRINT_DEFAULTS, ...JSON.parse(localStorage.getItem(PRINT_KEY) || "{}") }; }
    catch (_) { return { ...PRINT_DEFAULTS }; }
  }

  function buildPrintSheet(c, o) {
    const e = escHtml;
    const all = getCharacters();
    const parts = [];

    const basics = [["Pronouns", c.pronouns], ["Age", c.age], ["Birthday", c.birthday], ["Heritage", c.heritage], ["Occupation", c.occupation]].filter(r => r[1]);
    parts.push(`<h1>${e(c.name || "Unnamed")}</h1>${c.fandom ? `<div class="ps-fandom">${e(c.fandom)}</div>` : ""}`);
    if (o.basics && basics.length) {
      parts.push(`<table>${basics.map(r => `<tr><td>${r[0]}</td><td>${e(r[1])}</td></tr>`).join("")}</table>`);
    }

    if (o.refs) {
      const sheets = typeof getRefSheets === "function" ? getRefSheets(c) : (c.refImage ? [{ src: c.refImage, label: "" }] : []);
      if (sheets.length) {
        parts.push(`<div class="ps-refs">${sheets.map(s =>
          `<figure><img src="${e(s.src)}" alt="" loading="eager" />${s.label ? `<figcaption>${e(s.label)}</figcaption>` : ""}</figure>`).join("")}</div>`);
      }
    }

    if (o.appearance && (c.appearance || "").trim()) {
      parts.push(`<h2>Appearance</h2><div class="ps-text">${e(c.appearance.trim())}</div>`);
    }

    if (o.details) {
      let details = (c.details || []).filter(d => (d.value || "").trim());
      const hasNick = (c.details || []).some(d => d.key === "nickname" || (d.label || "").toLowerCase() === "nickname");
      if ((c.nicknames || "").trim() && !hasNick) details = [{ label: "Nickname", value: c.nicknames }, ...details];
      if (details.length) {
        parts.push(`<h2>Details</h2><dl>${details.map(d =>
          `<div class="${(d.value || "").length > 70 || /\n/.test(d.value) ? "wide" : ""}"><dt>${e(d.label || d.key || "")}</dt><dd>${e(d.value)}</dd></div>`).join("")}</dl>`);
      }
    }

    if (o.story) {
      const overview = (c.overview || "").trim();
      let bg = c.background || "";
      if (c.history && !bg.includes(c.history)) bg = [bg, c.history].filter(Boolean).join("\n\n");
      bg = bg.trim();
      if (overview) parts.push(`<h2>Overview</h2><div class="ps-text">${e(overview)}</div>`);
      if (bg) parts.push(`<h2>Background &amp; History</h2><div class="ps-text">${e(bg)}</div>`);
    }

    if (o.relationships && (c.relationships || []).length) {
      const items = c.relationships.map(r => {
        const m = r.charId ? all.find(x => x.id === r.charId) : null;
        const name = m ? m.name || "Unnamed" : r.name || "Unknown";
        const tag = r.canon === "canon" ? "canon" : r.canon === "noncanon" ? "OC" : "";
        const sub = [r.type, tag].filter(Boolean).join(" · ");
        return `<li><b>${e(name)}</b>${sub ? ` <span class="ps-sub">— ${e(sub)}</span>` : ""}${r.description ? `<div class="ps-desc">${e(r.description)}</div>` : ""}</li>`;
      });
      parts.push(`<h2>Relationships</h2><ul>${items.join("")}</ul>`);
    }

    if (o.links) {
      const l = c.links || {};
      const rows = [["Unvale", l.unvale], ["CharacterHub", l.characterhub], ["Artfight", l.artfight], ["Art Attack", l.artattack], ["Toyhou.se", l.toyhouse], ["Playlist", l.spotify]]
        .concat((c.customLinks || []).map(x => [x.title || "Link", x.url])).filter(r => r[1]);
      if (rows.length) parts.push(`<h2>Links</h2><ul>${rows.map(r => `<li><b>${e(r[0])}</b> — ${e(r[1])}</li>`).join("")}</ul>`);
    }

    parts.push(`<div class="ps-foot">Printed ${e(new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }))}</div>`);
    return parts.join("");
  }

  function waitForImages(root, maxMs) {
    const imgs = [...root.querySelectorAll("img")];
    return Promise.race([
      Promise.all(imgs.map(img => img.complete ? null : new Promise(res => { img.onload = img.onerror = res; }))),
      new Promise(res => setTimeout(res, maxMs)),
    ]);
  }

  async function printCharacter(c, opts) {
    document.getElementById("print-sheet")?.remove();
    const sheet = document.createElement("div");
    sheet.id = "print-sheet";
    sheet.innerHTML = buildPrintSheet(c, opts);
    document.body.appendChild(sheet);
    await waitForImages(sheet, 6000);
    window.addEventListener("afterprint", () => sheet.remove(), { once: true });
    window.print();
  }

  function openPrintDialog() {
    const id = typeof pageCharId === "function" ? pageCharId() : null;
    const c = id ? getCharacters().find(x => x.id === id) : null;
    if (!c) { toast("Couldn't find this character.", { type: "error" }); return; }

    let ov = document.getElementById("print-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "print-overlay";
      ov.className = "editor-overlay";
      ov.innerHTML = `
        <div class="editor-modal print-modal">
          <div class="editor-modal-header">
            <h2 class="editor-modal-title">Print / save as PDF</h2>
            <button type="button" class="editor-close" id="print-close" aria-label="Close">✕</button>
          </div>
          <div class="print-body">
            <p class="print-hint">Choose what goes on the sheet. In the print window, pick <strong>Save as PDF</strong> as the destination to get a file you can send to an artist.</p>
            <div class="print-opts" id="print-opts"></div>
            <div class="print-actions">
              <button type="button" class="editor-btn-cancel" id="print-cancel">Cancel</button>
              <button type="button" class="editor-btn-save" id="print-go">Print / Save PDF</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(ov);
      const close = () => { ov.classList.remove("open"); document.body.style.overflow = ""; };
      ov.addEventListener("click", e => { if (e.target === ov) close(); });
      ov.querySelector("#print-close").addEventListener("click", close);
      ov.querySelector("#print-cancel").addEventListener("click", close);
      document.addEventListener("keydown", e => { if (e.key === "Escape" && ov.classList.contains("open")) close(); });
      ov.querySelector("#print-go").addEventListener("click", () => {
        const opts = {};
        ov.querySelectorAll("#print-opts input").forEach(i => { opts[i.dataset.k] = i.checked; });
        try { localStorage.setItem(PRINT_KEY, JSON.stringify(opts)); } catch (_) {}
        close();
        const id2 = pageCharId();
        const ch = getCharacters().find(x => x.id === id2);
        if (ch) printCharacter(ch, opts);
      });
    }
    const saved = loadPrintOpts();
    ov.querySelector("#print-opts").innerHTML = PRINT_LABELS.map(([k, label]) =>
      `<label><input type="checkbox" data-k="${k}" ${saved[k] ? "checked" : ""} /> ${label}</label>`).join("");
    ov.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function initPrintButton() {
    document.getElementById("char-print-btn")?.addEventListener("click", openPrintDialog);
  }

  // ════════════════════════════════════════════════════════════════════
  // WORD COUNTERS
  // Live count under the overview / background / story text boxes, and a permanent
  // count at the bottom of the story reader. Refreshed whenever an editor or the
  // reader is opened (their text is filled in by script.js just before that).
  // ════════════════════════════════════════════════════════════════════
  const countWords = t => { const m = String(t || "").trim().match(/\S+/g); return m ? m.length : 0; };
  const wordLabel = n => `${n.toLocaleString()} ${n === 1 ? "word" : "words"}`;
  const counterUpdaters = [];

  function attachCounter(source, readValue, placeAfter, cls) {
    if (!source || !placeAfter || source.dataset.wcAttached) return;
    source.dataset.wcAttached = "1";
    const el = document.createElement("div");
    el.className = cls;
    placeAfter.insertAdjacentElement("afterend", el);
    const update = () => { el.textContent = wordLabel(countWords(readValue())); };
    update();
    counterUpdaters.push(update);
    return update;
  }

  function initWordCounters() {
    ["oef-overview", "oef-background", "ef-overview", "ef-background", "sef-body"].forEach(id => {
      const ta = document.getElementById(id);
      if (!ta) return;
      const update = attachCounter(ta, () => ta.value, ta, "word-count");
      if (update) ta.addEventListener("input", update);
    });
    const body = document.getElementById("story-reader-body");
    attachCounter(body, () => body.textContent, body, "word-count word-count--reader");

    const refresh = () => { counterUpdaters.forEach(fn => fn()); setTimeout(() => counterUpdaters.forEach(fn => fn()), 0); };
    const watch = new MutationObserver(refresh);
    ["overview-editor-overlay", "editor-overlay", "story-editor-overlay", "story-reader-overlay"].forEach(id => {
      const ov = document.getElementById(id);
      if (ov) watch.observe(ov, { attributes: true, attributeFilter: ["class"] });
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════════════
  document.addEventListener("DOMContentLoaded", () => {
    const steps = [injectThemeToggle, startImagePolish, initSearchShortcut, initTabHash, initBackToTop, initPrintButton, initWordCounters, offerPendingUndo];
    steps.forEach(fn => { try { fn(); } catch (e) { console.error("features.js:", fn.name, e); } });
    try { renderBirthdayBanner(""); } catch (e) { console.error(e); }
  });
})();
