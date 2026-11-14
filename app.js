// ================= ESTADO GLOBAL =================
const state = {
  activeTab: "xtream",
  currentProfile: null,
  catalog: {
    live: [],
    movies: [],
    series: []
  },
  currentSection: "home",
  selectedCategory: "ALL",
  renderedCount: 0,
  filteredItems: [],
  activeModalItem: null,
  activeSeriesData: null,
  currentPlaying: null,
  hlsInstance: null
};

// ================= INICIALIZAÇÃO & TEMA =================
document.addEventListener("DOMContentLoaded", () => {
  applyCustomConfig();
  setupAuthListeners();
  setupNavigation();
  setupModalAndPlayer();
  renderSavedProfiles();

  // Reconecta automaticamente na última lista usada, se existir
  const lastId = localStorage.getItem("iptv_last_profile_id");
  const profiles = getSavedProfiles();
  const lastProfile = profiles.find(p => p.id === lastId);
  if (lastProfile) {
    connectProfile(lastProfile);
  }
});

function applyCustomConfig() {
  const root = document.documentElement;
  root.style.setProperty("--primary", APP_CONFIG.primaryColor);
  root.style.setProperty("--primary-hover", APP_CONFIG.primaryHover);
  root.style.setProperty("--bg", APP_CONFIG.backgroundColor);
  root.style.setProperty("--surface", APP_CONFIG.surfaceColor);
  root.style.setProperty("--text", APP_CONFIG.textColor);
  document.title = APP_CONFIG.appName;

  const brandHTML = APP_CONFIG.logoUrl
    ? `<img src="${APP_CONFIG.logoUrl}" alt="${APP_CONFIG.appName}">`
    : `<span class="brand-symbol">${APP_CONFIG.logoSymbol}</span><span>${APP_CONFIG.appName}</span>`;

  document.getElementById("login-brand").innerHTML = brandHTML;
  document.getElementById("app-brand").innerHTML = brandHTML;
  document.getElementById("login-tagline").textContent = APP_CONFIG.appTagline;
}

function proxify(url) {
  if (!url) return "";
  if (APP_CONFIG.corsProxy && url.startsWith("http://")) {
    return APP_CONFIG.corsProxy + encodeURIComponent(url);
  }
  return url;
}

// ================= LOGIN E GESTÃO DE PERFIS =================
function setupAuthListeners() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeTab = btn.dataset.type;

      document.querySelectorAll(".type-fields").forEach(f => f.classList.add("hidden"));
      document.getElementById(`fields-${state.activeTab}`).classList.remove("hidden");
    });
  });

  document.getElementById("connection-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errBox = document.getElementById("login-error");
    errBox.classList.add("hidden");

    const name = document.getElementById("profile-name").value.trim() || "Minha Lista";
    const profile = { id: Date.now().toString(), name, type: state.activeTab };

    try {
      if (state.activeTab === "xtream") {
        profile.host = document.getElementById("xtream-host").value.trim().replace(/\/+$/, "");
        profile.user = document.getElementById("xtream-user").value.trim();
        profile.pass = document.getElementById("xtream-pass").value.trim();
        if (!profile.host || !profile.user || !profile.pass) throw new Error("Preencha servidor, usuário e senha.");
      } else if (state.activeTab === "m3u") {
        const fileInput = document.getElementById("m3u-file");
        if (fileInput.files.length > 0) {
          profile.rawContent = await fileInput.files[0].text();
        } else {
          profile.url = document.getElementById("m3u-url").value.trim();
          if (!profile.url) throw new Error("Informe a URL M3U ou envie um arquivo.");
        }
      } else if (state.activeTab === "json") {
        const raw = document.getElementById("json-raw").value.trim();
        if (raw) {
          profile.rawContent = raw;
        } else {
          profile.url = document.getElementById("json-url").value.trim();
          if (!profile.url) throw new Error("Informe a URL JSON ou cole o código.");
        }
      } else if (state.activeTab === "url") {
        profile.url = document.getElementById("direct-url").value.trim();
        if (!profile.url) throw new Error("Informe a URL direta do vídeo.");
      }

      saveProfile(profile);
      await connectProfile(profile);
    } catch (err) {
      errBox.textContent = err.message || "Falha ao conectar na lista.";
      errBox.classList.remove("hidden");
    }
  });

  document.getElementById("btn-switch-list").addEventListener("click", () => {
    document.getElementById("app-screen").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
    renderSavedProfiles();
  });
}

