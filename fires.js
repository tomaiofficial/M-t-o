(function () {
  "use strict";

  // ============================================================
  //  FIRES MODULE - 100% sans cle API
  //  Source : fichier JSON bundlé dans le repo (same-origin, no CORS)
  //  Chemin : fires-data.json (mise a jour quotidienne via GitHub Actions)
  // ============================================================

  const FIRE_DATA_URL = "fires-data.json";
  const CACHE_KEY = "meteo_fires_cache_v2";
  const CACHE_TTL_MS = 60 * 60 * 1000; // 1h : le fichier JSON est statique, cache long
  const FRESH_MS = 30 * 60 * 1000; // Refresh auto toutes les 30 min
  const ALERT_DISTANCE_KM = 50;

  let _allFires = [];
  let _lastFetchMs = 0;
  let _refreshTimer = null;
  let _userLat = null;
  let _userLon = null;
  let _currentFilter = "all";
  let _searchQuery = "";

  // ============================================================
  //  UTILITAIRES
  // ============================================================
  function $(sel) {
    return document.querySelector(sel);
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function timeAgoFR(isoDate) {
    if (!isoDate) return "";
    const ms = Date.now() - new Date(isoDate).getTime();
    if (ms < 0) return "à venir";
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const h = Math.floor(min / 60);
    const d = Math.floor(h / 24);
    if (d > 30) return Math.floor(d / 30) + " mois";
    if (d > 0) return d + " j";
    if (h > 0) return h + " h";
    if (min > 0) return min + " min";
    return "à l'instant";
  }

  function formatDateShortFR(isoDate) {
    if (!isoDate) return "";
    const d = new Date(isoDate);
    const jours = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
    const mois = ["jan", "fév", "mar", "avr", "mai", "jun", "jul", "aoû", "sep", "oct", "nov", "déc"];
    return jours[d.getDay()] + " " + d.getDate() + " " + mois[d.getMonth()];
  }

  function formatDateLongFR(isoDate) {
    if (!isoDate) return "";
    const d = new Date(isoDate);
    const mois = [
      "janvier", "février", "mars", "avril", "mai", "juin",
      "juillet", "août", "septembre", "octobre", "novembre", "décembre"
    ];
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return d.getDate() + " " + mois[d.getMonth()] + " " + d.getFullYear() + " à " + h + "h" + m;
  }

  function normalizeStatus(fire) {
    const s = fire.status || fire.cl || "";
    if (s === "active" || s === "open" || s === "actif") return "actif";
    if (s === "contained" || s === "controlled" || s === "maitrise" || s === "mîtrise") return "maitrise";
    if (s === "closed" || s === "extinguished" || s === "eteint") return "eteint";
    // Infer from date
    if (fire.lastUpdate || fire.startDate) {
      const latest = new Date(fire.lastUpdate || fire.startDate).getTime();
      const ageH = (Date.now() - latest) / 3600000;
      if (ageH < 6) return "actif";
      if (ageH < 48) return "maitrise";
    }
    return "eteint";
  }

  function classifyLevel(fire) {
    const m = fire.magnitude || fire.area || 0;
    // Convert acres to ha if needed
    let ha = m;
    if (fire.magnitudeUnit === "acres") ha = m * 0.404686;
    if (ha < 50) return "faible";
    if (ha < 500) return "modere";
    if (ha < 5000) return "eleve";
    return "critique";
  }

  function levelLabel(level) {
    return {
      faible: "Faible",
      modere: "Modéré",
      eleve: "Élevé",
      critique: "Critique"
    }[level] || "Inconnu";
  }

  function levelColor(level) {
    return {
      faible: "#34c759",
      modere: "#ffd60a",
      leve: "#ff9500",
      eleve: "#ff9500",
      critique: "#ff3b30"
    }[level] || "#8e8e93";
  }

  function statusLabel(s) {
    return { actif: "Actif", maitrise: "Maîtrisé", eteint: "Éteint" }[s] || "Inconnu";
  }

  function getUserLocation() {
    if (typeof state !== "undefined" && state.city) {
      const c = state.city;
      if (c.lat != null && c.lon != null) {
        return { lat: c.lat, lon: c.lon };
      }
    }
    if (_userLat != null && _userLon != null) {
      return { lat: _userLat, lon: _userLon };
    }
    return null;
  }

  function enrichFire(fire) {
    const status = normalizeStatus(fire);
    const level = classifyLevel(fire);
    const user = getUserLocation();
    const distance = user ? distanceKm(user.lat, user.lon, fire.lat, fire.lon) : null;
    return {
      ...fire,
      _status: status,
      _level: level,
      _distance: distance
    };
  }

  // ============================================================
  //  FETCH — same-origin (no CORS), no API key
  // ============================================================
  async function fetchFires() {
    // 1) Cache hit
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        if (c && c.ts && Date.now() - c.ts < CACHE_TTL_MS && c.fires) {
          _allFires = c.fires;
          _lastFetchMs = c.ts;
          return _allFires;
        }
      }
    } catch (e) {}

    // 2) Fetch JSON bundled in repo
    try {
      const url = FIRE_DATA_URL + "?v=" + new Date().toISOString().slice(0, 10);
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const fires = Array.isArray(data.fires) ? data.fires : [];
      _allFires = fires;
      _lastFetchMs = Date.now();
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ ts: _lastFetchMs, fires: _allFires, source: data.source })
        );
      } catch (e) {}
      return _allFires;
    } catch (e) {
      console.warn("[Fires] fetch failed:", e);
      // Fallback: keep cached value even if stale
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const c = JSON.parse(cached);
          if (c && c.fires) {
            _allFires = c.fires;
            _lastFetchMs = c.ts || 0;
            return _allFires;
          }
        }
      } catch (e2) {}
      _allFires = [];
      _lastFetchMs = 0;
      return _allFires;
    }
  }

  // ============================================================
  //  RENDER
  // ============================================================
  function getFilteredFires() {
    let list = _allFires.map(enrichFire);
    if (_currentFilter === "actif") {
      list = list.filter((f) => f._status === "actif");
    } else if (_currentFilter === "maitrise") {
      list = list.filter((f) => f._status === "maitrise");
    } else if (_currentFilter === "eteint") {
      list = list.filter((f) => f._status === "eteint");
    }
    if (_searchQuery) {
      const q = _searchQuery.toLowerCase();
      list = list.filter((f) => {
        const hay = [
          f.title,
          f.department,
          f.country,
          f.region,
          f.description
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    // Tri : du plus proche au plus éloigné si géoloc, sinon plus récent
    const user = getUserLocation();
    if (user) {
      list.sort((a, b) => (a._distance || 1e9) - (b._distance || 1e9));
    } else {
      list.sort((a, b) => {
        const da = new Date(a.lastUpdate || a.startDate || 0).getTime();
        const db = new Date(b.lastUpdate || b.startDate || 0).getTime();
        return db - da;
      });
    }
    return list;
  }

  function renderCard(fire) {
    const color = levelColor(fire._level);
    const status = fire._status;
    const dist = fire._distance;
    const distText = dist != null
      ? (dist < 1 ? Math.round(dist * 1000) + " m" : Math.round(dist) + " km")
      : null;
    const start = fire.startDate ? formatDateShortFR(fire.startDate) : "?";
    const upd = fire.lastUpdate || fire.startDate;
    const updText = "mis à jour " + timeAgoFR(upd);
    return (
      '<div class="fire-card" data-level="' + fire._level + '" data-id="' + escapeHtml(fire.id) + '">' +
        '<div class="fire-card-row1">' +
          '<div class="fire-place">' + escapeHtml(fire.title) + '</div>' +
          '<div class="fire-level-badge" style="background:' + color + ';color:#1a1a2e">' + levelLabel(fire._level) + '</div>' +
        '</div>' +
        '<div class="fire-card-row2">' +
          (fire.department ? '<span class="fire-dept">📍 ' + escapeHtml(fire.department) + '</span>' : '') +
          (fire.country ? '<span class="fire-country">🌍 ' + escapeHtml(fire.country) + '</span>' : '') +
        '</div>' +
        '<div class="fire-card-row3">' +
          '<span class="fire-status fire-status--' + status + '">' + statusLabel(status) + '</span>' +
          '<span class="fire-updated">' + updText + '</span>' +
        '</div>' +
        '<div class="fire-card-row4">' +
          (fire.magnitude ? '<span class="fire-burned">🔥 ' + Math.round(fire.magnitude).toLocaleString("fr-FR") + ' ' + (fire.magnitudeUnit || "ha") + '</span>' : '') +
          (distText != null ? '<span class="fire-distance">📏 ' + distText + '</span>' : '<span class="fire-distance muted">📏 —</span>') +
        '</div>' +
      '</div>'
    );
  }

  function renderList() {
    const list = getFilteredFires();
    const container = $("#firesList");
    if (!container) return;
    if (list.length === 0) {
      container.innerHTML =
        '<div class="fire-card fire-empty">' +
          '<div class="fire-empty-emoji">✅</div>' +
          '<div class="fire-empty-title">Aucun incendie</div>' +
          '<div class="fire-empty-sub">' +
            (_currentFilter === "all" && !_searchQuery ? "Aucun incendie enregistré" : "Aucun résultat pour ces filtres") +
          '</div>' +
          '<div class="fire-empty-hint">Données mises à jour quotidiennement (EFFIS / EONET)</div>' +
        '</div>';
    } else {
      container.innerHTML = list.map(renderCard).join("");
    }
    // Update count
    const count = $("#firesCount");
    if (count) count.textContent = list.length + " feu" + (list.length > 1 ? "x" : "");
    // Update last update
    const upd = $("#firesLastUpdate");
    if (upd) {
      if (_lastFetchMs) {
        upd.textContent = "mis à jour " + timeAgoFR(new Date(_lastFetchMs).toISOString());
      } else {
        upd.textContent = "—";
      }
    }
  }

  function renderAlert() {
    const user = getUserLocation();
    if (!user) return;
    const closeActive = _allFires
      .map(enrichFire)
      .filter((f) => f._status === "actif" && f._distance != null && f._distance <= ALERT_DISTANCE_KM)
      .sort((a, b) => a._distance - b._distance);
    const banner = $("#firesAlertBanner");
    if (!banner) return;
    if (closeActive.length > 0) {
      const closest = closeActive[0];
      const dist = Math.round(closest._distance);
      banner.innerHTML =
        '<span>🔥 <strong>Incendie actif à ' + dist + ' km</strong> — ' + escapeHtml(closest.title) + '</span>' +
        '<button id="firesAlertClose" aria-label="Fermer">×</button>';
      banner.classList.add("visible");
      // Update topbar icon badge
      const ico = $("#firesIconBtn");
      if (ico) ico.classList.add("has-alert");
      const dismissBtn = $("#firesAlertClose");
      if (dismissBtn) {
        dismissBtn.addEventListener("click", () => {
          banner.classList.remove("visible");
          try {
            sessionStorage.setItem("meteo_fires_alert_dismissed", String(Date.now()));
          } catch (e) {}
        }, { once: true });
      }
    } else {
      banner.classList.remove("visible");
      const ico = $("#firesIconBtn");
      if (ico) ico.classList.remove("has-alert");
    }
  }

  // ============================================================
  //  FIRE DETAIL
  // ============================================================
  function openFireDetail(fireId) {
    const fire = _allFires.find((f) => f.id === fireId);
    if (!fire) return;
    const e = enrichFire(fire);
    const color = levelColor(e._level);
    const status = e._status;
    const startLong = formatDateLongFR(fire.startDate);
    const updLong = formatDateLongFR(fire.lastUpdate || fire.startDate);
    const user = getUserLocation();
    const dist = e._distance;
    const distText = dist != null
      ? (dist < 1 ? Math.round(dist * 1000) + " m" : dist.toFixed(1) + " km")
      : "Localisation inactive";
    const osmUrl = "https://www.openstreetmap.org/?mlat=" + fire.lat + "&mlon=" + fire.lon + "#map=10/" + fire.lat + "/" + fire.lon;

    const advice = (() => {
      if (e._level === "critique") {
        return (
          '<p>⚠️ <strong>Risque majeur.</strong> Si vous êtes dans la zone : préparez votre évacuation, fermez volets et aérations, suivez les consignes des autorités (pompiers, préfecture).</p>' +
          '<p>Éloignez-vous des fumées, protégez vos voies respiratoires. Appelez le <strong>18</strong> (pompiers) ou le <strong>112</strong> en urgence.</p>'
        );
      }
      if (e._level === "eleve") {
        return (
          '<p>⚠️ <strong>Vigilance renforcée.</strong> Ne circulez pas dans le périmètre du feu. Si vous êtes dans une zone habitée proche, tenez-vous prêt à évacuer.</p>' +
          '<p>Évitez les activités en forêt. Suivez l\'évolution sur les canaux officiels.</p>'
        );
      }
      if (e._level === "modere") {
        return (
          '<p>🟡 <strong>Surveillance active.</strong> Le feu est contenu mais reste sous surveillance. Restez informé.</p>' +
          '<p>Respectez les éventuels arrêtés préfectoraux (circulation, accès aux massifs).</p>'
        );
      }
      return (
        '<p>✅ <strong>Situation stabilisée.</strong> Le feu est sous contrôle ou éteint. Pour rappel, restez vigilant en période estivale.</p>' +
        '<p>En cas de nouveau départ, appelez le <strong>18</strong> immédiatement.</p>'
      );
    })();

    const emoji = (() => {
      if (e._level === "critique") return "🔥";
      if (e._level === "eleve") return "🔥";
      if (e._level === "modere") return "🔥";
      return "🔥";
    })();

    const overlay = $("#fireDetailPanel");
    if (!overlay) return;
    overlay.querySelector("#fireDetailName").textContent = fire.title;
    const subEl = overlay.querySelector("#fireDetailDept");
    if (subEl) {
      subEl.textContent =
        (fire.department ? fire.department + " · " : "") +
        (fire.country || "") +
        (fire.region ? " · " + fire.region : "");
    }
    const emojiEl = overlay.querySelector("#fireDetailEmoji");
    if (emojiEl) emojiEl.textContent = emoji;
    const levEl = overlay.querySelector("#fireDetailLevel");
    if (levEl) {
      levEl.textContent = levelLabel(e._level);
      levEl.style.color = color;
    }
    const statEl = overlay.querySelector("#fireDetailStatus");
    if (statEl) {
      statEl.textContent = statusLabel(status);
      statEl.className = "fire-status fire-status--" + status;
    }
    const burnedEl = overlay.querySelector("#fireDetailBurned");
    if (burnedEl) {
      burnedEl.textContent = fire.magnitude
        ? Math.round(fire.magnitude).toLocaleString("fr-FR") + " " + (fire.magnitudeUnit || "ha")
        : "—";
    }
    const distEl = overlay.querySelector("#fireDetailDistance");
    if (distEl) distEl.textContent = distText;
    const startEl = overlay.querySelector("#fireDetailStart");
    if (startEl) startEl.textContent = startLong || "—";
    const updEl = overlay.querySelector("#fireDetailUpdated");
    if (updEl) updEl.textContent = updLong || "—";
    const coordsEl = overlay.querySelector("#fireDetailCoords");
    if (coordsEl) {
      coordsEl.textContent = fire.lat.toFixed(4) + "° N, " + fire.lon.toFixed(4) + "° E";
    }
    const adviceEl = overlay.querySelector("#fireDetailAdvice");
    if (adviceEl) adviceEl.innerHTML = advice;
    const link = overlay.querySelector("#fireDetailMapLink");
    if (link) link.href = osmUrl;
    overlay.classList.add("visible");
  }

  function closeFireDetail() {
    const overlay = $("#fireDetailPanel");
    if (overlay) overlay.classList.remove("visible");
  }

  // ============================================================
  //  PANEL
  // ============================================================
  function openPanel() {
    const overlay = $("#firesPanel");
    if (overlay) overlay.classList.add("visible");
    // Refresh on open (so it's fresh)
    refresh();
  }

  function closePanel() {
    const overlay = $("#firesPanel");
    if (overlay) overlay.classList.remove("visible");
    closeFireDetail();
  }

  // ============================================================
  //  BOUTON TOPBAR
  // ============================================================
  function toggleAlert() {
    const overlay = $("#firesPanel");
    if (!overlay) return;
    if (overlay.classList.contains("visible")) {
      closePanel();
    } else {
      openPanel();
    }
  }

  // ============================================================
  //  REFRESH
  // ============================================================
  async function refresh() {
    const btn = $("#firesRefreshBtn");
    if (btn) {
      btn.classList.add("spinning");
      btn.disabled = true;
    }
    // Show skeleton
    const list = $("#firesList");
    if (list) {
      list.innerHTML =
        '<div class="fire-card skeleton"><div class="sk-line sk-1"></div><div class="sk-line sk-2"></div><div class="sk-line sk-3"></div></div>' +
        '<div class="fire-card skeleton"><div class="sk-line sk-1"></div><div class="sk-line sk-2"></div><div class="sk-line sk-3"></div></div>';
    }
    try {
      await fetchFires();
      renderList();
      renderAlert();
    } catch (e) {
      console.error("[Fires] refresh error:", e);
      if (list) {
        list.innerHTML =
          '<div class="fire-card fire-empty">' +
            '<div class="fire-empty-emoji">⚠️</div>' +
            '<div class="fire-empty-title">Erreur de chargement</div>' +
            '<div class="fire-empty-sub">Impossible de récupérer les données</div>' +
          '</div>';
      }
    }
    if (btn) {
      btn.classList.remove("spinning");
      btn.disabled = false;
    }
  }

  function startAutoRefresh() {
    if (_refreshTimer) clearInterval(_refreshTimer);
    _refreshTimer = setInterval(() => {
      refresh();
    }, FRESH_MS);
  }

  // ============================================================
  //  FILTRES
  // ============================================================
  function setFilter(f) {
    // Map HTML data-filter values to internal values
    const map = {
      tous: "all",
      actifs: "actif",
      maitrises: "maitrise",
      eteints: "eteint"
    };
    _currentFilter = map[f] || f;
    const btns = document.querySelectorAll(".fires-filter");
    btns.forEach((b) => {
      if (b.dataset.filter === f) b.classList.add("active");
      else b.classList.remove("active");
    });
    renderList();
  }

  function setSearch(query) {
    _searchQuery = (query || "").trim();
    renderList();
  }

  // ============================================================
  //  INIT
  // ============================================================
  function init() {
    // Bouton topbar
    const btn = $("#firesIconBtn");
    if (btn) {
      btn.addEventListener("click", toggleAlert);
    }

    // Close panel
    const closeBtn = $("#firesCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", closePanel);

    // Refresh button
    const refreshBtn = $("#firesRefreshBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", refresh);

    // Filtres
    const filterBtns = document.querySelectorAll(".fires-filter");
    filterBtns.forEach((b) => {
      b.addEventListener("click", () => setFilter(b.dataset.filter));
    });
    setFilter("all");

    // Search
    const searchInput = $("#firesSearch");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => setSearch(e.target.value));
    }

    // Detail close
    const detailClose = $("#fireDetailClose");
    if (detailClose) detailClose.addEventListener("click", closeFireDetail);

    // Click outside detail to close
    const detailOverlay = $("#fireDetailPanel");
    if (detailOverlay) {
      detailOverlay.addEventListener("click", (e) => {
        if (e.target.id === "fireDetailPanel") closeFireDetail();
      });
    }

    // Click on fire card
    document.addEventListener("click", (e) => {
      const card = e.target.closest(".fire-card");
      if (card && card.dataset.id && !card.classList.contains("skeleton") && !card.classList.contains("fire-empty")) {
        openFireDetail(card.dataset.id);
      }
    });

    // Auto refresh
    startAutoRefresh();

    // Premier fetch
    refresh();
  }

  function onCityChange(lat, lon) {
    if (lat != null && lon != null) {
      _userLat = lat;
      _userLon = lon;
    }
    renderAlert();
    renderList();
  }

  // ============================================================
  //  EXPOSE
  // ============================================================
  window.FiresModule = {
    init: init,
    refresh: refresh,
    openPanel: openPanel,
    closePanel: closePanel,
    onCityChange: onCityChange
  };
})();
