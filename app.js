// ================= DICIONÁRIO DE TRADUÇÃO DE CATEGORIAS M3U =================
const CATEGORY_TRANSLATIONS = {
  "entertainment": "Entretenimento",
  "movies": "Filmes",
  "movie": "Filmes",
  "series": "Séries",
  "news": "Notícias",
  "sports": "Esportes",
  "sport": "Esportes",
  "kids": "Infantil",
  "children": "Infantil",
  "animation": "Animação",
  "documentary": "Documentários",
  "music": "Música",
  "education": "Educação",
  "religious": "Religioso",
  "religion": "Religioso",
  "culture": "Cultura",
  "general": "Variedades",
  "undefined": "Geral",
  "uncategorized": "Geral",
  "other": "Geral",
  "comedy": "Comédia",
  "classic": "Clássicos",
  "classics": "Clássicos",
  "lifestyle": "Estilo de Vida",
  "cooking": "Culinária",
  "shop": "Compras",
  "shopping": "Compras",
  "outdoor": "Natureza & Agro",
  "auto": "Automotivo",
  "automotive": "Automotivo",
  "business": "Negócios",
  "science": "Ciência",
  "travel": "Viagens",
  "weather": "Clima",
  "family": "Família",
  "legislative": "Legislativo"
};

// ================= PRIORIZAÇÃO DE CANAIS BRASILEIROS =================
const BRAZILIAN_KEYWORDS = [
  /\b(br|brazil|brasil|pt-br|portugu[eê]s)\b/i,
  /\b(globo|sbt|record|band|redetv|cultura|cnn brasil|jovem pan|agrobrasil|agrocanal|canal rural|canal do criador|fishtv|boas novas|amazon sat|arte 1|maisum|adrenalina pura|sportv|premiere|combate|telecine|megapix|multishow|gnt|viva|canal brasil|bis|off|gloob|tv brasil|tv câmara|tv senado|tv justiça|gazeta|rede vida|aparecida|canção nova|novo tempo)\b/i
];

function isBrazilianChannel(item) {
  const haystack = `${item.country || ""} ${item.lang || ""} ${item.title || ""} ${(item.categories || []).join(" ")}`;
  return BRAZILIAN_KEYWORDS.some(rx => rx.test(haystack));
}

function sortBrazilianFirst(items) {
  return [...items].sort((a, b) => {
    const aBr = isBrazilianChannel(a) ? 0 : 1;
    const bBr = isBrazilianChannel(b) ? 0 : 1;
    return aBr - bBr;
  });
}

function normalizeCategories(rawGroup) {
  if (!rawGroup) return ["Geral"];
  const parts = String(rawGroup)
    .split(/[;|]/)
    .map(s => s.trim())
    .filter(Boolean);

  if (!parts.length) return ["Geral"];

  const translated = parts.map(part => {
    const key = part.toLowerCase();
    return CATEGORY_TRANSLATIONS[key] || part;
  });

  return [...new Set(translated)];
}

