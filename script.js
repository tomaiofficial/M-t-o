// ===== WMO codes =====
// Pictogrammes Google Weather (style Apple iOS) — viewBox 0 0 48 48
const WMO = {
  0:  { label: "Ensoleillé",            icon: "apple-clear-day",         night: "apple-clear-night" },
  1:  { label: "Ensoleillé",            icon: "apple-clear-day",         night: "apple-clear-night" },
  2:  { label: "Partiellement nuageux",  icon: "apple-partly-cloudy-day", night: "apple-partly-cloudy-night" },
  3:  { label: "Couvert",               icon: "apple-cloudy",            night: "apple-cloudy" },
  45: { label: "Brouillard",            icon: "apple-fog",               night: "apple-fog" },
  48: { label: "Brouillard",            icon: "apple-fog",               night: "apple-fog" },
  51: { label: "Bruine",                icon: "apple-drizzle",           night: "apple-drizzle" },
  53: { label: "Bruine",                icon: "apple-drizzle",           night: "apple-drizzle" },
  55: { label: "Bruine",                icon: "apple-drizzle",           night: "apple-drizzle" },
  56: { label: "Bruine verglaçante",    icon: "apple-icy",               night: "apple-icy" },
  57: { label: "Bruine verglaçante",    icon: "apple-icy",               night: "apple-icy" },
  61: { label: "Pluie",                 icon: "apple-rain",              night: "apple-rain" },
  63: { label: "Pluie",                 icon: "apple-rain",              night: "apple-rain" },
  65: { label: "Pluie",                 icon: "apple-rain",              night: "apple-rain" },
  66: { label: "Pluie verglaçante",     icon: "apple-icy",               night: "apple-icy" },
  67: { label: "Pluie verglaçante",     icon: "apple-icy",               night: "apple-icy" },
  71: { label: "Neige",                 icon: "apple-snow",              night: "apple-snow" },
  73: { label: "Neige",                 icon: "apple-snow",              night: "apple-snow" },
  75: { label: "Neige abondante",       icon: "apple-snow",              night: "apple-snow" },
  77: { label: "Neige",                 icon: "apple-snow",              night: "apple-snow" },
  80: { label: "Averses",               icon: "apple-thunder-rain",      night: "apple-rain" },
  81: { label: "Averses",               icon: "apple-thunder-rain",      night: "apple-rain" },
  82: { label: "Fortes pluies",         icon: "apple-heavy-rain",        night: "apple-heavy-rain" },
  85: { label: "Neige",                 icon: "apple-snow",              night: "apple-snow" },
  86: { label: "Neige abondante",       icon: "apple-snow",              night: "apple-snow" },
  95: { label: "Orage",                 icon: "apple-thunder",           night: "apple-thunder" },
  96: { label: "Orage",                 icon: "apple-thunder",           night: "apple-thunder" },
  99: { label: "Orage",                 icon: "apple-thunder",           night: "apple-thunder" }
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
// Icônes Google Weather : couleurs intégrées via dégradés (ne pas appliquer de fill)
const ICON_COLORS = {
  "apple-clear-day":         null,
  "apple-clear-night":       null,
  "apple-partly-cloudy-day": null,
  "apple-partly-cloudy-night": null,
  "apple-cloudy":            null,
  "apple-fog":               null,
  "apple-drizzle":           null,
  "apple-rain":              null,
  "apple-heavy-rain":        null,
  "apple-snow":              null,
  "apple-thunder":           null,
  "apple-thunder-rain":      null,
  "apple-icy":               null,
  "apple-windy":             null
};

function icon(name, size = 28) {
  // Icônes Google Weather (apple-*) : viewBox 48x48 avec dégradés intégrés
  // Icônes utilitaires (i-*) : viewBox 64x64, fill hérité via currentColor
  const isApple = name.startsWith("apple-");
  const vb = isApple ? "0 0 48 48" : "0 0 64 64";
  const href = isApple ? `#${name}` : `#i-${name}`;
  // Les icônes Apple ont leurs couleurs dans les <linearGradient> du <symbol>
  const fill = isApple ? "" : "currentColor";
  const fillAttr = fill ? ` fill="${fill}"` : "";
  return `<svg class="wicon" width="${size}" height="${size}" viewBox="${vb}" aria-hidden="true"><use href="${href}"${fillAttr}/></svg>`;
}

// ===== State =====
const state = {
  cities: [],
  activeIdx: 0,
  geoTried: false,
  unit: "C",
  notif: false,
  autoRefresh: false,
  detailHourly: false,
  airQuality: false
};
const LS_KEY = "meteo_v2";
let lastWeather = null;   // cache pour partage/report
let lastAirQuality = null;
let lastRefreshMs = Date.now();

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
      state.autoRefresh = !!s.autoRefresh;
      state.detailHourly = !!s.detailHourly;
      state.airQuality = !!s.airQuality;
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
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,apparent_temperature,weather_code,precipitation_probability,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum&timezone=auto&forecast_days=10`;
  const res = await fetch(url);
  return res.json();
}

// L'API Open-Meteo (avec timezone=auto) renvoie les heures dans le fuseau LOCAL de la ville.
// On parse directement depuis l'ISO pour éviter d'utiliser le fuseau du navigateur.
function getHourFromISO(iso) {
  const m = (iso || "").match(/T(\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}
function findCurrentHourIndex(hourlyTimes, currentISO) {
  if (!Array.isArray(hourlyTimes) || hourlyTimes.length === 0) return 0;
  if (!currentISO) {
    const nowH = new Date().getHours();
    const i = hourlyTimes.findIndex(t => getHourFromISO(t) === nowH);
    return i >= 0 ? i : 0;
  }
  const curH = getHourFromISO(currentISO);
  const i = hourlyTimes.findIndex(t => getHourFromISO(t) === curH);
  return i >= 0 ? i : 0;
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

  // Description
  const hi = daily.temperature_2m_max[0];
  const lo = daily.temperature_2m_min[0];
  const popToday = daily.precipitation_probability_max[0] || 0;
  let desc;
  if (code === 0) desc = `C'est dégagé aujourd'hui, avec des températures maximales de ${fmtTemp(hi)}.`;
  else if ([2,3].includes(code)) desc = `Nuageux toute la journée. Vent ${Math.round(cur.wind_speed_10m)} km/h.`;
  else if ([51,53,55,61,63,65,80,81].includes(code)) desc = `Pluie attendue aujourd'hui avec un risque de ${popToday}%.`;
  else if ([71,73,75,77,85,86].includes(code)) desc = `Chutes de neige attendues aujourd'hui.`;
  else if ([95,96,99].includes(code)) desc = `Orages prévus aujourd'hui. Restez prudent.`;
  else desc = `${info.label}. Maximales ${fmtTemp(hi)}, minimales ${fmtTemp(lo)}.`;
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
    const popVal = Math.max(0, Math.min(100, popRaw));
    // Le % de précipitations n'apparaît QUE quand il y a vraiment un risque de pluie/neige/orage
    // (codes WMO 51-99) ET que la probabilité est significative (>= 5%).
    const isPrecipCode = [51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(hourly.weather_code[idx]);
    const popVisible = isPrecipCode && popVal >= 5;
    // Étiquette d'heure : "Maintenant" puis "00", "01", … "12", "13", … "23"
    let timeLabel;
    if (i === 0) timeLabel = "Maintenant";
    else timeLabel = `${String(hourVal).padStart(2, '0')}`;
    h.innerHTML = `
      <div class="hour-time">${timeLabel}</div>
      <div class="hour-icon">${icon(wi.icon, 28)}</div>
      <div class="hour-pop${popVisible ? "" : " empty"}">${popVisible ? popVal + "%" : "—"}</div>
      <div class="hour-temp">${tempDisplay}</div>
    `;
    $hourly.appendChild(h);
  }

  // Daily (style Apple iOS : nom jour | icône+% | min | barre gradient | max)
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
    const startPct = ((lo - allMin) / range) * 100;
    const endPct = ((hi - allMin) / range) * 100;
    const wi = wmoInfo(daily.weather_code[i], false);
    // Probabilité précipitations journalière (depuis daily si dispo, sinon 0)
    const popDay = daily.precipitation_probability_max?.[i] || 0;
    // Affiche le % uniquement si le code WMO du jour est un code de précipitations
    const isPrecipCodeDay = [51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(daily.weather_code[i]);
    const popVisible = isPrecipCodeDay && popDay >= 5;
    di.innerHTML = `
      <div class="day-name">${dayName(daily.time[i], i)}</div>
      <div class="day-icon-wrap">
        <div class="day-icon">${icon(wi.icon, 26)}</div>
        <div class="day-pop${popVisible ? "" : " empty"}">${popVisible ? popDay + "%" : "—"}</div>
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

  // Mémorise la dernière donnée pour les modules détaillés et l'heure de MAJ
  lastWeather = w;
  lastRefreshMs = Date.now();
  if (state.detailHourly) renderHourlyDetail();
  if (state.airQuality) loadAirQuality();
  updateMetaTimers();
}

// ===== Détails horaires sur 24 h (4×6 grille) =====
function renderHourlyDetail() {
  if (!lastWeather) return;
  const { hourly, current } = lastWeather;
  const start = findCurrentHourIndex(hourly.time, current?.time);
  const cells = [];
  for (let i = start; i < start + 24 && i < hourly.time.length; i++) {
    const hour = getHourFromISO(hourly.time[i]);
    const isNight = hour < 6 || hour >= 21;
    const temp = fmtTemp(hourly.temperature_2m[i]);
    const feels = fmtTemp(hourly.apparent_temperature?.[i]);
    const wind = Math.round(hourly.wind_speed_10m?.[i] || 0);
    const pop = hourly.precipitation_probability?.[i] || 0;
    const isPrecip = [51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(hourly.weather_code[i]);
    const popStr = isPrecip ? `<span style="color:#4cc9ff;font-weight:500;">${pop}%</span>` : "—";
    cells.push(`
      <div class="hd-cell">
        <div class="hd-hour">${String(hour).padStart(2,'0')}</div>
        <div class="hd-row"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v10M12 14a3 3 0 100 6 3 3 0 000-6z"/></svg>${temp}</div>
        <div class="hd-row"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9 15c1 1 2 1 3 1s2 0 3-1"/></svg>Ress. ${feels}</div>
        <div class="hd-row"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h13a3 3 0 110 6H4M16 8l3-3M16 8h-5M16 8v5"/></svg>${wind} km/h</div>
        <div class="hd-row">${popStr}</div>
      </div>
    `);
  }
  $("hourlyDetail").innerHTML = cells.join("");
}

// ===== Qualité de l'air (Open-Meteo Air Quality API) =====
async function loadAirQuality() {
  const city = state.cities[state.activeIdx];
  if (!city) return;
  $("airQualityMeta").textContent = "Chargement…";
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${city.lat}&longitude=${city.lon}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone&hourly=us_aqi&forecast_days=1`;
    const res = await fetch(url);
    const a = await res.json();
    lastAirQuality = a;
    renderAirQuality();
  } catch (e) {
    console.warn("Air quality fetch failed", e);
    $("airQualityMeta").textContent = "Indisponible";
  }
}