function getSavedProfiles() {
  return JSON.parse(localStorage.getItem("iptv_profiles") || "[]");
}

function saveProfile(profile) {
  const list = getSavedProfiles().filter(p => p.id !== profile.id);
  list.unshift(profile);
  localStorage.setItem("iptv_profiles", JSON.stringify(list));
  localStorage.setItem("iptv_last_profile_id", profile.id);
}

function renderSavedProfiles() {
  const list = getSavedProfiles();
  const box = document.getElementById("saved-profiles-box");
  const container = document.getElementById("saved-profiles-list");
  if (!list.length) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  container.innerHTML = list.map(p => `
    <div class="profile-item" data-id="${p.id}">
      <div class="profile-meta">
        <strong>${escapeHTML(p.name)}</strong><br/>
        <span>Formato: ${p.type.toUpperCase()}</span>
      </div>
      <button class="btn-del-profile" data-del="${p.id}" title="Remover">✕</button>
    </div>
  `).join("");

  container.querySelectorAll(".profile-item").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.dataset.del) {
        const updated = getSavedProfiles().filter(x => x.id !== e.target.dataset.del);
        localStorage.setItem("iptv_profiles", JSON.stringify(updated));
        renderSavedProfiles();
        return;
      }
      const found = getSavedProfiles().find(x => x.id === el.dataset.id);
      if (found) {
        localStorage.setItem("iptv_last_profile_id", found.id);
        connectProfile(found);
      }
    });
  });
}

// ================= PARSERS (XTREAM CODES, M3U, JSON, URL) =================
async function connectProfile(profile) {
  const btn = document.getElementById("btn-connect");
  btn.textContent = "Carregando catálogo...";
  btn.disabled = true;

  try {
    state.currentProfile = profile;
    state.catalog = { live: [], movies: [], series: [] };

    if (profile.type === "xtream") {
      await loadXtreamCodes(profile);
    } else if (profile.type === "m3u") {
      const text = profile.rawContent || await (await fetch(proxify(profile.url))).text();
      parseM3U(text);
    } else if (profile.type === "json") {
      const raw = profile.rawContent || await (await fetch(proxify(profile.url))).text();
      parseJSONList(JSON.parse(raw));
    } else if (profile.type === "url") {
      state.catalog.live.push({
        id: "direct_1",
        type: "live",
        title: profile.name,
        category: "Stream Direto",
        logo: "",
        url: profile.url
      });
    }

    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-screen").classList.remove("hidden");
    switchSection("home");
  } catch (err) {
    const errBox = document.getElementById("login-error");
    errBox.textContent = "Erro ao carregar dados: " + err.message;
    errBox.classList.remove("hidden");
  } finally {
    btn.textContent = "Conectar e Carregar Catálogo";
    btn.disabled = false;
  }
}

