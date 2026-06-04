// ══════════════════════════════════════════════════════════════════════
// GITHUB GIST SYNC
// ══════════════════════════════════════════════════════════════════════

const STORAGE_TOKEN  = "oc_gh_token";
const STORAGE_GIST   = "oc_gh_gist";
const STORAGE_LOCAL  = "oc_characters";
const GIST_FILENAME  = "characters.json";

function getCreds() {
  return {
    token:  localStorage.getItem(STORAGE_TOKEN)  || "",
    gistId: localStorage.getItem(STORAGE_GIST)   || "",
  };
}

function isConnected() {
  const { token, gistId } = getCreds();
  return !!(token && gistId);
}

// ── Low-level Gist API ────────────────────────────────────────────────

async function gistGet() {
  const { token, gistId } = getCreds();
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${res.statusText}`);
  const data = await res.json();
  const raw  = data.files?.[GIST_FILENAME]?.content;
  if (!raw) throw new Error(`File "${GIST_FILENAME}" not found in Gist.`);
  return JSON.parse(raw);
}

async function gistPut(characters) {
  const { token, gistId } = getCreds();
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(characters, null, 2) },
      },
    }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${res.statusText}`);
}

// ── Sync status dot ───────────────────────────────────────────────────

function setStatus(state, message) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.className = "sync-status";
  if (state === "syncing") { el.classList.add("sync-syncing"); el.title = "Syncing with GitHub…"; }
  if (state === "ok")      { el.classList.add("sync-ok");      el.title = message || "Synced with GitHub"; }
  if (state === "error")   { el.classList.add("sync-error");   el.title = message || "Sync failed — hover for details"; }
  if (state === "off")     { el.title = "Not connected to GitHub"; }
}

// ── Character read / write ────────────────────────────────────────────

function getCharacters() {
  return JSON.parse(localStorage.getItem(STORAGE_LOCAL) || "[]");
}

async function loadFromGist() {
  setStatus("syncing");
  try {
    const characters = await gistGet();
    localStorage.setItem(STORAGE_LOCAL, JSON.stringify(characters));
    setStatus("ok");
    return characters;
  } catch (err) {
    setStatus("error", err.message);
    console.error("Gist load error:", err);
    return getCharacters();
  }
}

