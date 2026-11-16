// ══════════════════════════════════════════════════════════════════════
// STATS PAGE
// Relies on script.js (getCharacters, loadFromGist, isConnected, setStatus, escHtml).
// ══════════════════════════════════════════════════════════════════════

(function () {
  const root = document.getElementById("stats-root");
  if (!root) return;

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // ── helpers ──────────────────────────────────────────────────────────
  const clean = s => String(s || "").trim();
  const words = s => (clean(s).match(/\S+/g) || []).length;
  const fmt = n => n.toLocaleString();
  const titleCase = s => s.charAt(0).toUpperCase() + s.slice(1);

  // Group characters by one or more keys (case-insensitive). Each group keeps the
  // characters in it, so the hover list can show who is in each bar.
  function groupBy(chars, keysFn) {
    const map = new Map();
    chars.forEach(c => {
      const seen = new Set();
      [].concat(keysFn(c)).forEach(v => {
        const label = clean(v);
        if (!label) return;
        const key = label.toLowerCase();
        if (seen.has(key)) return;           // a character counts once per category
        seen.add(key);
        if (!map.has(key)) map.set(key, { label, count: 0, chars: [] });
        const e = map.get(key);
        e.count++;
        e.chars.push(c);
      });
    });
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  // Same as groupBy, but adds a "None" row (always first, so it never hides behind
  // "+ more") listing characters that have nothing filled in for this field.
  function groupWithNone(chars, keysFn) {
    const rows = groupBy(chars, keysFn);
    const none = chars.filter(c => ![].concat(keysFn(c)).some(v => clean(v)));
    if (none.length) rows.unshift({ label: "None", count: none.length, chars: none, soft: true });
    return rows;
  }

  function ageOf(c) {
    const m = clean(c.age).match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  const AGE_BUCKETS = [
    { label: "Under 10", test: a => a <= 10 },          // 10 is included here so nobody falls in a gap
    { label: "11–13",    test: a => a >= 11 && a <= 13 },
    { label: "14–18",    test: a => a >= 14 && a <= 18 },
    { label: "19–24",    test: a => a >= 19 && a <= 24 },
    { label: "25–30",    test: a => a >= 25 && a <= 30 },
    { label: "31–39",    test: a => a >= 31 && a <= 39 },
    { label: "40–49",    test: a => a >= 40 && a <= 49 },
    { label: "50+",      test: a => a >= 50 },
  ];

  // Birth month from: a month name ("March 14", "14 Mar"), DD/MM/YYYY (also . or -),
  // or YYYY-MM-DD. Returns 0–11, or -1 if it can't tell.
  function monthOf(c) {
    const b = clean(c.birthday).toLowerCase();
    if (!b) return -1;
    const named = MONTHS.findIndex(m => new RegExp("\\b" + m.toLowerCase()).test(b));
    if (named >= 0) return named;

    let m = b.match(/^(\d{4})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})/);       // YYYY-MM-DD
    if (m) { const mo = +m[2]; return mo >= 1 && mo <= 12 ? mo - 1 : -1; }

    m = b.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?:\s*[\/.\-]\s*\d{2,4})?/);      // DD/MM[/YYYY]
    if (m) {
      const day = +m[1], mo = +m[2];
      if (mo >= 1 && mo <= 12) return mo - 1;
      if (day >= 1 && day <= 12) return day - 1;   // looks like MM/DD instead
    }
    return -1;
  }

  const normPronouns = p => clean(p).toLowerCase().replace(/\s*[\/,]\s*/g, "/").replace(/\s+/g, " ");

  // "Italian-Irish", "Italian & Irish", "Italian/Irish", "Italian, Irish" → separate heritages
  const splitHeritage = h => clean(h).split(/[,\/&;\-–—]| and /i).map(clean).filter(Boolean).map(titleCase);

   // "F1 Driver (Ferrari)" → F1 Driver