// ================= ÍCONES VETORIAIS =================
const SVG_ICONS = {
  playTriangle: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`,
  tv: `<svg class="card-fallback-svg" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>`,
  movie: `<svg class="card-fallback-svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>`,
  close: `<svg class="icon-svg" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
};

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
  hlsInstance: null,
  scrollObserver: null,
  backAction: null
};

let playerControlsTimer = null;
let streamTimeoutTimer = null;
let playbackAttemptId = 0;

// ================= INICIALIZAÇÃO & TEMA =================
document.addEventListener("DOMContentLoaded", () => {
  applyCustomConfig();
  setupAuthListeners();
  setupTopMenu();
  setupNavigation();
  setupModalAndPlayer();
  setupInfiniteScroll();
  renderSavedProfiles();

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

  if (APP_CONFIG.logoUrl) {
    document.getElementById("login-brand").innerHTML = `<img src="${escapeHTML(APP_CONFIG.logoUrl)}" alt="${escapeHTML(APP_CONFIG.appName)}">`;
    document.getElementById("app-brand").innerHTML = `<img src="${escapeHTML(APP_CONFIG.logoUrl)}" alt="${escapeHTML(APP_CONFIG.appName)}">`;
  } else {
    document.getElementById("login-brand").innerHTML = `<span class="brand-symbol">${SVG_ICONS.playTriangle}</span><span>${escapeHTML(APP_CONFIG.appName)}</span>`;
    document.getElementById("app-brand").innerHTML = `<span class="brand-mini-symbol">${SVG_ICONS.playTriangle}</span><span>${escapeHTML(APP_CONFIG.appName)}</span>`;
  }
  document.getElementById("login-tagline").textContent = APP_CONFIG.appTagline;
}

function getNormalizedProxyBase() {
  const raw = (APP_CONFIG.corsProxy || "").trim();
  if (!raw) return "";
  if (raw.endsWith("?url=") || raw.endsWith("&url=")) return raw;
  return raw.replace(/\/+$/, "") + "/?url=";
}

function proxify(url, forceProxy = false) {
  if (!url) return "";
  const proxyBase = getNormalizedProxyBase();
  if (!proxyBase) return url;
  if (url.startsWith(proxyBase)) return url;
  if (forceProxy || url.startsWith("http://")) {
    return proxyBase + encodeURIComponent(url);
  }
  return url;
}

function diagnoseStreamFailure(rawUrl, usedProxy) {
  if (!rawUrl) return "Endereço do canal inválido ou vazio.";

  if (/\/udp\//i.test(rawUrl) || /\.ogg(\?|$)/i.test(rawUrl)) {
    return "Formato incompatível com o navegador do iPhone (stream UDP multicast ou .ogg).";
  }

  try {
    const parsed = new URL(rawUrl);
    const hasCustomPort = parsed.port && parsed.port !== "80" && parsed.port !== "443";
    const hasExt = /\.(m3u8|m3u|mp4|mkv|webm|mov|mpd)(\?|$)/i.test(parsed.pathname);

    if (!hasExt && hasCustomPort) {
      return `Stream bruto MPEG-TS na porta :${parsed.port} (não suportado por navegadores web).`;
    }
    if (usedProxy && hasCustomPort && getNormalizedProxyBase().includes("workers.dev")) {
      return `O proxy gratuito da Cloudflare bloqueia conexões na porta :${parsed.port} (${parsed.hostname}), ou o servidor está fora do ar.`;
    }
    if (rawUrl.startsWith("http://") && !usedProxy) {
      return "Canal HTTP bloqueado pelo Safari. Configure um proxy HTTPS em config.js.";
    }
  } catch (_) {}

  return "O servidor do canal está fora do ar, bloqueou o acesso externo ou expirou.";
}

// ================= MENU SUSPENSO DE LOGIN & PERFIS =================
function setupAuthListeners() {
  const trigger = document.getElementById("conn-select-trigger");
  const menu = document.getElementById("conn-dropdown-menu");
  const labelDisplay = document.getElementById("selected-type-label");

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = !menu.classList.contains("hidden");
    menu.classList.toggle("hidden", isOpen);
    trigger.setAttribute("aria-expanded", String(!isOpen));
  });

  document.querySelectorAll(".dropdown-option").forEach(opt => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".dropdown-option").forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      state.activeTab = opt.dataset.type;
      labelDisplay.textContent = opt.dataset.label;

      menu.classList.add("hidden");
      trigger.setAttribute("aria-expanded", "false");

      document.querySelectorAll(".type-fields").forEach(f => f.classList.add("hidden"));
      document.getElementById(`fields-${state.activeTab}`).classList.remove("hidden");
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#conn-dropdown")) {
      menu.classList.add("hidden");
      trigger.setAttribute("aria-expanded", "false");
    }
    if (!e.target.closest(".menu-wrapper")) {
      document.getElementById("top-dropdown-menu").classList.add("hidden");
      document.getElementById("btn-top-menu").setAttribute("aria-expanded", "false");
    }
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
}

function setupTopMenu() {
  const menuBtn = document.getElementById("btn-top-menu");
  const dropdown = document.getElementById("top-dropdown-menu");

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden", isOpen);
    menuBtn.setAttribute("aria-expanded", String(!isOpen));
  });

  document.getElementById("btn-reload-list").addEventListener("click", () => {
    dropdown.classList.add("hidden");
    if (state.currentProfile) {
      connectProfile(state.currentProfile);
    }
  });

  document.getElementById("btn-switch-list").addEventListener("click", () => {
    dropdown.classList.add("hidden");
    stopPlayback();
    document.getElementById("player-overlay").classList.add("hidden");
    document.getElementById("app-screen").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
    renderSavedProfiles();
  });
}

function getSavedProfiles() {
  try {
    return JSON.parse(localStorage.getItem("iptv_profiles") || "[]");
  } catch {
    return [];
  }
}

function saveProfile(profile) {
  try {
    const list = getSavedProfiles().filter(p => p.id !== profile.id);
    list.unshift(profile);
    localStorage.setItem("iptv_profiles", JSON.stringify(list));
    localStorage.setItem("iptv_last_profile_id", profile.id);
  } catch (_) {}
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
    <div class="profile-item" data-id="${escapeHTML(p.id)}">
      <div class="profile-meta">
        <strong>${escapeHTML(p.name)}</strong><br/>
        <span>Formato: ${escapeHTML(p.type.toUpperCase())}</span>
      </div>
      <button type="button" class="btn-del-profile" data-del="${escapeHTML(p.id)}" title="Remover">${SVG_ICONS.close}</button>
    </div>
  `).join("");

  container.querySelectorAll(".profile-item").forEach(el => {
    el.addEventListener("click", (e) => {
      const delBtn = e.target.closest("[data-del]");
      if (delBtn) {
        const updated = getSavedProfiles().filter(x => x.id !== delBtn.dataset.del);
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
async function fetchTextChecked(url) {
  const res = await fetch(proxify(url));
  if (!res.ok) throw new Error(`Servidor retornou erro HTTP ${res.status}`);
  return res.text();
}

async function fetchJSON(url) {
  const res = await fetch(proxify(url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

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
      const text = profile.rawContent || await fetchTextChecked(profile.url);
      parseM3U(text);
    } else if (profile.type === "json") {
      const raw = profile.rawContent || await fetchTextChecked(profile.url);
      parseJSONList(JSON.parse(raw));
    } else if (profile.type === "url") {
      state.catalog.live.push({
        id: "direct_1",
        type: "live",
        title: profile.name,
        category: "Transmissão Direta",
        categories: ["Transmissão Direta"],
        logo: "",
        url: profile.url
      });
    }

    state.catalog.live = sortBrazilianFirst(state.catalog.live);

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

  state.catalog.live = (liveStreams || []).map(item => {
    const cats = normalizeCategories(lMap[item.category_id] || "TV ao Vivo");
    return {
      id: `live_${item.stream_id}`,
      streamId: item.stream_id,
      type: "live",
      title: item.name,
      category: cats[0],
      categories: cats,
      logo: item.stream_icon || "",
      url: `${host}/live/${user}/${pass}/${item.stream_id}.m3u8`
    };
  });

  state.catalog.movies = (vodStreams || []).map(item => {
    const cats = normalizeCategories(vMap[item.category_id] || "Filmes");
    return {
      id: `vod_${item.stream_id}`,
      streamId: item.stream_id,
      type: "movie",
      title: item.name,
      category: cats[0],
      categories: cats,
      logo: item.stream_icon || "",
      rating: item.rating || "",
      ext: item.container_extension || "mp4",
      url: `${host}/movie/${user}/${pass}/${item.stream_id}.${item.container_extension || "mp4"}`
    };
  });

  state.catalog.series = (seriesList || []).map(item => {
    const cats = normalizeCategories(sMap[item.category_id] || "Séries");
    return {
      id: `series_${item.series_id}`,
      seriesId: item.series_id,
      type: "series",
      title: item.name,
      category: cats[0],
      categories: cats,
      logo: item.cover || "",
      backdrop: (item.backdrop_path && item.backdrop_path[0]) || item.cover || "",
      rating: item.rating || "",
      synopsis: item.plot || "",
      year: item.releaseDate || ""
    };
  });
}

function extractExtinfTitle(line) {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) {
      return line.slice(i + 1).trim();
    }
  }
  const parts = line.split(",");
  return parts[parts.length - 1].trim();
}

function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXTINF:")) {
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const countryMatch = line.match(/tvg-country="([^"]*)"/i);
      const langMatch = line.match(/tvg-language="([^"]*)"/i);
      const title = extractExtinfTitle(line) || "Canal sem nome";
      const cats = normalizeCategories(groupMatch ? groupMatch[1] : "Geral");

      current = {
        id: `m3u_${i}`,
        title,
        logo: logoMatch ? logoMatch[1] : "",
        country: countryMatch ? countryMatch[1] : "",
        lang: langMatch ? langMatch[1] : "",
        category: cats[0],
        categories: cats
      };
    } else if (line && !line.startsWith("#") && current) {
      const hasVodExt = /\.(mp4|mkv|avi|mov|m4v)(\?|$)/i.test(line);
      const isSeriesUrl = /\/series\//i.test(line) || (hasVodExt && /s[0-9]{1,2}e[0-9]{1,2}|[0-9]{1,2}x[0-9]{1,2}/i.test(current.title));
      const isMovieUrl = /\/movie\//i.test(line) || (hasVodExt && !isSeriesUrl);

      current.url = line;
      current.type = isSeriesUrl ? "series" : isMovieUrl ? "movie" : "live";

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
    const cats = normalizeCategories(item.group || item.category || "Geral");
    const entry = {
      id: item.id || `json_${idx}`,
      type: item.type || (/\.(mp4|mkv)$/i.test(item.url) ? "movie" : "live"),
      title: item.name || item.title || `Item ${idx + 1}`,
      country: item.country || "",
      lang: item.language || "",
      category: cats[0],
      categories: cats,
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

// ================= NAVEGAÇÃO E RENDERIZAÇÃO =================
function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      switchSection(btn.dataset.section);
    });
  });

  document.getElementById("btn-grid-back").addEventListener("click", () => {
    if (typeof state.backAction === "function") {
      state.backAction();
    } else {
      switchSection(state.currentSection);
    }
  });

  document.getElementById("search-input").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      switchSection(state.currentSection);
      return;
    }
    const all = [...state.catalog.live, ...state.catalog.movies, ...state.catalog.series];
    const results = all.filter(item => item.title.toLowerCase().includes(q));
    document.getElementById("hero-banner").classList.add("hidden");
    document.getElementById("home-rows").classList.add("hidden");
    document.getElementById("catalog-grid-wrapper").classList.remove("hidden");
    showGridSection(`Busca: "${e.target.value}"`, results, false, () => switchSection(state.currentSection));
  });
}