async function loadXtreamCodes({ host, user, pass }) {
  const base = `${host}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;

  const [liveCats, liveStreams, vodCats, vodStreams, seriesCats, seriesList] = await Promise.all([
    fetchJSON(`${base}&action=get_live_categories`).catch(() => []),
    fetchJSON(`${base}&action=get_live_streams`).catch(() => []),
    fetchJSON(`${base}&action=get_vod_categories`).catch(() => []),
    fetchJSON(`${base}&action=get_vod_streams`).catch(() => []),
    fetchJSON(`${base}&action=get_series_categories`).catch(() => []),
    fetchJSON(`${base}&action=get_series`).catch(() => [])
  ]);

  const mapCats = (arr) => Object.fromEntries((arr || []).map(c => [c.category_id, c.category_name]));
  const lMap = mapCats(liveCats);
  const vMap = mapCats(vodCats);
  const sMap = mapCats(seriesCats);

  // Nota: .m3u8 garante compatibilidade nativa no Safari do iPhone 16e
  state.catalog.live = (liveStreams || []).map(item => ({
    id: `live_${item.stream_id}`,
    streamId: item.stream_id,
    type: "live",
    title: item.name,
    category: lMap[item.category_id] || "TV ao Vivo",
    logo: item.stream_icon || "",
    url: `${host}/live/${user}/${pass}/${item.stream_id}.m3u8`
  }));

  state.catalog.movies = (vodStreams || []).map(item => ({
    id: `vod_${item.stream_id}`,
    streamId: item.stream_id,
    type: "movie",
    title: item.name,
    category: vMap[item.category_id] || "Filmes",
    logo: item.stream_icon || "",
    rating: item.rating || "",
    ext: item.container_extension || "mp4",
    url: `${host}/movie/${user}/${pass}/${item.stream_id}.${item.container_extension || "mp4"}`
  }));

  state.catalog.series = (seriesList || []).map(item => ({
    id: `series_${item.series_id}`,
    seriesId: item.series_id,
    type: "series",
    title: item.name,
    category: sMap[item.category_id] || "Séries",
    logo: item.cover || "",
    backdrop: (item.backdrop_path && item.backdrop_path[0]) || item.cover || "",
    rating: item.rating || "",
    synopsis: item.plot || "",
    year: item.releaseDate || ""
  }));
}

function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXTINF:")) {
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const titleParts = line.split(",");
      const title = titleParts[titleParts.length - 1].trim() || "Canal sem nome";

      current = {
        id: `m3u_${i}`,
        title,
        logo: logoMatch ? logoMatch[1] : "",
        category: groupMatch && groupMatch[1] ? groupMatch[1] : "Geral"
      };
    } else if (line && !line.startsWith("#") && current) {
      const isMovie = /\.(mp4|mkv|avi|mov)(\?|$)/i.test(line) || /filme|vod|movie/i.test(current.category);
      const isSeries = /s[0-9]{1,2}e[0-9]{1,2}|temporada|série|series/i.test(current.title + current.category);
      current.url = line;
      current.type = isSeries ? "series" : isMovie ? "movie" : "live";

      if (current.type === "movie") state.catalog.movies.push(current);
      else if (current.type === "series") state.catalog.series.push(current);
      else state.catalog.live.push(current);

      current = null;
    }
  }
}

function parseJSONList(data) {
  const items = Array.isArray(data) ? data : (data.items || data.channels || []);
  items.forEach((item, idx) => {
    const entry = {
      id: item.id || `json_${idx}`,
      type: item.type || (/\.(mp4|mkv)$/i.test(item.url) ? "movie" : "live"),
      title: item.name || item.title || `Item ${idx + 1}`,
      category: item.group || item.category || "Geral",
      logo: item.logo || item.poster || "",
      backdrop: item.backdrop || item.logo || "",
      synopsis: item.synopsis || item.description || "",
      year: item.year || "",
      rating: item.rating || "",
      url: item.url
    };
    if (entry.type === "movie") state.catalog.movies.push(entry);
    else if (entry.type === "series") state.catalog.series.push(entry);
    else state.catalog.live.push(entry);
  });
}

async function fetchJSON(url) {
  const res = await fetch(proxify(url));
  return res.json();
}

// ================= NAVEGAÇÃO E RENDERIZAÇÃO =================
function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      switchSection(btn.dataset.section);
    });
  });

  document.getElementById("search-input").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      switchSection(state.currentSection);
      return;
    }
    const all = [...state.catalog.live, ...state.catalog.movies, ...state.catalog.series];
    const results = all.filter(item => item.title.toLowerCase().includes(q));
    showGridSection(`Resultados para "${e.target.value}"`, results, false);
  });

  document.getElementById("btn-load-more").addEventListener("click", () => {
    renderMoreCards();
  });
}

function switchSection(section) {
  state.currentSection = section;
  state.selectedCategory = "ALL";
  document.getElementById("search-input").value = "";

  const hero = document.getElementById("hero-banner");
  const catBar = document.getElementById("category-bar");
  const homeRows = document.getElementById("home-rows");
  const gridWrap = document.getElementById("catalog-grid-wrapper");

  if (section === "home") {
    catBar.classList.add("hidden");
    gridWrap.classList.add("hidden");
    homeRows.classList.remove("hidden");
    renderHomeView();
  } else {
    hero.classList.add("hidden");
    homeRows.classList.add("hidden");
    gridWrap.classList.remove("hidden");

    if (section === "live") showGridSection("TV ao Vivo", state.catalog.live, true);
    else if (section === "movies") showGridSection("Filmes", state.catalog.movies, true);
    else if (section === "series") showGridSection("Séries", state.catalog.series, true);
    else if (section === "favorites") {
      const favIds = getFavorites();
      const all = [...state.catalog.live, ...state.catalog.movies, ...state.catalog.series];
      showGridSection("Minha Lista", all.filter(i => favIds.includes(i.id)), false);
    }
  }
}

function renderHomeView() {
  const hero = document.getElementById("hero-banner");
  const rowsContainer = document.getElementById("home-rows");
  rowsContainer.innerHTML = "";

  // Banner de destaque (pega um filme ou série aleatória com imagem)
  const pool = [...state.catalog.movies, ...state.catalog.series].filter(i => i.logo);
  const featured = pool[Math.floor(Math.random() * Math.min(pool.length, 30))] || state.catalog.live[0];

  if (featured) {
    hero.classList.remove("hidden");
    document.getElementById("hero-backdrop").style.backgroundImage = `url('${featured.backdrop || featured.logo}')`;
    document.getElementById("hero-badge").textContent = featured.category.toUpperCase();
    document.getElementById("hero-title").textContent = featured.title;
    document.getElementById("hero-desc").textContent = featured.synopsis || "Toque para ver detalhes, sinopse ou iniciar a reprodução.";
    document.getElementById("hero-play-btn").onclick = () => handleItemClick(featured, true);
    document.getElementById("hero-info-btn").onclick = () => openDetailsModal(featured);
  } else {
    hero.classList.add("hidden");
  }

  // 1. Linha "Continuar Assistindo"
  const history = Object.values(getWatchHistory()).sort((a, b) => b.updatedAt - a.updatedAt);
  if (history.length > 0) {
    appendRow(rowsContainer, "Continuar Assistindo", history.map(h => h.item));
  }

  // 2. Linhas de destaque por tipo
  if (state.catalog.live.length) appendRow(rowsContainer, "Canais ao Vivo", state.catalog.live.slice(0, 20));
  if (state.catalog.movies.length) appendRow(rowsContainer, "Filmes Adicionados", state.catalog.movies.slice(0, 20));
  if (state.catalog.series.length) appendRow(rowsContainer, "Séries em Alta", state.catalog.series.slice(0, 20));
}

function appendRow(container, title, items) {
  const row = document.createElement("div");
  row.className = "media-row";
  row.innerHTML = `<h3 class="row-title">${escapeHTML(title)}</h3><div class="row-scroller"></div>`;
  const scroller = row.querySelector(".row-scroller");
  items.forEach(item => scroller.appendChild(createMediaCard(item)));
  container.appendChild(row);
}

function showGridSection(title, items, showCategories) {
  document.getElementById("section-title").textContent = title;
  const catBar = document.getElementById("category-bar");

  if (showCategories && items.length > 0) {
    const categories = ["ALL", ...new Set(items.map(i => i.category))];
    catBar.classList.remove("hidden");
    catBar.innerHTML = categories.map(cat => `
      <button class="cat-chip ${state.selectedCategory === cat ? "active" : ""}" data-cat="${escapeHTML(cat)}">
        ${cat === "ALL" ? "Todas" : escapeHTML(cat)}
      </button>
    `).join("");

    catBar.querySelectorAll(".cat-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        state.selectedCategory = chip.dataset.cat;
        showGridSection(title, items, true);
      });
    });
  } else {
    catBar.classList.add("hidden");
  }

  state.filteredItems = state.selectedCategory === "ALL"
    ? items
    : items.filter(i => i.category === state.selectedCategory);

  document.getElementById("section-count").textContent = `${state.filteredItems.length} itens`;
  document.getElementById("catalog-grid").innerHTML = "";
  state.renderedCount = 0;
  renderMoreCards();
}

function renderMoreCards() {
  const grid = document.getElementById("catalog-grid");
  const slice = state.filteredItems.slice(state.renderedCount, state.renderedCount + APP_CONFIG.batchSize);
  slice.forEach(item => grid.appendChild(createMediaCard(item)));
  state.renderedCount += slice.length;

  const btnMore = document.getElementById("btn-load-more");
  if (state.renderedCount < state.filteredItems.length) {
    btnMore.classList.remove("hidden");
  } else {
    btnMore.classList.add("hidden");
  }
}

function createMediaCard(item) {
  const card = document.createElement("div");
  card.className = "media-card";
  card.tabIndex = 0;

  const history = getWatchHistory()[item.id];
  const progressPct = history && history.duration > 0
    ? Math.min(100, Math.round((history.currentTime / history.duration) * 100))
    : 0;

  const isLive = item.type === "live";
  card.innerHTML = `
    <div class="card-thumb ${isLive ? "live-thumb" : ""}">
      ${item.logo
        ? `<img src="${item.logo}" loading="lazy" alt="" onerror="this.style.display='none'">`
        : `<span class="card-fallback-icon">${isLive ? "📺" : "🎬"}</span>`}
      ${progressPct > 2 ? `<div class="card-progress-bar"><div class="card-progress-fill" style="width:${progressPct}%"></div></div>` : ""}
    </div>
    <div class="card-info">
      <div class="card-title">${escapeHTML(item.title)}</div>
      <div class="card-sub">${escapeHTML(item.category)}</div>
    </div>
  `;

  card.addEventListener("click", () => handleItemClick(item, false));
  return card;
}

function handleItemClick(item, directPlay) {
  if (item.type === "live" && directPlay) {
    startPlayback(item, 0);
  } else {
    openDetailsModal(item);
  }
}

// ================= TELA "SOBRE" (DETALHES VOD / SÉRIES / CONTINUAR) =================
async function openDetailsModal(item) {
  state.activeModalItem = item;
  const modal = document.getElementById("vod-modal");
  modal.classList.remove("hidden");

  document.getElementById("modal-backdrop").src = item.backdrop || item.logo || "";
  document.getElementById("modal-poster").src = item.logo || "";
  document.getElementById("modal-category").textContent = item.category;
  document.getElementById("modal-title").textContent = item.title;
  document.getElementById("modal-year").textContent = item.year || "";
  document.getElementById("modal-rating").textContent = item.rating ? `★ ${item.rating}` : "";
  document.getElementById("modal-duration").textContent = "";
  document.getElementById("modal-synopsis").textContent = item.synopsis || "Sem sinopse disponível.";
  document.getElementById("modal-extra-info").innerHTML = "";
  document.getElementById("series-episodes-box").classList.add("hidden");

  updateFavoriteButton(item.id);

  // Verifica histórico para exibir "Continuar de onde parou"
  const saved = getWatchHistory()[item.id];
  const btnResume = document.getElementById("btn-resume");
  const progressBox = document.getElementById("modal-progress-box");

  if (saved && saved.currentTime > 10 && item.type !== "live") {
    btnResume.classList.remove("hidden");
    document.getElementById("resume-time-label").textContent = formatTime(saved.currentTime);
    btnResume.onclick = () => {
      modal.classList.add("hidden");
      startPlayback(saved.episodeItem || item, saved.currentTime);
    };

    if (saved.duration > 0) {
      const pct = Math.min(100, Math.round((saved.currentTime / saved.duration) * 100));
      progressBox.classList.remove("hidden");
      document.getElementById("modal-progress-fill").style.width = `${pct}%`;
      document.getElementById("modal-progress-text").textContent = `${pct}% concluído (${formatTime(saved.currentTime)} de ${formatTime(saved.duration)})`;
    }
  } else {
    btnResume.classList.add("hidden");
    progressBox.classList.add("hidden");
  }

  document.getElementById("btn-play-start").onclick = () => {
    modal.classList.add("hidden");
    startPlayback(item, 0);
  };

  // Busca metadados completos na API Xtream Codes (se aplicável)
  if (state.currentProfile?.type === "xtream") {
    const { host, user, pass } = state.currentProfile;
    const base = `${host}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;

    if (item.type === "movie" && item.streamId) {
      fetchJSON(`${base}&action=get_vod_info&vod_id=${item.streamId}`).then(data => {
        const info = data?.info || {};
        if (info.plot) document.getElementById("modal-synopsis").textContent = info.plot;
        if (info.releasedate) document.getElementById("modal-year").textContent = info.releasedate.slice(0, 4);
        if (info.duration) document.getElementById("modal-duration").textContent = info.duration;
        if (info.backdrop_path?.[0]) document.getElementById("modal-backdrop").src = info.backdrop_path[0];
        document.getElementById("modal-extra-info").innerHTML = `
          ${info.director ? `<div><strong>Direção:</strong> ${escapeHTML(info.director)}</div>` : ""}
          ${info.cast ? `<div><strong>Elenco:</strong> ${escapeHTML(info.cast)}</div>` : ""}
        `;
      }).catch(() => {});
    } else if (item.type === "series" && item.seriesId) {
      fetchJSON(`${base}&action=get_series_info&series_id=${item.seriesId}`).then(data => {
        state.activeSeriesData = data;
        const info = data?.info || {};
        if (info.plot) document.getElementById("modal-synopsis").textContent = info.plot;
        renderSeriesSeasons(data, item);
      }).catch(() => {});
    }
  }
}

