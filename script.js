// ===== WMO codes =====
// Pictogrammes La Chaîne Météo (LCM) — viewBox 0 0 192 192
const WMO = {
  0:  { label: "Ensoleillé",            icon: "weather-sunny",        night: "weather-moon" },
  1:  { label: "Ensoleillé",            icon: "weather-sunny",        night: "weather-moon" },
  2:  { label: "Partiellement nuageux",  icon: "weather-cloudy",       night: "weather-moon" },
  3:  { label: "Couvert",               icon: "weather-overcast",     night: "weather-overcast" },
  45: { label: "Brouillard",            icon: "weather-fog",          night: "weather-fog" },
  48: { label: "Brouillard",            icon: "weather-fog",          night: "weather-fog" },
  51: { label: "Bruine",                icon: "weather-rain",         night: "weather-rain" },
  53: { label: "Bruine",                icon: "weather-rain",         night: "weather-rain" },
  55: { label: "Bruine",                icon: "weather-rain",         night: "weather-rain" },
  56: { label: "Bruine verglaçante",    icon: "weather-freezing-rain",night: "weather-freezing-rain" },
  57: { label: "Bruine verglaçante",    icon: "weather-freezing-rain",night: "weather-freezing-rain" },
  61: { label: "Pluie",                 icon: "weather-rain",         night: "weather-rain" },
  63: { label: "Pluie",                 icon: "weather-rain",         night: "weather-rain" },
  65: { label: "Pluie",                 icon: "weather-rain",         night: "weather-rain" },
  66: { label: "Pluie verglaçante",     icon: "weather-freezing-rain",night: "weather-freezing-rain" },
  67: { label: "Pluie verglaçante",     icon: "weather-freezing-rain",night: "weather-freezing-rain" },
  71: { label: "Neige",                 icon: "weather-snow",         night: "weather-snow" },
  73: { label: "Neige",                 icon: "weather-snow",         night: "weather-snow" },
  75: { label: "Neige abondante",       icon: "weather-snow",         night: "weather-snow" },
  77: { label: "Neige",                 icon: "weather-snow",         night: "weather-snow" },
  80: { label: "Averses",               icon: "weather-sun-and-rain", night: "weather-rain" },
  81: { label: "Averses",               icon: "weather-sun-and-rain", night: "weather-rain" },
  82: { label: "Fortes pluies",         icon: "weather-rain",         night: "weather-rain" },
  85: { label: "Neige",                 icon: "weather-snow",         night: "weather-snow" },
  86: { label: "Neige abondante",       icon: "weather-snow",         night: "weather-snow" },
  95: { label: "Orage",                 icon: "weather-thunderstorm", night: "weather-thunderstorm" },
  96: { label: "Orage",                 icon: "weather-thunderstorm", night: "weather-thunderstorm" },
  99: { label: "Orage",                 icon: "weather-thunderstorm", night: "weather-thunderstorm" }
};

const REPORT_OPTIONS = [
  { code: 0,  label: "Ensoleillé" },
  { code: 2,  label: "Nuageux" },
  { code: 3,  label: "Couvert" },
  { code: 45, label: "Brouillard" },
  { code: 51, label: "Bruine" },
  { code: 61, label: "Pluie" },
  { code: 65, label: "Pluie forte" },
  { code: 71, label: "Neige" },
  { code: 95, label: "Orage" }
];

function wmoInfo(code, isNight) {
  const c = WMO[code] || { label: "—", icon: "cloud" };
  return { label: c.label, icon: isNight && c.night ? c.night : c.icon };
}
function themeFor(code, isNight, currentTime, windSpeed) {
  const hour = currentTime ? getHourFromISO(currentTime) : 12;
  const isEvening = hour >= 18 && hour < 21;
  const isWindy = (windSpeed || 0) > 25;
  if ([95,96,99].includes(code)) return "theme-storm";
  if (isWindy && [0,1,2,3].includes(code)) return "theme-windy";
  if ([71,73,75,77,85,86].includes(code)) return "theme-snow";
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return "theme-rain";
  if ([45,48].includes(code)) return "theme-fog";
  if ([2,3].includes(code)) return "theme-cloudy";
  if (code === 0 || code === 1) {
    if (isNight) return "theme-night-clear";
    if (isEvening) return "theme-sunset";
    return "theme-day-clear";
  }
  return "theme-day-clear";
}
// Couleurs officielles La Chaîne Météo pour chaque pictogramme
const ICON_COLORS = {
  "weather-sunny":         "#FFB300",
  "weather-moon":          "#E8EAF6",
  "weather-cloudy":        "#90A4AE",
  "weather-overcast":      "#607D8B",
  "weather-fog":           "#B0BEC5",
  "weather-rain":          "#2196F3",
  "weather-snow":          "#E1F5FE",
  "weather-thunderstorm":  "#5E35B1",
  "weather-sun-and-rain":  "#42A5F5",
  "weather-sun-and-snow":  "#B3E5FC",
  "weather-freezing-rain": "#7E57C2"
};