function setupInfiniteScroll() {
  const sentinel = document.getElementById("scroll-sentinel");
  state.scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && state.renderedCount < state.filteredItems.length) {
      renderMoreCards();
    }
  }, { rootMargin: "300px" });
  state.scrollObserver.observe(sentinel);
}

function switchSection(section) {
  state.currentSection = section;
  state.selectedCategory = "ALL";
  state.backAction = null;
  document.getElementById("search-input").value = "";
  window.scrollTo({ top: 0, behavior: "instant" });

  const hero = document.getElementById("hero-banner");
  const catBar = document.getElementById("category-bar");
  const homeRows = document.getElementById("home-rows");
  const gridWrap = document.getElementById("catalog-grid-wrapper");

  if (section === "home") {
    catBar.classList.add("hidden");
    gridWrap.classList.add("hidden");
    homeRows.classList.remove("hidden");
    renderHomeView();
  } else if (section === "live") {
    hero.classList.add("hidden");
    catBar.classList.add("hidden");
    renderLiveTvView();
  } else {
    hero.classList.add("hidden");
    homeRows.classList.add("hidden");
    gridWrap.classList.remove("hidden");

    if (section === "movies") showGridSection("Filmes", state.catalog.movies, true, null);
    else if (section === "series") showGridSection("Séries", state.catalog.series, true, null);
    else if (section === "favorites") {
      const favIds = getFavorites();
      const all = [...state.catalog.live, ...state.catalog.movies, ...state.catalog.series];
      showGridSection("Minha Lista", all.filter(i => favIds.includes(i.id)), false, null);
    }
  }
}