function renderSeriesSeasons(data, seriesItem) {
  const episodesMap = data?.episodes || {};
  const seasons = Object.keys(episodesMap);
  if (!seasons.length) return;

  const box = document.getElementById("series-episodes-box");
  const select = document.getElementById("season-select");
  box.classList.remove("hidden");

  select.innerHTML = seasons.map(s => `<option value="${s}">Temporada ${s}</option>`).join("");
  select.onchange = () => renderEpisodesList(episodesMap[select.value], seriesItem);
  renderEpisodesList(episodesMap[seasons[0]], seriesItem);
}

function renderEpisodesList(episodes, seriesItem) {
  const list = document.getElementById("episodes-list");
  const { host, user, pass } = state.currentProfile;

  list.innerHTML = (episodes || []).map(ep => `
    <div class="episode-item" data-ep-id="${ep.id}">
      <div>
        <strong>${ep.episode_num}. ${escapeHTML(ep.title || `Episódio ${ep.episode_num}`)}</strong>
      </div>
      <span>▶</span>
    </div>
  `).join("");

  list.querySelectorAll(".episode-item").forEach((el, idx) => {
    el.addEventListener("click", () => {
      const ep = episodes[idx];
      const epPlayable = {
        ...seriesItem,
        episodeId: ep.id,
        episodeTitle: `T${ep.season} • Ep ${ep.episode_num} - ${ep.title || ""}`,
        url: `${host}/series/${user}/${pass}/${ep.id}.${ep.container_extension || "mp4"}`
      };
      document.getElementById("vod-modal").classList.add("hidden");
      startPlayback(epPlayable, 0);
    });
  });
}

