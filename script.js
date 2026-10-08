// ══════════════════════════════════════════════════════════════════════
// GITHUB GIST SYNC
// ══════════════════════════════════════════════════════════════════════

const STORAGE_TOKEN = "oc_gh_token";
const STORAGE_GIST  = "oc_gh_gist";
const STORAGE_LOCAL = "oc_characters";
const GIST_FILENAME = "characters.json";

function getCreds() {
  return {
    token:  localStorage.getItem(STORAGE_TOKEN) || "",
    gistId: localStorage.getItem(STORAGE_GIST)  || "",
  };
}

function isConnected() {
  const { token, gistId } = getCreds();
  return !!(token && gistId);
}

async function gistGet() {
  const { token, gistId } = getCreds();
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" },
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
    body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(characters, null, 2) } } }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${res.statusText}`);
}

function setStatus(state, message) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.className = "sync-status";
  if (state === "syncing") { el.classList.add("sync-syncing"); el.title = "Syncing with GitHub…"; }
  if (state === "ok")      { el.classList.add("sync-ok");      el.title = message || "Synced with GitHub"; }
  if (state === "error")   { el.classList.add("sync-error");   el.title = message || "Sync failed"; }
  if (state === "off")     { el.title = "Not connected to GitHub"; }
}

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
  if (!isConnected()) return true;
  setStatus("syncing");
  try {
    await gistPut(list);
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setStatus("ok", `Last synced ${now}`);
    return true;
  } catch (err) {
    setStatus("error", err.message);
    console.error("Gist save error:", err);
    return false;
  }
}

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
    if (!res.ok) throw new Error(`GitHub error ${res.status}: ${res.statusText}`);
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
// CHARACTER PAGE
// ══════════════════════════════════════════════════════════════════════

let _charPageWired = false;

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
  setText("char-pronouns",   character.pronouns);
  setText("char-age",        character.age);
  setText("char-birthday",   character.birthday);
  setText("char-heritage",   character.heritage);
  setText("char-occupation", character.occupation);
  setFormattedText("char-appearance", character.appearance);

  renderAllLinks(character.links || {}, character.customLinks || []);
  renderBackgroundHistory(character.background, character.history);
  setFormattedText("char-overview", character.overview);

  const refWrap = document.querySelector(".char-ref-wrap");
  const img     = document.querySelector(".char-ref");
  if (character.refImage && refWrap && img) {
    img.src = character.refImage;
    refWrap.style.display = "block";
  } else if (refWrap) {
    refWrap.style.display = "none";
  }

  renderGallery(character.gallery || [], id);
  renderOtherArt(character.otherArt || []);
  document.title = (character.name || "Character") + " — Character Sheet";

  renderRelationships(character.relationships || [], id);
  renderDetails(character.details || [], character, id);

  // loadCharacterPage() runs again after every edit — only attach listeners the first time,
  // otherwise every click fires multiple times.
  if (_charPageWired) return;
  _charPageWired = true;
  initOverviewTabs(id);

  document.getElementById("char-page-edit-btn")
    ?.addEventListener("click", () => openCharPageEditor(id));
  document.getElementById("edit-relationships-btn")
    ?.addEventListener("click", () => openRelationshipEditor(id));
  document.getElementById("edit-details-btn")
    ?.addEventListener("click", () => openDetailsEditor(id));
  document.getElementById("edit-overview-btn")
    ?.addEventListener("click", () => openOverviewEditor(id));
  document.getElementById("gallery-edit-btn")
    ?.addEventListener("click", () => openGalleryEditor(id));
  document.getElementById("gallery-add-btn")
    ?.addEventListener("click", () => openGalleryEditor(id, true));
  document.getElementById("otherart-edit-btn")
    ?.addEventListener("click", () => openOtherArtEditor(id));
  document.getElementById("otherart-add-btn")
    ?.addEventListener("click", () => openOtherArtEditor(id, true));
}

function pageCharId() {
  return new URLSearchParams(window.location.search).get("id");
}

function renderAllLinks(links, customLinks) {
  const list = document.getElementById("char-links-list");
  if (!list) return;
  list.innerHTML = "";
  const fixed = [
    { href: links.unvale,       label: "Unvale" },
    { href: links.characterhub, label: "CharacterHub" },
    { href: links.artfight,     label: "Artfight" },
    { href: links.spotify,      label: "Playlist" },
  ];
  fixed.forEach(({ href, label }) => {
    if (!href) return;
    const li = document.createElement("li");
    li.innerHTML = `<a href="${escHtml(href)}" target="_blank" rel="noopener">${escHtml(label)}</a>`;
    list.appendChild(li);
  });
  (customLinks || []).forEach(({ url, title }) => {
    if (!url) return;
    const li = document.createElement("li");
    li.innerHTML = `<a href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(title || url)}</a>`;
    list.appendChild(li);
  });
}

// ══════════════════════════════════════════════════════════════════════
// OVERVIEW / DETAILS / RELATIONSHIPS / TREE TABS
// ══════════════════════════════════════════════════════════════════════

function initOverviewTabs(charId) {
  const tabs = {
    overview:      document.getElementById("tab-overview"),
    details:       document.getElementById("tab-details"),
    relationships: document.getElementById("tab-relationships"),
    tree:          document.getElementById("tab-tree"),
    stories:       document.getElementById("tab-stories"),
  };
  const panels = {
    overview:      document.getElementById("panel-overview"),
    details:       document.getElementById("panel-details"),
    relationships: document.getElementById("panel-relationships"),
    tree:          document.getElementById("panel-tree"),
    stories:       document.getElementById("panel-stories"),
  };
  const editRelBtn      = document.getElementById("edit-relationships-btn");
  const editDetailsBtn  = document.getElementById("edit-details-btn");
  const editOverviewBtn = document.getElementById("edit-overview-btn");
  const addStoryBtn     = document.getElementById("add-story-btn");
  if (editRelBtn)     editRelBtn.style.display     = "none";
  if (editDetailsBtn) editDetailsBtn.style.display = "none";
  if (addStoryBtn)    addStoryBtn.style.display    = "none";
  // overview edit btn is visible by default (overview tab starts active)

  function activate(key) {
    Object.values(tabs).forEach(t => t && t.classList.remove("active"));
    Object.values(panels).forEach(p => p && (p.style.display = "none"));
    if (tabs[key])   tabs[key].classList.add("active");
    if (panels[key]) panels[key].style.display = "";
    if (editRelBtn)      editRelBtn.style.display      = key === "relationships" ? "" : "none";
    if (editDetailsBtn)  editDetailsBtn.style.display  = key === "details"       ? "" : "none";
    if (editOverviewBtn) editOverviewBtn.style.display = key === "overview"      ? "" : "none";
    if (addStoryBtn)     addStoryBtn.style.display     = key === "stories"       ? "" : "none";
    if (key === "tree")    renderTree(charId);
    if (key === "stories") renderStories(charId);
  }

  tabs.overview?.addEventListener("click",      () => activate("overview"));
  tabs.details?.addEventListener("click",       () => activate("details"));
  tabs.relationships?.addEventListener("click", () => activate("relationships"));
  tabs.tree?.addEventListener("click",          () => activate("tree"));
  tabs.stories?.addEventListener("click",       () => activate("stories"));

  addStoryBtn?.addEventListener("click", () => openStoryEditor(charId, null));
}

// ══════════════════════════════════════════════════════════════════════
// DETAILS PANEL
// ══════════════════════════════════════════════════════════════════════

const DETAILS_PRESETS = [
  { key: "fullName",           label: "Full Legal Name" },
  { key: "nickname",           label: "Nickname" },
  { key: "alias",              label: "Alias" },
  { key: "title",              label: "Title" },
  { key: "sexuality",          label: "Sexuality" },
  { key: "relationshipStatus", label: "Relationship Status" },
  { key: "gender",             label: "Gender" },
  { key: "height",             label: "Height" },
  { key: "build",              label: "Build" },
  { key: "eyeColor",           label: "Eye Colour" },
  { key: "hairColor",          label: "Hair Colour" },
  { key: "skinColor",          label: "Skin Colour" },
  { key: "fashionStyle",       label: "Fashion Style" },
  { key: "species",            label: "Species / Race" },
  { key: "birthplace",         label: "Birthplace" },
  { key: "mbti",               label: "MBTI" },
  { key: "virtues",            label: "Virtues" },
  { key: "personality",        label: "Personality" },
  { key: "likes",              label: "Likes" },
  { key: "dislikes",           label: "Dislikes" },
  { key: "fears",              label: "Fears" },
  { key: "hobbies",            label: "Hobbies" },
  { key: "goals",              label: "Goals" },
  { key: "flaws",              label: "Flaws" },
  { key: "trivia",             label: "Trivia" },
];

// Fields now size themselves automatically based on how much text they hold,
// instead of the old manual Half/Full toggle — long values span the full row.
function isWideDetail(value) {
  const v = value || "";
  return v.length > 60 || /\r|\n/.test(v);
}

function renderDetails(details, character, charId) {
  const panel = document.getElementById("panel-details");
  if (!panel) return;

  let effectiveDetails = details || [];

  const hasNicknameField = effectiveDetails.some(d => d.key === "nickname" || (d.label || "").toLowerCase() === "nickname");
  if (character.nicknames && character.nicknames.trim() && !hasNicknameField) {
    effectiveDetails = [{ key: "nickname", label: "Nickname", value: character.nicknames }, ...effectiveDetails];
  }

  const filled = effectiveDetails.filter(d => (d.value || "").trim());

  if (!filled.length) {
    panel.innerHTML = `
      <p class="details-empty-state">No details added yet.
        <button class="rel-empty-add-btn" id="details-empty-add-btn">Add some</button>
      </p>`;
    panel.querySelector("#details-empty-add-btn")?.addEventListener("click", () => openDetailsEditor(charId));
    return;
  }

  const html = `<div class="details-grid">${filled.map(d => `
    <div class="details-field${isWideDetail(d.value) ? " details-field--wide" : ""}">
      <span class="details-label">${escHtml(d.label || d.key || "")}</span>
      <span class="details-value char-formatted">${escHtml(d.value || "")}</span>
    </div>`).join("")}</div>`;

  panel.innerHTML = html;
}

// ── Details editor modal ───────────────────────────────────────────────

let detailsEditingCharId = null;
// FIX 2: track whether the details editor has unsaved changes
let _detailsDirty = false;

function _markDetailsDirty() { _detailsDirty = true; }

function openDetailsEditor(charId) {
  const overlay = document.getElementById("details-editor-overlay");
  if (!overlay) return;
  detailsEditingCharId = charId;
  _detailsDirty = false;

  const characters = getCharacters();
  const character  = characters.find(c => c.id === charId);
  const existing   = character?.details || [];

  const tbody = document.getElementById("details-editor-rows");
  if (tbody) {
    tbody.innerHTML = "";
    const hasNicknameRow = existing.some(d => d.key === "nickname");
    if (character?.nicknames && character.nicknames.trim() && !hasNicknameRow) {
      addDetailsRow({ key: "nickname", label: "Nickname", value: character.nicknames });
    }
    existing.forEach(d => addDetailsRow(d));
  }

  renderPresetChips(existing);

  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function renderPresetChips(existing) {
  const container = document.getElementById("details-preset-chips");
  if (!container) return;
  const existingKeys = new Set(existing.map(d => d.key).filter(Boolean));
  container.innerHTML = DETAILS_PRESETS.map(p => {
    const added = existingKeys.has(p.key);
    return `<button type="button" class="details-preset-chip${added ? " chip-added" : ""}"
      data-key="${escHtml(p.key)}" data-label="${escHtml(p.label)}"
      ${added ? "disabled" : ""}>${escHtml(p.label)}</button>`;
  }).join("");

  container.querySelectorAll(".details-preset-chip:not(.chip-added)").forEach(btn => {
    btn.addEventListener("click", () => {
      addDetailsRow({ key: btn.dataset.key, label: btn.dataset.label, value: "" });
      btn.classList.add("chip-added");
      btn.disabled = true;
      _markDetailsDirty();
      const tbody = document.getElementById("details-editor-rows");
      tbody?.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}

// ── Reorder support ──────────────────────────────────────────────────
// Built on Pointer Events (not the native HTML5 drag-and-drop API) so that
// reordering works the same way with mouse, touch, and pen — native DnD
// never fires from touch input on phones/tablets, which is why dragging
// previously only worked on desktop.
let _dragState = null;

function startRowDrag(handle, row, tbody, pointerId) {
  handle.setPointerCapture(pointerId);
  row.classList.add("det-dragging");
  _dragState = { row, tbody, pointerId };

  const onMove = ev => {
    if (!_dragState || ev.pointerId !== pointerId) return;
    const y = ev.clientY;
    const siblings = Array.from(tbody.querySelectorAll(".details-editor-row")).filter(r => r !== row);
    for (const sib of siblings) {
      const rect = sib.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (y < mid) {
        if (sib.previousElementSibling !== row) tbody.insertBefore(row, sib);
        break;
      } else if (sib === siblings[siblings.length - 1]) {
        if (sib.nextElementSibling !== row) tbody.insertBefore(row, sib.nextElementSibling);
        break;
      }
    }
  };

  const onUp = ev => {
    if (ev.pointerId !== pointerId) return;
    handle.releasePointerCapture(pointerId);
    row.classList.remove("det-dragging");
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onUp);
    _dragState = null;
    _markDetailsDirty();
  };

  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onUp);
}

function addDetailsRow(field) {
  field = field || {};
  const tbody = document.getElementById("details-editor-rows");
  if (!tbody) return;

  const row = document.createElement("div");
  row.className = "details-editor-row";
  row.style.cssText = "display:grid;grid-template-columns:20px 160px 1fr 28px;gap:0.3rem;align-items:start;padding:0.45rem 0.9rem;border-bottom:1px solid var(--border);";
  row.innerHTML = `
    <span class="det-drag-handle" title="Drag to reorder"
      style="cursor:grab;color:var(--ink-light);font-size:1rem;line-height:1;padding-top:6px;user-select:none;touch-action:none;">⠿</span>
    <input type="text"  class="det-label" placeholder="Field name"  value="${escHtml(field.label || "")}"
      style="font-family:'DM Sans',sans-serif;font-size:0.8rem;padding:0.3rem 0.5rem;border:1px solid var(--border);border-radius:4px;background:var(--card);color:var(--ink);width:100%;box-sizing:border-box;outline:none;" />
    <textarea class="det-value" rows="2" placeholder="Value…"
      style="font-family:'DM Sans',sans-serif;font-size:0.8rem;padding:0.3rem 0.5rem;border:1px solid var(--border);border-radius:4px;background:var(--card);color:var(--ink);width:100%;box-sizing:border-box;resize:vertical;outline:none;min-height:42px;">${escHtml(field.value || "")}</textarea>
    <button type="button" class="rm-details-row" title="Remove"
      style="background:none;border:none;color:var(--ink-light);cursor:pointer;font-size:0.85rem;padding:0.25rem 0.3rem;border-radius:3px;transition:color 0.15s;margin-top:2px;">✕</button>
    <input type="hidden" class="det-key" value="${escHtml(field.key || "")}" />
  `;

  const handle = row.querySelector(".det-drag-handle");
  handle.addEventListener("pointerdown", e => {
    e.preventDefault();
    startRowDrag(handle, row, tbody, e.pointerId);
  });

  // Mark dirty on any input change
  row.querySelector(".det-label").addEventListener("input", _markDetailsDirty);
  row.querySelector(".det-value").addEventListener("input", _markDetailsDirty);

  row.querySelector(".rm-details-row").addEventListener("click", () => {
    const keyInp = row.querySelector(".det-key");
    if (keyInp?.value) {
      const chip = document.querySelector(`.details-preset-chip[data-key="${keyInp.value}"]`);
      if (chip) { chip.classList.remove("chip-added"); chip.disabled = false; }
    }
    row.remove();
    _markDetailsDirty();
  });
  row.querySelector(".rm-details-row").addEventListener("mouseover", function() { this.style.color = "#a05050"; });
  row.querySelector(".rm-details-row").addEventListener("mouseout",  function() { this.style.color = ""; });
  tbody.appendChild(row);
}

function closeDetailsEditor(force) {
  if (!force) {
    const msg = _detailsDirty
      ? "You have unsaved changes. Discard them and close?"
      : "Close the details editor? Any unsaved changes will be lost.";
    if (!confirm(msg)) return;
  }
  document.getElementById("details-editor-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
  detailsEditingCharId = null;
  _detailsDirty = false;
}

async function handleDetailsFormSubmit(e) {
  e.preventDefault();
  if (!detailsEditingCharId) return;

  const rows = Array.from(document.querySelectorAll("#details-editor-rows .details-editor-row"));
  const details = rows.map(row => ({
    key:   (row.querySelector(".det-key")?.value   || "").trim() || null,
    label: (row.querySelector(".det-label")?.value || "").trim(),
    value: (row.querySelector(".det-value")?.value || "").trim(),
  })).filter(d => d.label && d.value);

  const characters = getCharacters();
  const idx = characters.findIndex(c => c.id === detailsEditingCharId);
  if (idx !== -1) {
    characters[idx].details   = details;
    // Nicknames now live only in Details (any existing one was loaded into the editor as a row)
    characters[idx].nicknames = "";
    characters[idx].updatedAt = new Date().toISOString();
  }

  _detailsDirty = false;
  closeDetailsEditor(true);

  const character = characters[idx];
  renderDetails(details, character, detailsEditingCharId);
  await saveCharacters(characters);
}

// ══════════════════════════════════════════════════════════════════════
// FAMILY TREE
// ══════════════════════════════════════════════════════════════════════

const T = {
  NODE_R:    38,   // slightly larger circles give more room for initials
  GAP_H:     80,   // extra horizontal gap so wider labels don't collide
  ROW_H:    130,   // extra vertical gap for 3-line labels
  CANVAS_W: 1000,  // wider canvas for trees with many members
  LABEL_W:  110,   // max px width for text wrap
  LABEL_MAX: 22,   // chars before we start wrapping label
};

function getTreeMap(character) {
  const raw = character.treeData || {};
  const map = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      map[k] = {
        parents:  Array.isArray(v.parents)  ? v.parents  : [],
        partners: Array.isArray(v.partners) ? v.partners : [],
        children: Array.isArray(v.children) ? v.children : [],
      };
    }
  }
  return map;
}

async function saveTreeMap(charId, map) {
  const chars = getCharacters();
  const idx   = chars.findIndex(c => c.id === charId);
  if (idx === -1) return;
  chars[idx].treeData = map;
  await saveCharacters(chars);
}

let _treeCharId   = null;
let _treeEditMode = false;

function renderTree(charId) {
  _treeCharId = charId;
  const panel = document.getElementById("panel-tree");
  if (!panel) return;

  panel.innerHTML = `
    <div class="tree-root" id="tree-root">
      <div class="tree-topbar">
        <label class="tree-edit-label-wrap">
          <span class="tree-edit-label">Edit mode</span>
          <label class="tree-toggle-track">
            <input type="checkbox" id="tree-edit-toggle">
            <span class="tree-toggle-thumb"></span>
          </label>
        </label>
        <span class="tree-edit-hint" id="tree-edit-hint">Click any node to edit its connections</span>
      </div>
      <div class="tree-body" id="tree-body">
        <div class="tree-sidebar-wrap" id="tree-sidebar-wrap">
          <!-- sidebar content injected here -->
        </div>
        <div class="tree-canvas-wrap" id="tree-canvas-wrap">
          <svg id="tree-svg" class="tree-svg" xmlns="http://www.w3.org/2000/svg" width="100%"></svg>
        </div>
      </div>
    </div>
  `;

  _treeEditMode = false;
  showTreeDefaultSidebar(charId);
  redrawTree(charId);

  document.getElementById("tree-edit-toggle").addEventListener("change", function() {
    _treeEditMode = this.checked;
    const hint = document.getElementById("tree-edit-hint");
    if (hint) hint.style.opacity = _treeEditMode ? "1" : "0";
    if (!_treeEditMode) showTreeDefaultSidebar(charId);
    redrawTree(charId);
  });
}

// FIX 4: helper — remove a node entirely from the map if it becomes empty
// and scrub all references to it from other nodes
function pruneTreeMap(map, focalKey) {
  // Remove entries that are completely empty (no parents, partners, children)
  // but are NOT the focal character
  let changed = true;
  while (changed) {
    changed = false;
    for (const [k, nd] of Object.entries(map)) {
      if (k === focalKey) continue;
      if (!nd.parents.length && !nd.partners.length && !nd.children.length) {
        delete map[k];
        changed = true;
        // Also scrub references from remaining nodes
        for (const nd2 of Object.values(map)) {
          nd2.parents  = nd2.parents.filter(n => n !== k);
          nd2.partners = nd2.partners.filter(n => n !== k);
          nd2.children = nd2.children.filter(n => n !== k);
        }
      }
    }
  }
}

function showTreeDefaultSidebar(charId) {
  const wrap = document.getElementById("tree-sidebar-wrap");
  if (!wrap) return;
  const chars     = getCharacters();
  const character = chars.find(c => c.id === charId);
  if (!character) return;
  const map      = getTreeMap(character);
  const focalKey = character.name;

  const relMap = {};
  (character.relationships || []).forEach(r => {
    if (r.name) relMap[r.name.toLowerCase().trim()] = r.type || "";
  });

  const focalData = map[focalKey] || { parents: [], partners: [], children: [] };

  const treeRoles = {};

  function assignRole(names, role) {
    (names || []).forEach(n => {
      // FIX 4: only list names that actually exist as keys in the map
      if (n !== focalKey && !treeRoles[n] && map[n]) treeRoles[n] = role;
    });
  }

  assignRole(focalData.parents,  "Parent");
  assignRole(focalData.partners, "Partner");
  assignRole(focalData.children, "Child");

  Object.entries(map).forEach(([nodeName, nd]) => {
    if (nodeName === focalKey) return;
    if (!map[nodeName]) return; // FIX 4: skip pruned nodes

    if ((nd.parents || []).some(p => (focalData.parents || []).includes(p))) {
      if (!treeRoles[nodeName]) treeRoles[nodeName] = "Sibling";
    }

    (focalData.parents || []).forEach(parent => {
      const parentData = map[parent];
      if (!parentData) return;
      if ((parentData.parents || []).includes(nodeName) && !treeRoles[nodeName]) {
        treeRoles[nodeName] = "Grandparent";
      }
    });

    (focalData.children || []).forEach(child => {
      const childData = map[child];
      if (!childData) return;
      if ((childData.children || []).includes(nodeName) && !treeRoles[nodeName]) {
        treeRoles[nodeName] = "Grandchild";
      }
    });

    if (!treeRoles[nodeName] && map[nodeName]) treeRoles[nodeName] = "Family";
  });

  const entries = Object.entries(treeRoles);

  if (!entries.length) {
    wrap.innerHTML = `
      <div class="tree-sidebar">
        <p class="tree-sb-title">Family Tree</p>
        <p class="tree-sb-empty">No one on the tree yet.<br>Turn on Edit mode and click the focal node to start.</p>
      </div>`;
    return;
  }

  const roleOrder = ["Parent", "Grandparent", "Partner", "Sibling", "Child", "Grandchild", "Family"];
  entries.sort((a, b) => {
    const ai = roleOrder.indexOf(a[1]);
    const bi = roleOrder.indexOf(b[1]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a[0].localeCompare(b[0]);
  });

  const rows = entries.map(([name, treeRole]) => {
    const relType = relMap[name.toLowerCase().trim()];
    const otherChar = chars.find(c =>
      c.id !== charId &&
      (c.name || "").toLowerCase().trim() === name.toLowerCase().trim()
    );
    const img  = otherChar ? (otherChar.titleImage || otherChar.refImage || "") : "";
    const href = otherChar ? `character.html?id=${escHtml(otherChar.id)}` : "";

    const avatarHtml = img
      ? `<img src="${escHtml(img)}" class="tree-sb-avatar" alt="" />`
      : `<div class="tree-sb-avatar tree-sb-avatar-placeholder">${escHtml((name[0] || "?").toUpperCase())}</div>`;

    const nameHtml = href
      ? `<a href="${escHtml(href)}" class="tree-sb-name tree-sb-name-link">${escHtml(name)}</a>`
      : `<span class="tree-sb-name">${escHtml(name)}</span>`;

    const roleClass = {
      Parent:      "tree-sb-role--parent",
      Grandparent: "tree-sb-role--parent",
      Partner:     "tree-sb-role--partner",
      Child:       "tree-sb-role--child",
      Grandchild:  "tree-sb-role--child",
      Sibling:     "tree-sb-role--sibling",
      Family:      "tree-sb-role--sibling",
    }[treeRole] || "tree-sb-role--sibling";

    return `
      <div class="tree-sb-member">
        ${avatarHtml}
        <div class="tree-sb-member-info">
          <div class="tree-sb-name-row">${nameHtml}</div>
          <div class="tree-sb-meta-row">
            <span class="tree-sb-role ${roleClass}">${escHtml(treeRole)}</span>
            ${relType
              ? `<span class="tree-sb-reltype">${escHtml(relType)}</span>`
              : `<button class="tree-sb-add-rel" data-name="${escHtml(name)}" title="Add relationship type">+ add rel. type</button>`
            }
          </div>
        </div>
      </div>`;
  }).join("");

  wrap.innerHTML = `
    <div class="tree-sidebar">
      <p class="tree-sb-title">Family Tree</p>
      <div class="tree-sb-members">${rows}</div>
    </div>`;

  wrap.querySelectorAll(".tree-sb-add-rel").forEach(btn => {
    btn.addEventListener("click", () => {
      openRelationshipEditor(charId);
      setTimeout(() => {
        const name = btn.dataset.name;
        const rows = document.querySelectorAll("#rel-editor-rows .rel-editor-row");
        let found = false;
        rows.forEach(tr => {
          const inp = tr.querySelector(".rel-r-name");
          if (inp && inp.value.trim().toLowerCase() === name.toLowerCase()) found = true;
        });
        if (!found) {
          addRelRow({ name });
          const tbody = document.getElementById("rel-editor-rows");
          if (tbody) tbody.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 80);
    });
  });
}

function showNodeEditSidebar(charId, nodeName) {
  const wrap = document.getElementById("tree-sidebar-wrap");
  if (!wrap) return;
  const chars     = getCharacters();
  const character = chars.find(c => c.id === charId);
  if (!character) return;
  const map      = getTreeMap(character);
  const nodeData = map[nodeName] || { parents: [], partners: [], children: [] };

  // Build suggestions from: (1) names already in the tree map, (2) relationship names —
  // but exclude names that were removed/pruned from the map so stale entries don't reappear.
  const mapNames = Object.keys(map).filter(n => n !== nodeName);
  const relNames = (character.relationships || []).map(r => r.name).filter(Boolean);
  const suggestions = [...new Set([...mapNames, ...relNames])].filter(Boolean);

  function roleSection(roleKey, label, colorClass) {
    const members = nodeData[roleKey] || [];
    const pills   = members.map(name => `
      <span class="tree-pill">
        ${escHtml(name)}
        <button class="tree-pill-rm" data-role="${roleKey}" data-name="${escHtml(name)}" title="Remove">✕</button>
      </span>`).join("");

    return `
      <div class="tree-sb-section">
        <p class="tree-sb-role ${colorClass}">${label}</p>
        <div class="tree-pills" id="pills-${roleKey}">${pills || '<span class="tree-pill-empty">None</span>'}</div>
        <div class="tree-add-row">
          <input type="text" class="tree-add-input" id="add-input-${roleKey}"
            placeholder="Add name…" list="tree-suggestions-${roleKey}" autocomplete="off"/>
          <datalist id="tree-suggestions-${roleKey}">
            ${suggestions.map(s => `<option value="${escHtml(s)}">`).join("")}
          </datalist>
          <button class="tree-add-btn" data-role="${roleKey}">+</button>
        </div>
      </div>`;
  }

  const isNodeOnTree = !!map[nodeName];
  const isFocal = nodeName === character.name;

  wrap.innerHTML = `
    <div class="tree-sidebar tree-sidebar--edit">
      <div class="tree-sb-header">
        <span class="tree-sb-node-name">${escHtml(nodeName)}</span>
        <button class="tree-sb-back" id="tree-sb-back" title="Back">←</button>
      </div>
      ${roleSection("parents",  "Parents",  "tree-sb-role--parent")}
      ${roleSection("partners", "Partners", "tree-sb-role--partner")}
      ${roleSection("children", "Children", "tree-sb-role--child")}
      ${!isFocal && !isNodeOnTree ? `<p class="tree-sb-hint" style="margin-top:.5rem">This node isn't on the tree yet. Add connections above to place it.</p>` : ""}
    </div>
  `;

  document.getElementById("tree-sb-back").addEventListener("click", () => {
    showTreeDefaultSidebar(charId);
  });

  wrap.querySelectorAll(".tree-pill-rm").forEach(btn => {
    btn.addEventListener("click", async () => {
      const role = btn.dataset.role;
      const name = btn.dataset.name;
      const chars2   = getCharacters();
      const char2    = chars2.find(c => c.id === charId);
      const map2     = getTreeMap(char2);
      if (!map2[nodeName]) return;
      map2[nodeName][role] = map2[nodeName][role].filter(n => n !== name);

      // FIX 4: also remove the reverse reference
      if (map2[name]) {
        if (role === "parents")  map2[name].children = map2[name].children.filter(n => n !== nodeName);
        if (role === "children") map2[name].parents  = map2[name].parents.filter(n => n !== nodeName);
        if (role === "partners") map2[name].partners = map2[name].partners.filter(n => n !== nodeName);
      }

      // FIX 4: prune empty non-focal nodes
      pruneTreeMap(map2, char2.name);

      await saveTreeMap(charId, map2);
      showNodeEditSidebar(charId, nodeName);
      redrawTree(charId);
    });
  });

  wrap.querySelectorAll(".tree-add-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const role  = btn.dataset.role;
      const input = document.getElementById(`add-input-${role}`);
      const name  = (input?.value || "").trim();
      if (!name) return;
      const chars2 = getCharacters();
      const char2  = chars2.find(c => c.id === charId);
      const map2   = getTreeMap(char2);
      if (!map2[nodeName]) map2[nodeName] = { parents: [], partners: [], children: [] };
      if (!map2[nodeName][role].includes(name)) {
        map2[nodeName][role].push(name);
      }
      // Add reverse reference so the other node also appears in the map
      if (!map2[name]) map2[name] = { parents: [], partners: [], children: [] };
      if (role === "parents"  && !map2[name].children.includes(nodeName)) map2[name].children.push(nodeName);
      if (role === "children" && !map2[name].parents.includes(nodeName))  map2[name].parents.push(nodeName);
      if (role === "partners" && !map2[name].partners.includes(nodeName)) map2[name].partners.push(nodeName);

      await saveTreeMap(charId, map2);
      if (input) input.value = "";
      showNodeEditSidebar(charId, nodeName);
      redrawTree(charId);
    });
  });

  ["parents","partners","children"].forEach(role => {
    document.getElementById(`add-input-${role}`)?.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        wrap.querySelector(`.tree-add-btn[data-role="${role}"]`)?.click();
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// TREE LAYOUT + SVG DRAWING
// ══════════════════════════════════════════════════════════════════════

// Wrap a name into ≤3 SVG <tspan> lines, breaking at spaces where possible
function wrapTreeLabel(name, maxChars) {
  if (name.length <= maxChars) return [name];

  // Helper: find best space-break index near the midpoint of a string
  function bestBreak(str) {
    const mid = Math.floor(str.length / 2);
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === " ") {
        const d = Math.abs(i - mid);
        if (d < bestDist) { bestDist = d; best = i; }
      }
    }
    return best;
  }

  const b1 = bestBreak(name);
  if (b1 === -1) {
    // No spaces at all — hard-break into two chunks
    return [name.slice(0, maxChars - 1) + "–", name.slice(maxChars - 1)];
  }

  const line1 = name.slice(0, b1);
  const rest  = name.slice(b1 + 1);

  if (rest.length <= maxChars) return [line1, rest];

  // Rest is still long — split it once more
  const b2 = bestBreak(rest);
  if (b2 === -1) {
    return [line1, rest.slice(0, maxChars - 1) + "–", rest.slice(maxChars - 1)];
  }
  return [line1, rest.slice(0, b2), rest.slice(b2 + 1)];
}

function redrawTree(charId) {
  const svg = document.getElementById("tree-svg");
  if (!svg) return;
  const chars     = getCharacters();
  const character = chars.find(c => c.id === charId);
  if (!character) return;

  const map      = getTreeMap(character);
  const focalKey = character.name;

  const placed   = new Map();
  const rowSlots = new Map();

  function ensureRow(row) {
    if (!rowSlots.has(row)) rowSlots.set(row, []);
  }

  function placeNode(name, row) {
    if (placed.has(name)) return;
    // FIX 4: only place nodes that actually exist in the map (except focal)
    if (name !== focalKey && !map[name]) return;
    ensureRow(row);
    rowSlots.get(row).push(name);
    placed.set(name, { row });
  }

  placeNode(focalKey, 0);

  const queue   = [{ name: focalKey, row: 0 }];
  const visited = new Set([focalKey]);

  while (queue.length) {
    const { name, row } = queue.shift();
    const nd = map[name];
    if (!nd) continue;

    (nd.parents || []).forEach(p => {
      if (!visited.has(p) && map[p]) {
        visited.add(p);
        placeNode(p, row - 1);
        queue.push({ name: p, row: row - 1 });
      }
    });

    (nd.children || []).forEach(c => {
      if (!visited.has(c) && map[c]) {
        visited.add(c);
        placeNode(c, row + 1);
        queue.push({ name: c, row: row + 1 });
      }
    });

    (nd.partners || []).forEach(p => {
      if (!visited.has(p) && map[p]) {
        visited.add(p);
        placeNode(p, row);
      }
    });
  }

  const nodePos = new Map();
  const rowNums = Array.from(rowSlots.keys()).sort((a,b) => a-b);
  const minRow  = rowNums[0] ?? 0;
  const maxRow  = rowNums[rowNums.length - 1] ?? 0;

  const STEP  = T.NODE_R * 2 + T.GAP_H;
  const CX    = T.CANVAS_W / 2;
  const Y_TOP = 60;

  rowNums.forEach(row => {
    const names  = rowSlots.get(row);
    const count  = names.length;
    const totalW = (count - 1) * STEP;
    const startX = CX - totalW / 2;
    const y      = Y_TOP + (row - minRow) * T.ROW_H;
    names.forEach((name, i) => {
      nodePos.set(name, { x: startX + i * STEP, y });
    });
  });

  const LABEL_LINE_H = 15;
  // Allow up to 3 label lines below each node
  const svgH = Y_TOP + (maxRow - minRow) * T.ROW_H + T.NODE_R * 2 + LABEL_LINE_H * 3 + 50;

  let clipIdN = 0;
  const mkCid = () => `tc${++clipIdN}_${Date.now()}`;

  let defs   = `<defs>`;
  let conns  = ``;
  let nodes_ = ``;

  function getImg(name) {
    const m = chars.find(c => (c.name||"").toLowerCase().trim() === (name||"").toLowerCase().trim());
    return m ? (m.titleImage || m.refImage || "") : "";
  }

  function getHref(name) {
    const m = chars.find(c =>
      c.id !== charId &&
      (c.name||"").toLowerCase().trim() === (name||"").toLowerCase().trim()
    );
    return m ? `character.html?id=${m.id}` : "";
  }

  function drawNode(name, x, y, isFocal) {
    const r      = isFocal ? T.NODE_R + 4 : T.NODE_R;
    const cid    = mkCid();
    const img    = getImg(name);
    const href   = getHref(name);
    const init   = (name[0] || "?").toUpperCase();

    // FIX 5: wrap label into up to 2 lines
    const lines  = wrapTreeLabel(name, T.LABEL_MAX);

    defs += `<clipPath id="${cid}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath>`;

    const imgEl = img
      ? `<image href="${escHtml(img)}" x="${x-r}" y="${y-r}" width="${r*2}" height="${r*2}" clip-path="url(#${cid})" preserveAspectRatio="xMidYMid slice"/>`
      : `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central"
           font-family="Cormorant Garamond,serif" font-size="${Math.round(r*0.85)}"
           fill="var(--ink-light)">${escHtml(init)}</text>`;

    const ring     = isFocal ? `stroke="var(--ink)" stroke-width="2.5"` : `stroke="var(--border)" stroke-width="1.5"`;
    const cursor   = _treeEditMode ? `style="cursor:pointer"` : (href ? `style="cursor:pointer"` : "");
    const dataEdit = _treeEditMode ? `data-editnode="${escHtml(name)}"` : "";
    const dataHref = (!_treeEditMode && href) ? `data-href="${escHtml(href)}"` : "";

    const badge = _treeEditMode ? `
      <circle cx="${x+r-4}" cy="${y-r+4}" r="10" fill="var(--card)" stroke="var(--border)" stroke-width="1"/>
      <text x="${x+r-4}" y="${y-r+4}" text-anchor="middle" dominant-baseline="central"
        font-family="DM Sans,sans-serif" font-size="11" fill="var(--ink-mid)">✎</text>` : "";

    // FIX 5: multi-line label using <tspan>
    const labelY   = y + r + 16;
    const tspans   = lines.map((line, i) =>
      `<tspan x="${x}" dy="${i === 0 ? 0 : LABEL_LINE_H}">${escHtml(line)}</tspan>`
    ).join("");
    const labelEl  = `<text x="${x}" y="${labelY}" text-anchor="middle"
        font-family="DM Sans,sans-serif" font-size="12" font-weight="${isFocal ? '600' : '400'}"
        fill="${isFocal ? 'var(--ink)' : 'var(--ink-mid)'}">${tspans}</text>`;

    return `
      <g class="tree-node" ${cursor} ${dataEdit} ${dataHref}>
        <circle cx="${x}" cy="${y}" r="${r}" fill="var(--card)" ${ring}/>
        ${imgEl}
        ${badge}
        ${labelEl}
      </g>`;
  }

  function drawConn(x1, y1, x2, y2, type) {
    if (type === "partner") {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      return `
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="tree-conn tree-conn-partner"/>
        <text x="${mx}" y="${my - 7}" text-anchor="middle" font-size="13"
          font-family="serif" fill="var(--ink-light)">♥</text>`;
    }
    const midy = (y1 + y2) / 2;
    return `<path d="M${x1} ${y1} C${x1} ${midy},${x2} ${midy},${x2} ${y2}"
      fill="none" class="tree-conn"/>`;
  }

  const drawnConns    = new Set();
  const drawnParentBus = new Set(); // track T-bars already drawn for a parent group
  function connKey(a, b) { return [a,b].sort().join("|||"); }

  // Build a lookup: parentName → [childNames that are actually placed]
  const parentToChildren = new Map();
  placed.forEach((_, name) => {
    const nd = map[name];
    if (!nd) return;
    (nd.children || []).forEach(cname => {
      if (!nodePos.get(cname)) return;
      if (!parentToChildren.has(name)) parentToChildren.set(name, []);
      if (!parentToChildren.get(name).includes(cname)) parentToChildren.get(name).push(cname);
    });
  });

  // Draw partner lines first
  placed.forEach((_, name) => {
    const nd  = map[name];
    const pos = nodePos.get(name);
    if (!nd || !pos) return;
    (nd.partners || []).forEach(pname => {
      const ppos = nodePos.get(pname);
      if (!ppos) return;
      const k = connKey(name, pname);
      if (drawnConns.has(k)) return;
      drawnConns.add(k);
      const lx = Math.min(pos.x, ppos.x) + T.NODE_R;
      const rx = Math.max(pos.x, ppos.x) - T.NODE_R;
      conns += drawConn(lx, pos.y, rx, pos.y, "partner");
    });
  });

  // Draw parent→children connections using T-bar routing when >1 child
  parentToChildren.forEach((children, parentName) => {
    const ppos = nodePos.get(parentName);
    if (!ppos) return;

    // Collect the co-parents of this set of children so we can find
    // the midpoint between all parents on the same row (for the bar origin)
    const coParents = new Set([parentName]);
    children.forEach(cname => {
      const cnd = map[cname];
      if (!cnd) return;
      (cnd.parents || []).forEach(p => { if (nodePos.get(p)) coParents.add(p); });
    });

    // X origin of the vertical drop: midpoint of all co-parents
    const coParentXs = Array.from(coParents).map(p => nodePos.get(p)?.x).filter(x => x != null);
    const originX    = coParentXs.reduce((s, x) => s + x, 0) / coParentXs.length;
    const originY    = ppos.y + T.NODE_R;

    // Midpoint Y between parent row and child row
    const anyChildPos = nodePos.get(children[0]);
    if (!anyChildPos) return;
    const busY = (originY + (anyChildPos.y - T.NODE_R)) / 2;

    // Avoid duplicating the same bus for co-parent groups
    const busKey = [...coParents].sort().join("|||") + "|||" + children.sort().join("|||");

    if (children.length === 1) {
      // Single child — simple bezier, no bus needed
      const cpos = nodePos.get(children[0]);
      if (!cpos) return;
      const k = connKey(parentName, children[0]);
      if (!drawnConns.has(k)) {
        drawnConns.add(k);
        conns += drawConn(ppos.x, ppos.y + T.NODE_R, cpos.x, cpos.y - T.NODE_R, "parent");
      }
    } else {
      // Multiple children — T-bar
      if (!drawnParentBus.has(busKey)) {
        drawnParentBus.add(busKey);

        // Vertical from each co-parent down to bus
        coParents.forEach(p => {
          const pp = nodePos.get(p);
          if (!pp) return;
          conns += `<line x1="${pp.x}" y1="${pp.y + T.NODE_R}" x2="${pp.x}" y2="${busY}" class="tree-conn"/>`;
        });

        // Horizontal bus merging co-parents to a single origin if >1 co-parent
        if (coParents.size > 1) {
          const minCPX = Math.min(...coParentXs);
          const maxCPX = Math.max(...coParentXs);
          conns += `<line x1="${minCPX}" y1="${busY}" x2="${maxCPX}" y2="${busY}" class="tree-conn"/>`;
        }

        // Horizontal bus spanning all children
        const childXs = children.map(c => nodePos.get(c)?.x).filter(x => x != null);
        const minX    = Math.min(...childXs, originX);
        const maxX    = Math.max(...childXs, originX);
        conns += `<line x1="${minX}" y1="${busY}" x2="${maxX}" y2="${busY}" class="tree-conn"/>`;

        // Vertical from bus origin down to bus (only if single parent and not already drawn)
        if (coParents.size === 1) {
          conns += `<line x1="${originX}" y1="${ppos.y + T.NODE_R}" x2="${originX}" y2="${busY}" class="tree-conn"/>`;
        }
      }

      // Vertical from bus down to each child
      children.forEach(cname => {
        const cpos = nodePos.get(cname);
        if (!cpos) return;
        const k = connKey(parentName, cname);
        if (!drawnConns.has(k)) {
          drawnConns.add(k);
          conns += `<line x1="${cpos.x}" y1="${busY}" x2="${cpos.x}" y2="${cpos.y - T.NODE_R}" class="tree-conn"/>`;
        }
      });
    }
  });

  placed.forEach((_, name) => {
    const pos = nodePos.get(name);
    if (!pos) return;
    if (name !== focalKey) {
      nodes_ += drawNode(name, pos.x, pos.y, false);
    }
  });
  const fpos = nodePos.get(focalKey);
  if (fpos) nodes_ += drawNode(focalKey, fpos.x, fpos.y, true);

  defs += `</defs>`;

  const hasContent = placed.size > 1;
  const emptyHint  = !hasContent ? `
    <text x="${CX}" y="${Y_TOP + T.NODE_R + 44}" text-anchor="middle"
      font-family="DM Sans,sans-serif" font-size="13" fill="var(--ink-light)">
      Turn on Edit mode and click this node to add family members
    </text>` : "";

  svg.setAttribute("viewBox", `0 0 ${T.CANVAS_W} ${svgH}`);
  svg.innerHTML = defs + conns + nodes_ + emptyHint;

  svg.querySelectorAll("[data-href]").forEach(el => {
    el.addEventListener("click", () => window.location.href = el.getAttribute("data-href"));
  });

  if (_treeEditMode) {
    svg.querySelectorAll("[data-editnode]").forEach(el => {
      el.addEventListener("click", () => {
        const name = el.getAttribute("data-editnode");
        showNodeEditSidebar(_treeCharId, name);
      });
    });
  }
}