function renderLiveTvView() {
  const items = state.catalog.live;
  const homeRows = document.getElementById("home-rows");
  const gridWrap = document.getElementById("catalog-grid-wrapper");

  gridWrap.classList.add("hidden");
  homeRows.classList.remove("hidden");
  homeRows.innerHTML = "";
  window.scrollTo({ top: 0, behavior: "instant" });

  if (!items.length) {
    homeRows.innerHTML = `<div class="empty-state">${SVG_ICONS.tv}<p>Nenhum canal ao vivo encontrado nesta lista.</p></div>`;
    return;
  }

  appendRow(homeRows, `Todos os Canais (${items.length})`, items.slice(0, 30), () => {
    homeRows.classList.add("hidden");
    gridWrap.classList.remove("hidden");
    showGridSection("Todos os Canais", items, false, () => renderLiveTvView());
  });

  const allCats = [...new Set(items.flatMap(i => i.categories || [i.category]))];
  allCats.forEach(cat => {
    const catItems = items.filter(i => (i.categories || [i.category]).includes(cat));
    if (catItems.length > 0) {
      appendRow(homeRows, `${cat} (${catItems.length})`, catItems.slice(0, 25), () => {
        homeRows.classList.add("hidden");
        gridWrap.classList.remove("hidden");
        showGridSection(cat, catItems, false, () => renderLiveTvView());
      });
    }
  });
}