// ================= PLAYER DE VÍDEO & SALVAMENTO DE PROGRESSO =================
function setupModalAndPlayer() {
  document.getElementById("btn-close-modal").addEventListener("click", () => {
    document.getElementById("vod-modal").classList.add("hidden");
  });

  document.getElementById("btn-toggle-fav").addEventListener("click", () => {
    if (!state.activeModalItem) return;
    toggleFavorite(state.activeModalItem.id);
    updateFavoriteButton(state.activeModalItem.id);
  });

  const video = document.getElementById("video-player");

  document.getElementById("btn-close-player").addEventListener("click", () => {
    saveCurrentProgress();
    stopPlayback();
    document.getElementById("player-overlay").classList.add("hidden");
    if (state.currentSection === "home") renderHomeView();
  });

  document.getElementById("btn-restart-video").addEventListener("click", () => {
    video.currentTime = 0;
    video.play();
  });

  document.getElementById("btn-pip").addEventListener("click", async () => {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (video.requestPictureInPicture) {
      await video.requestPictureInPicture();
    } else if (video.webkitSetPresentationMode) {
      // Fallback específico para Safari no iPhone
      video.webkitSetPresentationMode(video.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture");
    }
  });

  // Salva progresso automaticamente a cada 5 segundos
  setInterval(() => {
    if (!video.paused && !video.ended && state.currentPlaying) {
      saveCurrentProgress();
    }
  }, 5000);
}

function startPlayback(item, startTime = 0) {
  stopPlayback();
  state.currentPlaying = item;

  const overlay = document.getElementById("player-overlay");
  const video = document.getElementById("video-player");
  const spinner = document.getElementById("player-spinner");

  overlay.classList.remove("hidden");
  spinner.classList.remove("hidden");
  document.getElementById("player-title").textContent = item.title;
  document.getElementById("player-subtitle").textContent = item.episodeTitle || item.category;

  const streamUrl = proxify(item.url);

  const onReady = () => {
    spinner.classList.add("hidden");
    if (startTime > 0 && isFinite(video.duration)) {
      video.currentTime = startTime;
    }
    video.play().catch(() => {});
  };

  // Safari (iPhone/Mac) toca .m3u8 nativamente; outros navegadores usam Hls.js
  if (streamUrl.includes(".m3u8") && !video.canPlayType("application/vnd.apple.mpegurl") && window.Hls?.isSupported()) {
    state.hlsInstance = new Hls();
    state.hlsInstance.loadSource(streamUrl);
    state.hlsInstance.attachMedia(video);
    state.hlsInstance.on(Hls.Events.MANIFEST_PARSED, onReady);
  } else {
    video.src = streamUrl;
    video.addEventListener("loadedmetadata", onReady, { once: true });
  }
}

function stopPlayback() {
  const video = document.getElementById("video-player");
  video.pause();
  video.removeAttribute("src");
  video.load();
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }
}