async function saveCharacters(list) {
  localStorage.setItem(STORAGE_LOCAL, JSON.stringify(list));
  if (!isConnected()) return;
  setStatus("syncing");
  try {
    await gistPut(list);
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setStatus("ok", `Last synced ${now}`);
  } catch (err) {
    setStatus("error", err.message);
    console.error("Gist save error:", err);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ══════════════════════════════════════════════════════════════════════
// SETUP MODAL
// ══════════════════════════════════════════════════════════════════════

function openSetup() {
  const overlay = document.getElementById("setup-overlay");
  if (!overlay) return;
  const { token, gistId } = getCreds();
  const tokenEl = document.getElementById("setup-token");
  const gistEl  = document.getElementById("setup-gist");
  if (tokenEl) tokenEl.value = token;
  if (gistEl)  gistEl.value  = gistId;
  clearSetupError();
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeSetup() {
  document.getElementById("setup-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
}

function showSetupError(msg) {
  const el = document.getElementById("setup-error");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
}

function clearSetupError() {
  const el = document.getElementById("setup-error");
  if (el) el.style.display = "none";
}

async function handleSetupSave() {
  const token  = document.getElementById("setup-token")?.value.trim();
  const gistId = document.getElementById("setup-gist")?.value.trim();
  clearSetupError();

  if (!token)  { showSetupError("Please enter your Personal Access Token."); return; }
  if (!gistId) { showSetupError("Please enter your Gist ID."); return; }

  const btn = document.getElementById("setup-save");
  if (btn) { btn.textContent = "Connecting…"; btn.disabled = true; }

  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" },
    });
    if (res.status === 401) throw new Error("Invalid token — check it hasn't expired and has the gist scope.");
    if (res.status === 404) throw new Error("Gist not found — double-check the ID from the URL.");
    if (!res.ok)            throw new Error(`GitHub error ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (!data.files?.[GIST_FILENAME]) {
      throw new Error(`No file named "${GIST_FILENAME}" in that Gist. Make sure the filename is exactly characters.json`);
    }

    localStorage.setItem(STORAGE_TOKEN, token);
    localStorage.setItem(STORAGE_GIST,  gistId);
    closeSetup();

    await loadFromGist();
    const grid = document.getElementById("char-sections-container");
    if (grid) renderIndexSections(grid);
    updateSettingsBtnStyle();

  } catch (err) {
    showSetupError(err.message);
  } finally {
    if (btn) { btn.textContent = "Connect & Sync"; btn.disabled = false; }
  }
}

function handleSetupClear() {
  if (!confirm("Disconnect GitHub sync? Your locally cached characters stay, but won't sync to GitHub until you reconnect.")) return;
  localStorage.removeItem(STORAGE_TOKEN);
  localStorage.removeItem(STORAGE_GIST);
  setStatus("off");
  updateSettingsBtnStyle();
  closeSetup();
}

function updateSettingsBtnStyle() {
  const btn = document.getElementById("nav-settings-btn");
  if (!btn) return;
  if (isConnected()) {
    btn.title = "GitHub Sync: connected";
    btn.classList.add("settings-connected");
  } else {
    btn.title = "Set up GitHub Sync";
    btn.classList.remove("settings-connected");
  }
}

// ══════════════════════════════════════════════════════════════════════
// CHARACTER PAGE  (character.html)
// ══════════════════════════════════════════════════════════════════════

function loadCharacterPage() {
  if (!document.getElementById("char-name")) return;

  const id         = new URLSearchParams(window.location.search).get("id");
  const characters = getCharacters();
  const character  = characters.find(c => c.id === id);

  if (!character) {
    const sheet = document.querySelector(".char-sheet");
    if (sheet) sheet.innerHTML = "<p style='padding:2rem'>Character not found.</p>";
    return;
  }

  setText("char-name",       character.name);
  setText("char-fandom",     character.fandom);
  setText("char-nicknames",  character.nicknames);
  setText("char-pronouns",   character.pronouns);
  setText("char-age",        character.age);
  setText("char-birthday",   character.birthday);
  setText("char-heritage",   character.heritage);
  setText("char-occupation", character.occupation);
  setFormattedText("char-appearance", character.appearance);

  setLink("char-unvale",       "char-unvale-li",       character.links?.unvale,       "Unvale");
  setLink("char-characterhub", "char-characterhub-li", character.links?.characterhub, "CharacterHub");
  setLink("char-artfight",     "char-artfight-li",     character.links?.artfight,     "Artfight");
  setLink("char-spotify",      "char-spotify-li",      character.links?.spotify,      "Playlist");

  renderBackgroundHistory(character.background, character.history);
  setFormattedText("char-overview", character.overview);

  // Ref image
  const refWrap = document.querySelector(".char-ref-wrap");
  const img     = document.querySelector(".char-ref");
  if (character.refImage && refWrap && img) {
    img.src = character.refImage;
    refWrap.style.display = "block";
  } else if (refWrap) {
    refWrap.style.display = "none";
  }

  const titleImg = document.querySelector(".char-title-img");
  if (character.titleImage && titleImg) {
    titleImg.src = character.titleImage;
    titleImg.style.display = "block";
  } else if (titleImg) {
    titleImg.style.display = "none";
  }

  renderGallery(character.gallery || []);
  document.title = (character.name || "Character") + " — Character Sheet";

  // Overview / Relationships tab switching
  initOverviewTabs();

  // Render relationships tab
  renderRelationships(character.relationships || [], id);

  // Edit button (main character editor — redirects to index)
  const editBtn = document.getElementById("char-page-edit-btn");
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      openCharPageEditor(id);
    });
  }

  // Edit relationships button — opens inline relationship editor
  const editRelBtn = document.getElementById("edit-relationships-btn");
  if (editRelBtn) {
    editRelBtn.addEventListener("click", () => openRelationshipEditor(id));
  }
}

// ── Overview / Relationships tabs ─────────────────────────────────────

function initOverviewTabs() {
  const overviewTab = document.getElementById("tab-overview");
  const relTab      = document.getElementById("tab-relationships");
  const overviewPanel = document.getElementById("panel-overview");
  const relPanel      = document.getElementById("panel-relationships");
  const editRelBtn    = document.getElementById("edit-relationships-btn");

  if (!overviewTab || !relTab) return;

  // Hide edit button on overview tab by default
  if (editRelBtn) editRelBtn.style.display = "none";

  overviewTab.addEventListener("click", () => {
    overviewTab.classList.add("active");
    relTab.classList.remove("active");
    overviewPanel.style.display = "";
    relPanel.style.display = "none";
    if (editRelBtn) editRelBtn.style.display = "none";
  });

  relTab.addEventListener("click", () => {
    relTab.classList.add("active");
    overviewTab.classList.remove("active");
    relPanel.style.display = "";
    overviewPanel.style.display = "none";
    if (editRelBtn) editRelBtn.style.display = "";
  });
}

// ── Relationships rendering ───────────────────────────────────────────

const REL_TRUNCATE = 180;

function renderRelationships(relationships, currentId) {
  const panel = document.getElementById("panel-relationships");
  if (!panel) return;

  const editRelBtn = document.getElementById("edit-relationships-btn");

  if (!relationships || !relationships.length) {
    panel.innerHTML = `
      <p class="rel-empty">No relationships added yet.
        <button class="rel-empty-add-btn" onclick="document.getElementById('edit-relationships-btn').click()">Add some</button>
      </p>`;
    return;
  }

  const allChars = getCharacters();

  const cards = relationships.map(rel => {
    // Try to find a matching character by name (case-insensitive)
    const match = allChars.find(c =>
      c.id !== currentId &&
      (c.name || "").toLowerCase().trim() === (rel.name || "").toLowerCase().trim()
    );

    const nameHtml = match
      ? `<a href="character.html?id=${escHtml(match.id)}" class="rel-name rel-name-link">${escHtml(rel.name || "Unknown")}</a>`
      : rel.link
        ? `<a href="${escHtml(rel.link)}" class="rel-name rel-name-link" target="_blank" rel="noopener">${escHtml(rel.name || "Unknown")}</a>`
        : `<span class="rel-name">${escHtml(rel.name || "Unknown")}</span>`;

    const canonLabel = rel.canon === "canon"
      ? `<span class="rel-canon rel-canon--yes">canon</span>`
      : rel.canon === "noncanon"
        ? `<span class="rel-canon rel-canon--no">OC</span>`
        : "";

    const desc = rel.description || "";
    let descHtml = "";

    if (!desc) {
      descHtml = "";
    } else if (desc.length <= REL_TRUNCATE) {
      descHtml = `<p class="rel-desc char-formatted">${escHtml(desc)}</p>`;
    } else {
      let cut = REL_TRUNCATE;
      while (cut < desc.length && desc[cut] !== " " && desc[cut] !== "\n") cut++;
      const visible = desc.slice(0, cut).trimEnd();
      const hidden  = desc.slice(cut).trimStart();
      descHtml = `
        <div class="rel-desc-block">
          <span class="rel-desc char-formatted">${escHtml(visible)}</span><span class="rel-ellipsis">…</span>
          <details class="rel-details">
            <summary>read more</summary>
            <span class="rel-desc char-formatted">${escHtml(hidden)}</span>
          </details>
        </div>`;
    }

    // Tiny avatar from matched character
    const avatarHtml = match && (match.titleImage || match.refImage)
      ? `<img src="${escHtml(match.titleImage || match.refImage)}" class="rel-avatar" alt="" />`
      : `<div class="rel-avatar rel-avatar-placeholder">${escHtml((rel.name?.[0] || "?").toUpperCase())}</div>`;

    return `
      <div class="rel-card">
        <div class="rel-card-header">
          ${avatarHtml}
          <div class="rel-card-meta">
            <div class="rel-name-row">
              ${nameHtml}
              ${canonLabel}
            </div>
            ${rel.type ? `<span class="rel-type">${escHtml(rel.type)}</span>` : ""}
          </div>
        </div>
        ${descHtml}
      </div>`;
  }).join("");

  panel.innerHTML = `<div class="rel-grid">${cards}</div>`;

  // Wire up details toggles
  panel.querySelectorAll(".rel-details").forEach(det => {
    const ellipsis = det.previousElementSibling;
    if (ellipsis?.classList.contains("rel-ellipsis")) {
      det.addEventListener("toggle", () => {
        ellipsis.style.display = det.open ? "none" : "inline";
      });
    }
  });
}

// ══════════════════════════════════════════════════════════════════════
// RELATIONSHIP EDITOR  (opens on character.html, inline)
// ══════════════════════════════════════════════════════════════════════

let relEditingCharId = null;

function openRelationshipEditor(charId) {
  const overlay = document.getElementById("rel-editor-overlay");
  if (!overlay) return;

  relEditingCharId = charId;
  const characters = getCharacters();
  const character  = characters.find(c => c.id === charId);

  const tbody = document.getElementById("rel-editor-rows");
  if (tbody) {
    tbody.innerHTML = "";
    (character?.relationships || []).forEach(rel => addRelRow(rel));
  }

  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeRelationshipEditor() {
  document.getElementById("rel-editor-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
  relEditingCharId = null;
}

function addRelRow(rel) {
  rel = rel || {};
  const tbody = document.getElementById("rel-editor-rows");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.classList.add("rel-editor-row");
  tr.innerHTML = `
    <td class="rel-editor-cell rel-editor-cell--name">
      <input type="text" class="rel-r-name" placeholder="Name" value="${escHtml(rel.name || "")}" />
    </td>
    <td class="rel-editor-cell rel-editor-cell--type">
      <input type="text" class="rel-r-type" placeholder="e.g. best friend, rival" value="${escHtml(rel.type || "")}" />
    </td>
   <td class="rel-editor-cell rel-editor-cell--canon">
      <select class="rel-r-canon">
        <option value=""         ${!rel.canon                    ? "selected" : ""}>—</option>
        <option value="canon"    ${rel.canon === "canon"         ? "selected" : ""}>Canon character</option>
        <option value="noncanon" ${rel.canon === "noncanon"      ? "selected" : ""}>OC</option>
      </select>
    </td>
    <td class="rel-editor-cell rel-editor-cell--link">
      <input type="url" class="rel-r-link" placeholder="https://… (optional)" value="${escHtml(rel.link || "")}" />
    </td>
    <td class="rel-editor-cell rel-editor-cell--desc">
      <textarea class="rel-r-desc" rows="2" placeholder="Short description…">${escHtml(rel.description || "")}</textarea>
    </td>
    <td class="rel-editor-cell rel-editor-cell--rm">
      <button type="button" class="rm-rel-row" title="Remove">✕</button>
    </td>
  `;
  tr.querySelector(".rm-rel-row").addEventListener("click", () => tr.remove());
  tbody.appendChild(tr);
}

async function handleRelFormSubmit(e) {
  e.preventDefault();
  if (!relEditingCharId) return;

  const rows = Array.from(document.querySelectorAll("#rel-editor-rows .rel-editor-row"));
  const relationships = rows.map(tr => ({
    name:        (tr.querySelector(".rel-r-name")?.value  || "").trim(),
    type:        (tr.querySelector(".rel-r-type")?.value  || "").trim(),
    canon:       (tr.querySelector(".rel-r-canon")?.value || ""),
    link:        (tr.querySelector(".rel-r-link")?.value  || "").trim(),
    description: (tr.querySelector(".rel-r-desc")?.value  || "").trim(),
  })).filter(r => r.name);

  const characters = getCharacters();
  const idx = characters.findIndex(c => c.id === relEditingCharId);
  if (idx !== -1) {
    characters[idx].relationships = relationships;
    characters[idx].updatedAt = new Date().toISOString();
  }

  closeRelationshipEditor();

  // Re-render relationships panel in place
  renderRelationships(relationships, relEditingCharId);

  await saveCharacters(characters);
}

// ── Helper functions used by character page ───────────────────────────

const TRUNCATE_CHARS = 500;

function renderBackgroundHistory(background, history) {
  const container = document.getElementById("char-bg-history-container");
  if (!container) return;

  let fullText = background || "";
  if (history && !fullText.includes(history)) {
    fullText = [fullText, history].filter(Boolean).join("\n\n");
  }

  if (!fullText) {
    container.innerHTML = "";
    return;
  }

  if (fullText.length <= TRUNCATE_CHARS) {
    container.innerHTML = `<p class="char-body char-formatted" id="char-bg-history-text">${escHtml(fullText)}</p>`;
    return;
  }

  let cutoff = TRUNCATE_CHARS;
  while (cutoff < fullText.length && fullText[cutoff] !== " " && fullText[cutoff] !== "\n") cutoff++;

  const visible = fullText.slice(0, cutoff).trimEnd();
  const hidden  = fullText.slice(cutoff).trimStart();

  container.innerHTML = `
    <div class="char-bg-history-block">
      <span class="char-body char-formatted" id="char-bg-visible">${escHtml(visible)}</span><span class="char-bg-ellipsis">…</span>
      <details class="char-details char-bg-details">
        <summary>click here to read more</summary>
        <span class="char-body char-formatted" id="char-bg-hidden">${escHtml(hidden)}</span>
      </details>
    </div>
  `;

  const details  = container.querySelector(".char-bg-details");
  const ellipsis = container.querySelector(".char-bg-ellipsis");
  if (details && ellipsis) {
    details.addEventListener("toggle", () => {
      ellipsis.style.display = details.open ? "none" : "inline";
    });
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

function setFormattedText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value || "";
  el.classList.add("char-formatted");
}

function setLink(anchorId, liId, href, label) {
  const anchor = document.getElementById(anchorId);
  const li     = document.getElementById(liId);
  if (!anchor) return;
  if (href) {
    anchor.href        = href;
    anchor.textContent = label;
    if (li) li.style.display = "";
  } else {
    if (li) li.style.display = "none";
  }
}

function renderGallery(gallery) {
  const grid = document.querySelector(".gallery-grid");
  if (!grid) return;
  if (!gallery.length) {
    grid.innerHTML = "<p style='padding:1rem;opacity:.5;font-style:italic'>No gallery images yet.</p>";
    return;
  }
  grid.innerHTML = gallery.map(item => `
    <div class="gallery-item">
      <div class="gallery-img-wrap">
        <img src="${escHtml(item.src)}" alt="${escHtml(item.caption || '')}" loading="lazy" />
      </div>
      <div class="gallery-meta">
        <span class="gallery-caption">${escHtml(item.caption || "")}</span>
        ${item.year ? `<span class="gallery-year">${escHtml(item.year)}</span>` : ""}
      </div>
    </div>
  `).join("");
}

function openCharPageEditor(id) {
  window.location.href = `index.html?edit=${id}`;
}

// ══════════════════════════════════════════════════════════════════════
// INDEX PAGE  (index.html)
// ══════════════════════════════════════════════════════════════════════

async function loadIndexPage() {
  const container = document.getElementById("char-sections-container");
  if (!container) return;

  updateSettingsBtnStyle();

  const editParam = new URLSearchParams(window.location.search).get("edit");

  if (isConnected()) {
    setStatus("syncing");
    renderIndexSections(container);
    await loadFromGist();
    renderIndexSections(container);
  } else {
    setStatus("off");
    renderIndexSections(container);
    if (!localStorage.getItem("oc_banner_dismissed")) {
      setTimeout(() => {
        const banner = document.getElementById("sync-banner");
        if (banner) banner.style.display = "flex";
      }, 600);
    }
  }

  // Nav buttons
  document.getElementById("add-char-btn")
    ?.addEventListener("click", () => openEditor(null));
  document.getElementById("nav-add-btn")
    ?.addEventListener("click", () => openEditor(null));
  document.getElementById("nav-settings-btn")
    ?.addEventListener("click", openSetup);

  // Setup modal
  document.getElementById("setup-close")
    ?.addEventListener("click", closeSetup);
  document.getElementById("setup-save")
    ?.addEventListener("click", handleSetupSave);
  document.getElementById("setup-clear")
    ?.addEventListener("click", handleSetupClear);
  document.getElementById("setup-overlay")
    ?.addEventListener("click", e => { if (e.target.id === "setup-overlay") closeSetup(); });

  // Setup banner
  document.getElementById("sync-banner-btn")
    ?.addEventListener("click", () => {
      document.getElementById("sync-banner").style.display = "none";
      openSetup();
    });
  document.getElementById("sync-banner-dismiss")
    ?.addEventListener("click", () => {
      document.getElementById("sync-banner").style.display = "none";
      localStorage.setItem("oc_banner_dismissed", "1");
    });

  // Editor modal
  document.getElementById("editor-close")
    ?.addEventListener("click", closeEditor);
  document.getElementById("editor-close-bottom")
    ?.addEventListener("click", closeEditor);
  document.getElementById("editor-overlay")
    ?.addEventListener("click", e => { if (e.target.id === "editor-overlay") closeEditor(); });
  document.getElementById("char-editor-form")
    ?.addEventListener("submit", handleFormSubmit);
  document.getElementById("add-gallery-row")
    ?.addEventListener("click", () => addGalleryRow());

  // Search
  document.getElementById("search-input")
    ?.addEventListener("input", e => {
      renderIndexSections(container, e.target.value.trim().toLowerCase());
    });

  if (editParam) {
    const url = new URL(window.location.href);
    url.searchParams.delete("edit");
    window.history.replaceState({}, "", url.toString());
    openEditor(editParam);
  }
}

function renderIndexSections(container, filter) {
  filter = filter || "";
  let characters = getCharacters();

  if (filter) {
    characters = characters.filter(c =>
      (c.name   || "").toLowerCase().includes(filter) ||
      (c.fandom || "").toLowerCase().includes(filter)
    );
  }

  if (!characters.length) {
    container.innerHTML = `<p class="empty-state" style="padding:1rem 0">${filter ? "No characters match your search." : "No characters yet. Add one!"}</p>`;
    return;
  }

  let html = "";

  if (!filter) {
    const recentlySorted = [...characters]
      .sort((a, b) => {
        const ta = a.updatedAt || a.id || "";
        const tb = b.updatedAt || b.id || "";
        return tb.localeCompare(ta);
      })
      .slice(0, 10);

    html += `
      <section class="char-section">
        <div class="char-section-header">
          <h2 class="char-section-title">Recently Edited</h2>
          <span class="char-section-count">${recentlySorted.length} character${recentlySorted.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="char-grid">
          ${recentlySorted.map(c => renderCharCard(c)).join("")}
        </div>
      </section>
    `;
  }

  const fandoms = {};
  characters.forEach(c => {
    const fandom = (c.fandom || "").trim() || "Uncategorized";
    if (!fandoms[fandom]) fandoms[fandom] = [];
    fandoms[fandom].push(c);
  });

  Object.keys(fandoms).sort().forEach(fandom => {
    const chars = fandoms[fandom];
    html += `
      <section class="char-section">
        <div class="char-section-header">
          <h2 class="char-section-title">${escHtml(fandom)}</h2>
          <span class="char-section-count">${chars.length} character${chars.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="char-grid">
          ${chars.map(c => renderCharCard(c)).join("")}
        </div>
      </section>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll(".char-card-edit").forEach(btn =>
    btn.addEventListener("click", () => openEditor(btn.dataset.id))
  );
  container.querySelectorAll(".char-card-delete").forEach(btn =>
    btn.addEventListener("click", () => deleteCharacter(btn.dataset.id))
  );
}

function renderCharCard(c) {
  const cardImg = c.titleImage || c.refImage;
  return `
    <div class="char-card" data-id="${escHtml(c.id)}">
      <a href="character.html?id=${escHtml(c.id)}" class="char-card-img-link">
        <div class="char-card-img-wrap">
          ${cardImg
            ? `<img src="${escHtml(cardImg)}" alt="${escHtml(c.name || '')}" />`
            : `<div class="char-card-placeholder">${escHtml((c.name?.[0] || "?").toUpperCase())}</div>`}
        </div>
      </a>
      <div class="char-card-body">
        <a href="character.html?id=${escHtml(c.id)}" class="char-card-name-link">
          <p class="char-card-name">${escHtml(c.name || "Unnamed")}</p>
        </a>
        <p class="char-card-fandom">${escHtml(c.fandom || "")}</p>
        <div class="char-card-actions">
          <button class="char-card-btn char-card-edit"   data-id="${escHtml(c.id)}">Edit</button>
          <button class="char-card-btn char-card-delete" data-id="${escHtml(c.id)}">Delete</button>
        </div>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════
// EDITOR MODAL  (index.html)
// ══════════════════════════════════════════════════════════════════════

let editingId = null;

function openEditor(id) {
  const overlay = document.getElementById("editor-overlay");
  if (!overlay) return;

  editingId = id;
  const c = id ? getCharacters().find(x => x.id === id) : null;

  const fields = [
    "name","fandom","nicknames","pronouns","age","birthday",
    "heritage","occupation","refImage","titleImage","appearance","overview",
    "background",
    "links.unvale","links.characterhub","links.artfight","links.spotify"
  ];

  if (c?.history && !c.background?.includes(c.history)) {
    const mergedEl = document.getElementById("ef-background");
    if (mergedEl) {
      mergedEl.value = [c.background, c.history].filter(Boolean).join("\n\n");
    }
  }

  fields.forEach(key => {
    const el = document.getElementById("ef-" + key.replace(".", "_"));
    if (!el) return;
    el.value = key.startsWith("links.")
      ? (c?.links?.[key.split(".")[1]] || "")
      : (c?.[key] || "");
  });

  const galleryBody = document.getElementById("gallery-rows");
  if (galleryBody) {
    galleryBody.innerHTML = "";
    (c?.gallery || []).forEach(item => addGalleryRow(item));
  }

  document.getElementById("editor-title").textContent = c ? "Edit Character" : "New Character";
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeEditor() {
  document.getElementById("editor-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
  editingId = null;
}

function addGalleryRow(item) {
  item = item || {};
  const tbody = document.getElementById("gallery-rows");
  if (!tbody) return;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="g-src"     placeholder="Image URL" value="${escHtml(item.src || "")}" /></td>
    <td><input type="text" class="g-caption" placeholder="Caption"   value="${escHtml(item.caption || "")}" /></td>
    <td><input type="text" class="g-year"    placeholder="Year"      value="${escHtml(item.year || "")}" style="width:70px" /></td>
    <td><button type="button" class="rm-gallery-row">✕</button></td>
  `;
  tr.querySelector(".rm-gallery-row").addEventListener("click", function() { tr.remove(); });
  tbody.appendChild(tr);
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const valField = function(id) { return (document.getElementById(id)?.value || "").trim(); };

  const name   = valField("ef-name");
  const fandom = valField("ef-fandom");

  if (!name || !fandom) {
    alert("A Name and Fandom are both required before saving a character.");
    return;
  }

  const gallery = Array.from(document.querySelectorAll("#gallery-rows tr")).map(function(tr) {
    return {
      src:     (tr.querySelector(".g-src")?.value     || "").trim(),
      caption: (tr.querySelector(".g-caption")?.value || "").trim(),
      year:    (tr.querySelector(".g-year")?.value    || "").trim(),
    };
  }).filter(function(g) { return g.src; });

  const now = new Date().toISOString();

  // Preserve existing relationships when saving via main editor
  const existingChar = editingId ? getCharacters().find(c => c.id === editingId) : null;

  const character = {
    id:            editingId || generateId(),
    updatedAt:     now,
    name,
    fandom,
    nicknames:     valField("ef-nicknames"),
    pronouns:      valField("ef-pronouns"),
    age:           valField("ef-age"),
    birthday:      valField("ef-birthday"),
    heritage:      valField("ef-heritage"),
    occupation:    valField("ef-occupation"),
    titleImage:    valField("ef-titleImage"),
    refImage:      valField("ef-refImage"),
    appearance:    valField("ef-appearance"),
    overview:      valField("ef-overview"),
    background:    valField("ef-background"),
    history:       "",
    relationships: existingChar?.relationships || [],
    links: {
      unvale:       valField("ef-links_unvale"),
      characterhub: valField("ef-links_characterhub"),
      artfight:     valField("ef-links_artfight"),
      spotify:      valField("ef-links_spotify"),
    },
    gallery,
  };

  const characters = getCharacters();
  if (editingId) {
    const idx = characters.findIndex(function(c) { return c.id === editingId; });
    if (idx !== -1) characters[idx] = character;
    else characters.push(character);
  } else {
    characters.push(character);
  }

  closeEditor();
  const container = document.getElementById("char-sections-container");
  if (container) renderIndexSections(container);
  await saveCharacters(characters);
}

async function deleteCharacter(id) {
  if (!confirm("Delete this character? This cannot be undone.")) return;
  const characters = getCharacters().filter(function(c) { return c.id !== id; });
  const container = document.getElementById("char-sections-container");
  if (container) renderIndexSections(container);
  await saveCharacters(characters);
}

// ══════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", function() {
  loadIndexPage();
  loadCharacterPage();

  // Relationship editor wiring (character.html only)
  document.getElementById("rel-editor-close")
    ?.addEventListener("click", closeRelationshipEditor);
  document.getElementById("rel-editor-overlay")
    ?.addEventListener("click", e => { if (e.target.id === "rel-editor-overlay") closeRelationshipEditor(); });
  document.getElementById("rel-editor-form")
    ?.addEventListener("submit", handleRelFormSubmit);
  document.getElementById("add-rel-row")
    ?.addEventListener("click", () => addRelRow());
});