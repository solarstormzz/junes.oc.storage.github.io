// ══════════════════════════════════════════════════════════════════════
// RELATIONSHIP WEB
// A force-directed graph of every relationship on the site.
// Relies on script.js (getCharacters, loadFromGist, isConnected, setStatus, escHtml,
// searchMatch, wrapTreeLabel, openMiniProfile).
// ══════════════════════════════════════════════════════════════════════

(function () {
  const root = document.getElementById("web-root");
  if (!root) return;

  const NS = "http://www.w3.org/2000/svg";

  // Relationship types are free text, so the colour is guessed from keywords.
  const CATS = [
    { key: "family",  label: "Family",            color: "#6fa07c", re: /\b(famil|parent|mother|father|mom\b|dad\b|mum\b|sibling|brother|sister|child|son\b|daughter|cousin|aunt|uncle|niece|nephew|grand|twin|guardian|adopt|step)/ },
    { key: "romance", label: "Romantic",          color: "#cf7b9d", re: /\b(love|lover|spouse|husband|wife|boyfriend|girlfriend|fianc|crush|romanc|dating|married|marri|ex\b|soulmate|couple|flirt|sweetheart|significant|(life|romantic) partner)/ },
    { key: "rival",   label: "Rivals & enemies",  color: "#d08a55", re: /\b(rival|enem|nemes|foe|antagon|hate|villain|opponent|archenem|betray)/ },
    { key: "friend",  label: "Friends & allies",  color: "#6c97cf", re: /\b(friend|bestie|buddy|pal\b|ally|allies|companion|colleague|teammate|mentor|student|crew|bff|sidekick|roommate|neighbo|co-?worker|boss|employ|partner)/ },
    { key: "other",   label: "Other",             color: "#9a948b", re: null },
  ];
  function catOf(text) {
    const t = String(text || "").toLowerCase();
    return CATS.find(c => c.re && c.re.test(t)) || CATS[CATS.length - 1];
  }

  const fandomColor = f => {
    let h = 0;
    for (let i = 0; i < f.length; i++) h = (h * 31 + f.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360}, 42%, 56%)`;
  };
  const fandomOf = c => (c.fandom || "").trim() || "Uncategorized";
  const svgEl = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k]));
    return e;
  };

  // ── state ────────────────────────────────────────────────────────────
  const state = {
    fandom: "", hideIsolated: true, showMinis: true,
    cats: new Set(CATS.map(c => c.key)),
    q: "", selected: null, hover: null,
    catCounts: {}, isolated: 0, totalPairs: 0, totalChars: 0,
  };
  let nodes = [], edges = [];
  const byId = new Map();
  const posCache = new Map();
  let view = null, bounds = null, touched = false, fitW = 1000;
  let svg, panel, emptyEl, gEdges, gNodes;
  let raf = null, temp = 0;

  // ── shell (built once) ───────────────────────────────────────────────
  root.innerHTML = `
    <div class="web-controls">
      <label>Fandom <select id="web-fandom"><option value="">All fandoms</option></select></label>
      <input type="search" id="web-search" placeholder="Find a character…" autocomplete="off" />
      <label class="web-check"><input type="checkbox" id="web-hide-iso" checked /> Hide characters without relationships</label>
      <label class="web-check"><input type="checkbox" id="web-minis" checked /> Mini profiles</label>
      <button type="button" class="web-btn" id="web-relayout" title="Throw the layout away and arrange everyone again">Re-arrange</button>
      <span class="web-hint">Drag nodes · scroll or pinch to zoom · click for details · double-click to open</span>
    </div>
    <div class="web-body">
      <div class="web-canvas-wrap">
        <svg id="web-svg" class="web-svg" xmlns="http://www.w3.org/2000/svg"></svg>
        <div class="web-zoom">
          <button type="button" data-z="in"  title="Zoom in"  aria-label="Zoom in">+</button>
          <button type="button" data-z="out" title="Zoom out" aria-label="Zoom out">−</button>
          <button type="button" data-z="fit" title="Fit to view" aria-label="Fit to view">⤢</button>
        </div>
        <div class="web-empty" id="web-empty"></div>
      </div>
      <aside class="web-panel" id="web-panel"></aside>
    </div>`;
  svg = document.getElementById("web-svg");
  panel = document.getElementById("web-panel");
  emptyEl = document.getElementById("web-empty");

  // ── graph data ───────────────────────────────────────────────────────
  function buildGraph() {
    const chars = getCharacters();
    state.totalChars = chars.filter(c => !c.mini).length;
    const cand = chars.filter(c => state.showMinis || !c.mini);
    const candById = new Map(cand.map(c => [c.id, c]));

    // one edge per pair of characters, no matter which side(s) listed the relationship
    const pairs = new Map();
    cand.forEach(c => (c.relationships || []).forEach(r => {
      if (!r.charId || r.charId === c.id || !candById.has(r.charId)) return;
      const [a, b] = [c.id, r.charId].sort();
      const key = a + "|" + b;
      if (!pairs.has(key)) pairs.set(key, { a, b, items: [] });
      pairs.get(key).items.push({ from: c.id, type: (r.type || "").trim(), canon: r.canon });
    }));
    pairs.forEach(p => { p.cat = catOf(p.items.map(i => i.type).join(" ")); });

    state.catCounts = {};
    CATS.forEach(c => { state.catCounts[c.key] = 0; });
    pairs.forEach(p => { state.catCounts[p.cat.key]++; });
    state.totalPairs = pairs.size;

    const linked = new Set();
    pairs.forEach(p => { linked.add(p.a); linked.add(p.b); });
    state.isolated = cand.filter(c => !c.mini && !linked.has(c.id)).length;

    let list = [...pairs.values()].filter(p => state.cats.has(p.cat.key));
    let ids;
    if (state.fandom) {
      const inFandom = new Set(cand.filter(c => fandomOf(c) === state.fandom).map(c => c.id));
      list = list.filter(p => inFandom.has(p.a) || inFandom.has(p.b));       // keep their links to other fandoms too
      ids = new Set(inFandom);
      list.forEach(p => { ids.add(p.a); ids.add(p.b); });
    } else {
      ids = new Set(cand.map(c => c.id));
    }
    if (state.hideIsolated) {
      const used = new Set();
      list.forEach(p => { used.add(p.a); used.add(p.b); });
      ids = new Set([...ids].filter(id => used.has(id)));
    }

    // nodes (reuse cached positions so filtering doesn't scramble the layout)
    const fandoms = [...new Set(cand.map(fandomOf))].sort();
    const seen = new Map();
    byId.clear();
    nodes = cand.filter(c => ids.has(c.id)).map(c => {
      const f = fandomOf(c);
      const k = seen.get(f) || 0;
      seen.set(f, k + 1);
      const cached = posCache.get(c.id);
      const ang = (fandoms.indexOf(f) / Math.max(1, fandoms.length)) * Math.PI * 2 + k * 0.5;
      const rad = 200 + (k % 4) * 50 + (cand.length > 40 ? 120 : 0);
      const n = {
        id: c.id, c, name: c.name || "Unnamed", mini: !!c.mini, fandom: f,
        img: c.titleImage || c.refImage || "", color: fandomColor(f),
        x: cached ? cached.x : Math.cos(ang) * rad, y: cached ? cached.y : Math.sin(ang) * rad,
        vx: 0, vy: 0, fx: 0, fy: 0, pinned: false, deg: 0, r: 20, fresh: !cached,
      };
      byId.set(n.id, n);
      return n;
    });

    edges = list.map(p => {
      const a = byId.get(p.a), b = byId.get(p.b);
      if (!a || !b) return null;
      a.deg++; b.deg++;
      const types = [...new Set(p.items.map(i => i.type).filter(Boolean))];
      return { a, b, cat: p.cat, items: p.items, label: types.join(" / ").slice(0, 44) };
    }).filter(Boolean);

    nodes.forEach(n => { n.r = (n.mini ? 14 : 20) + Math.min(n.deg, 10) * 1.8; });
    if (state.selected && !byId.has(state.selected)) state.selected = null;
    if (state.hover && !byId.has(state.hover)) state.hover = null;
  }

  // ── physics ──────────────────────────────────────────────────────────
  const REPEL = 14000, LINK = 120, SPRING = 0.035, GRAVITY = 0.012;

  function step(maxMove) {
    const N = nodes, n = N.length;
    for (let i = 0; i < n; i++) { N[i].fx = 0; N[i].fy = 0; }
    for (let i = 0; i < n; i++) {
      const a = N[i];
      for (let j = i + 1; j < n; j++) {
        const b = N[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = ((i * 7919 + j) % 13 - 6) / 6 + 0.3; dy = ((j * 104729 + i) % 11 - 5) / 5 + 0.3; d2 = dx * dx + dy * dy; }
        const d = Math.sqrt(d2);
        let f = REPEL / d2;
        const min = a.r + b.r + 36;                       // never let circles (and labels) touch
        if (d < min) f += (min - d) * 0.6;
        const fx = dx / d * f, fy = dy / d * f;
        a.fx += fx; a.fy += fy; b.fx -= fx; b.fy -= fy;
      }
    }
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - (LINK + e.a.r + e.b.r)) * SPRING;
      const fx = dx / d * f, fy = dy / d * f;
      e.a.fx += fx; e.a.fy += fy; e.b.fx -= fx; e.b.fy -= fy;
    }
    for (let i = 0; i < n; i++) {
      const a = N[i];
      a.fx -= a.x * GRAVITY; a.fy -= a.y * GRAVITY;
      if (a.pinned) { a.vx = a.vy = 0; continue; }
      a.vx = (a.vx + a.fx) * 0.6; a.vy = (a.vy + a.fy) * 0.6;
      const sp = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
      if (sp > maxMove) { a.vx *= maxMove / sp; a.vy *= maxMove / sp; }
      a.x += a.vx; a.y += a.vy;
    }
  }

  function prerun() {
    const iter = nodes.length > 250 ? 150 : nodes.length ? (nodes.every(n => !n.fresh) ? 90 : 320) : 0;
    for (let t = 0; t < iter; t++) step(60 * (1 - t / iter) + 1.5);
  }

  function savePositions() { nodes.forEach(n => posCache.set(n.id, { x: n.x, y: n.y })); }

  function reheat(t) {
    temp = Math.max(temp, t);
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function loop() {
    raf = null;
    if (temp < 1.2) { savePositions(); return; }
    step(temp);
    temp *= 0.965;
    place();
    raf = requestAnimationFrame(loop);
  }

  // ── drawing ──────────────────────────────────────────────────────────
  function draw() {
    svg.innerHTML = "";
    gEdges = svgEl("g");
    gNodes = svgEl("g");
    svg.append(gEdges, gNodes);

    edges.forEach(e => {
      const g = svgEl("g", { class: "web-edge" });
      const line = svgEl("line", { class: "web-edge-line", stroke: e.cat.color });
      const hit = svgEl("line", { class: "web-edge-hit" });
      const tip = svgEl("title");
      tip.textContent = `${e.a.name} ↔ ${e.b.name}` + e.items.map(i => {
        const from = i.from === e.a.id ? e.a.name : e.b.name;
        return i.type ? `\n${from}: ${i.type}` : "";
      }).join("");
      hit.appendChild(tip);
      const text = svgEl("text", { class: "web-elabel" });
      text.textContent = e.label;
      g.append(line, hit, text);
      gEdges.appendChild(g);
      e.g = g; e.line = line; e.hit = hit; e.text = text;
    });

    nodes.forEach((n, i) => {
      const g = svgEl("g", { class: "web-node" + (n.mini ? " mini" : ""), "data-id": n.id });
      const tip = svgEl("title");
      tip.textContent = n.name + (n.fandom ? " — " + n.fandom : "") + (n.mini ? " (mini profile)" : "");
      const ring = svgEl("circle", { class: "web-ring", r: n.r, stroke: n.color });
      const init = svgEl("text", { class: "web-initial", "font-size": Math.round(n.r * 0.95) });
      init.textContent = (n.name[0] || "?").toUpperCase();
      g.append(tip, ring, init);
      if (n.img) {
        const cid = "wc" + i;
        const cp = svgEl("clipPath", { id: cid });
        cp.appendChild(svgEl("circle", { r: n.r - 1.5 }));
        g.append(cp, svgEl("image", {
          href: n.img, x: -n.r, y: -n.r, width: n.r * 2, height: n.r * 2,
          preserveAspectRatio: "xMidYMid slice", "clip-path": `url(#${cid})`,
        }));
      }
      const label = svgEl("text", { class: "web-label", y: n.r + 14 });
      wrapTreeLabel(n.name, 16).forEach((line, li) => {
        const ts = svgEl("tspan", { x: 0, dy: li ? 12 : 0 });
        ts.textContent = line;
        label.appendChild(ts);
      });
      g.appendChild(label);
      gNodes.appendChild(g);
      n.g = g;
    });
  }

  function place() {
    nodes.forEach(n => n.g && n.g.setAttribute("transform", `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`));
    edges.forEach(e => {
      const x1 = e.a.x.toFixed(1), y1 = e.a.y.toFixed(1), x2 = e.b.x.toFixed(1), y2 = e.b.y.toFixed(1);
      [e.line, e.hit].forEach(l => { l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2); });
      e.text.setAttribute("x", ((e.a.x + e.b.x) / 2).toFixed(1));
      e.text.setAttribute("y", ((e.a.y + e.b.y) / 2 - 5).toFixed(1));
    });
  }

  function applyHighlight() {
    const focus = state.hover || state.selected;
    let near = null;
    if (focus) {
      near = new Set([focus]);
      edges.forEach(e => { if (e.a.id === focus) near.add(e.b.id); else if (e.b.id === focus) near.add(e.a.id); });
    }
    let hits = null;
    if (state.q) hits = new Set(nodes.filter(n => searchMatch(n.c, state.q)).map(n => n.id));

    nodes.forEach(n => {
      const dim = (near && !near.has(n.id)) || (hits && !hits.has(n.id));
      n.g.classList.toggle("dim", !!dim);
      n.g.classList.toggle("sel", n.id === state.selected);
      n.g.classList.toggle("hot", n.id === focus);
    });
    edges.forEach(e => {
      const incident = !!focus && (e.a.id === focus || e.b.id === focus);
      const faded = (!!focus && !incident) || (hits && !(hits.has(e.a.id) && hits.has(e.b.id)));
      e.g.classList.toggle("active", incident);
      e.g.classList.toggle("dim", !!faded);
    });
  }

  // ── pan / zoom ───────────────────────────────────────────────────────
  function rect() {
    const r = svg.getBoundingClientRect();
    return { w: r.width > 0 ? r.width : 800, h: r.height > 0 ? r.height : 560 };
  }
  function applyView() {
    if (view) svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  }
  function fit() {
    if (!nodes.length) { view = { x: -400, y: -280, w: 800, h: 560 }; fitW = 800; applyView(); return; }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      minX = Math.min(minX, n.x - n.r); maxX = Math.max(maxX, n.x + n.r);
      minY = Math.min(minY, n.y - n.r); maxY = Math.max(maxY, n.y + n.r + 42);
    });
    const b = { x: minX - 50, y: minY - 40, w: maxX - minX + 100, h: maxY - minY + 70 };
    bounds = b;
    const r = rect();
    const s = Math.max(Math.max(b.w, 420) / r.w, b.h / r.h);
    const w = s * r.w, h = s * r.h;
    view = { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
    fitW = w;
    touched = false;
    applyView();
  }
  function zoom(factor, px, py) {
    if (!view) return;
    const r = rect();
    const nw = Math.min(fitW * 5, Math.max(fitW * 0.1, view.w * factor));
    const f = nw / view.w, nh = view.h * f;
    const fx = (px == null ? r.w / 2 : px) / r.w, fy = (py == null ? r.h / 2 : py) / r.h;
    view.x += (view.w - nw) * fx;
    view.y += (view.h - nh) * fy;
    view.w = nw; view.h = nh;
    touched = true;
    applyView();
  }
  function focusNode(n) {
    if (!n || !view) return;
    view.x = n.x - view.w / 2; view.y = n.y - view.h / 2;
    touched = true;
    applyView();
  }

  function wireInteractions() {
    const pts = new Map();

    svg.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const nodeEl = e.target.closest(".web-node");
      pts.set(e.pointerId, {
        x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false,
        node: nodeEl ? byId.get(nodeEl.getAttribute("data-id")) || null : null,
      });
    });

    svg.addEventListener("pointermove", e => {
      const p = pts.get(e.pointerId);
      if (!p || !view) return;
      const r = svg.getBoundingClientRect();
      if (pts.size === 1) {
        if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 5) return;
        if (!p.moved) {
          p.moved = true;
          try { svg.setPointerCapture(e.pointerId); } catch (_) {}
          if (p.node) p.node.pinned = true; else svg.classList.add("panning");
        }
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        const sx = view.w / r.width, sy = view.h / r.height;
        if (p.node) {
          p.node.x += dx * sx; p.node.y += dy * sy;
          p.node.vx = p.node.vy = 0;
          reheat(10);
          place();
        } else {
          view.x -= dx * sx; view.y -= dy * sy;
          touched = true;
          applyView();
        }
      } else if (pts.size === 2) {
        const other = [...pts.entries()].find(([id]) => id !== e.pointerId)[1];
        const oldD = Math.hypot(p.x - other.x, p.y - other.y);
        p.x = e.clientX; p.y = e.clientY;
        p.moved = true;
        const newD = Math.hypot(p.x - other.x, p.y - other.y);
        if (oldD > 0 && newD > 0) zoom(oldD / newD, (p.x + other.x) / 2 - r.left, (p.y + other.y) / 2 - r.top);
      }
    });

    const end = e => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (!pts.size) svg.classList.remove("panning");
      if (!p) return;
      if (p.node) { p.node.pinned = false; if (p.moved) savePositions(); }
      if (!p.moved && e.type === "pointerup") {
        if (p.node) select(state.selected === p.node.id ? null : p.node.id);
        else if (state.selected) select(null);
      }
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);

    svg.addEventListener("wheel", e => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoom(Math.exp(e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    svg.addEventListener("dblclick", e => {
      const el = e.target.closest(".web-node");
      const n = el && byId.get(el.getAttribute("data-id"));
      if (n && !n.mini) window.location.href = `character.html?id=${encodeURIComponent(n.id)}`;
    });

    svg.addEventListener("mouseover", e => {
      const el = e.target.closest(".web-node");
      const id = el ? el.getAttribute("data-id") : null;
      if (id !== state.hover) { state.hover = id; applyHighlight(); }
    });
    svg.addEventListener("mouseleave", () => {
      if (state.hover) { state.hover = null; applyHighlight(); }
    });

    root.querySelectorAll(".web-zoom button").forEach(btn => btn.addEventListener("click", () => {
      const z = btn.dataset.z;
      if (z === "in") zoom(1 / 1.3); else if (z === "out") zoom(1.3); else fit();
    }));

    window.addEventListener("resize", () => {
      if (!view) return;
      if (!touched) fit(); else { const r = rect(); view.h = view.w * r.h / r.w; applyView(); }
    });
  }

  // ── panel ────────────────────────────────────────────────────────────
  function select(id) {
    state.selected = id;
    applyHighlight();
    renderPanel();
  }

  function renderPanel() {
    const sel = state.selected && byId.get(state.selected);
    if (sel) {
      const inc = edges.filter(e => e.a === sel || e.b === sel);
      const rows = inc.map(e => {
        const other = e.a === sel ? e.b : e.a;
        return `<button type="button" class="web-link-row" data-id="${escHtml(other.id)}">
          <span class="web-swatch" style="background:${e.cat.color}"></span>
          <span>${escHtml(other.name)}</span>
          <span class="web-link-type">${escHtml(e.label || "—")}</span>
        </button>`;
      }).join("");
      const open = sel.mini
        ? `<button type="button" class="web-open" data-mini="${escHtml(sel.id)}">View mini profile</button>`
        : `<a class="web-open" href="character.html?id=${encodeURIComponent(sel.id)}">Open profile →</a>`;
      panel.innerHTML = `
        <button type="button" class="web-back" id="web-back">← Back to overview</button>
        <h2>${escHtml(sel.name)}</h2>
        <div class="web-sub">${escHtml(sel.fandom)}${sel.mini ? " · mini profile" : ""}</div>
        <h3>Connections (${inc.length})</h3>
        <div class="web-links">${rows || `<span class="web-stat">No visible connections with the current filters.</span>`}</div>
        ${open}`;
      return;
    }

    const legend = CATS.map(c => `
      <label>
        <input type="checkbox" data-cat="${c.key}" ${state.cats.has(c.key) ? "checked" : ""} />
        <span class="web-swatch" style="background:${c.color}"></span>${c.label}
        <span class="web-count">${state.catCounts[c.key] || 0}</span>
      </label>`).join("");
    const iso = state.isolated
      ? `<div class="web-stat">${state.isolated} character${state.isolated === 1 ? " has" : "s have"} no relationships yet${state.hideIsolated ? " (hidden)" : ""}.</div>` : "";
    panel.innerHTML = `
      <h2>Relationship web</h2>
      <div class="web-stat">${nodes.length} character${nodes.length === 1 ? "" : "s"} · ${edges.length} connection${edges.length === 1 ? "" : "s"}</div>
      ${iso}
      <h3>Connection types</h3>
      <div class="web-legend">${legend}</div>
      <div class="web-stat" style="font-size:.72rem;color:var(--ink-light)">Colours are guessed from the relationship type text (e.g. “sister”, “rival”, “best friend”). The ring colour shows the fandom.</div>`;
  }

  panel.addEventListener("click", e => {
    if (e.target.closest("#web-back")) { select(null); return; }
    const row = e.target.closest(".web-link-row");
    if (row) { const n = byId.get(row.getAttribute("data-id")); select(row.getAttribute("data-id")); focusNode(n); return; }
    const mini = e.target.closest("[data-mini]");
    if (mini && typeof openMiniProfile === "function") {
      const c = getCharacters().find(x => x.id === mini.getAttribute("data-mini"));
      if (c) openMiniProfile(c.id, c.name, null);
    }
  });
  panel.addEventListener("change", e => {
    const cb = e.target.closest("input[data-cat]");
    if (!cb) return;
    if (cb.checked) state.cats.add(cb.dataset.cat); else state.cats.delete(cb.dataset.cat);
    rebuild();
  });

  // ── controls ─────────────────────────────────────────────────────────
  function fillFandomSelect() {
    const sel = document.getElementById("web-fandom");
    const list = [...new Set(getCharacters().filter(c => !c.mini).map(fandomOf))].sort((a, b) => a.localeCompare(b));
    if (state.fandom && !list.includes(state.fandom)) state.fandom = "";
    sel.innerHTML = `<option value="">All fandoms</option>` + list.map(f => `<option value="${escHtml(f)}">${escHtml(f)}</option>`).join("");
    sel.value = state.fandom;
  }

  document.getElementById("web-fandom").addEventListener("change", e => { state.fandom = e.target.value; rebuild(); });
  document.getElementById("web-hide-iso").addEventListener("change", e => { state.hideIsolated = e.target.checked; rebuild(); });
  document.getElementById("web-minis").addEventListener("change", e => { state.showMinis = e.target.checked; rebuild(); });
  document.getElementById("web-relayout").addEventListener("click", () => { posCache.clear(); rebuild(); });
  const search = document.getElementById("web-search");
  search.addEventListener("input", () => { state.q = search.value.trim().toLowerCase(); applyHighlight(); });
  search.addEventListener("keydown", e => {
    if (e.key !== "Enter" || !state.q) return;
    const hit = nodes.find(n => searchMatch(n.c, state.q));
    if (hit) { select(hit.id); focusNode(hit); }
  });

  // ── build everything ─────────────────────────────────────────────────
  function rebuild() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    temp = 0;
    buildGraph();
    fillFandomSelect();

    if (!nodes.length) {
      svg.innerHTML = "";
      emptyEl.style.display = "flex";
      emptyEl.textContent = !state.totalChars
        ? "No characters yet — add some on the homepage."
        : !state.totalPairs
          ? "No relationships yet. Add some in a character's “Relationships” tab and they will appear here."
          : "Nothing matches the current filters.";
      view = null;
      fit();
      renderPanel();
      return;
    }
    emptyEl.style.display = "none";

    prerun();
    nodes.forEach(n => { n.fresh = false; });
    savePositions();
    draw();
    place();
    if (!touched || !view) fit(); else applyView();
    applyHighlight();
    renderPanel();
  }

  wireInteractions();

  document.addEventListener("DOMContentLoaded", async () => {
    rebuild();
    if (typeof isConnected === "function" && isConnected()) {
      await loadFromGist();
      rebuild();
    } else if (typeof setStatus === "function") {
      setStatus("off");
    }
  });
})();