// "Journalist, working at the New York Post" → Journalist
// "Writer / Illustrator" or "Chef & Baker" → two separate jobs
function splitOccupation(o) {
  let s = clean(o), prev;
  do {                                                   // strip (…), […], {…}, nested too
    prev = s;
    s = s.replace(/[\(\[\{][^\(\)\[\]\{\}]*[\)\]\}]/g, " ");
  } while (s !== prev);
  s = s.replace(/[\(\[\{].*$/, " ");                     // unclosed bracket: drop the rest
  s = s.split(",")[0];                                   // keep only what's before the first comma
  return s.split(/[\/&]/).map(clean).filter(Boolean).map(titleCase);
}

  // ── colour by share of the whole ─────────────────────────────────────
  // 0% = pale dusty blue, 50%+ = deep plum. Everything in between is a smooth blend.
  function shareColor(share) {
    const t = Math.min(1, Math.max(0, share) / 0.5);
    return `hsl(${205 + 130 * t}, ${30 + 15 * t}%, ${76 - 40 * t}%)`;
  }

  // ── hover tooltips ───────────────────────────────────────────────────
  let tips = [];
  const addTip = (title, chars) => { tips.push({ title, chars }); return tips.length - 1; };

  const tipEl = document.createElement("div");
  tipEl.id = "stat-tip";
  document.body.appendChild(tipEl);
  let tipCur = null;

  function hideTip() { tipEl.style.display = "none"; tipCur = null; }

  function placeTip(x, y) {
    const pad = 14, r = tipEl.getBoundingClientRect();
    let left = x + pad, top = y + pad;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
    if (top + r.height > window.innerHeight - 8) top = window.innerHeight - r.height - 8;
    tipEl.style.left = Math.max(8, left) + "px";
    tipEl.style.top = Math.max(8, top) + "px";
  }

  function showTip(el, x, y) {
    if (el !== tipCur) {
      const t = tips[+el.dataset.tip];
      if (!t) { hideTip(); return; }
      const names = t.chars.map(c => c.name || "Unnamed").sort((a, b) => a.localeCompare(b));
      const MAX = 40;
      tipEl.innerHTML =
        `<div class="tip-title">${escHtml(t.title)} <span>${names.length}</span></div>` +
        `<div class="tip-list ${names.length > 12 ? "cols" : ""}">` +
        names.slice(0, MAX).map(n => `<div>${escHtml(n)}</div>`).join("") +
        (names.length > MAX ? `<div class="tip-more">+ ${names.length - MAX} more</div>` : "") +
        `</div>`;
      tipEl.style.display = "block";
      tipCur = el;
    }
    placeTip(x, y);
  }

  root.addEventListener("mousemove", e => {
    const el = e.target.closest("[data-tip]");
    el ? showTip(el, e.clientX, e.clientY) : hideTip();
  });
  root.addEventListener("mouseleave", hideTip);

  // Touch screens have no hover: tap a bar to show the list, tap elsewhere to close it.
  root.addEventListener("click", e => {
    const more = e.target.closest(".more-btn");
    if (more) {
      const chart = more.previousElementSibling;
      const open = chart.classList.toggle("expanded");
      more.textContent = open ? "Show less" : `+ ${more.dataset.more} more`;
      return;
    }
    if (window.matchMedia("(hover: none)").matches) {
      const el = e.target.closest("[data-tip]");
      el ? showTip(el, e.clientX, e.clientY) : hideTip();
    }
  });
  window.addEventListener("scroll", hideTip, { passive: true });

  // ── building blocks ──────────────────────────────────────────────────
  function barChart(rows, limit) {
    if (!rows.length) return `<p class="stat-empty">Nothing filled in yet.</p>`;
    limit = limit || 10;
    const total = rows.reduce((s, r) => s + r.count, 0) || 1;
    const max = Math.max(...rows.map(r => r.count), 1);

    const html = rows.map((r, i) => {
  const share = r.count / total;
  const pct = r.count === 0 ? "0%" : share * 100 < 1 ? "<1%" : Math.round(share * 100) + "%";
  const color = r.soft ? "#b9b3aa" : shareColor(share);
  return `
      <div class="bar-row${i >= limit ? " bar-extra" : ""}" data-tip="${addTip(r.label, r.chars)}">
        <span class="bar-label">${escHtml(r.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(r.count / max) * 100}%;background:${color} !important"></span></span>
        <span class="bar-val">${r.count}<span class="bar-pct">${pct}</span></span>
      </div>`;
    }).join("");

    const hidden = rows.length - limit;
    const more = hidden > 0 ? `<button type="button" class="more-btn" data-more="${hidden}">+ ${hidden} more</button>` : "";
    return `<div class="bar-chart">${html}</div>${more}`;
  }

  const card = (title, note, body) =>
    `<section class="stat-card"><h2>${escHtml(title)}</h2>${note ? `<p class="stat-card-note">${escHtml(note)}</p>` : ""}${body}</section>`;

  function leaderboard(chars, valueFn, unit, n) {
    const rows = chars
      .map(c => ({ c, v: valueFn(c) }))
      .filter(r => r.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, n || 5);
    if (!rows.length) return `<p class="stat-empty">Nothing here yet.</p>`;
    return rows.map((r, i) => `
      <div class="lb-row">
        <span class="lb-rank">${i + 1}</span>
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          <a class="lb-name" href="character.html?id=${encodeURIComponent(r.c.id)}">${escHtml(r.c.name || "Unnamed")}</a>
          ${r.c.fandom ? `<span class="lb-fandom">${escHtml(r.c.fandom)}</span>` : ""}
        </span>
        <span class="lb-val">${fmt(r.v)} ${unit}</span>
      </div>`).join("");
  }

  // ── main render ──────────────────────────────────────────────────────
  function render() {
    tips = [];
    hideTip();
    const chars = getCharacters().filter(c => !c.mini);

    if (!chars.length) {
      root.innerHTML = `<p class="empty-state">No characters yet — add some on the <a href="index.html">homepage</a> and the stats will appear here.</p>`;
      return;
    }

    // Totals
    const fandoms        = groupBy(chars, c => c.fandom || "Uncategorized");
    const galleryTotal   = chars.reduce((s, c) => s + (c.gallery || []).length, 0);
    const otherTotal     = chars.reduce((s, c) => s + (c.otherArt || []).length, 0);
    const storyTotal     = chars.reduce((s, c) => s + (c.stories || []).length, 0);
    const backstoryWords = c => words(c.background) + words(c.history);
    const wordTotal      = chars.reduce((s, c) => s + backstoryWords(c), 0);
    const ages           = chars.map(ageOf).filter(a => a !== null);
    const avgAge         = ages.length ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : null;

    const tiles = [
      [chars.length, "Characters"],
      [fandoms.length, "Fandoms / settings"],
      [galleryTotal, "Gallery images"],
      [otherTotal, "Art by others"],
      [storyTotal, "Stories"],
      [wordTotal, "Backstory words"],
      [avgAge ?? "—", "Average age"],
    ].map(([n, l]) => `<div class="stat-tile"><div class="stat-tile-num">${typeof n === "number" ? fmt(n) : n}</div><div class="stat-tile-label">${l}</div></div>`).join("");

    const legend = `
      <div class="share-legend">
        <span>Bar colour = share of the chart</span>
        <span class="share-legend-bar" style="background:linear-gradient(to right,${shareColor(0)},${shareColor(0.25)},${shareColor(0.5)})"></span>
        <span>0% → 50%+</span>
        <span class="share-legend-hint">Hover (or tap) a bar to see who is in it</span>
      </div>`;

    // Fandoms
    const fandomCard = card("Characters per fandom", "", barChart(fandoms, 12));

    // Age ranges
    const ageRows = AGE_BUCKETS.map(b => ({ label: b.label, chars: chars.filter(c => { const a = ageOf(c); return a !== null && b.test(a); }) }))
      .map(r => ({ ...r, count: r.chars.length }));
    const unknownAge = chars.filter(c => ageOf(c) === null);
    if (unknownAge.length) ageRows.push({ label: "Unknown / ageless", count: unknownAge.length, chars: unknownAge, soft: true });
    const ageCard = card("Age ranges", "The first number in the Age field is used, so text like \"20s\" or \"~300 (looks 25)\" still counts.", barChart(ageRows, 10));

    // Pronouns / heritage / occupation
    const pronounCard  = card("Pronouns", "", barChart(groupWithNone(chars, c => normPronouns(c.pronouns)), 10));
    const heritageCard = card("Heritage", "Split on commas, slashes, hyphens, “&” and “and”, so mixed heritage counts for each part.", barChart(groupWithNone(chars, c => splitHeritage(c.heritage)), 10));
    const occCard = card("Occupations",
  "Brackets and anything after a comma are ignored; “/” and “&” count as separate jobs.",
  barChart(groupWithNone(chars, c => splitOccupation(c.occupation)), 10));

    // Birthday months
    const monthChars = Array.from({ length: 12 }, () => []);
    chars.forEach(c => { const m = monthOf(c); if (m >= 0) monthChars[m].push(c); });
    const mMax = Math.max(...monthChars.map(a => a.length), 1);
    const monthTotal = monthChars.reduce((s, a) => s + a.length, 0) || 1;
    const monthCard = card("Birthdays by month", "Month names or DD/MM/YYYY both work.",
      monthChars.some(a => a.length) ? `<div class="col-chart">${monthChars.map((list, i) => {
        const n = list.length;
        return `
        <div class="col-item" ${n ? `data-tip="${addTip(MONTHS_FULL[i], list)}"` : ""}>
          <span class="col-val">${n || ""}</span>
          <div class="col-bar ${n ? "" : "empty"}" style="height:${n ? (n / mMax) * 100 : 3}%;${n ? `background:${shareColor(n / monthTotal)}` : ""}"></div>
          <span class="col-label">${MONTHS[i]}</span>
        </div>`;
      }).join("")}</div>` : `<p class="stat-empty">Nothing filled in yet.</p>`);

    // Tagged-in-galleries count
    const tagCounts = new Map();
    chars.forEach(c => (c.gallery || []).forEach(g => (g.characterIds || []).forEach(id => tagCounts.set(id, (tagCounts.get(id) || 0) + 1))));

    const boards = [
      card("Biggest galleries", "Most images in own gallery", leaderboard(chars, c => (c.gallery || []).length, "images")),
      card("Most art by others", "Most fanart / gifts / commissions", leaderboard(chars, c => (c.otherArt || []).length, "pieces")),
      card("Longest backstories", "Background + history, by word count", leaderboard(chars, backstoryWords, "words")),
      card("Most written about", "Total words across all stories", leaderboard(chars, c => (c.stories || []).reduce((s, st) => s + words(st.body), 0), "words")),
      card("Most social", "Most relationships listed", leaderboard(chars, c => (c.relationships || []).length, "relationships")),
      card("Most tagged", "Appears most in other characters' galleries", leaderboard(chars, c => tagCounts.get(c.id) || 0, "tags")),
    ];

    root.innerHTML = `
      ${legend}
      <div class="stat-tiles">${tiles}</div>
      <div class="stat-grid">
        ${fandomCard}${ageCard}${pronounCard}${heritageCard}${occCard}${monthCard}
        ${boards.join("")}
      </div>`;
  }

  // ── init ─────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", async () => {
    render();
    if (typeof isConnected === "function" && isConnected()) {
      await loadFromGist();
      render();
    } else if (typeof setStatus === "function") {
      setStatus("off");
    }
  });
})();
