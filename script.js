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
  // nicknames removed from basics table — shown in Details panel
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
  document.title = (character.name || "Character") + " — Character Sheet";

  initOverviewTabs(id);
  renderRelationships(character.relationships || [], id);
  renderDetails(character.details || [], character, id);

  document.getElementById("char-page-edit-btn")
    ?.addEventListener("click", () => openCharPageEditor(id));
  document.getElementById("edit-relationships-btn")
    ?.addEventListener("click", () => openRelationshipEditor(id));
  document.getElementById("edit-details-btn")
    ?.addEventListener("click", () => openDetailsEditor(id));
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
  };
  const panels = {
    overview:      document.getElementById("panel-overview"),
    details:       document.getElementById("panel-details"),
    relationships: document.getElementById("panel-relationships"),
    tree:          document.getElementById("panel-tree"),
  };
  const editRelBtn     = document.getElementById("edit-relationships-btn");
  const editDetailsBtn = document.getElementById("edit-details-btn");
  if (editRelBtn)     editRelBtn.style.display     = "none";
  if (editDetailsBtn) editDetailsBtn.style.display = "none";

  function activate(key) {
    Object.values(tabs).forEach(t => t && t.classList.remove("active"));
    Object.values(panels).forEach(p => p && (p.style.display = "none"));
    if (tabs[key])   tabs[key].classList.add("active");
    if (panels[key]) panels[key].style.display = "";
    if (editRelBtn)     editRelBtn.style.display     = key === "relationships" ? "" : "none";
    if (editDetailsBtn) editDetailsBtn.style.display = key === "details"       ? "" : "none";
    if (key === "tree") renderTree(charId);
  }

  tabs.overview?.addEventListener("click",      () => activate("overview"));
  tabs.details?.addEventListener("click",       () => activate("details"));
  tabs.relationships?.addEventListener("click", () => activate("relationships"));
  tabs.tree?.addEventListener("click",          () => activate("tree"));
}

// ══════════════════════════════════════════════════════════════════════
// DETAILS PANEL
// ══════════════════════════════════════════════════════════════════════

// Preset fields — label + whether it spans both columns
const DETAILS_PRESETS = [
  { key: "fullName",    label: "Full Legal Name", wide: false },
  { key: "nickname",    label: "Nickname",        wide: false },
  { key: "alias",       label: "Alias / Alias",   wide: false },
  { key: "sexuality",   label: "Sexuality",        wide: false },
  { key: "gender",      label: "Gender",           wide: false },
  { key: "height",      label: "Height",           wide: false },
  { key: "build",       label: "Build",            wide: false },
  { key: "eyeColor",    label: "Eye Colour",       wide: false },
  { key: "hairColor",   label: "Hair Colour",      wide: false },
  { key: "species",     label: "Species / Race",   wide: false },
  { key: "religion",    label: "Religion",         wide: false },
  { key: "mbti",        label: "MBTI",             wide: false },
  { key: "enneagram",   label: "Enneagram",        wide: false },
  { key: "alignment",   label: "Alignment",        wide: false },
  { key: "personality", label: "Personality",      wide: true  },
  { key: "likes",       label: "Likes",            wide: true  },
  { key: "dislikes",    label: "Dislikes",         wide: true  },
  { key: "fears",       label: "Fears",            wide: true  },
  { key: "hobbies",     label: "Hobbies",          wide: true  },
  { key: "goals",       label: "Goals",            wide: true  },
  { key: "flaws",       label: "Flaws",            wide: true  },
  { key: "trivia",      label: "Trivia",           wide: true  },
];

