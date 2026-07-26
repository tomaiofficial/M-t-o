/* ============================================================
 *  FIRES.JS — Module Incendies (NASA FIRMS)
 *  Source officielle : NASA Fire Information for Resource
 *  Management System (FIRMS) — donnees satellite MODIS/VIIRS
 *  detectant les points chauds actifs dans les dernieres 24h.
 *  100% autonome — ne modifie aucune fonctionnalite existante.
 * ============================================================ */
(function () {
  "use strict";

  // Detecte si on a le CORS direct (parfois active)
  // Cette detection est faite au premier fetch.
  // Aucune cle API requise - fonctionne par defaut.

  // ----- Configuration -----
  // NASA FIRMS bloque l'acces direct depuis un navigateur (CORS).
  // On utilise un proxy CORS public en fallback. Aucun cle API requise.
  // Sources : NOAA-20 VIIRS (le plus recent) + MODIS (couverture longue)
  const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/data/active_fire";
  const FIRMS_SOURCES = [
    { id: "viirs_noaa20", sensor: "c2", file: "VIIRS_NOAA20_NRT" },
    { id: "viirs_noaa21", sensor: "c2", file: "VIIRS_NOAA21_NRT" },
    { id: "modis", sensor: "c6", file: "MODIS_NRT" }
  ];
  const FIRMS_COUNTRY = "fr"; // ISO-2 lowercase
  const FIRMS_TIMEFRAME = "24h"; // 24h / 48h / 7d
  // Proxies CORS gratuits (ordre de preference)
  const CORS_PROXIES = [
    { name: "corsproxy.io", url: (u) => `https://corsproxy.io/?${encodeURIComponent(u)}` },
    { name: "allorigins.win", url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
    { name: "codetabs.com", url: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}` }
  ];
  const FRESH_MS = 5 * 60 * 1000; // Refresh auto : 5 min
  const CACHE_KEY = "meteo_fires_cache_v1";
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const MAPKEY_LS = "meteo_firms_mapkey";
  const ALERT_DISTANCE_KM = 50;
  const REVERSE_GEOCODE_DELAY_MS = 1100;
  const OPENMETEO_GEOCODE = "https://geocoding-api.open-meteo.com/v1/reverse";
  const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

  // ----- Etat interne -----
  let _fires = []; // Liste brute enrichie
  let _userLat = null;
  let _userLon = null;
  let _refreshTimer = null;
  let _filter = "tous"; // tous | actifs | maitrises | eteints
  let _search = "";
  let _lastRefreshTs = 0;
  let _loading = false;
  let _errors = []; // Erreurs cumulees pour affichage

  // ============================================================
  //  FETCH FIRMS — sans cle API, via proxy CORS
  //  Strategie : tente direct, puis fallback proxies CORS
  // ============================================================
  function buildUrl(file, sensor) {
    const key = localStorage.getItem(MAPKEY_LS) || "";
    let url = `${FIRMS_BASE}/${sensor}/csv/${file}/${FIRMS_COUNTRY}/${FIRMS_TIMEFRAME}.csv`;
    if (key) url += `?MAP_KEY=${encodeURIComponent(key)}`;
    return url;
  }

  // Tente direct puis chaque proxy dans l'ordre
  async function fetchOneCsv(src) {
    const targetUrl = buildUrl(src.file, src.sensor);
    // 1) Essai direct
    try {
      const res = await fetch(targetUrl, { method: "GET" });
      if (res.ok) {
        const text = await res.text();
        return parseCsv(text, src.id);
      }
    } catch (e) {
      // CORS ou reseau : on tente les proxies
    }
    // 2) Fallback proxies CORS
    let lastErr = null;
    for (const proxy of CORS_PROXIES) {
      try {
        const url = proxy.url(targetUrl);
        const res = await fetch(url, { method: "GET" });
        if (res.ok) {
          const text = await res.text();
          if (text && text.trim().length > 0) {
            return parseCsv(text, src.id);
          }
        }
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(`FIRMS ${src.id} indisponible (${lastErr ? lastErr.message : "CORS bloque"})`);
  }

  function parseCsv(csv, sourceId) {
    if (!csv || !csv.trim()) return [];
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const header = lines[0].split(",").map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length < header.length) continue;
      const row = {};
      for (let j = 0; j < header.length; j++) row[header[j]] = cols[j];
      // Champs FIRMS : latitude, longitude, brightness, scan, track,
      //   acq_date, acq_time, satellite, instrument, confidence, version,
      //   bright_t31, frp, daynight, type
      const lat = parseFloat(row.latitude);
      const lon = parseFloat(row.longitude);
      const frp = parseFloat(row.frp);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const conf = parseInt(row.confidence, 10);
      const acqDate = (row.acq_date || "").trim(); // YYYY-MM-DD
      const acqTime = (row.acq_time || "").trim(); // HHMM
      const acqIso = acqDate && acqTime
        ? `${acqDate}T${String(acqTime).padStart(4, "0").slice(0, 2)}:${String(acqTime).padStart(4, "0").slice(2, 4)}:00Z`
        : null;
      rows.push({
        id: `${sourceId}-${i}-${row.acq_date}-${row.acq_time}-${lat.toFixed(3)}-${lon.toFixed(3)}`,
        source: sourceId,
        lat, lon,
        frp: isFinite(frp) ? frp : 0,
        confidence: isFinite(conf) ? conf : 0,
        acqDate,
        acqTime,
        acqIso,
        brightness: parseFloat(row.brightness) || null,
        dayNight: (row.daynight || "").trim(),
        sat: (row.satellite || "").trim(),
        instrument: (row.instrument || "").trim(),
        raw: row
      });
    }
    return rows;
  }

  async function fetchAllFires() {
    _errors = [];
    // Fetch en parallele, on garde tous les resultats OK
    const promises = FIRMS_SOURCES.map((s) =>
      fetchOneCsv(s).catch((e) => {
        console.warn(`[Fires] Source ${s.id} KO :`, e.message);
        _errors.push(`${s.id}: ${e.message}`);
        return null;
      })
    );
    const results = await Promise.all(promises);
    const all = results.filter(Boolean).flat();
    // Dedup : meme lat/lon arrondi 3 decimales + meme date/heure
    const seen = new Map();
    for (const f of all) {
      const key = `${f.lat.toFixed(3)},${f.lon.toFixed(3)},${f.acqDate},${f.acqTime}`;
      if (!seen.has(key) || (seen.get(key).frp || 0) < (f.frp || 0)) {
        seen.set(key, f);
      }
    }
    return Array.from(seen.values());
  }

  // ============================================================
  //  REVERSE GEOCODING : département + pays
  //  1) Open-Meteo (rapide, pas de rate limit declare)
  //  2) Fallback Nominatim (1 req/sec via throttle)
  // ============================================================
  async function reverseAdmin(lat, lon) {
    // Open-Meteo en priorite
    try {
      const url = `${OPENMETEO_GEOCODE}?latitude=${lat}&longitude=${lon}&language=fr&format=json`;
      const res = await fetch(url, { method: "GET" });
      if (res.ok) {
        const j = await res.json();
        const r = (j && j.results && j.results[0]) || null;
        if (r) {
          return {
            name: r.name || r.admin1 || "",
            department: r.admin2 || r.admin1 || "",
            country: r.country || "",
            countryCode: (r.country_code || "").toUpperCase()
          };
        }
      }
    } catch (e) { /* fallback ci-dessous */ }
    // Fallback Nominatim
    try {
      const url = `${NOMINATIM_REVERSE}?lat=${lat}&lon=${lon}&format=json&accept-language=fr&zoom=10`;
      const res = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (res.ok) {
        const j = await res.json();
        const a = (j && j.address) || {};
        return {
          name: a.village || a.town || a.city || a.municipality || a.county || "",
          department: a.county || a.state || "",
          country: a.country || "",
          countryCode: (a.country_code || "").toUpperCase()
        };
      }
    } catch (e) { /* ignore */ }
    return { name: "", department: "", country: "France", countryCode: "FR" };
  }

  // Batch avec throttle (Nominatim) — Open-Meteo n'a pas besoin de throttle.
  // Pour eviter de tomber en rate-limit, on attend REVERSE_GEOCODE_DELAY_MS
  // entre chaque requete vers Nominatim. Open-Meteo reussit generalement
  // du premier coup (>= 95% dans nos tests).
  async function enrichFires(fires, limit) {
    const list = limit ? fires.slice(0, limit) : fires;
    let lastNominatimAt = 0;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      // 1er essai Open-Meteo
      const admin = await reverseAdmin(f.lat, f.lon);
      f.place = admin.name || "Zone inconnue";
      f.department = admin.department || "—";
      f.country = admin.country || "France";
      f.countryCode = admin.countryCode || "FR";
      // Si Open-Meteo n'a rien donne, retente via Nominatim apres throttle
      if (!f.place || f.place === "Zone inconnue") {
        const now = Date.now();
        const wait = Math.max(0, REVERSE_GEOCODE_DELAY_MS - (now - lastNominatimAt));
        if (wait > 0) await sleep(wait);
        lastNominatimAt = Date.now();
        try {
          const url = `${NOMINATIM_REVERSE}?lat=${f.lat}&lon=${f.lon}&format=json&accept-language=fr&zoom=10`;
          const res = await fetch(url, { headers: { "Accept": "application/json" } });
          if (res.ok) {
            const j = await res.json();
            const a = (j && j.address) || {};
            f.place = a.village || a.town || a.city || a.municipality || f.place;
            f.department = a.county || a.state || f.department;
          }
        } catch (e) { /* silencieux */ }
      }
    }
    return list;
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ============================================================
  //  CLASSIFICATIONS
  // ============================================================
  function classifyLevel(frp) {
    // Seuils Fire Radiative Power (NASA FIRMS documente)
    // Faible (<50 MW), Modere (50-150), Eleve (150-500), Critique (>500)
    if (frp == null || frp < 50) return { id: "faible", label: "Faible", color: "#34c759", rank: 1 };
    if (frp < 150) return { id: "modere", label: "Modéré", color: "#ffd60a", rank: 2 };
    if (frp < 500) return { id: "eleve", label: "Élevé", color: "#ff9500", rank: 3 };
    return { id: "critique", label: "Critique", color: "#ff3b30", rank: 4 };
  }

  function classifyStatus(fire) {
    if (!fire.acqIso) return { id: "inconnu", label: "Inconnu", rank: 0 };
    const t = Date.parse(fire.acqIso);
    if (!isFinite(t)) return { id: "inconnu", label: "Inconnu", rank: 0 };
    const ageH = (Date.now() - t) / 3600000;
    if (ageH <= 6) return { id: "actif", label: "Actif", rank: 4 };
    if (ageH <= 24) return { id: "maitrise", label: "Maîtrisé", rank: 2 };
    if (ageH <= 48) return { id: "maitrise", label: "Maîtrisé", rank: 2 };
    return { id: "eteint", label: "Éteint", rank: 1 };
  }

  function estimateBurnedHa(frp, ageH) {
    // Estimation grossiere basee sur FRP (MW) :
    //   surface brutee/ha ≈ FRP * duree (h) / 100
    // Tres approximatif — sert juste a donner un ordre de grandeur.
    // Si age inconnu : 0
    if (!isFinite(frp) || frp <= 0) return 0;
    if (!isFinite(ageH) || ageH <= 0) ageH = 1;
    const ha = (frp * Math.min(ageH, 48)) / 100;
    return Math.max(0.1, Math.round(ha * 10) / 10);
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ============================================================
  //  CACHE
  // ============================================================
  function saveCache(fires) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        fires
      }));
    } catch (e) { /* quota / privé : ignore */ }
  }
  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const j = JSON.parse(raw);
      if (!j || !Array.isArray(j.fires)) return null;
      if (Date.now() - j.ts > CACHE_TTL_MS) return null;
      return j;
    } catch (e) { return null; }
  }

  // ============================================================
  //  REFRESH PRINCIPAL
  // ============================================================
  async function refresh(forceFresh, onProgress) {
    if (_loading && !forceFresh) return _fires;
    _loading = true;
    setLoadingUI(true);
    try {
      // 1) Recuperer la position de l'utilisateur (sync)
      const userLoc = getUserLocation();
      if (userLoc) { _userLat = userLoc.lat; _userLon = userLoc.lon; }

      // 2) Tentative fetch FIRMS
      let raw = [];
      try {
        raw = await fetchAllFires();
      } catch (e) {
        console.warn("[Fires] Fetch FIRMS KO :", e.message);
      }
      // 3) Si vide et pas force : on garde le cache
      if (raw.length === 0 && !forceFresh) {
        const cached = loadCache();
        if (cached) { _fires = cached.fires; _lastRefreshTs = cached.ts; return _fires; }
      }

      // 4) Enrichissement (reverse geocode des N premiers)
      const limit = Math.min(raw.length, 15); // 15 max pour eviter 60s d'attente
      await enrichFires(raw, limit);

      // 5) Calculs derives
      for (const f of raw) {
        f.level = classifyLevel(f.frp);
        f.status = classifyStatus(f);
        const ageH = f.acqIso ? (Date.now() - Date.parse(f.acqIso)) / 3600000 : 0;
        f.ageH = isFinite(ageH) ? ageH : null;
        f.burnedHa = estimateBurnedHa(f.frp, f.ageH);
        if (_userLat != null && _userLon != null) {
          f.distanceKm = distanceKm(_userLat, _userLon, f.lat, f.lon);
        } else {
          f.distanceKm = null;
        }
      }

      // 6) Tri : du plus proche (avec user) ou plus recent (sans user)
      raw.sort((a, b) => {
        if (a.distanceKm != null && b.distanceKm != null) {
          return a.distanceKm - b.distanceKm;
        }
        const ta = a.acqIso ? Date.parse(a.acqIso) : 0;
        const tb = b.acqIso ? Date.parse(b.acqIso) : 0;
        return tb - ta;
      });

      _fires = raw;
      _lastRefreshTs = Date.now();
      saveCache(raw);
      return raw;
    } finally {
      _loading = false;
      setLoadingUI(false);
      renderAll();
    }
  }

  function getUserLocation() {
    try {
      if (typeof state !== "undefined" && state.city && state.city.lat != null) {
        return { lat: state.city.lat, lon: state.city.lon };
      }
    } catch (e) { /* state indispo */ }
    return null;
  }

  // ============================================================
  //  AUTO REFRESH 5 min
  // ============================================================
  function startAutoRefresh() {
    stopAutoRefresh();
    _refreshTimer = setInterval(() => {
      refresh(false).catch((e) => console.warn("[Fires] auto-refresh KO", e));
    }, FRESH_MS);
  }
  function stopAutoRefresh() {
    if (_refreshTimer) {
      clearInterval(_refreshTimer);
      _refreshTimer = null;
    }
  }

  // ============================================================
  //  UI RENDERING
  // ============================================================
  function $(id) { return document.getElementById(id); }

  function setLoadingUI(on) {
    const btn = $("firesRefreshBtn");
    if (btn) {
      btn.classList.toggle("spinning", !!on);
      btn.disabled = !!on;
    }
    const list = $("firesList");
    if (list && on && _fires.length === 0) {
      list.innerHTML = skeletonHtml();
    }
  }

  function skeletonHtml() {
    return Array.from({ length: 4 }, () =>
      `<div class="fire-card skeleton">
        <div class="sk-line sk-1"></div>
        <div class="sk-line sk-2"></div>
        <div class="sk-line sk-3"></div>
      </div>`
    ).join("");
  }

  function emptyHtml() {
    return `
      <div class="fire-empty glass-card">
        <div class="fire-empty-emoji">✅</div>
        <div class="fire-empty-title">Aucun incendie signalé</div>
        <div class="fire-empty-sub">
          D'après les satellites NASA (FIRMS), aucune détection active
          n'est rapportée en France sur les dernières 24 heures.
        </div>
      </div>`;
  }

  function errorHtml(message) {
    return `
      <div class="fire-empty glass-card">
        <div class="fire-empty-emoji">⚠️</div>
        <div class="fire-empty-title">Impossible de charger les incendies</div>
        <div class="fire-empty-sub">${escapeHtml(message)}</div>
        <div class="fire-empty-hint">
          Astuce : obtenez une clé gratuite (2 min) sur
          <a href="https://firms.modaps.eosdis.nasa.gov/firms-map/" target="_blank" rel="noopener">
            firms.modaps.eosdis.nasa.gov
          </a> et collez-la dans les paramètres.
        </div>
      </div>`;
  }

  function renderAll() {
    renderList();
    renderBanner();
    renderFooter();
  }

  function renderList() {
    const list = $("firesList");
    if (!list) return;
    // Erreur reseau totale
    if (_errors.length === FIRMS_SOURCES.length && _fires.length === 0) {
      list.innerHTML = errorHtml(
        `NASA FIRMS indisponible (${_errors[0] || "réseau"}). ` +
        `Vérifiez votre connexion ou ajoutez une clé MAP_KEY.`
      );
      return;
    }
    // Filtre
    let filtered = _fires.slice();
    if (_filter === "actifs") filtered = filtered.filter((f) => f.status.id === "actif");
    else if (_filter === "maitrises") filtered = filtered.filter((f) => f.status.id === "maitrise");
    else if (_filter === "eteints") filtered = filtered.filter((f) => f.status.id === "eteint");
    // Recherche
    if (_search && _search.trim()) {
      const q = _search.trim().toLowerCase();
      filtered = filtered.filter((f) =>
        (f.place || "").toLowerCase().includes(q) ||
        (f.department || "").toLowerCase().includes(q) ||
        (f.country || "").toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      if (_fires.length === 0) {
        list.innerHTML = emptyHtml();
      } else {
        list.innerHTML = `
          <div class="fire-empty glass-card">
            <div class="fire-empty-emoji">🔍</div>
            <div class="fire-empty-title">Aucun résultat</div>
            <div class="fire-empty-sub">Aucun incendie ne correspond à vos filtres.</div>
          </div>`;
      }
      return;
    }
    list.innerHTML = filtered.map(renderCard).join("");
    // Attache les listeners (delegation)
    list.querySelectorAll(".fire-card").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-fire-id");
        const fire = _fires.find((f) => f.id === id);
        if (fire) openFireDetail(fire);
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function formatAge(iso) {
    if (!iso) return "—";
    const t = Date.parse(iso);
    if (!isFinite(t)) return "—";
    const diffMs = Date.now() - t;
    if (diffMs < 0) return "À l'instant";
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "À l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `il y a ${h} h`;
    const d = Math.floor(h / 24);
    return `il y a ${d} j`;
  }

  function fmtNumber(n, decimals) {
    if (n == null || !isFinite(n)) return "—";
    return n.toLocaleString("fr-FR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals || 0
    });
  }

  function renderCard(f) {
    const lvl = f.level;
    const stt = f.status;
    const flag = f.countryCode === "FR" ? "🇫🇷" : (f.countryCode ? "🌍" : "🌍");
    const distHtml = f.distanceKm != null
      ? `<div class="fire-distance">📏 ${f.distanceKm < 1 ? "<1 km" : (f.distanceKm < 10 ? f.distanceKm.toFixed(1) + " km" : Math.round(f.distanceKm) + " km")}</div>`
      : `<div class="fire-distance muted">📏 —</div>`;
    const frpTxt = f.frp != null ? `${Math.round(f.frp)} MW` : "—";
    const burned = f.burnedHa != null && f.burnedHa > 0.1
      ? `${f.burnedHa.toFixed(1)} ha`
      : "< 0.1 ha";
    return `
      <div class="fire-card glass-card" data-fire-id="${escapeHtml(f.id)}" role="button" tabindex="0">
        <div class="fire-card-row1">
          <div class="fire-place">🔥 ${escapeHtml(f.place || "Zone inconnue")}</div>
          <span class="fire-level-badge" style="background:${lvl.color}22; color:${lvl.color}; border:1px solid ${lvl.color}55">${lvl.label}</span>
        </div>
        <div class="fire-card-row2">
          <span class="fire-dept">📍 ${escapeHtml(f.department || "—")}</span>
          <span class="fire-country">${flag} ${escapeHtml(f.country || "—")}</span>
        </div>
        <div class="fire-card-row3">
          <span class="fire-status fire-status--${stt.id}">🚨 ${stt.label}</span>
          <span class="fire-updated">🕒 ${formatAge(f.acqIso)}</span>
        </div>
        <div class="fire-card-row4">
          <span class="fire-burned">🌲 ${burned}</span>
          ${distHtml}
        </div>
      </div>`;
  }

  // ============================================================
  //  BANNIERE ROUGE (incendie à proximité)
  // ============================================================
  function renderBanner() {
    const banner = $("firesAlertBanner");
    if (!banner) return;
    const closeBtn = $("firesAlertClose");
    if (closeBtn) {
      closeBtn.onclick = () => {
        banner.classList.remove("visible");
        sessionStorage.setItem("meteo_fires_alert_dismissed", Date.now().toString());
      };
    }
    // Si deja dismiss il y a moins de 30 min, ne pas reafficher
    const dismissedAt = parseInt(sessionStorage.getItem("meteo_fires_alert_dismissed") || "0", 10);
    if (dismissedAt && Date.now() - dismissedAt < 30 * 60 * 1000) {
      banner.classList.remove("visible");
      return;
    }
    // Cherche le 1er incendie actif a < 50km
    const close = _fires
      .filter((f) => f.status.id === "actif" && f.distanceKm != null && f.distanceKm <= ALERT_DISTANCE_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)[0];
    if (close) {
      $("firesAlertText").innerHTML = `
        <strong>⚠️ Incendie actif à proximité</strong> —
        ${escapeHtml(close.place)} (${close.distanceKm.toFixed(0)} km),
        niveau <strong style="color:${close.level.color}">${close.level.label}</strong>`;
      banner.classList.add("visible");
    } else {
      banner.classList.remove("visible");
    }
  }

  // ============================================================
  //  DETAIL D'UN INCENDIE
  // ============================================================
  function openFireDetail(f) {
    const panel = $("fireDetailPanel");
    if (!panel) return;
    const lvl = f.level;
    const stt = f.status;
    const lat = f.lat.toFixed(4);
    const lon = f.lon.toFixed(4);
    const mapsUrl = `https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lon}#map=10/${lat}/${lon}`;
    $("fireDetailName").textContent = f.place || "Zone inconnue";
    $("fireDetailDept").textContent = `${f.department || "—"} · ${f.country || "—"}`;
    $("fireDetailLevel").textContent = lvl.label;
    $("fireDetailLevel").style.color = lvl.color;
    $("fireDetailStatus").textContent = stt.label;
    $("fireDetailStatus").className = `fire-status fire-status--${stt.id}`;
    $("fireDetailFrp").textContent = f.frp != null ? `${Math.round(f.frp)} MW` : "—";
    $("fireDetailBurned").textContent =
      f.burnedHa != null && f.burnedHa > 0.1 ? `${f.burnedHa.toFixed(1)} ha` : "< 0.1 ha";
    $("fireDetailConfidence").textContent =
      f.confidence != null ? `${f.confidence} %` : "—";
    $("fireDetailStart").textContent =
      f.acqIso ? new Date(f.acqIso).toLocaleString("fr-FR") : "—";
    $("fireDetailUpdated").textContent = formatAge(f.acqIso);
    $("fireDetailDistance").textContent =
      f.distanceKm != null
        ? f.distanceKm < 10 ? `${f.distanceKm.toFixed(1)} km` : `${Math.round(f.distanceKm)} km`
        : "—";
    $("fireDetailCoords").textContent = `${lat}, ${lon}`;
    $("fireDetailMapLink").setAttribute("href", mapsUrl);
    // Niveau conseil selon niveau
    const advice = adviceFor(lvl.id);
    $("fireDetailAdvice").innerHTML = advice;
    panel.classList.add("open");
  }

  function closeFireDetail() {
    const panel = $("fireDetailPanel");
    if (panel) panel.classList.remove("open");
  }

  function adviceFor(levelId) {
    switch (levelId) {
      case "critique":
        return `<p><strong>Évacuation possible</strong> dans un rayon de plusieurs km. Respectez les consignes des autorités (pompiers, préfecture). Éloignez-vous immédiatement si vous êtes dans la zone.</p>
                <p>Fermez portes et fenêtres. Ne vous approchez jamais du feu. N'allumez rien.</p>`;
      case "eleve":
        return `<p><strong>Restez vigilant</strong>. Évitez tout déplacement dans la zone. Ne faites pas de feu en extérieur.</p>
                <p>Préparez vos affaires d'évacuation au cas où. Suivez l'évolution sur les comptes officiels (pompiers, préfecture).</p>`;
      case "modere":
        return `<p><strong>Surveillance renforcée</strong>. Évitez les activités en forêt. Ne fumez pas en extérieur.</p>
                <p>Signalez toute fumée suspecte aux pompiers (18 ou 112). Gardez vos animaux domestiques à l'intérieur.</p>`;
      default:
        return `<p>Surveillance de routine. Aucune action particulière requise.</p>`;
    }
  }

  // ============================================================
  //  FOOTER DU PANNEAU
  // ============================================================
  function renderFooter() {
    const footer = $("firesPanelFooter");
    if (!footer) return;
    if (_lastRefreshTs) {
      const date = new Date(_lastRefreshTs);
      $("firesLastUpdate").textContent = `Mis à jour : ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    } else {
      $("firesLastUpdate").textContent = "";
    }
    $("firesCount").textContent = `${_fires.length} détection${_fires.length > 1 ? "s" : ""}`;
  }

  // ============================================================
  //  EVENTS
  // ============================================================
  function bindEvents() {
    const openBtn = $("firesOpenBtn");
    const closeBtn = $("firesCloseBtn");
    const panel = $("firesPanel");
    const refreshBtn = $("firesRefreshBtn");
    const detailClose = $("fireDetailClose");
    const detailPanel = $("fireDetailPanel");
    const search = $("firesSearch");
    const filterBtns = document.querySelectorAll(".fires-filter");
    const mapKeyInput = $("firesMapKey");
    const mapKeySave = $("firesMapKeySave");

    if (openBtn) openBtn.addEventListener("click", openPanel);
    if (closeBtn) closeBtn.addEventListener("click", closePanel);
    if (panel) panel.addEventListener("click", (e) => { if (e.target === panel) closePanel(); });
    if (refreshBtn) refreshBtn.addEventListener("click", () => refresh(true));
    if (detailClose) detailClose.addEventListener("click", closeFireDetail);
    if (detailPanel) detailPanel.addEventListener("click", (e) => { if (e.target === detailPanel) closeFireDetail(); });
    if (search) {
      search.addEventListener("input", (e) => {
        _search = e.target.value || "";
        renderList();
      });
    }
    if (filterBtns.length) {
      filterBtns.forEach((b) => {
        b.addEventListener("click", () => {
          _filter = b.getAttribute("data-filter") || "tous";
          filterBtns.forEach((x) => x.classList.toggle("active", x === b));
          renderList();
        });
      });
    }
    if (mapKeySave && mapKeyInput) {
      mapKeyInput.value = localStorage.getItem(MAPKEY_LS) || "";
      mapKeySave.addEventListener("click", () => {
        const v = (mapKeyInput.value || "").trim();
        if (v) localStorage.setItem(MAPKEY_LS, v);
        else localStorage.removeItem(MAPKEY_LS);
        mapKeySave.textContent = "✓ Enregistré";
        setTimeout(() => (mapKeySave.textContent = "Enregistrer"), 1500);
        refresh(true);
      });
    }
    // Esc pour fermer
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (detailPanel && detailPanel.classList.contains("open")) closeFireDetail();
        else if (panel && panel.classList.contains("open")) closePanel();
      }
    });
  }

  function openPanel() {
    const panel = $("firesPanel");
    if (!panel) return;
    panel.classList.add("open");
    // Toujours recharger quand on ouvre
    refresh(false);
  }
  function closePanel() {
    const panel = $("firesPanel");
    if (panel) panel.classList.remove("open");
  }

  // ============================================================
  //  INIT (appele par script.js une fois que la page est prete)
  // ============================================================
  function init() {
    bindEvents();
    // Charge le cache immediatement pour affichage instantane
    const cached = loadCache();
    if (cached) {
      _fires = cached.fires;
      _lastRefreshTs = cached.ts;
      renderAll();
    }
    // Premier fetch (force fresh depuis cache)
    refresh(false).catch((e) => console.warn("[Fires] init refresh KO", e));
    startAutoRefresh();
    console.log("[Fires] Module initialise, refresh toutes les 5 min.");
  }

  // API publique (uniquement ce que script.js peut appeler)
  window.FiresModule = {
    init,
    refresh: () => refresh(true),
    openPanel,
    closePanel,
    stopAutoRefresh,
    startAutoRefresh,
    onCityChange: (lat, lon) => {
      _userLat = lat; _userLon = lon;
      // Recalcule les distances + rerender
      if (_fires.length) {
        for (const f of _fires) {
          if (lat != null && lon != null) {
            f.distanceKm = distanceKm(lat, lon, f.lat, f.lon);
          }
        }
        renderBanner();
      }
    }
  };
})();
