// ── Helpers ──────────────────────────────────────────────────────────────────

function getCharacters() {
  return JSON.parse(localStorage.getItem("oc_characters") || "[]");
}

function saveCharacters(list) {
  localStorage.setItem("oc_characters", JSON.stringify(list));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── character.html logic ──────────────────────────────────────────────────────

function loadCharacterPage() {
  if (!document.getElementById("char-name")) return; // not on character page

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const characters = getCharacters();
  const character = characters.find(c => c.id === id);

  if (!character) {
    const sheet = document.querySelector(".char-sheet");
    if (sheet) sheet.innerHTML = "<p style='padding:2rem'>Character not found.</p>";
    return;
  }

  // Basic fields
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

  // Links — each link has a dedicated <li> with a matching id
  setLink("char-unvale",       "char-unvale-li",       character.links?.unvale,       "Unvale");
  setLink("char-characterhub", "char-characterhub-li", character.links?.characterhub, "CharacterHub");
  setLink("char-artfight",     "char-artfight-li",     character.links?.artfight,     "Artfight");
  setLink("char-spotify",      "char-spotify-li",      character.links?.spotify,      "Playlist");

  // Ref image
  const refWrap = document.querySelector(".char-ref-wrap");
  const img     = document.querySelector(".char-ref");
  if (character.refImage && refWrap && img) {
    img.src = character.refImage;
    refWrap.style.display = "block";
  } else if (refWrap) {
    refWrap.style.display = "none";
  }

  // Gallery
  renderGallery(character.gallery || []);

  // Page title
  document.title = (character.name || "Character") + " — Character Sheet";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

// Sets a link element's href and shows/hides its parent <li> by liId
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

// ── index.html logic ──────────────────────────────────────────────────────────

function loadIndexPage() {
  const grid = document.getElementById("char-grid");
  if (!grid) return; // not on index page

  renderCharacterGrid(grid);

  // "Add character" button (inside the section)
  document.getElementById("add-char-btn")
    ?.addEventListener("click", () => openEditor(null));

  // "+" button in the nav bar
  document.getElementById("nav-add-btn")
    ?.addEventListener("click", () => openEditor(null));

  // Modal close buttons
  document.getElementById("editor-close")
    ?.addEventListener("click", closeEditor);
  document.getElementById("editor-close-bottom")
    ?.addEventListener("click", closeEditor);

  // Close on backdrop click
  document.getElementById("editor-overlay")
    ?.addEventListener("click", e => {
      if (e.target.id === "editor-overlay") closeEditor();
    });

  // Form submit
  document.getElementById("char-editor-form")
    ?.addEventListener("submit", handleFormSubmit);

  // Gallery add-row button
  document.getElementById("add-gallery-row")
    ?.addEventListener("click", () => addGalleryRow());

  // Search
  document.getElementById("search-input")
    ?.addEventListener("input", e => {
      const query = e.target.value.trim().toLowerCase();
      renderCharacterGrid(grid, query);
    });
}

function renderCharacterGrid(grid, filter = "") {
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

// ── Editor modal ──────────────────────────────────────────────────────────────

let editingId = null;

function openEditor(id) {
  const overlay = document.getElementById("editor-overlay");
  if (!overlay) return;

  editingId = id;
  const characters = getCharacters();
  const c = id ? characters.find(x => x.id === id) : null;

  // Populate fields
  const fields = [
    "name","fandom","nicknames","pronouns","age","birthday",
    "heritage","occupation","refImage","appearance","overview",
    "background","history",
    "links.unvale","links.characterhub","links.artfight","links.spotify"
  ];

  fields.forEach(key => {
    const el = document.getElementById(`ef-${key.replace(".", "_")}`);
    if (!el) return;
    if (key.startsWith("links.")) {
      const sub = key.split(".")[1];
      el.value = c?.links?.[sub] || "";
    } else {
      el.value = c?.[key] || "";
    }
  });

  // Gallery rows
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

function addGalleryRow(item = {}) {
  const tbody = document.getElementById("gallery-rows");
  if (!tbody) return;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="g-src"     placeholder="Image URL" value="${escHtml(item.src || "")}" /></td>
    <td><input type="text" class="g-caption" placeholder="Caption"   value="${escHtml(item.caption || "")}" /></td>
    <td><input type="text" class="g-year"    placeholder="Year"      value="${escHtml(item.year || "")}" style="width:70px" /></td>
    <td><button type="button" class="rm-gallery-row">✕</button></td>
  `;
  tr.querySelector(".rm-gallery-row").addEventListener("click", () => tr.remove());
  tbody.appendChild(tr);
}

function handleFormSubmit(e) {
  e.preventDefault();
  const val = id => document.getElementById(id)?.value.trim() || "";

  const gallery = [...document.querySelectorAll("#gallery-rows tr")].map(tr => ({
    src:     tr.querySelector(".g-src")?.value.trim()     || "",
    caption: tr.querySelector(".g-caption")?.value.trim() || "",
    year:    tr.querySelector(".g-year")?.value.trim()    || "",
  })).filter(g => g.src);

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

  saveCharacters(characters);
  closeEditor();
  const grid = document.getElementById("char-grid");
  if (grid) renderCharacterGrid(grid);
}

function deleteCharacter(id) {
  if (!confirm("Delete this character? This cannot be undone.")) return;
  const characters = getCharacters().filter(c => c.id !== id);
  saveCharacters(characters);
  const grid = document.getElementById("char-grid");
  if (grid) renderCharacterGrid(grid);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  loadIndexPage();
  loadCharacterPage();
});