function icon(name, size = 28) {
  // Les pictogrammes LCM (weather-*) ont un viewBox 192x192, les icônes i-* 64x64
  const isLcm = name.startsWith("weather-") || name === "weather-moon";
  const vb = isLcm ? "0 0 192 192" : "0 0 64 64";
  const href = isLcm ? `#${name}` : `#i-${name}`;
  // La couleur est appliquée sur l'élément <use> : elle est héritée par les paths du <symbol>
  const fill = isLcm ? (ICON_COLORS[name] || "#FFFFFF") : "currentColor";
  return `<svg class="wicon" width="${size}" height="${size}" viewBox="${vb}" aria-hidden="true"><use href="${href}" fill="${fill}"/></svg>`;
}

// ===== State =====
const state = {
  cities: [],
  activeIdx: 0,
  geoTried: false,
  unit: "C",
  notif: false
};
const LS_KEY = "meteo_v2";
let lastWeather = null;   // cache pour partage/report

function saveState() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (s && Array.isArray(s.cities) && s.cities.length) {
      state.cities = s.cities;
      state.activeIdx = Math.min(s.activeIdx || 0, s.cities.length - 1);
      state.unit = s.unit || "C";
      state.notif = !!s.notif;
      return true;
    }
  } catch (e) {}
  return false;
}

function fmtTemp(c) {
  if (c == null || isNaN(c)) return "—";
  if (state.unit === "F") return `${Math.round(c * 9/5 + 32)}°`;
  return `${Math.round(c)}°`;
}

async function searchCities(q) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=fr&format=json`;
  const res = await fetch(url);
  return (await res.json()).results || [];
}
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum&timezone=auto&forecast_days=10`;
  const res = await fetch(url);
  return res.json();
}

// L'API Open-Meteo (avec timezone=auto) renvoie les heures dans le fuseau LOCAL de la ville.
// On parse directement depuis l'ISO pour éviter d'utiliser le fuseau du navigateur.
function getHourFromISO(iso) {
  const m = (iso || "").match(/T(\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}
function getMinutesFromISO(iso) {
  const m = (iso || "").match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}
function fmtTime(iso) {
  if (!iso) return "—";
  // sunrise/sunset : "2026-06-24T05:42" → "05:42" dans le fuseau de la ville
  const t = getMinutesFromISO(iso);
  if (t) return t;
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function fmtHourLabel(iso) {
  const h = getHourFromISO(iso);
  return h != null ? `${String(h).padStart(2, '0')}h` : "—";
}
function dayName(iso, idx) {
  if (idx === 0) return "Auj.";
  // "2026-06-24" → on force UTC midi pour ne pas décaler d'un jour
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
}
function degToCompass(deg) { const dirs = ["N","NE","E","SE","S","SO","O","NO"]; return dirs[Math.round(deg / 45) % 8]; }

const $ = (id) => document.getElementById(id);
const app = $("app");

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2500);
}

// ===== Tabs =====
function renderTabs() {
  const tabs = $("cityTabs");
  tabs.innerHTML = "";
  state.cities.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "city-tab" + (i === state.activeIdx ? " active" : "");
    b.innerHTML = `${c.name}<span class="close-x" data-i="${i}">✕</span>`;
    b.onclick = (e) => {
      if (e.target.classList.contains("close-x")) {
        e.stopPropagation();
        if (state.cities.length > 1) {
          state.cities.splice(i, 1);
          state.activeIdx = Math.min(state.activeIdx, state.cities.length - 1);
        }
        saveState();
        renderTabs();
        loadActive();
      } else {
        state.activeIdx = i;
        saveState();
        renderTabs();
        loadActive();
      }
    };
    tabs.appendChild(b);
  });
}