// ══════════════════════════════════════════════════════════════════════
// SHARED: sentence boundary + expand/collapse
// ══════════════════════════════════════════════════════════════════════

function findSentenceBoundary(text, limit) {
  const sentenceEnd = /[.!?]/;
  for (let i = Math.min(limit, text.length - 1); i >= limit * 0.5; i--) {
    if (sentenceEnd.test(text[i])) {
      const rest = text.slice(i + 1).trimStart();
      if (!rest || /^[A-Z"'«\u2018\u201C]/.test(rest) || rest[0] === "\n") {
        return i + 1;
      }
    }
  }
  let cut = limit;
  while (cut < text.length && text[cut] !== " " && text[cut] !== "\n") cut++;
  return cut;
}

function wireExpandable(block) {
  const ellipsis = block.querySelector(".ex-ellipsis");
  const readmore = block.querySelector(".ex-readmore");
  const hidden   = block.querySelector(".ex-hidden");
  const collapse = block.querySelector(".ex-collapse");
  hidden.style.display   = "none";
  collapse.style.display = "none";
  block.querySelectorAll(".expandable-link").forEach(link => {
    link.addEventListener("click", () => {
      const isExpanded = hidden.style.display !== "none";
      if (!isExpanded) {
        hidden.style.display   = "inline";
        collapse.style.display = "inline";
        ellipsis.style.display = "none";
        readmore.style.display = "none";
      } else {
        hidden.style.display   = "none";
        collapse.style.display = "none";
        ellipsis.style.display = "inline";
        readmore.style.display = "inline";
        block.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// RELATIONSHIPS
// ══════════════════════════════════════════════════════════════════════

const REL_TRUNCATE = 1000;

function renderRelationships(relationships, currentId) {
  const panel = document.getElementById("panel-relationships");
  if (!panel) return;

  if (!relationships || !relationships.length) {
    panel.innerHTML = `
      <p class="rel-empty">No relationships added yet.
        <button class="rel-empty-add-btn" onclick="document.getElementById('edit-relationships-btn').click()">Add some</button>
      </p>`;
    return;
  }

  const allChars = getCharacters();
  const cards = relationships.map(rel => {
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
      const cutoff  = findSentenceBoundary(desc, REL_TRUNCATE);
      const visible = desc.slice(0, cutoff).trimEnd();
      const rest    = desc.slice(cutoff).trimStart();
      descHtml = `
        <div class="ex-block rel-desc char-formatted">
          <span class="ex-visible">${escHtml(visible)}</span><!--
          --><span class="ex-ellipsis"> …</span><!--
          --> <span class="ex-readmore"><span class="expandable-link" data-action="expand">read more</span></span>
          <span class="ex-hidden">${escHtml(rest)}</span><!--
          --> <span class="ex-collapse"><span class="expandable-link" data-action="collapse">collapse</span></span>
        </div>`;
    }
    const avatarHtml = match && (match.titleImage || match.refImage)
      ? `<img src="${escHtml(match.titleImage || match.refImage)}" class="rel-avatar" alt="" />`
      : `<div class="rel-avatar rel-avatar-placeholder">${escHtml((rel.name?.[0] || "?").toUpperCase())}</div>`;
    return `
      <div class="rel-card">
        <div class="rel-card-header">
          ${avatarHtml}
          <div class="rel-card-meta">
            <div class="rel-name-row">${nameHtml}${canonLabel}</div>
            ${rel.type ? `<span class="rel-type">${escHtml(rel.type)}</span>` : ""}
          </div>
        </div>
        ${descHtml}
      </div>`;
  }).join("");

  panel.innerHTML = `<div class="rel-grid">${cards}</div>`;
  panel.querySelectorAll(".ex-block").forEach(block => wireExpandable(block));
}

// ══════════════════════════════════════════════════════════════════════
// RELATIONSHIP EDITOR MODAL
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
        <option value=""         ${!rel.canon                   ? "selected" : ""}>—</option>
        <option value="canon"    ${rel.canon === "canon"        ? "selected" : ""}>Canon character</option>
        <option value="noncanon" ${rel.canon === "noncanon"     ? "selected" : ""}>OC</option>
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
  renderRelationships(relationships, relEditingCharId);
  await saveCharacters(characters);
}

// ══════════════════════════════════════════════════════════════════════
// BACKGROUND / HISTORY
// ══════════════════════════════════════════════════════════════════════

const TRUNCATE_CHARS = 2000;

function renderBackgroundHistory(background, history) {
  const container = document.getElementById("char-bg-history-container");
  if (!container) return;
  let fullText = background || "";
  if (history && !fullText.includes(history)) {
    fullText = [fullText, history].filter(Boolean).join("\n\n");
  }
  if (!fullText) { container.innerHTML = ""; return; }
  if (fullText.length <= TRUNCATE_CHARS) {
    container.innerHTML = `<p class="char-body char-formatted">${escHtml(fullText)}</p>`;
    return;
  }
  const cutoff  = findSentenceBoundary(fullText, TRUNCATE_CHARS);
  const visible = fullText.slice(0, cutoff).trimEnd();
  const rest    = fullText.slice(cutoff).trimStart();
  container.innerHTML = `
    <div class="ex-block char-body char-formatted">
      <span class="ex-visible">${escHtml(visible)}</span><!--
      --><span class="ex-ellipsis"> …</span><!--
      --> <span class="ex-readmore"><span class="expandable-link" data-action="expand">click here to read more</span></span>
      <span class="ex-hidden">${escHtml(rest)}</span><!--
      --> <span class="ex-collapse"><span class="expandable-link" data-action="collapse">collapse</span></span>
    </div>
  `;
  container.querySelectorAll(".ex-block").forEach(block => wireExpandable(block));
}

// ══════════════════════════════════════════════════════════════════════
// OVERVIEW EDITOR MODAL
// ══════════════════════════════════════════════════════════════════════

let _overviewEditingCharId = null;

function openOverviewEditor(charId) {
  const overlay = document.getElementById("overview-editor-overlay");
  if (!overlay) return;
  _overviewEditingCharId = charId;
  const character = getCharacters().find(c => c.id === charId);
  const ovEl = document.getElementById("oef-overview");
  const bgEl = document.getElementById("oef-background");
  if (ovEl) ovEl.value = character?.overview  || "";
  if (bgEl) bgEl.value = character?.background || "";
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeOverviewEditor() {
  document.getElementById("overview-editor-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
  _overviewEditingCharId = null;
}

async function handleOverviewFormSubmit(e) {
  e.preventDefault();
  if (!_overviewEditingCharId) return;
  const overview   = (document.getElementById("oef-overview")?.value  || "").trim();
  const background = (document.getElementById("oef-background")?.value || "").trim();
  const characters = getCharacters();
  const idx = characters.findIndex(c => c.id === _overviewEditingCharId);
  if (idx !== -1) {
    characters[idx].overview   = overview;
    characters[idx].background = background;
    characters[idx].history    = "";
    characters[idx].updatedAt  = new Date().toISOString();
  }
  closeOverviewEditor();
  setFormattedText("char-overview", overview);
  renderBackgroundHistory(background, "");
  await saveCharacters(characters);
}

// ══════════════════════════════════════════════════════════════════════
// GALLERY EDITOR MODAL
// ══════════════════════════════════════════════════════════════════════

let _galleryEditingCharId = null;

function addGalleryEditorRow(item) {
  item = item || {};
  const tbody = document.getElementById("gallery-editor-rows");
  if (!tbody) return;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="g-src"        placeholder="Image URL"          value="${escHtml(item.src        || "")}" /></td>
    <td><input type="text" class="g-caption"    placeholder="Caption"            value="${escHtml(item.caption    || "")}" /></td>
    <td><input type="text" class="g-characters" placeholder="Names, comma-sep."  value="${escHtml(item.characters || "")}" /></td>
    <td><input type="text" class="g-year"       placeholder="Year" style="width:70px" value="${escHtml(item.year || "")}" /></td>
    <td><button type="button" class="rm-gallery-row">✕</button></td>
  `;
  tr.querySelector(".rm-gallery-row").addEventListener("click", () => tr.remove());
  tbody.appendChild(tr);
}

function openGalleryEditor(charId, addRow) {
  const overlay = document.getElementById("gallery-editor-overlay");
  if (!overlay) return;
  _galleryEditingCharId = charId;
  const character = getCharacters().find(c => c.id === charId);
  const tbody = document.getElementById("gallery-editor-rows");
  if (tbody) {
    tbody.innerHTML = "";
    (character?.gallery || []).forEach(item => addGalleryEditorRow(item));
    if (addRow) addGalleryEditorRow();
  }
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeGalleryEditor() {
  document.getElementById("gallery-editor-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
  _galleryEditingCharId = null;
}

async function handleGalleryFormSubmit(e) {
  e.preventDefault();
  if (!_galleryEditingCharId) return;
  const gallery = Array.from(document.querySelectorAll("#gallery-editor-rows tr")).map(tr => ({
    src:        (tr.querySelector(".g-src")?.value        || "").trim(),
    caption:    (tr.querySelector(".g-caption")?.value    || "").trim(),
    characters: (tr.querySelector(".g-characters")?.value || "").trim(),
    year:       (tr.querySelector(".g-year")?.value       || "").trim(),
  })).filter(g => g.src);
  const characters = getCharacters();
  const idx = characters.findIndex(c => c.id === _galleryEditingCharId);
  if (idx !== -1) {
    characters[idx].gallery   = gallery;
    characters[idx].updatedAt = new Date().toISOString();
  }
  closeGalleryEditor();
  renderGallery(gallery, _galleryEditingCharId);
  await saveCharacters(characters);
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

// ══════════════════════════════════════════════════════════════════════
// GALLERY
// ══════════════════════════════════════════════════════════════════════

function renderGallery(ownGallery, currentCharId) {
  const grid = document.querySelector("#gallery .gallery-grid");
  if (!grid) return;
  const allChars    = getCharacters();
  const currentChar = allChars.find(c => c.id === currentCharId);
  const currentName = (currentChar?.name || "").toLowerCase().trim();
  const taggedImages = [];
  allChars.forEach(c => {
    if (c.id === currentCharId) return;
    (c.gallery || []).forEach(item => {
      const tags = (item.characters || "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
      if (currentName && tags.includes(currentName)) {
        taggedImages.push({ ...item, _fromChar: c.name });
      }
    });
  });
  const combined = [...ownGallery, ...taggedImages];
  combined.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
  if (!combined.length) {
    grid.innerHTML = "<p style='padding:1rem;opacity:.5;font-style:italic'>No gallery images yet.</p>";
    return;
  }
  grid.innerHTML = combined.map(item => `
    <div class="gallery-item">
      <div class="gallery-img-wrap">
        <img src="${escHtml(item.src)}" alt="${escHtml(item.caption || '')}" loading="lazy" />
      </div>
      <div class="gallery-meta">
        <span class="gallery-caption">${escHtml(item.caption || "")}</span>
        <div class="gallery-meta-right">
          ${item._fromChar ? `<span class="gallery-shared-tag" title="Uploaded to ${escHtml(item._fromChar)}'s gallery">w/ ${escHtml(item._fromChar)}</span>` : ""}
          ${item.year ? `<span class="gallery-year">${escHtml(item.year)}</span>` : ""}
        </div>
      </div>
    </div>
  `).join("");
}

// ══════════════════════════════════════════════════════════════════════
// ART BY OTHERS
// ══════════════════════════════════════════════════════════════════════

function renderOtherArt(items) {
  const grid = document.getElementById("otherart-grid");
  if (!grid) return;
  const sorted = [...(items || [])].sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
  if (!sorted.length) {
    grid.innerHTML = "<p style='padding:1rem;opacity:.5;font-style:italic'>No art by others yet.</p>";
    return;
  }
  grid.innerHTML = sorted.map(item => `
    <div class="gallery-item">
      <div class="gallery-img-wrap">
        <img src="${escHtml(item.src)}" alt="${escHtml(item.caption || '')}" loading="lazy" />
      </div>
      <div class="gallery-meta">
        <div>
          <span class="gallery-caption">${escHtml(item.caption || "")}</span>
          ${item.artist ? `<div class="gallery-artist">Art by ${escHtml(item.artist)}</div>` : ""}
        </div>
        <div class="gallery-meta-right">
          ${item.year ? `<span class="gallery-year">${escHtml(item.year)}</span>` : ""}
        </div>
      </div>
    </div>
  `).join("");
}

let _otherArtEditingCharId = null;

function addOtherArtEditorRow(item) {
  item = item || {};
  const tbody = document.getElementById("otherart-editor-rows");
  if (!tbody) return;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="oa-src"     placeholder="Image URL" value="${escHtml(item.src     || "")}" /></td>
    <td><input type="text" class="oa-caption" placeholder="Caption"   value="${escHtml(item.caption || "")}" /></td>
    <td><input type="text" class="oa-artist"  placeholder="Artist"    value="${escHtml(item.artist  || "")}" /></td>
    <td><input type="text" class="oa-year"    placeholder="Year" style="width:70px" value="${escHtml(item.year || "")}" /></td>
    <td><button type="button" class="rm-gallery-row">✕</button></td>
  `;
  tr.querySelector(".rm-gallery-row").addEventListener("click", () => tr.remove());
  tbody.appendChild(tr);
}

function openOtherArtEditor(charId, addRow) {
  const overlay = document.getElementById("otherart-editor-overlay");
  if (!overlay) return;
  _otherArtEditingCharId = charId;
  const character = getCharacters().find(c => c.id === charId);
  const tbody = document.getElementById("otherart-editor-rows");
  if (tbody) {
    tbody.innerHTML = "";
    (character?.otherArt || []).forEach(item => addOtherArtEditorRow(item));
    if (addRow) addOtherArtEditorRow();
  }
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeOtherArtEditor() {
  document.getElementById("otherart-editor-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
  _otherArtEditingCharId = null;
}

async function handleOtherArtFormSubmit(e) {
  e.preventDefault();
  if (!_otherArtEditingCharId) return;
  const charId = _otherArtEditingCharId;
  const otherArt = Array.from(document.querySelectorAll("#otherart-editor-rows tr")).map(tr => ({
    src:     (tr.querySelector(".oa-src")?.value     || "").trim(),
    caption: (tr.querySelector(".oa-caption")?.value || "").trim(),
    artist:  (tr.querySelector(".oa-artist")?.value  || "").trim(),
    year:    (tr.querySelector(".oa-year")?.value    || "").trim(),
  })).filter(g => g.src);
  const characters = getCharacters();
  const idx = characters.findIndex(c => c.id === charId);
  if (idx !== -1) {
    characters[idx].otherArt  = otherArt;
    characters[idx].updatedAt = new Date().toISOString();
  }
  closeOtherArtEditor();
  renderOtherArt(otherArt);
  await saveCharacters(characters);
}

function openCharPageEditor(id) {
  openEditor(id);
}

// ══════════════════════════════════════════════════════════════════════
// INDEX PAGE
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

  document.getElementById("add-char-btn")?.addEventListener("click",    () => openEditor(null));
  document.getElementById("nav-add-btn")?.addEventListener("click",     () => openEditor(null));
  document.getElementById("nav-settings-btn")?.addEventListener("click", openSetup);
  document.getElementById("setup-close")?.addEventListener("click",  closeSetup);
  document.getElementById("setup-save")?.addEventListener("click",   handleSetupSave);
  document.getElementById("setup-clear")?.addEventListener("click",  handleSetupClear);
  document.getElementById("setup-overlay")?.addEventListener("click", e => { if (e.target.id === "setup-overlay") closeSetup(); });
  document.getElementById("sync-banner-btn")?.addEventListener("click", () => {
    document.getElementById("sync-banner").style.display = "none";
    openSetup();
  });
  document.getElementById("sync-banner-dismiss")?.addEventListener("click", () => {
    document.getElementById("sync-banner").style.display = "none";
    localStorage.setItem("oc_banner_dismissed", "1");
  });
  document.getElementById("search-input")?.addEventListener("input", e => {
    renderIndexSections(container, e.target.value.trim().toLowerCase());
  });

  if (editParam) {
    const url = new URL(window.location.href);
    url.searchParams.delete("edit");
    window.history.replaceState({}, "", url.toString());
    openEditor(editParam);
  }
}

// ══════════════════════════════════════════════════════════════════════
// CAROUSEL-STYLE INDEX SECTIONS
// ══════════════════════════════════════════════════════════════════════

function renderIndexSections(container, filter) {
  filter = filter || "";
  let characters = getCharacters();
  const totalBadge = document.getElementById("total-char-count");
  if (totalBadge) {
    const n = characters.length;
    totalBadge.textContent = `${n} character${n !== 1 ? "s" : ""}`;
  }
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

  let sections = [];

  if (!filter) {
    const recentlySorted = [...characters]
      .sort((a, b) => (b.updatedAt || b.id || "").localeCompare(a.updatedAt || a.id || ""))
      .slice(0, 10);
    sections.push({ title: "Recently Edited", chars: recentlySorted });
  }

  const fandoms = {};
  characters.forEach(c => {
    const fandom = (c.fandom || "").trim() || "Uncategorized";
    if (!fandoms[fandom]) fandoms[fandom] = [];
    fandoms[fandom].push(c);
  });
  Object.keys(fandoms).sort().forEach(fandom => {
    sections.push({ title: fandom, chars: fandoms[fandom] });
  });

  let html = sections.map((sec, sIdx) => `
    <section class="char-section" data-section="${sIdx}">
      <div class="char-section-header">
        <h2 class="char-section-title">${escHtml(sec.title)}</h2>
        <div class="char-section-right">
          <span class="char-section-count">${sec.chars.length} character${sec.chars.length !== 1 ? "s" : ""}</span>
          ${sec.chars.length > 4 ? `
            <div class="carousel-controls">
              <button class="carousel-btn carousel-prev" data-section="${sIdx}" aria-label="Previous">‹</button>
              <button class="carousel-btn carousel-next" data-section="${sIdx}" aria-label="Next">›</button>
            </div>` : ""}
        </div>
      </div>
      <div class="char-carousel-wrap">
        <div class="char-carousel" data-section="${sIdx}">
          ${sec.chars.map(c => renderCharCard(c)).join("")}
        </div>
      </div>
    </section>`).join("");

  container.innerHTML = html;

  container.querySelectorAll(".carousel-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const sIdx     = btn.dataset.section;
      const carousel = container.querySelector(`.char-carousel[data-section="${sIdx}"]`);
      if (!carousel) return;
      const card   = carousel.querySelector(".char-card");
      const step   = card ? card.offsetWidth + 16 : 186;
      const dir    = btn.classList.contains("carousel-next") ? 1 : -1;
      carousel.scrollBy({ left: dir * step * 3, behavior: "smooth" });
    });
  });
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
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// EDITOR MODAL
// ══════════════════════════════════════════════════════════════════════

let editingId = null;

function openEditor(id) {
  const overlay = document.getElementById("editor-overlay");
  if (!overlay) return;
  editingId = id;
  const c = id ? getCharacters().find(x => x.id === id) : null;
  const fields = [
    "name","fandom","pronouns","age","birthday",
    "heritage","occupation","refImage","titleImage","appearance","overview",
    "background",
    "links.unvale","links.characterhub","links.artfight","links.spotify"
  ];
  fields.forEach(key => {
    const el = document.getElementById("ef-" + key.replace(".", "_"));
    if (!el) return;
    el.value = key.startsWith("links.")
      ? (c?.links?.[key.split(".")[1]] || "")
      : (c?.[key] || "");
  });
  // Merge legacy "history" into the single background box (must run AFTER the loop above)
  if (c?.history && !c.background?.includes(c.history)) {
    const mergedEl = document.getElementById("ef-background");
    if (mergedEl) mergedEl.value = [c.background, c.history].filter(Boolean).join("\n\n");
  }
  const galleryBody = document.getElementById("gallery-rows");
  if (galleryBody) {
    galleryBody.innerHTML = "";
    (c?.gallery || []).forEach(item => addGalleryRow(item));
  }
  const customLinkBody = document.getElementById("custom-link-rows");
  if (customLinkBody) {
    customLinkBody.innerHTML = "";
    (c?.customLinks || []).forEach(link => addCustomLinkRow(link));
  }
  document.getElementById("editor-title").textContent = c ? "Edit Character" : "New Character";

  const deleteBtn = document.getElementById("editor-delete-btn");
  if (deleteBtn) {
    deleteBtn.style.display = id ? "" : "none";
  }

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
    <td><input type="text" class="g-src"        placeholder="Image URL"          value="${escHtml(item.src        || "")}" /></td>
    <td><input type="text" class="g-caption"    placeholder="Caption"            value="${escHtml(item.caption    || "")}" /></td>
    <td><input type="text" class="g-characters" placeholder="Names, comma-sep."  value="${escHtml(item.characters || "")}" /></td>
    <td><input type="text" class="g-year"       placeholder="Year" style="width:70px" value="${escHtml(item.year || "")}" /></td>
    <td><button type="button" class="rm-gallery-row">✕</button></td>
  `;
  tr.querySelector(".rm-gallery-row").addEventListener("click", () => tr.remove());
  tbody.appendChild(tr);
}

function addCustomLinkRow(link) {
  link = link || {};
  const tbody = document.getElementById("custom-link-rows");
  if (!tbody) return;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="cl-title" placeholder="Link title" value="${escHtml(link.title || "")}" /></td>
    <td><input type="url"  class="cl-url"   placeholder="https://…"  value="${escHtml(link.url   || "")}" /></td>
    <td><button type="button" class="rm-gallery-row">✕</button></td>
  `;
  tr.querySelector(".rm-gallery-row").addEventListener("click", () => tr.remove());
  tbody.appendChild(tr);
}

let _savingCharacter = false;

async function handleFormSubmit(e) {
  e.preventDefault();
  // Guard against double-submits (double click / Enter twice while the GitHub sync is in flight).
  // Each extra submit of a NEW character used to create another copy with a fresh id.
  if (_savingCharacter) return;

  const valField = id => (document.getElementById(id)?.value || "").trim();
  const name   = valField("ef-name");
  const fandom = valField("ef-fandom");
  if (!name || !fandom) { alert("A Name and Fandom are both required before saving a character."); return; }

  _savingCharacter = true;
  const submitBtn = document.querySelector('#char-editor-form button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving…"; }

  try {
    const existingChar = editingId ? getCharacters().find(c => c.id === editingId) : null;

    // The character-page editor has no gallery table, so keep the saved gallery when the table isn't there.
    const galleryBody = document.getElementById("gallery-rows");
    const gallery = galleryBody
      ? Array.from(galleryBody.querySelectorAll("tr")).map(tr => ({
          src:        (tr.querySelector(".g-src")?.value        || "").trim(),
          caption:    (tr.querySelector(".g-caption")?.value    || "").trim(),
          characters: (tr.querySelector(".g-characters")?.value || "").trim(),
          year:       (tr.querySelector(".g-year")?.value       || "").trim(),
        })).filter(g => g.src)
      : (existingChar?.gallery || []);

    const customLinks = Array.from(document.querySelectorAll("#custom-link-rows tr")).map(tr => ({
      title: (tr.querySelector(".cl-title")?.value || "").trim(),
      url:   (tr.querySelector(".cl-url")?.value   || "").trim(),
    })).filter(l => l.url);

    const now = new Date().toISOString();
    const character = {
      // Start from the saved character so anything the editor doesn't show
      // (stories, relationships, treeData, details, createdAt, …) is kept.
      ...(existingChar || {}),
      id:            editingId || generateId(),
      updatedAt:     now,
      name,
      fandom,
      nicknames:     existingChar?.nicknames || "",   // managed from the Details tab now
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
      treeData:      existingChar?.treeData      || {},
      details:       existingChar?.details       || [],
      stories:       existingChar?.stories       || [],
      links: {
        unvale:       valField("ef-links_unvale"),
        characterhub: valField("ef-links_characterhub"),
        artfight:     valField("ef-links_artfight"),
        spotify:      valField("ef-links_spotify"),
      },
      customLinks,
      gallery,
    };

    const characters = getCharacters();
    const isNew = !editingId;
    if (editingId) {
      const idx = characters.findIndex(c => c.id === editingId);
      if (idx !== -1) characters[idx] = character;
      else characters.push(character);
    } else {
      characters.push(character);
    }
    await saveCharacters(characters);
    closeEditor();

    if (isNew) {
      // Leave _savingCharacter set: the page is navigating away, so no further submits.
      window.location.href = `character.html?id=${character.id}`;
      return;
    }

    // Editing existing — re-render in place
    const container = document.getElementById("char-sections-container");
    if (container) renderIndexSections(container);
    if (document.getElementById("char-name")) {
      loadCharacterPage();
    }
  } catch (err) {
    console.error("Save error:", err);
    alert("Something went wrong while saving: " + err.message);
  }
  _savingCharacter = false;
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Save Character"; }
}

async function deleteCharacter(id) {
  if (!confirm("Delete this character? This cannot be undone.")) return;
  const characters = getCharacters().filter(c => c.id !== id);
  closeEditor();
  // Wait for the GitHub write to finish BEFORE navigating away. Otherwise the page
  // unloads mid-request, the Gist keeps the old list, and the next index load
  // pulls the "deleted" character straight back from the Gist.
  const ok = await saveCharacters(characters);
  if (!ok) {
    alert("The character was removed on this device, but syncing to GitHub failed — it may reappear after a refresh. Check the sync icon and try again.");
  }
  const container = document.getElementById("char-sections-container");
  if (container) renderIndexSections(container);
  if (document.getElementById("char-name")) {
    window.location.href = "index.html";
  }
}

// ══════════════════════════════════════════════════════════════════════
// STORIES
// ══════════════════════════════════════════════════════════════════════

function splitTags(str) {
  return (str || "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
}

function renderStories(charId) {
  const panel = document.getElementById("panel-stories");
  if (!panel) return;
  const all       = getCharacters();
  const character = all.find(c => c.id === charId);
  const myName    = (character?.name || "").toLowerCase().trim();

  const items = (character?.stories || []).map(story => ({ story, ownerId: charId, ownerName: "" }));

  // Stories on other characters' pages that tag this character
  if (myName) {
    all.forEach(c => {
      if (c.id === charId) return;
      (c.stories || []).forEach(story => {
        if (splitTags(story.characters).includes(myName)) {
          items.push({ story, ownerId: c.id, ownerName: c.name || "Unnamed" });
        }
      });
    });
  }

  if (!items.length) {
    panel.innerHTML = `
      <p class="stories-empty-state">No stories yet.
        <button class="rel-empty-add-btn" id="stories-empty-add-btn">Add one</button>
      </p>`;
    panel.querySelector("#stories-empty-add-btn")
      ?.addEventListener("click", () => openStoryEditor(charId, null));
    return;
  }

  const grid = document.createElement("div");
  grid.className = "stories-grid";
  items.forEach(({ story, ownerId, ownerName }) => {
    const card = document.createElement("div");
    card.className = "story-card";
    card.innerHTML = `
      <span class="story-card-title">${escHtml(story.title || "Untitled")}</span>
      ${story.subtitle ? `<span class="story-card-subtitle">${escHtml(story.subtitle)}</span>` : ""}
      ${ownerName ? `<span class="story-card-tag" title="From ${escHtml(ownerName)}'s stories">w/ ${escHtml(ownerName)}</span>` : ""}
    `;
    card.addEventListener("click", () => openStoryReader(ownerId, story.id));
    grid.appendChild(card);
  });
  panel.innerHTML = "";
  panel.appendChild(grid);
}

// ── Story reader ─────────────────────────────────────────────────────

let _storyReaderCharId  = null;
let _storyReaderStoryId = null;

function openStoryReader(charId, storyId) {
  const overlay = document.getElementById("story-reader-overlay");
  if (!overlay) return;
  const character = getCharacters().find(c => c.id === charId);
  const story     = (character?.stories || []).find(s => s.id === storyId);
  if (!story) return;

  _storyReaderCharId  = charId;
  _storyReaderStoryId = storyId;

  document.getElementById("story-reader-title").textContent    = story.title    || "Untitled";
  document.getElementById("story-reader-subtitle").textContent = story.subtitle || "";
  document.getElementById("story-reader-subtitle").style.display = story.subtitle ? "" : "none";
  document.getElementById("story-reader-body").textContent     = story.body     || "";

  // Meta line: who the story belongs to (if not this page) + tagged characters, linked where possible
  const metaEl = document.getElementById("story-reader-meta");
  if (metaEl) {
    const allChars = getCharacters();
    const pageId   = pageCharId();
    const parts = [];
    if (character && charId !== pageId) {
      parts.push(`From <a href="character.html?id=${escHtml(character.id)}">${escHtml(character.name || "Unnamed")}</a>'s stories`);
    }
    const tagNames = (story.characters || "").split(",").map(t => t.trim()).filter(Boolean);
    if (tagNames.length) {
      const links = tagNames.map(n => {
        const m = allChars.find(c => (c.name || "").toLowerCase().trim() === n.toLowerCase());
        return m && m.id !== pageId
          ? `<a href="character.html?id=${escHtml(m.id)}">${escHtml(n)}</a>`
          : escHtml(n);
      });
      parts.push(`Featuring ${links.join(", ")}`);
    }
    metaEl.innerHTML = parts.join(" · ");
  }

  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeStoryReader() {
  document.getElementById("story-reader-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
  _storyReaderCharId  = null;
  _storyReaderStoryId = null;
}

// ── Story editor ─────────────────────────────────────────────────────

let _storyEditingCharId  = null;
let _storyEditingStoryId = null;

function openStoryEditor(charId, storyId) {
  // If called from the reader, close it first
  const readerOverlay = document.getElementById("story-reader-overlay");
  if (readerOverlay?.classList.contains("open")) {
    readerOverlay.classList.remove("open");
  }

  const overlay = document.getElementById("story-editor-overlay");
  if (!overlay) return;
  _storyEditingCharId  = charId;
  _storyEditingStoryId = storyId;

  const character = getCharacters().find(c => c.id === charId);
  const story     = storyId ? (character?.stories || []).find(s => s.id === storyId) : null;

  document.getElementById("sef-title").value    = story?.title    || "";
  document.getElementById("sef-subtitle").value = story?.subtitle || "";
  document.getElementById("sef-body").value     = story?.body     || "";
  const tagInput = document.getElementById("sef-characters");
  if (tagInput) tagInput.value = story?.characters || "";
  const tagList = document.getElementById("sef-characters-list");
  if (tagList) {
    tagList.innerHTML = getCharacters()
      .filter(c => c.id !== charId && c.name)
      .map(c => `<option value="${escHtml(c.name)}">`).join("");
  }

  const deleteBtn = document.getElementById("story-editor-delete-btn");
  if (deleteBtn) deleteBtn.style.display = storyId ? "" : "none";

  document.getElementById("story-editor-title").textContent = storyId ? "Edit Story" : "New Story";

  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeStoryEditor() {
  document.getElementById("story-editor-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
  _storyEditingCharId  = null;
  _storyEditingStoryId = null;
}

async function handleStoryFormSubmit(e) {
  e.preventDefault();
  if (!_storyEditingCharId) return;

  const title    = (document.getElementById("sef-title")?.value    || "").trim();
  const subtitle = (document.getElementById("sef-subtitle")?.value || "").trim();
  const body     = (document.getElementById("sef-body")?.value     || "").trim();
  const tagged   = (document.getElementById("sef-characters")?.value || "")
    .split(",").map(t => t.trim()).filter(Boolean).join(", ");

  if (!title) { alert("Please give your story a title."); return; }

  const characters = getCharacters();
  const idx = characters.findIndex(c => c.id === _storyEditingCharId);
  if (idx === -1) return;

  if (!characters[idx].stories) characters[idx].stories = [];

  const now = new Date().toISOString();
  if (_storyEditingStoryId) {
    const sIdx = characters[idx].stories.findIndex(s => s.id === _storyEditingStoryId);
    if (sIdx !== -1) {
      characters[idx].stories[sIdx] = { ...characters[idx].stories[sIdx], title, subtitle, body, characters: tagged, updatedAt: now };
    }
  } else {
    characters[idx].stories.push({ id: generateId(), title, subtitle, body, characters: tagged, createdAt: now, updatedAt: now });
  }
  characters[idx].updatedAt = now;

  // Re-render the story list of the page we're ON (the story may belong to another character)
  const renderFor = pageCharId() || _storyEditingCharId;
  closeStoryEditor();
  renderStories(renderFor);
  await saveCharacters(characters);
}

async function deleteStory(charId, storyId) {
  if (!confirm("Delete this story? This cannot be undone.")) return;
  const characters = getCharacters();
  const idx = characters.findIndex(c => c.id === charId);
  if (idx !== -1) {
    characters[idx].stories = (characters[idx].stories || []).filter(s => s.id !== storyId);
    characters[idx].updatedAt = new Date().toISOString();
  }
  closeStoryEditor();
  renderStories(pageCharId() || charId);
  await saveCharacters(characters);
}

// ══════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", function () {
  loadIndexPage();
  loadCharacterPage();

  // ── Editor modal  ──
  document.getElementById("editor-close")?.addEventListener("click", closeEditor);
  document.getElementById("editor-close-bottom")?.addEventListener("click", closeEditor);
  document.getElementById("editor-overlay")?.addEventListener("click", e => {
    if (e.target.id === "editor-overlay") closeEditor();
  });
  document.getElementById("char-editor-form")?.addEventListener("submit", handleFormSubmit);
  document.getElementById("add-gallery-row")?.addEventListener("click", () => addGalleryRow());
  document.getElementById("add-custom-link-row")?.addEventListener("click", () => addCustomLinkRow());

  // ── Delete button in editor footer ──
  document.getElementById("editor-delete-btn")?.addEventListener("click", () => {
    if (editingId) deleteCharacter(editingId);
  });

  // ── Relationship editor ──
  document.getElementById("rel-editor-close")?.addEventListener("click", closeRelationshipEditor);
  document.getElementById("rel-editor-cancel")?.addEventListener("click", closeRelationshipEditor);
  document.getElementById("rel-editor-overlay")?.addEventListener("click", e => {
    if (e.target.id === "rel-editor-overlay") closeRelationshipEditor();
  });
  document.getElementById("rel-editor-form")?.addEventListener("submit", handleRelFormSubmit);
  document.getElementById("add-rel-row")?.addEventListener("click", () => addRelRow());

  // ── Overview editor ──
  document.getElementById("overview-editor-close")?.addEventListener("click", closeOverviewEditor);
  document.getElementById("overview-editor-cancel")?.addEventListener("click", closeOverviewEditor);
  document.getElementById("overview-editor-overlay")?.addEventListener("click", e => {
    if (e.target.id === "overview-editor-overlay") closeOverviewEditor();
  });
  document.getElementById("overview-editor-form")?.addEventListener("submit", handleOverviewFormSubmit);

  // ── Gallery editor ──
  document.getElementById("gallery-editor-close")?.addEventListener("click", closeGalleryEditor);
  document.getElementById("gallery-editor-cancel")?.addEventListener("click", closeGalleryEditor);
  document.getElementById("gallery-editor-overlay")?.addEventListener("click", e => {
    if (e.target.id === "gallery-editor-overlay") closeGalleryEditor();
  });
  document.getElementById("gallery-editor-form")?.addEventListener("submit", handleGalleryFormSubmit);
  document.getElementById("add-gallery-editor-row")?.addEventListener("click", () => addGalleryEditorRow());

  // ── Art by others editor ──
  document.getElementById("otherart-editor-close")?.addEventListener("click", closeOtherArtEditor);
  document.getElementById("otherart-editor-cancel")?.addEventListener("click", closeOtherArtEditor);
  document.getElementById("otherart-editor-overlay")?.addEventListener("click", e => {
    if (e.target.id === "otherart-editor-overlay") closeOtherArtEditor();
  });
  document.getElementById("otherart-editor-form")?.addEventListener("submit", handleOtherArtFormSubmit);
  document.getElementById("add-otherart-editor-row")?.addEventListener("click", () => addOtherArtEditorRow());

  // ── Details editor ──
  document.getElementById("details-editor-close")?.addEventListener("click", () => closeDetailsEditor());
  document.getElementById("details-editor-cancel")?.addEventListener("click", () => closeDetailsEditor());
  document.getElementById("details-editor-overlay")?.addEventListener("click", e => {
    if (e.target.id === "details-editor-overlay") closeDetailsEditor();
  });
  document.getElementById("details-editor-form")?.addEventListener("submit", handleDetailsFormSubmit);
  document.getElementById("add-details-row")?.addEventListener("click", () => { addDetailsRow(); _markDetailsDirty(); });

  // ── Story reader ──
  document.getElementById("story-reader-close")?.addEventListener("click", closeStoryReader);
  document.getElementById("story-reader-overlay")?.addEventListener("click", e => {
    if (e.target.id === "story-reader-overlay") closeStoryReader();
  });
  document.getElementById("story-reader-edit-btn")?.addEventListener("click", () => {
    openStoryEditor(_storyReaderCharId, _storyReaderStoryId);
  });

  // ── Story editor ──
  document.getElementById("story-editor-close")?.addEventListener("click", closeStoryEditor);
  document.getElementById("story-editor-cancel")?.addEventListener("click", closeStoryEditor);
  document.getElementById("story-editor-overlay")?.addEventListener("click", e => {
    if (e.target.id === "story-editor-overlay") closeStoryEditor();
  });
  document.getElementById("story-editor-form")?.addEventListener("submit", handleStoryFormSubmit);
  document.getElementById("story-editor-delete-btn")?.addEventListener("click", () => {
    if (_storyEditingCharId && _storyEditingStoryId)
      deleteStory(_storyEditingCharId, _storyEditingStoryId);
  });
});