function renderHomeView() {
  const hero = document.getElementById("hero-banner");
  const rowsContainer = document.getElementById("home-rows");
  rowsContainer.innerHTML = "";

  const pool = [...state.catalog.movies, ...state.catalog.series].filter(i => i.logo);
  const featured = pool[Math.floor(Math.random() * Math.min(pool.length, 30))] || state.catalog.live[0];

  if (featured) {
    hero.classList.remove("hidden");
    const safeBg = (featured.backdrop || featured.logo || "").replace(/["'\\]/g, "\\$&");
    document.getElementById("hero-backdrop").style.backgroundImage = safeBg ? `url("${safeBg}")` : "none";
    document.getElementById("hero-badge").textContent = featured.category.toUpperCase();
    document.getElementById("hero-title").textContent = featured.title;
    document.getElementById("hero-desc").textContent = featured.synopsis || "Toque para assistir agora.";
    document.getElementById("hero-play-btn").onclick = () => startPlayback(featured, 0);
    document.getElementById("hero-info-btn").onclick = () => openDetailsModal(featured);
  } else {
    hero.classList.add("hidden");
  }

  const history = Object.values(getWatchHistory())
    .filter(h => h.item && h.item.type !== "live")
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (history.length > 0) {
    appendRow(rowsContainer, "Continuar Assistindo", history.map(h => h.item));
  }

  if (state.catalog.live.length) {
    appendRow(rowsContainer, "TV ao Vivo", state.catalog.live.slice(0, 25), () => {
      document.querySelector('.nav-item[data-section="live"]').click();
    });
  }
  if (state.catalog.movies.length) {
    appendRow(rowsContainer, "Filmes", state.catalog.movies.slice(0, 25), () => {
      document.querySelector('.nav-item[data-section="movies"]').click();
    });
  }
  if (state.catalog.series.length) {
    appendRow(rowsContainer, "Séries", state.catalog.series.slice(0, 25), () => {
      document.querySelector('.nav-item[data-section="series"]').click();
    });
  }
}

function appendRow(container, title, items, onSeeAll) {
  const row = document.createElement("div");
  row.className = "media-row";
  row.innerHTML = `
    <div class="row-header">
      <h3 class="row-title">${escapeHTML(title)}</h3>
      ${onSeeAll ? `<button type="button" class="row-more-btn">Ver todos ›</button>` : ""}
    </div>
    <div class="row-scroller"></div>
  `;
  if (onSeeAll) {
    row.querySelector(".row-more-btn").addEventListener("click", onSeeAll);
  }
  const scroller = row.querySelector(".row-scroller");
  items.forEach(item => scroller.appendChild(createMediaCard(item)));
  container.appendChild(row);
}

function showGridSection(title, items, showCategories, onBack) {
  window.scrollTo({ top: 0, behavior: "instant" });
  document.getElementById("section-title").textContent = title;
  const catBar = document.getElementById("category-bar");
  const backBtn = document.getElementById("btn-grid-back");
  const emptyBox = document.getElementById("empty-state-box");

  state.backAction = onBack || null;
  backBtn.classList.toggle("hidden", !onBack);

  if (showCategories && items.length > 0) {
    const categories = ["ALL", ...new Set(items.flatMap(i => i.categories || [i.category]))];
    catBar.classList.remove("hidden");
    catBar.innerHTML = categories.map(cat => `
      <button type="button" class="cat-chip ${state.selectedCategory === cat ? "active" : ""}" data-cat="${escapeHTML(cat)}">
        ${cat === "ALL" ? "Todas" : escapeHTML(cat)}
      </button>
    `).join("");

    catBar.querySelectorAll(".cat-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        state.selectedCategory = chip.dataset.cat;
        showGridSection(title, items, true, onBack);
      });
    });
  } else {
    catBar.classList.add("hidden");
  }

  state.filteredItems = state.selectedCategory === "ALL"
    ? items
    : items.filter(i => (i.categories || [i.category]).includes(state.selectedCategory));

  document.getElementById("section-count").textContent = `${state.filteredItems.length} itens`;
  document.getElementById("catalog-grid").innerHTML = "";
  state.renderedCount = 0;

  if (state.filteredItems.length === 0) {
    emptyBox.classList.remove("hidden");
    emptyBox.innerHTML = `${SVG_ICONS.movie}<p>Nenhum conteúdo disponível nesta seção.</p>`;
  } else {
    emptyBox.classList.add("hidden");
    renderMoreCards();
  }
}