// ===== Render city =====
function renderCity(city, w) {
  lastWeather = w;
  const cur = w.current;
  const daily = w.daily;
  const hourly = w.hourly;
  const isNight = cur.is_day === 0;
  const code = cur.weather_code;
  const info = wmoInfo(code, isNight);

  app.className = "app " + themeFor(code, isNight, cur.time, cur.wind_speed_10m);

  $("cityName").textContent = city.name;
  $("temp").textContent = fmtTemp(cur.temperature_2m);
  $("condition").textContent = info.label;
  $("hilo").textContent = `H:${fmtTemp(daily.temperature_2m_max[0])}  L:${fmtTemp(daily.temperature_2m_min[0])}`;

  // Grande icône météo principale (LCM)
  const mainIcon = $("mainIcon");
  if (mainIcon) mainIcon.innerHTML = icon(info.icon, 140);

  // Description premium et naturelle
  const hi = daily.temperature_2m_max[0];
  const lo = daily.temperature_2m_min[0];
  const popToday = daily.precipitation_probability_max[0] || 0;
  const feelsLike = fmtTemp(cur.apparent_temperature);
  const humidity = cur.relative_humidity_2m;
  const wind = Math.round(cur.wind_speed_10m);

  let desc = `Actuellement, le temps est ${info.label.toLowerCase()}. `;
  desc += `Le ressenti est de ${feelsLike} avec une humidité de ${humidity}%. `;

  if (popToday > 30) {
    desc += `Des précipitations sont probables (${popToday}%). `;
  } else if (wind > 25) {
    desc += `Attention au vent soutenu de ${wind} km/h. `;
  } else if (code === 0 || code === 1) {
    desc += `Profitez d'une belle journée ensoleillée. `;
  }

  desc += `Les températures varieront entre ${fmtTemp(lo)} et ${fmtTemp(hi)}.`;
  $("descText").textContent = desc;

  // Hourly — "Maintenant" = température COURANTE, et tout est dans le fuseau de la ville
  const currentHour = getHourFromISO(cur.time);
  const nowIdx = currentHour != null
    ? hourly.time.findIndex(t => getHourFromISO(t) === currentHour)
    : 0;
  const startIdx = nowIdx >= 0 ? nowIdx : 0;
  const $hourly = $("hourly");
  $hourly.innerHTML = "";
  for (let i = 0; i < 24; i++) {
    const idx = startIdx + i;
    if (idx >= hourly.time.length) break;
    const h = document.createElement("div");
    h.className = "hour" + (i === 0 ? " now" : "");
    const hourVal = getHourFromISO(hourly.time[idx]);
    const isNightH = hourVal != null && (hourVal < 6 || hourVal >= 20);
    const wi = wmoInfo(hourly.weather_code[idx], isNightH);
    const tempDisplay = (i === 0) ? fmtTemp(cur.temperature_2m) : fmtTemp(hourly.temperature_2m[idx]);
    const popRaw = hourly.precipitation_probability[idx] || 0;
    // Jauge visuelle : visible à partir de 5%, pleine à 100%
    const popVal = Math.max(0, Math.min(100, popRaw));
    const popVisible = popVal >= 5;
    const popBarHeight = popVisible ? Math.max(6, (popVal / 100) * 22) : 0;
    const popColor = popVal >= 70 ? "#7E57C2" : popVal >= 40 ? "#42A5F5" : "#90CAF9";
    h.innerHTML = `
      <div class="hour-time">${i === 0 ? "Maintenant" : fmtHourLabel(hourly.time[idx])}</div>
      <div class="hour-icon">${icon(wi.icon, 28)}</div>
      <div class="hour-temp">${tempDisplay}</div>
      <div class="hour-pop">
        ${popVisible ? `<div class="pop-bar" style="height:${popBarHeight}px;background:${popColor};"><span>${popVal}%</span></div>` : `<div class="pop-bar empty" style="height:2px;"><span>&nbsp;</span></div>`}
      </div>
    `;
    $hourly.appendChild(h);
  }

  // Daily
  const $daily = $("daily");
  $daily.innerHTML = "";
  const allMax = Math.max(...daily.temperature_2m_max);
  const allMin = Math.min(...daily.temperature_2m_min);
  const range = Math.max(1, allMax - allMin);
  for (let i = 0; i < daily.time.length; i++) {
    const di = document.createElement("div");
    di.className = "day";
    const lo = daily.temperature_2m_min[i];
    const hi = daily.temperature_2m_max[i];
    const pop = daily.precipitation_probability_max[i] || 0;
    const startPct = ((lo - allMin) / range) * 100;
    const endPct = ((hi - allMin) / range) * 100;
    const wi = wmoInfo(daily.weather_code[i], false);
    di.innerHTML = `
      <div class="day-name">${dayName(daily.time[i], i)}</div>
      <div class="day-icon">
        ${icon(wi.icon, 24)}
        ${pop > 0 ? `<div class="day-pop">${pop}%</div>` : ""}
      </div>
      <div class="day-low">${fmtTemp(lo)}</div>
      <div class="day-bar"><span class="fill" style="left:${startPct}%; right:${100 - endPct}%"></span></div>
      <div class="day-high">${fmtTemp(hi)}</div>
    `;
    $daily.appendChild(di);
  }

  // Details
  $("sunrise").textContent = fmtTime(daily.sunrise[0]);
  $("sunset").textContent = fmtTime(daily.sunset[0]);
  $("wind").textContent = `${Math.round(cur.wind_speed_10m)} km/h`;
  $("windDir").textContent = `${degToCompass(cur.wind_direction_10m)} · Rafales ${Math.round(cur.wind_speed_10m * 1.4)} km/h`;
  $("precip").textContent = `${daily.precipitation_sum[0]?.toFixed(1) || "0.0"} mm`;
  $("precipSub").textContent = `Risque ${daily.precipitation_probability_max[0] || 0}% aujourd'hui`;
  $("humidity").textContent = `${cur.relative_humidity_2m}%`;
  $("dew").textContent = `Point de rosée ${fmtTemp(cur.temperature_2m - (100 - cur.relative_humidity_2m) / 5)}`;
  $("feels").textContent = fmtTemp(cur.apparent_temperature);
  $("feelsSub").textContent = cur.apparent_temperature < cur.temperature_2m ? "Plus frais à cause du vent" : "Similaire à la réelle";
  $("vis").textContent = "10+ km";
  $("pressure").textContent = `${Math.round(cur.surface_pressure)} hPa`;
  $("pressureSub").textContent = cur.surface_pressure > 1013 ? "Au-dessus de la moyenne" : "En dessous de la moyenne";

  // UV
  const uv = daily.uv_index_max?.[0] || 0;
  $("airQ").textContent = uv.toFixed(1);
  const uvLabels = ["Faible","Faible","Faible","Modéré","Modéré","Modéré","Élevé","Élevé","Très élevé","Extrême","Extrême"];
  $("airSub").textContent = uvLabels[Math.min(10, Math.round(uv))] || "—";
  $("aqBar").style.width = `${Math.min(100, uv * 10)}%`;
}