function renderDetails(details, character, charId) {
  const panel = document.getElementById("panel-details");
  if (!panel) return;

  // Merge: always show nicknames from basic info if present
  // Build effective list — prepend nickname from character.nicknames if not already in details
  let effectiveDetails = details || [];

  // Auto-inject nicknames field if character has nicknames and it's not already in details
  const hasNicknameField = effectiveDetails.some(d => d.key === "nickname" || (d.label || "").toLowerCase() === "nickname");
  if (character.nicknames && character.nicknames.trim() && !hasNicknameField) {
    effectiveDetails = [{ key: "nickname", label: "Nickname", value: character.nicknames, wide: false }, ...effectiveDetails];
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
    <div class="details-field${d.wide ? " details-field--wide" : ""}">
      <span class="details-label">${escHtml(d.label || d.key || "")}</span>
      <span class="details-value char-formatted">${escHtml(d.value || "")}</span>
    </div>`).join("")}</div>`;

  panel.innerHTML = html;
}

// ── Details editor modal ───────────────────────────────────────────────

let detailsEditingCharId = null;

function openDetailsEditor(charId) {
  const overlay = document.getElementById("details-editor-overlay");
  if (!overlay) return;
  detailsEditingCharId = charId;

  const characters = getCharacters();
  const character  = characters.find(c => c.id === charId);
  const existing   = character?.details || [];

  // Populate rows
  const tbody = document.getElementById("details-editor-rows");
  if (tbody) {
    tbody.innerHTML = "";
    // If character has nicknames but no nickname detail field, seed it
    const hasNicknameRow = existing.some(d => d.key === "nickname");
    if (character?.nicknames && character.nicknames.trim() && !hasNicknameRow) {
      addDetailsRow({ key: "nickname", label: "Nickname", value: character.nicknames, wide: false });
    }
    existing.forEach(d => addDetailsRow(d));
  }

  // Render preset chips
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
      data-key="${escHtml(p.key)}" data-label="${escHtml(p.label)}" data-wide="${p.wide}"
      ${added ? "disabled" : ""}>${escHtml(p.label)}</button>`;
  }).join("");

  container.querySelectorAll(".details-preset-chip:not(.chip-added)").forEach(btn => {
    btn.addEventListener("click", () => {
      addDetailsRow({ key: btn.dataset.key, label: btn.dataset.label, value: "", wide: btn.dataset.wide === "true" });
      btn.classList.add("chip-added");
      btn.disabled = true;
      // Scroll to bottom of rows
      const tbody = document.getElementById("details-editor-rows");
      tbody?.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}

function addDetailsRow(field) {
  field = field || {};
  const tbody = document.getElementById("details-editor-rows");
  if (!tbody) return;

  const row = document.createElement("div");
  row.className = "details-editor-row";
  row.style.cssText = "display:grid;grid-template-columns:160px 60px 1fr 28px;gap:0.3rem;align-items:start;padding:0.45rem 0.9rem;border-bottom:1px solid var(--border);";
  row.innerHTML = `
    <input type="text"  class="det-label" placeholder="Field name"  value="${escHtml(field.label || "")}"
      style="font-family:'DM Sans',sans-serif;font-size:0.8rem;padding:0.3rem 0.5rem;border:1px solid var(--border);border-radius:4px;background:var(--card);color:var(--ink);width:100%;box-sizing:border-box;outline:none;" />
    <select class="det-wide"
      style="font-family:'DM Sans',sans-serif;font-size:0.75rem;padding:0.3rem 0.3rem;border:1px solid var(--border);border-radius:4px;background:var(--card);color:var(--ink);width:100%;outline:none;"
      title="Width">
      <option value="false" ${!field.wide ? "selected" : ""}>Half</option>
      <option value="true"  ${ field.wide ? "selected" : ""}>Full</option>
    </select>
    <textarea class="det-value" rows="2" placeholder="Value…"
      style="font-family:'DM Sans',sans-serif;font-size:0.8rem;padding:0.3rem 0.5rem;border:1px solid var(--border);border-radius:4px;background:var(--card);color:var(--ink);width:100%;box-sizing:border-box;resize:vertical;outline:none;min-height:42px;">${escHtml(field.value || "")}</textarea>
    <button type="button" class="rm-details-row" title="Remove"
      style="background:none;border:none;color:var(--ink-light);cursor:pointer;font-size:0.85rem;padding:0.25rem 0.3rem;border-radius:3px;transition:color 0.15s;margin-top:2px;">✕</button>
    <input type="hidden" class="det-key" value="${escHtml(field.key || "")}" />
  `;
  row.querySelector(".rm-details-row").addEventListener("click", () => {
    // Re-enable the chip if it was a preset
    const keyInp = row.querySelector(".det-key");
    if (keyInp?.value) {
      const chip = document.querySelector(`.details-preset-chip[data-key="${keyInp.value}"]`);
      if (chip) { chip.classList.remove("chip-added"); chip.disabled = false; }
    }
    row.remove();
  });
  row.querySelector(".rm-details-row").addEventListener("mouseover", function() { this.style.color = "#a05050"; });
  row.querySelector(".rm-details-row").addEventListener("mouseout",  function() { this.style.color = ""; });
  tbody.appendChild(row);
}

function closeDetailsEditor() {
  document.getElementById("details-editor-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
  detailsEditingCharId = null;
}

async function handleDetailsFormSubmit(e) {
  e.preventDefault();
  if (!detailsEditingCharId) return;

  const rows = Array.from(document.querySelectorAll("#details-editor-rows .details-editor-row"));
  const details = rows.map(row => ({
    key:   (row.querySelector(".det-key")?.value   || "").trim() || null,
    label: (row.querySelector(".det-label")?.value || "").trim(),
    value: (row.querySelector(".det-value")?.value || "").trim(),
    wide:  row.querySelector(".det-wide")?.value === "true",
  })).filter(d => d.label && d.value);

  const characters = getCharacters();
  const idx = characters.findIndex(c => c.id === detailsEditingCharId);
  if (idx !== -1) {
    characters[idx].details   = details;
    characters[idx].updatedAt = new Date().toISOString();
  }

  closeDetailsEditor();

  const character = characters[idx];
  renderDetails(details, character, detailsEditingCharId);
  await saveCharacters(characters);
}

// ══════════════════════════════════════════════════════════════════════
// FAMILY TREE
// ══════════════════════════════════════════════════════════════════════

const T = {
  NODE_R:    30,
  GAP_H:     56,
  ROW_H:    110,
  CANVAS_W: 680,
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

// ── State ─────────────────────────────────────────────────────────────
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

// ── Default sidebar: member list with relationship types ──────────────
function showTreeDefaultSidebar(charId) {
  const wrap = document.getElementById("tree-sidebar-wrap");
  if (!wrap) return;
  const chars     = getCharacters();
  const character = chars.find(c => c.id === charId);
  if (!character) return;
  const map      = getTreeMap(character);
  const focalKey = character.name;

  // Build a lookup of relationship types keyed by name (lowercase)
  const relMap = {};
  (character.relationships || []).forEach(r => {
    if (r.name) relMap[r.name.toLowerCase().trim()] = r.type || "";
  });

  const focalData = map[focalKey] || { parents: [], partners: [], children: [] };

  // Assign tree roles relative to the focal character
  const treeRoles = {};

  function assignRole(names, role) {
    (names || []).forEach(n => {
      if (n !== focalKey && !treeRoles[n]) treeRoles[n] = role;
    });
  }

  // Direct connections
  assignRole(focalData.parents,  "Parent");
  assignRole(focalData.partners, "Partner");
  assignRole(focalData.children, "Child");

  // Extended family
  Object.entries(map).forEach(([nodeName, nd]) => {
    if (nodeName === focalKey) return;

    // Siblings: share a parent with focal
    if ((nd.parents || []).some(p => (focalData.parents || []).includes(p))) {
      if (!treeRoles[nodeName]) treeRoles[nodeName] = "Sibling";
    }

    // Grandparents: parents of focal's parents
    (focalData.parents || []).forEach(parent => {
      const parentData = map[parent];
      if (!parentData) return;
      if ((parentData.parents || []).includes(nodeName) && !treeRoles[nodeName]) {
        treeRoles[nodeName] = "Grandparent";
      }
    });

    // Grandchildren: children of focal's children
    (focalData.children || []).forEach(child => {
      const childData = map[child];
      if (!childData) return;
      if ((childData.children || []).includes(nodeName) && !treeRoles[nodeName]) {
        treeRoles[nodeName] = "Grandchild";
      }
    });

    // Fallback for any remaining placed node
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

  // Wire up "add rel. type" buttons → open relationship editor with name pre-filled
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

// ── Node edit sidebar ─────────────────────────────────────────────────
function showNodeEditSidebar(charId, nodeName) {
  const wrap = document.getElementById("tree-sidebar-wrap");
  if (!wrap) return;
  const chars     = getCharacters();
  const character = chars.find(c => c.id === charId);
  if (!character) return;
  const map      = getTreeMap(character);
  const nodeData = map[nodeName] || { parents: [], partners: [], children: [] };

  const suggestions = (character.relationships || []).map(r => r.name).filter(Boolean);

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
      if (nodeName !== char2.name) {
        const nd = map2[nodeName];
        if (!nd.parents.length && !nd.partners.length && !nd.children.length) {
          delete map2[nodeName];
        }
      }
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
      if (!map2[name]) map2[name] = { parents: [], partners: [], children: [] };
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
    ensureRow(row);
    rowSlots.get(row).push(name);
    placed.set(name, { row });
  }

  placeNode(focalKey, 0);

  const queue = [{ name: focalKey, row: 0 }];
  const visited = new Set([focalKey]);

  while (queue.length) {
    const { name, row } = queue.shift();
    const nd = map[name];
    if (!nd) continue;

    (nd.parents || []).forEach(p => {
      if (!visited.has(p)) {
        visited.add(p);
        placeNode(p, row - 1);
        queue.push({ name: p, row: row - 1 });
      }
    });

    (nd.children || []).forEach(c => {
      if (!visited.has(c)) {
        visited.add(c);
        placeNode(c, row + 1);
        queue.push({ name: c, row: row + 1 });
      }
    });

    (nd.partners || []).forEach(p => {
      if (!visited.has(p)) {
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

  const svgH = Y_TOP + (maxRow - minRow) * T.ROW_H + T.NODE_R * 2 + 50;

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
    const label  = name.length > 13 ? name.slice(0,12) + "…" : name;

    defs += `<clipPath id="${cid}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath>`;

    const imgEl = img
      ? `<image href="${escHtml(img)}" x="${x-r}" y="${y-r}" width="${r*2}" height="${r*2}" clip-path="url(#${cid})" preserveAspectRatio="xMidYMid slice"/>`
      : `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central"
           font-family="Cormorant Garamond,serif" font-size="${Math.round(r*0.85)}"
           fill="var(--ink-light)">${escHtml(init)}</text>`;

    const ring      = isFocal ? `stroke="var(--ink)" stroke-width="2.5"` : `stroke="var(--border)" stroke-width="1.5"`;
    const cursor    = _treeEditMode ? `style="cursor:pointer"` : (href ? `style="cursor:pointer"` : "");
    const dataEdit  = _treeEditMode ? `data-editnode="${escHtml(name)}"` : "";
    const dataHref  = (!_treeEditMode && href) ? `data-href="${escHtml(href)}"` : "";

    const badge = _treeEditMode ? `
      <circle cx="${x+r-4}" cy="${y-r+4}" r="10" fill="var(--card)" stroke="var(--border)" stroke-width="1"/>
      <text x="${x+r-4}" y="${y-r+4}" text-anchor="middle" dominant-baseline="central"
        font-family="DM Sans,sans-serif" font-size="11" fill="var(--ink-mid)">✎</text>` : "";

    return `
      <g class="tree-node" ${cursor} ${dataEdit} ${dataHref}>
        <circle cx="${x}" cy="${y}" r="${r}" fill="var(--card)" ${ring}/>
        ${imgEl}
        ${badge}
        <text x="${x}" y="${y+r+18}" text-anchor="middle"
          font-family="DM Sans,sans-serif" font-size="12" font-weight="${isFocal ? '600' : '400'}"
          fill="${isFocal ? 'var(--ink)' : 'var(--ink-mid)'}">${escHtml(label)}</text>
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

  const drawnConns = new Set();
  function connKey(a, b) { return [a,b].sort().join("|||"); }

  placed.forEach((_, name) => {
    const nd  = map[name];
    const pos = nodePos.get(name);
    if (!nd || !pos) return;

    (nd.parents || []).forEach(pname => {
      const ppos = nodePos.get(pname);
      if (!ppos) return;
      const k = connKey(name, pname);
      if (drawnConns.has(k)) return;
      drawnConns.add(k);
      conns += drawConn(ppos.x, ppos.y + T.NODE_R, pos.x, pos.y - T.NODE_R, "parent");
    });

    (nd.partners || []).forEach(pname => {
      const ppos = nodePos.get(pname);
      if (!ppos) return;
      const k = connKey(name, pname);
      if (drawnConns.has(k)) return;
      drawnConns.add(k);
      const lx = Math.min(pos.x, ppos.x) + T.NODE_R;
      const rx = Math.max(pos.x, ppos.x) - T.NODE_R;
      const y  = pos.y;
      conns += drawConn(lx, y, rx, y, "partner");
    });

    (nd.children || []).forEach(cname => {
      const cpos = nodePos.get(cname);
      if (!cpos) return;
      const k = connKey(name, cname);
      if (drawnConns.has(k)) return;
      drawnConns.add(k);
      conns += drawConn(pos.x, pos.y + T.NODE_R, cpos.x, cpos.y - T.NODE_R, "child");
    });
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

const REL_TRUNCATE = 180;

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
  const grid = document.querySelector(".gallery-grid");
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

function openCharPageEditor(id) {
  window.location.href = `index.html?edit=${id}`;
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
  document.getElementById("editor-close")?.addEventListener("click",        closeEditor);
  document.getElementById("editor-close-bottom")?.addEventListener("click", closeEditor);
  document.getElementById("editor-overlay")?.addEventListener("click", e => { if (e.target.id === "editor-overlay") closeEditor(); });
  document.getElementById("char-editor-form")?.addEventListener("submit",   handleFormSubmit);
  document.getElementById("add-gallery-row")?.addEventListener("click",     () => addGalleryRow());
  document.getElementById("add-custom-link-row")?.addEventListener("click", () => addCustomLinkRow());
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
  let html = "";
  if (!filter) {
    const recentlySorted = [...characters]
      .sort((a, b) => (b.updatedAt || b.id || "").localeCompare(a.updatedAt || a.id || ""))
      .slice(0, 10);
    html += `
      <section class="char-section">
        <div class="char-section-header">
          <h2 class="char-section-title">Recently Edited</h2>
          <span class="char-section-count">${recentlySorted.length} character${recentlySorted.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="char-scroll-row">
          ${recentlySorted.map(c => renderCharCard(c)).join("")}
        </div>
      </section>`;
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
        <div class="char-scroll-row">
          ${chars.map(c => renderCharCard(c)).join("")}
        </div>
      </section>`;
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
    "name","fandom","nicknames","pronouns","age","birthday",
    "heritage","occupation","refImage","titleImage","appearance","overview",
    "background",
    "links.unvale","links.characterhub","links.artfight","links.spotify"
  ];
  if (c?.history && !c.background?.includes(c.history)) {
    const mergedEl = document.getElementById("ef-background");
    if (mergedEl) mergedEl.value = [c.background, c.history].filter(Boolean).join("\n\n");
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
  const customLinkBody = document.getElementById("custom-link-rows");
  if (customLinkBody) {
    customLinkBody.innerHTML = "";
    (c?.customLinks || []).forEach(link => addCustomLinkRow(link));
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

async function handleFormSubmit(e) {
  e.preventDefault();
  const valField = id => (document.getElementById(id)?.value || "").trim();
  const name   = valField("ef-name");
  const fandom = valField("ef-fandom");
  if (!name || !fandom) { alert("A Name and Fandom are both required before saving a character."); return; }
  const gallery = Array.from(document.querySelectorAll("#gallery-rows tr")).map(tr => ({
    src:        (tr.querySelector(".g-src")?.value        || "").trim(),
    caption:    (tr.querySelector(".g-caption")?.value    || "").trim(),
    characters: (tr.querySelector(".g-characters")?.value || "").trim(),
    year:       (tr.querySelector(".g-year")?.value       || "").trim(),
  })).filter(g => g.src);
  const customLinks = Array.from(document.querySelectorAll("#custom-link-rows tr")).map(tr => ({
    title: (tr.querySelector(".cl-title")?.value || "").trim(),
    url:   (tr.querySelector(".cl-url")?.value   || "").trim(),
  })).filter(l => l.url);
  const now          = new Date().toISOString();
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
    treeData:      existingChar?.treeData      || {},
    details:       existingChar?.details       || [],
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
  if (editingId) {
    const idx = characters.findIndex(c => c.id === editingId);
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
  const characters = getCharacters().filter(c => c.id !== id);
  const container  = document.getElementById("char-sections-container");
  if (container) renderIndexSections(container);
  await saveCharacters(characters);
}

// ══════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", function () {
  loadIndexPage();
  loadCharacterPage();

  // Relationship editor
  document.getElementById("rel-editor-close")
    ?.addEventListener("click", closeRelationshipEditor);
  document.getElementById("rel-editor-cancel")
    ?.addEventListener("click", closeRelationshipEditor);
  document.getElementById("rel-editor-overlay")
    ?.addEventListener("click", e => { if (e.target.id === "rel-editor-overlay") closeRelationshipEditor(); });
  document.getElementById("rel-editor-form")
    ?.addEventListener("submit", handleRelFormSubmit);
  document.getElementById("add-rel-row")
    ?.addEventListener("click", () => addRelRow());

  // Details editor
  document.getElementById("details-editor-close")
    ?.addEventListener("click", closeDetailsEditor);
  document.getElementById("details-editor-cancel")
    ?.addEventListener("click", closeDetailsEditor);
  document.getElementById("details-editor-overlay")
    ?.addEventListener("click", e => { if (e.target.id === "details-editor-overlay") closeDetailsEditor(); });
  document.getElementById("details-editor-form")
    ?.addEventListener("submit", handleDetailsFormSubmit);
  document.getElementById("add-details-row")
    ?.addEventListener("click", () => addDetailsRow());
});