function saveCurrentProgress() {
  const video = document.getElementById("video-player");
  const item = state.currentPlaying;
  if (!item || !video.currentTime || video.currentTime < 5) return;

  const history = getWatchHistory();
  history[item.id] = {
    item: { ...item, episodeId: undefined, episodeTitle: undefined },
    episodeItem: item.episodeId ? item : null,
    currentTime: video.currentTime,
    duration: isFinite(video.duration) ? video.duration : 0,
    updatedAt: Date.now()
  };
  localStorage.setItem("iptv_history", JSON.stringify(history));
}

function getWatchHistory() {
  return JSON.parse(localStorage.getItem("iptv_history") || "{}");
}

function getFavorites() {
  return JSON.parse(localStorage.getItem("iptv_favorites") || "[]");
}

function toggleFavorite(id) {
  let favs = getFavorites();
  favs = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id];
  localStorage.setItem("iptv_favorites", JSON.stringify(favs));
}

function updateFavoriteButton(id) {
  const btn = document.getElementById("btn-toggle-fav");
  btn.textContent = getFavorites().includes(id) ? "✓ Na Minha Lista" : "+ Minha Lista";
}

function formatTime(sec) {
  const s = Math.floor(sec);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return hrs > 0
    ? `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function escapeHTML(str) {
  return String(str || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