async function loadActive() {
  const city = state.cities[state.activeIdx];
  if (!city) return;
  try {
    $("cityName").textContent = city.name + " …";
    const w = await fetchWeather(city.lat, city.lon);
    renderCity(city, w);
  } catch (e) {
    console.error(e);
    $("cityName").textContent = "Erreur";
    $("temp").textContent = "—";
  }
}

// ===== Geoloc =====
function tryGeolocate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(false);
    if (window.location.protocol === "file:") return resolve(false);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      if (state.cities[0] && state.cities[0].name === "Ma position") {
        state.cities[0] = { name: "Ma position", lat: latitude, lon: longitude };
      } else {
        state.cities.unshift({ name: "Ma position", lat: latitude, lon: longitude });
        state.activeIdx = 0;
      }
      saveState();
      renderTabs();
      await loadActive();
      toast("Position mise à jour");
      resolve(true);
    }, () => resolve(false), { timeout: 8000, maximumAge: 600000 });
  });
}

// ===== Search =====
const overlay = $("searchOverlay");
const input = $("searchInput");
const results = $("searchResults");
let searchTimer;
$("searchBtn").onclick = () => {
  overlay.classList.add("open");
  input.value = "";
  results.innerHTML = "";
  setTimeout(() => input.focus(), 50);
};
$("cancelSearch").onclick = () => overlay.classList.remove("open");
input.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = input.value.trim();
  if (q.length < 2) { results.innerHTML = ""; return; }
  searchTimer = setTimeout(async () => {
    try {
      const rs = await searchCities(q);
      results.innerHTML = "";
      rs.forEach(r => {
        const div = document.createElement("div");
        div.className = "search-result";
        div.innerHTML = `
          <div>
            <div class="sr-name">${r.name}</div>
            <div class="sr-meta">${[r.admin1, r.country].filter(Boolean).join(", ")}</div>
          </div>
        `;
        div.onclick = () => {
          state.cities.push({ name: r.name, lat: r.latitude, lon: r.longitude });
          state.activeIdx = state.cities.length - 1;
          saveState();
          renderTabs();
          loadActive();
          overlay.classList.remove("open");
        };
        results.appendChild(div);
      });
      if (!rs.length) {
        results.innerHTML = `<div class="search-result"><div class="sr-meta">Aucun résultat</div></div>`;
      }
    } catch (e) {
      results.innerHTML = `<div class="search-result"><div class="sr-meta">Erreur réseau</div></div>`;
    }
  }, 250);
});