function renderAirQuality() {
  if (!lastAirQuality || !lastAirQuality.current) return;
  const c = lastAirQuality.current;
  const aqi = Math.round(c.us_aqi || 0);
  $("aqAqi").textContent = aqi;
  const level = aqi <= 50 ? { label: "Bonne", advice: "Qualité de l'air satisfaisante", color: "#34C759" }
              : aqi <= 100 ? { label: "Modérée", advice: "Acceptable pour la plupart", color: "#FFD60A" }
              : aqi <= 150 ? { label: "Mauvaise", advice: "Personnes sensibles : limiter l'effort", color: "#FF9A3C" }
              : aqi <= 200 ? { label: "Très mauvaise", advice: "Limitez les activités extérieures", color: "#FF5E3A" }
              : aqi <= 300 ? { label: "Très mauvaise", advice: "Évitez les efforts prolongés", color: "#B14CFF" }
              :                { label: "Dangereuse", advice: "Restez à l'intérieur si possible", color: "#7E1BCC" };
  $("aqLevel").textContent = level.label;
  $("aqLevel").style.color = level.color;
  $("aqAdvice").textContent = level.advice;
  $("aqBar2").style.width = `${Math.min(100, aqi / 5)}%`;
  $("aqGrid").innerHTML = [
    { k: "PM2.5", v: (c.pm2_5 ?? 0).toFixed(1), u: "µg/m³" },
    { k: "PM10", v: (c.pm10 ?? 0).toFixed(1), u: "µg/m³" },
    { k: "O₃", v: (c.ozone ?? 0).toFixed(0), u: "µg/m³" },
    { k: "NO₂", v: (c.nitrogen_dioxide ?? 0).toFixed(0), u: "µg/m³" }
  ].map(x => `<div class="aq-item"><div class="aq-key">${x.k}</div><div class="aq-val">${x.v}</div><div class="aq-key">${x.u}</div></div>`).join("");
  const now = new Date();
  $("airQualityMeta").textContent = `Mis à jour à ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

// Met à jour l'indicateur "Mis à jour il y a X min" dans les sections
function updateMetaTimers() {
  const elapsed = Math.round((Date.now() - lastRefreshMs) / 60000);
  const label = elapsed < 1 ? "il y a quelques secondes" : `il y a ${elapsed} min`;
  const el = $("hourlyDetailMeta");
  if (el) el.textContent = `Mis à jour ${label}`;
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
      // Reverse-geocoding via Nominatim (OpenStreetMap) - gratuit, sans clé API
      let placeName = "Position actuelle";
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=fr&zoom=12`,
          { headers: { "Accept": "application/json" } }
        );
        const data = await res.json();
        if (data && data.address) {
          const a = data.address;
          // Priorité : ville > village > quartier > comté > pays
          placeName = a.city || a.town || a.village || a.municipality || a.suburb || a.county || a.state || a.country || "Position actuelle";
        }
      } catch (e) {
        console.warn("Reverse geocoding failed", e);
      }
      const city = { name: placeName, lat: latitude, lon: longitude };
      if (state.cities[0] && (state.cities[0].name === "Ma position" || state.cities[0].name === "Position actuelle" || state.cities[0].name === "Paris")) {
        state.cities[0] = city;
      } else {
        state.cities.unshift(city);
        state.activeIdx = 0;
      }
      saveState();
      renderTabs();
      await loadActive();
      toast(`Localisé à ${placeName}`);
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

