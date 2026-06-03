// ══════════════════════════════════════════════════════════════════════
// GITHUB GIST SYNC
// Credentials stored in localStorage (per-device, never sent anywhere
// except the official GitHub API). Character data lives in a private
// Gist and is synced on load and after every write.
// ══════════════════════════════════════════════════════════════════════

const STORAGE_TOKEN  = "oc_gh_token";
const STORAGE_GIST   = "oc_gh_gist";
const STORAGE_LOCAL  = "oc_characters";   // local cache / fallback
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
    const grid = document.getElementById("char-grid");
    if (grid) renderCharacterGrid(grid);
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
  setText("char-appearance", character.appearance);
  setText("char-overview",   character.overview);
  setText("char-background", character.background);
  setText("char-history",    character.history);

  setLink("char-unvale",       "char-unvale-li",       character.links?.unvale,       "Unvale");
  setLink("char-characterhub", "char-characterhub-li", character.links?.characterhub, "CharacterHub");
  setLink("char-artfight",     "char-artfight-li",     character.links?.artfight,     "Artfight");
  setLink("char-spotify",      "char-spotify-li",      character.links?.spotify,      "Playlist");

  const refWrap = document.querySelector(".char-ref-wrap");
  const img     = document.querySelector(".char-ref");
  if (character.refImage && refWrap && img) {
    img.src = character.refImage;
    refWrap.style.display = "block";
  } else if (refWrap) {
    refWrap.style.display = "none";
  }

  renderGallery(character.gallery || []);
  document.title = (character.name || "Character") + " — Character Sheet";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
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
        <img src="${escHtml(item.src)}" alt="${escHtml(item.caption || '')}" />
        ${item.year ? `<span class="gallery-year">${escHtml(item.year)}</span>` : ""}
      </div>
      <p class="gallery-caption">${escHtml(item.caption || "")}</p>
    </div>
  `).join("");
}

// ══════════════════════════════════════════════════════════════════════
// INDEX PAGE  (index.html)
// ══════════════════════════════════════════════════════════════════════

async function loadIndexPage() {
  const grid = document.getElementById("char-grid");
  if (!grid) return;

  updateSettingsBtnStyle();

  if (isConnected()) {
    setStatus("syncing");
    renderCharacterGrid(grid);       // instant render from cache
    await loadFromGist();            // then refresh from GitHub
    renderCharacterGrid(grid);
  } else {
    setStatus("off");
    renderCharacterGrid(grid);
    // Show setup banner for first-time visitors
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
      renderCharacterGrid(grid, e.target.value.trim().toLowerCase());
    });
}

function renderCharacterGrid(grid, filter) {
  filter = filter || "";
  let characters = getCharacters();
  if (filter) {
    characters = characters.filter(c =>
      (c.name   || "").toLowerCase().includes(filter) ||
      (c.fandom || "").toLowerCase().includes(filter)
    );
  }
  if (!characters.length) {
    grid.innerHTML = `<p class="empty-state">${filter ? "No characters match your search." : "No characters yet. Add one!"}</p>`;
    return;
  }
  grid.innerHTML = characters.map(c => `
    <div class="char-card" data-id="${escHtml(c.id)}">
      <div class="char-card-img-wrap">
        ${c.refImage
          ? `<img src="${escHtml(c.refImage)}" alt="${escHtml(c.name || '')}" />`
          : `<div class="char-card-placeholder">${escHtml((c.name?.[0] || "?").toUpperCase())}</div>`}
      </div>
      <div class="char-card-body">
        <p class="char-card-name">${escHtml(c.name || "Unnamed")}</p>
        <p class="char-card-fandom">${escHtml(c.fandom || "")}</p>
        <div class="char-card-actions">
          <a href="character.html?id=${escHtml(c.id)}" class="char-card-btn">View</a>
          <button class="char-card-btn char-card-edit"   data-id="${escHtml(c.id)}">Edit</button>
          <button class="char-card-btn char-card-delete" data-id="${escHtml(c.id)}">Delete</button>
        </div>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".char-card-edit").forEach(btn =>
    btn.addEventListener("click", () => openEditor(btn.dataset.id))
  );
  grid.querySelectorAll(".char-card-delete").forEach(btn =>
    btn.addEventListener("click", () => deleteCharacter(btn.dataset.id))
  );
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
    "heritage","occupation","refImage","appearance","overview",
    "background","history",
    "links.unvale","links.characterhub","links.artfight","links.spotify"
  ];

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
  const val = function(id) { return (document.getElementById(id)?.value || "").trim(); };

  const gallery = Array.from(document.querySelectorAll("#gallery-rows tr")).map(function(tr) {
    return {
      src:     (tr.querySelector(".g-src")?.value     || "").trim(),
      caption: (tr.querySelector(".g-caption")?.value || "").trim(),
      year:    (tr.querySelector(".g-year")?.value    || "").trim(),
    };
  }).filter(function(g) { return g.src; });

  const character = {
    id:         editingId || generateId(),
    name:       val("ef-name"),
    fandom:     val("ef-fandom"),
    nicknames:  val("ef-nicknames"),
    pronouns:   val("ef-pronouns"),
    age:        val("ef-age"),
    birthday:   val("ef-birthday"),
    heritage:   val("ef-heritage"),
    occupation: val("ef-occupation"),
    refImage:   val("ef-refImage"),
    appearance: val("ef-appearance"),
    overview:   val("ef-overview"),
    background: val("ef-background"),
    history:    val("ef-history"),
    links: {
      unvale:       val("ef-links_unvale"),
      characterhub: val("ef-links_characterhub"),
      artfight:     val("ef-links_artfight"),
      spotify:      val("ef-links_spotify"),
    },
    gallery: gallery,
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
  const grid = document.getElementById("char-grid");
  if (grid) renderCharacterGrid(grid);
  await saveCharacters(characters);
}

async function deleteCharacter(id) {
  if (!confirm("Delete this character? This cannot be undone.")) return;
  const characters = getCharacters().filter(function(c) { return c.id !== id; });
  const grid = document.getElementById("char-grid");
  if (grid) renderCharacterGrid(grid);
  await saveCharacters(characters);
}

// ══════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", function() {
  loadIndexPage();
  loadCharacterPage();
});