// ===== Settings panel =====
$("settingsBtn").onclick = () => $("settingsPanel").classList.add("open");
$("closeSettings").onclick = () => $("settingsPanel").classList.remove("open");
$("settingsPanel").addEventListener("click", (e) => {
  if (e.target.id === "settingsPanel") $("settingsPanel").classList.remove("open");
});

// Unit toggle
document.querySelectorAll(".seg").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".seg").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.unit = btn.dataset.unit;
    saveState();
    loadActive();
  });
});

// Refresh
$("refreshBtn").onclick = async () => {
  $("settingsPanel").classList.remove("open");
  await loadActive();
  toast("Météo actualisée");
};

// Notifications toggle
$("notifToggle").onclick = () => {
  state.notif = !state.notif;
  $("notifToggle").classList.toggle("on", state.notif);
  saveState();
  toast(state.notif ? "Notifications activées" : "Notifications désactivées");
};

// Share
$("shareBtn").onclick = async () => {
  $("settingsPanel").classList.remove("open");
  const city = state.cities[state.activeIdx];
  if (!city) return;
  const text = `Météo à ${city.name} : ${$("condition").textContent}, ${$("temp").textContent} — ${$("hilo").textContent}`;
  if (navigator.share) {
    try { await navigator.share({ title: "Météo", text }); return; }
    catch (e) {}
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Copié dans le presse-papier");
  } catch (e) {
    toast("Partage indisponible");
  }
};

// Clear history
$("clearHistoryBtn").onclick = () => {
  $("settingsPanel").classList.remove("open");
  localStorage.removeItem("meteo_reports");
  toast("Historique des signalements effacé");
};

// ===== Report modal =====
$("reportBtn").onclick = () => {
  const city = state.cities[state.activeIdx];
  $("settingsPanel").classList.remove("open");
  $("reportCity").textContent = city ? city.name : "—";
  $("reportIcon").innerHTML = icon(getCurrentIconName(), 56);
  $("reportTemp").textContent = $("temp").textContent;
  $("reportCond").textContent = $("condition").textContent;

  const grid = $("conditionGrid");
  grid.innerHTML = "";
  REPORT_OPTIONS.forEach(opt => {
    const isNight = new Date().getHours() < 6 || new Date().getHours() > 19;
    const wi = wmoInfo(opt.code, isNight);
    const b = document.createElement("button");
    b.className = "cond-btn";
    b.innerHTML = `${icon(wi.icon, 32)}<div>${opt.label}</div>`;
    b.onclick = () => {
      const reports = JSON.parse(localStorage.getItem("meteo_reports") || "[]");
      reports.push({ city: city.name, code: opt.code, label: opt.label, time: new Date().toISOString() });
      localStorage.setItem("meteo_reports", JSON.stringify(reports));
      $("reportModal").classList.remove("open");
      toast(`"${opt.label}" signalé pour ${city.name}`);
    };
    grid.appendChild(b);
  });
  $("reportModal").classList.add("open");
};
$("confirmReport").onclick = () => {
  const city = state.cities[state.activeIdx];
  const reports = JSON.parse(localStorage.getItem("meteo_reports") || "[]");
  reports.push({ city: city.name, code: "confirmed", label: $("condition").textContent, time: new Date().toISOString() });
  localStorage.setItem("meteo_reports", JSON.stringify(reports));
  $("reportModal").classList.remove("open");
  toast(`Condition confirmée pour ${city.name}`);
};
$("cancelReport").onclick = () => $("reportModal").classList.remove("open");
$("reportModal").addEventListener("click", (e) => {
  if (e.target.id === "reportModal") $("reportModal").classList.remove("open");
});

function getCurrentIconName() {
  if (!lastWeather) return "cloud";
  const cur = lastWeather.current;
  return wmoInfo(cur.weather_code, cur.is_day === 0).icon;
}

// ===== Init =====
function syncUnitToggle() {
  document.querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b.dataset.unit === state.unit));
  $("notifToggle").classList.toggle("on", state.notif);
}

(async function init() {
  const ok = loadState();
  if (!ok) {
    state.cities = [{ name: "Ma position", lat: 48.8566, lon: 2.3522 }];
    state.activeIdx = 0;
  }
  syncUnitToggle();
  renderTabs();
  await loadActive();

  // Auto-actualisation toutes les 1 minute
  setInterval(loadActive, 60000);

  if (!state.geoTried) {
    state.geoTried = true;
    tryGeolocate();
  }
})();