function renderMoreCards() {
  const grid = document.getElementById("catalog-grid");
  const slice = state.filteredItems.slice(state.renderedCount, state.renderedCount + APP_CONFIG.batchSize);
  slice.forEach(item => grid.appendChild(createMediaCard(item)));
  state.renderedCount += slice.length;
}

function createMediaCard(item) {
  const isLive = item.type === "live";
  const card = document.createElement("div");
  card.className = `media-card ${isLive ? "live-card" : ""}`;
  card.tabIndex = 0;

  const history = getWatchHistory()[item.id];
  const progressPct = !isLive && history && history.duration > 0
    ? Math.min(100, Math.round((history.currentTime / history.duration) * 100))
    : 0;

  const subtitle = (item.categories || [item.category]).join(" • ");
  const fallbackSvg = isLive ? SVG_ICONS.tv : SVG_ICONS.movie;

  card.innerHTML = `
    <div class="card-thumb ${isLive ? "live-thumb" : ""}">
      ${item.logo
        ? `<img src="${escapeHTML(item.logo)}" loading="lazy" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">${fallbackSvg.replace('class="card-fallback-svg"', 'class="card-fallback-svg" style="display:none"')}`
        : fallbackSvg}
      ${progressPct > 2 ? `<div class="card-progress-bar"><div class="card-progress-fill" style="width:${progressPct}%"></div></div>` : ""}
    </div>
    <div class="card-info">
      <div class="card-title">${escapeHTML(item.title)}</div>
      <div class="card-sub">${escapeHTML(subtitle)}</div>
    </div>
  `;

  card.addEventListener("click", () => {
    if (isLive) {
      startPlayback(item, 0);
    } else {
      openDetailsModal(item);
    }
  });
  return card;
}

// ================= TELA "SOBRE" (DETALHES VOD / SÉRIES) =================
async function openDetailsModal(item) {
  state.activeModalItem = item;
  const modal = document.getElementById("vod-modal");
  modal.classList.remove("hidden");

  const isLive = item.type === "live";
  const qualityMatch = item.title.match(/\b(4K|1080p|720p|480p|360p|FHD|HD|SD)\b/i);

  document.getElementById("modal-backdrop").src = item.backdrop || item.logo || "";
  document.getElementById("modal-poster").src = item.logo || "";
  document.getElementById("modal-category").textContent = (item.categories || [item.category]).join(" • ");
  document.getElementById("modal-title").textContent = item.title;
  document.getElementById("modal-year").textContent = item.year || (qualityMatch ? qualityMatch[1].toUpperCase() : "");
  document.getElementById("modal-rating").textContent = item.rating ? `Nota ${item.rating}` : (isLive ? "AO VIVO" : "");
  document.getElementById("modal-duration").textContent = "";
  document.getElementById("modal-extra-info").innerHTML = "";
  document.getElementById("series-episodes-box").classList.add("hidden");

  if (item.synopsis) {
    document.getElementById("modal-synopsis").textContent = item.synopsis;
  } else if (isLive) {
    document.getElementById("modal-synopsis").textContent = `Transmissão ao vivo na categoria ${(item.categories || [item.category]).join(", ")}.`;
  } else {
    document.getElementById("modal-synopsis").textContent = `Título disponível sob demanda na categoria ${(item.categories || [item.category]).join(", ")}.`;
  }

  updateFavoriteButton(item.id);

  const saved = getWatchHistory()[item.id];
  const btnResume = document.getElementById("btn-resume");
  const progressBox = document.getElementById("modal-progress-box");

  if (saved && saved.currentTime > 10 && !isLive) {
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

  const btnStart = document.getElementById("btn-play-start");
  btnStart.querySelector("span").textContent = isLive ? "Assistir ao Vivo" : "Assistir do início";
  btnStart.onclick = () => {
    modal.classList.add("hidden");
    startPlayback(item, 0);
  };

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
      ${SVG_ICONS.playTriangle}
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

// ================= PLAYER, AUTO-OCULTAR BARRA & MEDIA SESSION =================
function showPlayerControls() {
  const topControls = document.querySelector(".player-top-controls");
  const video = document.getElementById("video-player");
  if (!topControls) return;

  topControls.classList.remove("controls-hidden");
  clearTimeout(playerControlsTimer);

  if (video && !video.paused) {
    playerControlsTimer = setTimeout(() => {
      topControls.classList.add("controls-hidden");
    }, 3500);
  }
}

function hidePlayerControls() {
  const topControls = document.querySelector(".player-top-controls");
  if (!topControls) return;
  clearTimeout(playerControlsTimer);
  topControls.classList.add("controls-hidden");
}

function setupModalAndPlayer() {
  document.getElementById("btn-close-modal").addEventListener("click", () => {
    document.getElementById("vod-modal").classList.add("hidden");
  });

  document.getElementById("btn-toggle-fav").addEventListener("click", () => {
    if (!state.activeModalItem) return;
    toggleFavorite(state.activeModalItem.id);
    updateFavoriteButton(state.activeModalItem.id);
  });

  const overlay = document.getElementById("player-overlay");
  const topControls = document.querySelector(".player-top-controls");
  const video = document.getElementById("video-player");

  overlay.addEventListener("click", (e) => {
    if (e.target.closest(".player-top-controls") || e.target.closest("#player-error")) {
      showPlayerControls();
      return;
    }
    if (topControls.classList.contains("controls-hidden")) {
      showPlayerControls();
    } else if (!video.paused) {
      hidePlayerControls();
    }
  });

  overlay.addEventListener("mousemove", () => {
    showPlayerControls();
  });

  document.getElementById("btn-close-player").addEventListener("click", () => {
    clearTimeout(playerControlsTimer);
    saveCurrentProgress();
    stopPlayback();
    overlay.classList.add("hidden");
    if (state.currentSection === "home") renderHomeView();
  });

  document.getElementById("btn-restart-video").addEventListener("click", () => {
    video.currentTime = 0;
    video.play().catch(() => {});
    showPlayerControls();
  });

  document.getElementById("btn-player-retry").addEventListener("click", () => {
    if (state.currentPlaying) {
      startPlayback(state.currentPlaying, 0, false);
    }
  });

  video.addEventListener("play", () => {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    showPlayerControls();
  });

  video.addEventListener("pause", () => {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    showPlayerControls();
  });

  video.addEventListener("seeking", () => {
    showPlayerControls();
  });

  setInterval(() => {
    if (!overlay.classList.contains("hidden") && !video.paused && !video.ended && state.currentPlaying) {
      saveCurrentProgress();
    }
  }, 5000);
}

function updateMediaSession(item) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title,
      artist: (item.categories || [item.category]).join(" • "),
      album: APP_CONFIG.appName,
      artwork: item.logo ? [{ src: item.logo, sizes: "512x512", type: "image/png" }] : []
    });
    const video = document.getElementById("video-player");
    navigator.mediaSession.setActionHandler("play", () => video.play().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause", () => video.pause());
  } catch (_) {}
}

function showPlayerError(message) {
  clearTimeout(streamTimeoutTimer);
  document.getElementById("player-spinner").classList.add("hidden");
  document.getElementById("player-error-msg").textContent = message;
  document.getElementById("player-error").classList.remove("hidden");
  showPlayerControls();
}

function startPlayback(item, startTime = 0, forceProxy = false) {
  stopPlayback();
  const attemptId = ++playbackAttemptId;
  state.currentPlaying = item;
  updateMediaSession(item);

  const overlay = document.getElementById("player-overlay");
  const video = document.getElementById("video-player");
  const spinner = document.getElementById("player-spinner");
  const errorBox = document.getElementById("player-error");
  const restartBtn = document.getElementById("btn-restart-video");

  overlay.classList.remove("hidden");
  errorBox.classList.add("hidden");
  spinner.classList.remove("hidden");
  restartBtn.classList.toggle("hidden", item.type === "live");
  showPlayerControls();

  document.getElementById("player-title").textContent = item.title;
  document.getElementById("player-subtitle").textContent = item.episodeTitle || (item.categories || [item.category]).join(" • ");

  const rawUrl = item.url || "";
  const streamUrl = proxify(rawUrl, forceProxy);
  const usedProxy = streamUrl !== rawUrl;

  if (!rawUrl || /\/udp\//i.test(rawUrl) || /\.ogg(\?|$)/i.test(rawUrl)) {
    showPlayerError(diagnoseStreamFailure(rawUrl, usedProxy));
    return;
  }

  let settled = false;
  const markReady = () => {
    if (settled || attemptId !== playbackAttemptId) return;
    settled = true;
    clearTimeout(streamTimeoutTimer);
    spinner.classList.add("hidden");
    errorBox.classList.add("hidden");
    if (startTime > 0 && isFinite(video.duration)) {
      video.currentTime = startTime;
    }
    video.play().catch(() => {});
    showPlayerControls();
  };

  const handleFailure = () => {
    if (settled || attemptId !== playbackAttemptId) return;
    settled = true;
    clearTimeout(streamTimeoutTimer);

    // Se falhou em HTTPS direto e existe proxy configurado, tenta automaticamente via proxy uma vez
    if (!usedProxy && rawUrl.startsWith("https://") && getNormalizedProxyBase()) {
      startPlayback(item, startTime, true);
      return;
    }

    showPlayerError(diagnoseStreamFailure(rawUrl, usedProxy));
  };

  streamTimeoutTimer = setTimeout(() => {
    if (!settled && attemptId === playbackAttemptId) {
      handleFailure();
    }
  }, 15000);

  const isHls = /\.m3u8(\?|$)/i.test(rawUrl) || streamUrl.includes(".m3u8");

  if (isHls && !video.canPlayType("application/vnd.apple.mpegurl") && window.Hls?.isSupported()) {
    state.hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: true
    });
    state.hlsInstance.on(Hls.Events.MANIFEST_PARSED, markReady);
    state.hlsInstance.on(Hls.Events.ERROR, (_, data) => {
      if (data?.fatal) {
        handleFailure();
      }
    });
    state.hlsInstance.loadSource(streamUrl);
    state.hlsInstance.attachMedia(video);
  } else {
    video.onerror = handleFailure;
    video.onloadeddata = markReady;
    video.oncanplay = markReady;
    video.onplaying = markReady;
    video.src = streamUrl;
    video.load();
    // Inicia o play imediatamente dentro do gesto do usuário (essencial no iOS Safari)
    video.play().catch(() => {});
  }
}

function stopPlayback() {
  playbackAttemptId++;
  clearTimeout(playerControlsTimer);
  clearTimeout(streamTimeoutTimer);

  const video = document.getElementById("video-player");
  video.onerror = null;
  video.onloadeddata = null;
  video.oncanplay = null;
  video.onplaying = null;
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
  if (!item || item.type === "live" || !video.currentTime || video.currentTime < 5) return;

  try {
    const history = getWatchHistory();
    history[item.id] = {
      item: { ...item, episodeId: undefined, episodeTitle: undefined },
      episodeItem: item.episodeId ? item : null,
      currentTime: video.currentTime,
      duration: isFinite(video.duration) ? video.duration : 0,
      updatedAt: Date.now()
    };

    const entries = Object.entries(history)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, 50);

    localStorage.setItem("iptv_history", JSON.stringify(Object.fromEntries(entries)));
  } catch (_) {}
}

function getWatchHistory() {
  try {
    return JSON.parse(localStorage.getItem("iptv_history") || "{}");
  } catch {
    return {};
  }
}

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem("iptv_favorites") || "[]");
  } catch {
    return [];
  }
}

function toggleFavorite(id) {
  let favs = getFavorites();
  favs = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id];
  try {
    localStorage.setItem("iptv_favorites", JSON.stringify(favs));
  } catch (_) {}
}

function updateFavoriteButton(id) {
  const btn = document.getElementById("btn-toggle-fav");
  btn.textContent = getFavorites().includes(id) ? "Na Minha Lista" : "+ Minha Lista";
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
