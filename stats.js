// ══════════════════════════════════════════════════════════════════════
// STATS PAGE
// Relies on script.js (getCharacters, loadFromGist, isConnected, setStatus, escHtml).
// ══════════════════════════════════════════════════════════════════════

(function () {
  const root = document.getElementById("stats-root");
  if (!root) return;

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ── helpers ──────────────────────────────────────────────────────────
  const clean = s => String(s || "").trim();
  const words = s => (clean(s).match(/\S+/g) || []).length;
  const fmt = n => n.toLocaleString();
  const titleCase = s => s.charAt(0).toUpperCase() + s.slice(1);

  // Tally strings case-insensitively; keeps the first spelling seen for display.
  function tally(values) {
    const map = new Map();
    values.forEach(v => {
      const label = clean(v);
      if (!label) return;
      const key = label.toLowerCase();
      if (!map.has(key)) map.set(key, { label, count: 0 });
      map.get(key).count++;
    });
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  function ageOf(c) {
    const m = clean(c.age).match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  const AGE_BUCKETS = [
    { label: "Under 13", test: a => a < 13 },
    { label: "13–17",    test: a => a >= 13 && a <= 17 },
    { label: "18–24",    test: a => a >= 18 && a <= 24 },
    { label: "25–34",    test: a => a >= 25 && a <= 34 },
    { label: "35–49",    test: a => a >= 35 && a <= 49 },
    { label: "50+",      test: a => a >= 50 },
  ];

  function monthOf(c) {
    const b = clean(c.birthday).toLowerCase();
    if (!b) return -1;
    return MONTHS.findIndex(m => new RegExp("\\b" + m.toLowerCase()).test(b));
  }

  function normPronouns(p) {
    return clean(p).toLowerCase().replace(/\s*[\/,]\s*/g, "/").replace(/\s+/g, " ");
  }

  function splitHeritage(h) {
    return clean(h).split(/[,\/&;]| and /i).map(clean).filter(Boolean);
  }

  // ── building blocks ──────────────────────────────────────────────────
  function barChart(rows, opts) {
    opts = opts || {};
    if (!rows.length) return `<p class="stat-empty">Nothing filled in yet.</p>`;
    const max = Math.max(...rows.map(r => r.count), 1);
    return rows.map(r => `
      <div class="bar-row" title="${escHtml(r.label)}: ${r.count}">
        <span class="bar-label">${escHtml(r.label)}</span>
        <span class="bar-track"><span class="bar-fill ${r.soft ? "soft" : ""}" style="width:${(r.count / max) * 100}%"></span></span>
        <span class="bar-val">${r.count}</span>
      </div>`).join("");
  }

  function topN(rows, n) {
    if (rows.length <= n) return { rows, more: 0 };
    return { rows: rows.slice(0, n), more: rows.length - n };
  }

  function card(title, note, body) {
    return `<section class="stat-card"><h2>${escHtml(title)}</h2>${note ? `<p class="stat-card-note">${escHtml(note)}</p>` : ""}${body}</section>`;
  }

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
    const chars = getCharacters().filter(c => !c.mini);

    if (!chars.length) {
      root.innerHTML = `<p class="empty-state">No characters yet — add some on the <a href="index.html">homepage</a> and the stats will appear here.</p>`;
      return;
    }

    // Totals
    const fandoms      = tally(chars.map(c => c.fandom || "Uncategorized"));
    const galleryTotal = chars.reduce((s, c) => s + (c.gallery || []).length, 0);
    const otherTotal   = chars.reduce((s, c) => s + (c.otherArt || []).length, 0);
    const storyTotal   = chars.reduce((s, c) => s + (c.stories || []).length, 0);
    const backstoryWords = c => words(c.background) + words(c.history);
    const wordTotal    = chars.reduce((s, c) => s + backstoryWords(c), 0);
    const ages         = chars.map(ageOf).filter(a => a !== null);
    const avgAge       = ages.length ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : null;

    const tiles = [
      [chars.length, "Characters"],
      [fandoms.length, "Fandoms / settings"],
      [galleryTotal, "Gallery images"],
      [otherTotal, "Art by others"],
      [storyTotal, "Stories"],
      [wordTotal, "Backstory words"],
      [avgAge ?? "—", "Average age"],
    ].map(([n, l]) => `<div class="stat-tile"><div class="stat-tile-num">${typeof n === "number" ? fmt(n) : n}</div><div class="stat-tile-label">${l}</div></div>`).join("");

    // Fandoms
    const f = topN(fandoms, 12);
    const fandomCard = card("Characters per fandom", "", barChart(f.rows) + (f.more ? `<p class="stat-card-note" style="margin-top:.6rem">+ ${f.more} more</p>` : ""));

    // Age ranges
    const ageRows = AGE_BUCKETS.map(b => ({ label: b.label, count: ages.filter(b.test).length }));
    const unknownAge = chars.length - ages.length;
    if (unknownAge) ageRows.push({ label: "Unknown / ageless", count: unknownAge, soft: true });
    const ageCard = card("Age ranges", "The first number in the Age field is used, so text like \"20s\" or \"~300 (looks 25)\" still counts.", barChart(ageRows));

    // Pronouns
    const pr = topN(tally(chars.map(c => normPronouns(c.pronouns))), 10);
    const pronounCard = card("Pronouns", "", barChart(pr.rows) + (pr.more ? `<p class="stat-card-note" style="margin-top:.6rem">+ ${pr.more} more</p>` : ""));

    // Heritage
    const he = topN(tally(chars.flatMap(c => splitHeritage(c.heritage)).map(titleCase)), 10);
    const heritageCard = card("Heritage", "Split on commas, slashes, “&” and “and”, so mixed heritage counts for each part.", barChart(he.rows) + (he.more ? `<p class="stat-card-note" style="margin-top:.6rem">+ ${he.more} more</p>` : ""));

    // Occupation
    const oc = topN(tally(chars.map(c => c.occupation)), 10);
    const occCard = card("Occupations", "", barChart(oc.rows) + (oc.more ? `<p class="stat-card-note" style="margin-top:.6rem">+ ${oc.more} more</p>` : ""));

    // Birthday months
    const monthCounts = new Array(12).fill(0);
    chars.forEach(c => { const m = monthOf(c); if (m >= 0) monthCounts[m]++; });
    const mMax = Math.max(...monthCounts, 1);
    const monthCard = card("Birthdays by month", "",
      monthCounts.some(n => n) ? `<div class="col-chart">${monthCounts.map((n, i) => `
        <div class="col-item">
          <span class="col-val">${n || ""}</span>
          <div class="col-bar ${n ? "" : "empty"}" style="height:${n ? (n / mMax) * 100 : 3}%"></div>
          <span class="col-label">${MONTHS[i]}</span>
        </div>`).join("")}</div>` : `<p class="stat-empty">Nothing filled in yet.</p>`);

    // Tagged-in-galleries count (how often each character is tagged in anyone's gallery)
    const tagCounts = new Map();
    chars.forEach(c => (c.gallery || []).forEach(g => (g.characterIds || []).forEach(id => tagCounts.set(id, (tagCounts.get(id) || 0) + 1))));

    // Leaderboards
    const boards = [
      card("Biggest galleries", "Most images in own gallery", leaderboard(chars, c => (c.gallery || []).length, "images")),
      card("Most art by others", "Most fanart / gifts / commissions", leaderboard(chars, c => (c.otherArt || []).length, "pieces")),
      card("Longest backstories", "Background + history, by word count", leaderboard(chars, backstoryWords, "words")),
      card("Most written about", "Total words across all stories", leaderboard(chars, c => (c.stories || []).reduce((s, st) => s + words(st.body), 0), "words")),
      card("Most social", "Most relationships listed", leaderboard(chars, c => (c.relationships || []).length, "relationships")),
      card("Most tagged", "Appears most in other characters' galleries", leaderboard(chars, c => tagCounts.get(c.id) || 0, "tags")),
    ];

    root.innerHTML = `
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
      await loadFromGist();   // pull the latest from the Gist, then redraw
      render();
    } else if (typeof setStatus === "function") {
      setStatus("off");
    }
  });
})();