// Actualisation automatique (1 h) toggle
let autoRefreshTimer = null;
$("autoRefreshToggle").onclick = () => {
  state.autoRefresh = !state.autoRefresh;
  $("autoRefreshToggle").classList.toggle("on", state.autoRefresh);
  saveState();
  if (state.autoRefresh) {
    autoRefreshTimer = setInterval(async () => {
      try {
        await loadActive();
        toast("Météo actualisée automatiquement");
      } catch (e) {
        console.warn("Auto-refresh failed", e);
      }
    }, 60 * 60 * 1000); // 1 heure
    toast("Actualisation automatique activée (1 h)");
  } else {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    toast("Actualisation automatique désactivée");
  }
};

// Détails horaires (24 h) toggle
$("detailHourlyToggle").onclick = () => {
  state.detailHourly = !state.detailHourly;
  $("detailHourlyToggle").classList.toggle("on", state.detailHourly);
  $("hourlyDetailSection").style.display = state.detailHourly ? "" : "none";
  saveState();
  if (state.detailHourly) {
    if (typeof renderHourlyDetail === "function") renderHourlyDetail();
    toast("Détails horaires activés");
  } else {
    toast("Détails horaires masqués");
  }
};

// Qualité de l'air toggle
$("airQualityToggle").onclick = async () => {
  state.airQuality = !state.airQuality;
  $("airQualityToggle").classList.toggle("on", state.airQuality);
  $("airQualitySection").style.display = state.airQuality ? "" : "none";
  saveState();
  if (state.airQuality) {
    await loadAirQuality();
    toast("Qualité de l'air activée");
  } else {
    toast("Qualité de l'air masquée");
  }
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
  $("autoRefreshToggle").classList.toggle("on", state.autoRefresh);
  $("detailHourlyToggle").classList.toggle("on", state.detailHourly);
  $("airQualityToggle").classList.toggle("on", state.airQuality);
  $("hourlyDetailSection").style.display = state.detailHourly ? "" : "none";
  $("airQualitySection").style.display = state.airQuality ? "" : "none";
  // Si l'auto-refresh était activé, relance le timer
  if (state.autoRefresh) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(async () => {
      try { await loadActive(); toast("Météo actualisée automatiquement"); } catch (e) {}
    }, 60 * 60 * 1000);
  }
}

(async function init() {
  const ok = loadState();
  if (!ok) {
    state.cities = [{ name: "Paris", lat: 48.8566, lon: 2.3522 }];
    state.activeIdx = 0;
  }
  syncUnitToggle();
  renderTabs();
  await loadActive();
  if (!state.geoTried) {
    state.geoTried = true;
    tryGeolocate();
  }
  // Lance le timer de mise à jour du "Mis à jour il y a X min"
  setInterval(updateMetaTimers, 30 * 1000);
})();