// ============================================================
//  Météo - Application météo style Apple Weather
//  Géolocalisation auto + IP fallback + descriptions stables
// ============================================================

// ============= WMO CODES + ICONS (SVG inline) =============
const WMO = {
  0:  { label: "Ciel dégagé", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="5"/><g stroke-linecap="round"><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></g></svg>` },
  1:  { label: "Plutôt ensoleillé", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="4"/><g stroke-linecap="round"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"/></g></svg>` },
  2:  { label: "Partiellement nuageux", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="9" r="3"/><path d="M9 2v1M3 9h1M14 5l-1 1M4 4l1 1"/><path d="M7 16a4 4 0 0 1 4-4 5 5 0 0 1 9.6 1.5A4 4 0 1 1 21 19H8a4 4 0 0 1-1-7.9" stroke-linejoin="round"/></svg>` },
  3:  { label: "Ciel couvert", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M7 18a5 5 0 0 1-1-9.9 6 6 0 0 1 11.7 1.5A4.5 4.5 0 1 1 18 18H7z"/></svg>` },
  45: { label: "Brouillard", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 9h16M4 13h16M4 17h12M7 5h10"/></svg>` },
  48: { label: "Brouillard givrant", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 9h16M4 13h16M4 17h12M7 5h10M12 3v1M12 19v1"/></svg>` },
  51: { label: "Bruine", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 14a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 18H7a4 4 0 0 1 0-4"/><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2"/></svg>` },
  53: { label: "Bruine", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 14a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 18H7a4 4 0 0 1 0-4"/><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"/></svg>` },
  55: { label: "Bruine dense", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 14a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 18H7a4 4 0 0 1 0-4"/><path d="M8 19l-1 2M11 19l-1 2M14 19l-1 2M17 19l-1 2"/></svg>` },
  61: { label: "Pluie faible", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17H7a4 4 0 0 1 0-4"/><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"/></svg>` },
  63: { label: "Pluie", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17H7a4 4 0 0 1 0-4"/><path d="M8 19l-1 2M11 19l-1 2M14 19l-1 2M17 19l-1 2"/></svg>` },
  65: { label: "Fortes pluies", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17H7a4 4 0 0 1 0-4"/><path d="M7 19l-1 2M10 19l-1 2M13 19l-1 2M16 19l-1 2"/></svg>` },
  71: { label: "Neige faible", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17H7a4 4 0 0 1 0-4"/><g stroke-linecap="round"><path d="M9 19v3M12 19v3M7 21h10"/></g></svg>` },
  73: { label: "Neige", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17H7a4 4 0 0 1 0-4"/><g stroke-linecap="round"><path d="M8 20l.5.5M11 20l.5.5M14 20l.5.5M9 22l.5-.5M12 22l.5-.5"/></g></svg>` },
  75: { label: "Fortes chutes de neige", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17H7a4 4 0 0 1 0-4"/><g stroke-linecap="round"><path d="M7 19l1 1M10 19l1 1M13 19l1 1M16 19l1 1M8 21l1-1M11 21l1-1M14 21l1-1"/></g></svg>` },
  80: { label: "Averses", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17H7a4 4 0 0 1 0-4"/><path d="M8 19l-1 2M11 19l-1 2M14 19l-1 2"/></svg>` },
  81: { label: "Averses", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17H7a4 4 0 0 1 0-4"/><path d="M8 19l-1 2M11 19l-1 2M14 19l-1 2M17 19l-1 2"/></svg>` },
  82: { label: "Violentes averses", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17H7a4 4 0 0 1 0-4"/><path d="M7 19l-1 2M10 19l-1 2M13 19l-1 2M16 19l-1 2"/></svg>` },
  85: { label: "Averses de neige", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17H7a4 4 0 0 1 0-4"/><g stroke-linecap="round"><path d="M8 19v3M12 19v3M16 19v3"/></g></svg>` },
  86: { label: "Averses de neige", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17H7a4 4 0 0 1 0-4"/><g stroke-linecap="round"><path d="M8 19v3M11 19v3M14 19v3"/></g></svg>` },
  95: { label: "Orages", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17h-2"/><path d="M13 17l-2 4h3l-2 4"/></svg>` },
  96: { label: "Orages avec pluie", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17h-2"/><path d="M13 17l-2 4h3l-2 4"/><path d="M8 19l-1 2M11 19l-1 2"/></svg>` },
  99: { label: "Orages violents", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6 1.4A4 4 0 1 1 16 17h-2"/><path d="M13 17l-2 4h3l-2 4"/><path d="M7 19l-1 2M10 19l-1 2M13 19l-1 2"/></svg>` }
};

// ============= STATE =============
const state = {
  city: null,
  unit: "C",
  lastWeather: null,
  lastRefreshMs: 0,
  favorites: [],
  requestId: 0,
  currentFetchController: null
};

const $ = (id) => document.getElementById(id);
const LS_KEY = "meteo_v6";
const FETCH_TIMEOUT_MS = 8000;
const CACHE_KEY_PREFIX = "meteo_cache_";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// ============= HELPERS =============
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

function fmtTemp(c) {
  if (c == null || isNaN(c)) return "—";
  return state.unit === "F" ? `${Math.round(c * 9 / 5 + 32)}°` : `${Math.round(c)}°`;
}

function setText(id, v) {
  const e = $(id);
  if (e) e.textContent = v;
}

function setHTML(id, v) {
  const e = $(id);
  if (e) e.innerHTML = v;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      city: state.city,
      unit: state.unit,
      favorites: state.favorites
    }));
  } catch (e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    if (!obj) return false;
    state.city = obj.city || null;
    state.unit = obj.unit || "C";
    state.favorites = Array.isArray(obj.favorites) ? obj.favorites : [];
    return !!(state.city && state.city.lat != null && state.city.lon != null);
  } catch (e) {
    return false;
  }
}

// ============= CACHE OFFLINE =============
function saveToCache(lat, lon, data) {
  try {
    const key = `${CACHE_KEY_PREFIX}${lat.toFixed(2)}_${lon.toFixed(2)}`;
    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
  } catch (e) {}
}

function loadFromCache(lat, lon) {
  try {
    const key = `${CACHE_KEY_PREFIX}${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.timestamp || !obj.data) return null;
    const ageMs = Date.now() - obj.timestamp;
    if (ageMs > CACHE_TTL_MS) return null;
    return { data: obj.data, ageMin: Math.round(ageMs / 60000) };
  } catch (e) {
    return null;
  }
}

// ============= FETCH WITH RETRIES =============
async function fetchWithRetry(url, options = {}, retries = 3) {
  const delays = [500, 1500, 4000];
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchWithTimeout(url, options);
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < retries - 1) {
      const jitter = Math.random() * 500;
      await new Promise((r) => setTimeout(r, delays[i] + jitter));
    }
  }
  throw lastErr || new Error("fetch failed");
}

// ============= OPEN-METEO FETCH + TRANSFORM =============
async function callOpenMeteo(lat, lon) {
  const params = [
    "current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,visibility",
    "hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,relative_humidity_2m,surface_pressure,dew_point_2m,visibility,is_day",
    "daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant",
    `timezone=auto`,
    `forecast_days=10`,
    `past_hours=2`
  ].join("&");

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&${params}`;
  const res = await fetchWithRetry(url);
  return await res.json();
}

function openMeteoToInternal(json) {
  const cur = json.current || {};
  const h = json.hourly || {};
  const d = json.daily || {};

  const nowMs = Date.now();
  let startIdx = 0;
  if (Array.isArray(h.time) && h.time.length) {
    for (let i = 0; i < h.time.length; i++) {
      const t = new Date(h.time[i]).getTime();
      if (isNaN(t)) continue;
      if (t <= nowMs - 30 * 60 * 1000) startIdx = i;
      else break;
    }
  }

  const hourly = {
    time: h.time || [],
    temperature_2m: h.temperature_2m || [],
    apparent_temperature: h.apparent_temperature || [],
    precipitation_probability: h.precipitation_probability || [],
    precipitation: h.precipitation || [],
    weather_code: h.weather_code || [],
    is_day: h.is_day || [],
    wind_speed_10m: h.wind_speed_10m || [],
    wind_gusts_10m: h.wind_gusts_10m || [],
    cloud_cover: h.cloud_cover || [],
    relative_humidity_2m: h.relative_humidity_2m || [],
    dew_point_2m: h.dew_point_2m || [],
    visibility: h.visibility || [],
    surface_pressure: h.surface_pressure || []
  };

  const daily = {
    time: d.time || [],
    weather_code: d.weather_code || [],
    temperature_2m_max: d.temperature_2m_max || [],
    temperature_2m_min: d.temperature_2m_min || [],
    sunrise: d.sunrise || [],
    sunset: d.sunset || [],
    daylight_duration: d.daylight_duration || [],
    uv_index_max: d.uv_index_max || [],
    precipitation_sum: d.precipitation_sum || [],
    precipitation_hours: d.precipitation_hours || [],
    precipitation_probability_max: d.precipitation_probability_max || [],
    wind_speed_10m_max: d.wind_speed_10m_max || [],
    wind_gusts_10m_max: d.wind_gusts_10m_max || [],
    wind_direction_10m_dominant: d.wind_direction_10m_dominant || []
  };

  const current = {
    time: cur.time || new Date().toISOString(),
    temperature_2m: cur.temperature_2m,
    apparent_temperature: cur.apparent_temperature,
    relative_humidity_2m: cur.relative_humidity_2m,
    dew_point_2m: h.dew_point_2m ? h.dew_point_2m[startIdx] : null,
    pressure_msl: cur.pressure_msl,
    surface_pressure: cur.surface_pressure,
    wind_speed_10m: cur.wind_speed_10m,
    wind_direction_10m: cur.wind_direction_10m,
    wind_gusts_10m: cur.wind_gusts_10m,
    weather_code: cur.weather_code,
    is_day: cur.is_day,
    precipitation: cur.precipitation,
    rain: cur.rain,
    showers: cur.showers,
    snowfall: cur.snowfall,
    cloud_cover: cur.cloud_cover,
    visibility: cur.visibility != null ? cur.visibility : (h.visibility ? h.visibility[startIdx] : null)
  };

  return { current, hourly, daily };
}

// ============= AQI FETCH (Open-Meteo Air Quality) =============
async function fetchAirQuality(lat, lon) {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=pm10,pm2_5,ozone&timezone=auto`;
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) return null;
    const json = await res.json();
    const c = json.current || {};
    return {
      pm10: c.pm10,
      pm2_5: c.pm2_5,
      ozone: c.ozone
    };
  } catch (e) {
    return null;
  }
}

function computeAQI(aq) {
  if (!aq) return null;
  // AQI simplifié : prend le plus défavorable entre PM2.5, PM10, O3
  let worst = 0;
  // PM2.5 (µg/m³) : 0-12 excellent, 12-35 bon, 35-55 moyen, 55-75 médiocre
  if (aq.pm2_5 != null) {
    const v = aq.pm2_5;
    if (v < 12) worst = Math.max(worst, v * 2); // 0-25
    else if (v < 35) worst = Math.max(worst, 25 + (v - 12)); // 25-50
    else if (v < 55) worst = Math.max(worst, 50 + (v - 35) * 1.25); // 50-75
    else if (v < 150) worst = Math.max(worst, 75 + (v - 55) * 0.5);
    else worst = Math.max(worst, 150);
  }
  if (aq.pm10 != null) {
    const v = aq.pm10;
    if (v < 50) worst = Math.max(worst, v * 0.5);
    else if (v < 100) worst = Math.max(worst, 25 + (v - 50) * 0.5);
    else if (v < 250) worst = Math.max(worst, 50 + (v - 100) * 0.33);
    else worst = Math.max(worst, 150);
  }
  return Math.round(Math.min(worst, 200));
}

function aqiLabel(aqi) {
  if (aqi == null) return { label: "—", color: "#8e8e93", width: "0%" };
  if (aqi <= 25) return { label: "Excellent", color: "#34c759", width: `${(aqi / 200) * 100}%` };
  if (aqi <= 50) return { label: "Bon", color: "#a8e063", width: `${(aqi / 200) * 100}%` };
  if (aqi <= 75) return { label: "Moyen", color: "#ffd60a", width: `${(aqi / 200) * 100}%` };
  if (aqi <= 100) return { label: "Médiocre", color: "#ff9500", width: `${(aqi / 200) * 100}%` };
  if (aqi <= 150) return { label: "Mauvais", color: "#ff3b30", width: `${(aqi / 200) * 100}%` };
  return { label: "Très mauvais", color: "#af52de", width: "100%" };
}

// ============= FETCH WEATHER (main entry) =============
async function fetchWeather(lat, lon) {
  try {
    const json = await callOpenMeteo(lat, lon);
    const data = openMeteoToInternal(json);
    saveToCache(lat, lon, data);
    return { data, source: "Open-Meteo" };
  } catch (e) {
    console.warn("[Meteo] Open-Meteo failed:", e.message || e);
    const cached = loadFromCache(lat, lon);
    if (cached) {
      console.warn(`[Meteo] Fallback cache (${cached.ageMin} min)`);
      cached.data._fromCache = true;
      cached.data._cacheAgeMin = cached.ageMin;
      return { data: cached.data, source: "cache" };
    }
    throw e;
  }
}

// ============= HELPERS: weather state =============
function getCurrentCondition(c) {
  return (WMO[c.weather_code] || { label: "Conditions variables" }).label;
}

function getWeatherIcon(code, size = 28) {
  const wmo = WMO[code];
  if (!wmo) return "";
  return `<div class="weather-icon" style="width:${size}px;height:${size}px;">${wmo.icon}</div>`;
}

function isDaytime(c) {
  if (c.is_day === 0 || c.is_day === false) return false;
  if (c.is_day === 1 || c.is_day === true) return true;
  // fallback: heure locale
  const h = new Date().getHours();
  return h >= 6 && h < 20;
}

function getHourLabel(timeStr) {
  const d = new Date(timeStr);
  const h = d.getHours();
  if (h === 0) return "Minuit";
  if (h === 12) return "Midi";
  return `${h}h`;
}

function getDayName(dateStr, offset = 0) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + offset);
  const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 86400000;
  const diff = Math.round((d - today) / dayMs);
  if (diff === 0) return "Auj.";
  if (diff === 1) return "Demain";
  return days[d.getDay()];
}

function getDateLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function getTimeLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function windDirLabel(deg) {
  if (deg == null || isNaN(deg)) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round(deg / 45) % 8];
}

function uvLabel(uv) {
  if (uv == null || isNaN(uv)) return "—";
  if (uv < 3) return "Faible";
  if (uv < 6) return "Modéré";
  if (uv < 8) return "Élevé";
  if (uv < 11) return "Très élevé";
  return "Extrême";
}

// ============= RENDER: city =============
function renderCity(data) {
  const c = data.current;
  const d = data.daily;
  const h = data.hourly;

  // Ville
  setText("cityName", state.city.name);
  document.body.dataset.city = state.city.name;

  // Température
  setText("temp", fmtTemp(c.temperature_2m));
  setText("condition", getCurrentCondition(c));

  // Hilo (J+0)
  if (d.temperature_2m_max && d.temperature_2m_min) {
    setText("hilo", `H:${fmtTemp(d.temperature_2m_max[0])}  L:${fmtTemp(d.temperature_2m_min[0])}`);
  }

  // Description enrichie
  renderDescription(c, d, h);

  // Hourly 24h
  renderHourly(h);

  // Daily 10 jours
  renderDaily(d, h);

  // Détails
  renderDetails(c, d, h);

  // AQI (async, ne bloque pas)
  renderAQIAsync();

  // Radar (async, ne bloque pas)
  renderRadarOverlay(c);

  // Source badge
  renderSourceBadge();

  // Updated at
  setText("updatedAt", `Mis à jour il y a ${getRelativeTime(state.lastRefreshMs)}`);
}

function getRelativeTime(ms) {
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return `${m} min`;
}

// ============= RENDER: description enrichie =============
function renderDescription(c, d, h) {
  const parts = [];
  parts.push(getCurrentCondition(c));

  // UV
  if (d.uv_index_max && d.uv_index_max[0] != null) {
    const uv = d.uv_index_max[0];
    if (uv >= 8) parts.push("crème solaire recommandée");
    else if (uv >= 6) parts.push("protection solaire conseillée");
  }

  // Pression tendance
  if (h.surface_pressure && h.surface_pressure.length >= 4) {
    const recent = h.surface_pressure.slice(-4);
    const delta = recent[recent.length - 1] - recent[0];
    if (delta < -3) parts.push("pression en baisse, possible dégradation");
    else if (delta > 3) parts.push("pression en hausse, temps stable");
  }

  // Feels-like
  if (c.apparent_temperature != null && c.temperature_2m != null) {
    const diff = c.apparent_temperature - c.temperature_2m;
    if (Math.abs(diff) >= 5) {
      if (diff < 0) parts.push("vent frais");
      else parts.push("ressenti plus chaud");
    }
  }

  setText("descText", parts.join(" · "));
}

// ============= RENDER: hourly 24h =============
function renderHourly(h) {
  const el = $("hourly");
  if (!el) return;
  if (!h.time || !h.time.length) {
    el.innerHTML = "<p style='opacity:0.5;text-align:center;padding:20px'>Données horaires indisponibles</p>";
    return;
  }

  const nowMs = Date.now();
  const startIdx = h.time.findIndex((t) => new Date(t).getTime() >= nowMs - 30 * 60 * 1000);
  const fromIdx = Math.max(0, startIdx);
  const toIdx = Math.min(h.time.length, fromIdx + 24);

  const cells = [];
  for (let i = fromIdx; i < toIdx; i++) {
    const t = h.time[i];
    const temp = h.temperature_2m ? h.temperature_2m[i] : null;
    const code = h.weather_code ? h.weather_code[i] : null;
    const pop = h.precipitation_probability ? h.precipitation_probability[i] : null;
    const isDay = h.is_day ? h.is_day[i] : 1;

    const popDisplay = pop != null && pop >= 5 ? `<span class="hour-pop">${Math.round(pop / 5) * 5}%</span>` : "";

    cells.push(`
      <div class="hour-cell">
        <div class="hour-time">${getHourLabel(t)}</div>
        <div class="hour-icon">${getWeatherIcon(code, 22)}</div>
        <div class="hour-temp">${fmtTemp(temp)}</div>
        ${popDisplay}
      </div>
    `);
  }
  el.innerHTML = `<div class="hour-row">${cells.join("")}</div>`;
}

// ============= RENDER: daily 10 jours =============
function renderDaily(d, h) {
  const el = $("daily");
  if (!el) return;
  if (!d.time || !d.time.length) {
    el.innerHTML = "<p style='opacity:0.5;text-align:center;padding:20px'>Données 10 jours indisponibles</p>";
    return;
  }

  const rows = [];
  for (let i = 0; i < Math.min(d.time.length, 10); i++) {
    const code = d.weather_code ? d.weather_code[i] : null;
    const tmax = d.temperature_2m_max ? d.temperature_2m_max[i] : null;
    const tmin = d.temperature_2m_min ? d.temperature_2m_min[i] : null;
    const pop = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;

    const popRounded = pop != null ? Math.round(pop / 5) * 5 : 0;
    const popDisplay = pop != null && pop >= 5 ? `${popRounded}%` : "";
    const popClass = pop != null && pop >= 5 ? "" : "empty";

    rows.push(`
      <div class="day" data-day-idx="${i}">
        <div class="day-name">${getDayName(d.time[i])}</div>
        <div class="day-icon-wrap">
          <div class="day-icon">${getWeatherIcon(code, 24)}</div>
          <div class="day-pop ${popClass}">${popDisplay}</div>
        </div>
        <div class="day-low">${fmtTemp(tmin)}</div>
        <div class="day-high">${fmtTemp(tmax)}</div>
      </div>
    `);
  }
  el.innerHTML = rows.join("");
  // Click handler
  el.querySelectorAll(".day").forEach((row) => {
    row.addEventListener("click", () => {
      const idx = parseInt(row.dataset.dayIdx, 10);
      if (!isNaN(idx)) openDayDetail(idx);
    });
  });
}

// ============= RENDER: details =============
function renderDetails(c, d, h) {
  // UV
  if (d.uv_index_max && d.uv_index_max[0] != null) {
    const uv = d.uv_index_max[0];
    setText("uv", Math.round(uv));
    setText("uvSub", uvLabel(uv));
    const bar = $("uvBar");
    if (bar) bar.style.width = `${Math.min(100, (uv / 11) * 100)}%`;
  }

  // Sunrise / sunset
  if (d.sunrise && d.sunrise[0]) setText("sunrise", getTimeLabel(d.sunrise[0]));
  if (d.sunset && d.sunset[0]) setText("sunset", getTimeLabel(d.sunset[0]));

  // Vent
  if (c.wind_speed_10m != null) {
    setText("windSpeed", Math.round(c.wind_speed_10m));
    setText("windDir", windDirLabel(c.wind_direction_10m));
  }
  if (c.wind_gusts_10m != null && c.wind_gusts_10m > c.wind_speed_10m + 5) {
    setText("windGusts", Math.round(c.wind_gusts_10m));
    $("gustsRow") && $("gustsRow").classList.remove("hidden");
  } else {
    $("gustsRow") && $("gustsRow").classList.add("hidden");
  }

  // Précipitations
  if (c.precipitation != null) {
    setText("precip", `${(c.precipitation || 0).toFixed(1)} mm`);
    setText("precipNow", c.precipitation > 0 ? "Pluie en cours" : "Pas de pluie");
    setText("precipSub", c.precipitation > 0 ? "Couvrez-vous" : "Temps sec");
  }

  // Humidité + point de rosée + couverture nuageuse
  if (c.relative_humidity_2m != null) setText("humidity", `${Math.round(c.relative_humidity_2m)}%`);
  if (c.dew_point_2m != null) setText("dewPoint", `Rosée ${fmtTemp(c.dew_point_2m)}`);
  if (c.cloud_cover != null) setText("cloudCover", `Nuages ${Math.round(c.cloud_cover)}%`);

  // Ressenti
  setText("feels", fmtTemp(c.apparent_temperature));
  if (c.apparent_temperature != null && c.temperature_2m != null) {
    const diff = c.apparent_temperature - c.temperature_2m;
    if (Math.abs(diff) < 0.5) setText("feelsSub", "Identique");
    else if (diff < 0) setText("feelsSub", `Plus frais de ${Math.round(-diff)}°`);
    else setText("feelsSub", `Plus chaud de ${Math.round(diff)}°`);
  }

  // Visibilité
  if (c.visibility != null) {
    if (c.visibility >= 1000) setText("vis", `${(c.visibility / 1000).toFixed(1)} km`);
    else setText("vis", `${Math.round(c.visibility)} m`);
  }

  // Pression + tendance
  if (c.pressure_msl != null) {
    setText("pressure", `${Math.round(c.pressure_msl)} hPa`);
    if (h.surface_pressure && h.surface_pressure.length >= 4) {
      const recent = h.surface_pressure.slice(-4);
      const delta = recent[recent.length - 1] - recent[0];
      const arrow = $("pressureTrendArrow");
      if (arrow) {
        if (delta < -1) {
          arrow.textContent = "↓";
          arrow.style.color = "#ff9500";
        } else if (delta > 1) {
          arrow.textContent = "↑";
          arrow.style.color = "#34c759";
        } else {
          arrow.textContent = "→";
          arrow.style.color = "#8e8e93";
        }
      }
      setText("pressureSub", `${delta > 0 ? "+" : ""}${delta.toFixed(1)} hPa / 3h`);
    }
  }
}

// ============= RENDER: AQI =============
async function renderAQIAsync() {
  if (!state.city) return;
  const aq = await fetchAirQuality(state.city.lat, state.city.lon);
  if (!aq) {
    setText("aqi", "—");
    setText("aqiSub", "Indisponible");
    return;
  }
  const aqi = computeAQI(aq);
  const info = aqiLabel(aqi);
  setText("aqi", Math.round(aqi));
  setText("aqiSub", info.label);
  const bar = $("aqiBar");
  if (bar) {
    bar.style.width = info.width;
    bar.style.background = info.color;
  }
}

// ============= RENDER: radar overlay =============
async function renderRadarOverlay(c) {
  if (!window.RadarModule || !state.city) return;
  try {
    const result = await window.RadarModule.sampleRadarAt(state.city.lat, state.city.lon);
    if (result && result.precipMm > 0.1) {
      // Override le code WMO si pluie détectée par radar
      const radarCode = window.RadarModule.radarIntensityToWmo(result.precipMm);
      // On ne change PAS le weather_code actuel (déjà rendu), mais on
      // peut afficher un bandeau pluie
      showRainBanner(`Pluie détectée · ${result.precipMm.toFixed(1)} mm/h`);
    } else {
      hideRainBanner();
    }
  } catch (e) {
    // silencieux
  }
}

function showRainBanner(text) {
  const b = $("rainBanner");
  if (b) {
    b.textContent = text;
    b.classList.add("visible");
  }
}
function hideRainBanner() {
  const b = $("rainBanner");
  if (b) b.classList.remove("visible");
}

// ============= RENDER: source badge =============
function renderSourceBadge() {
  const el = $("sourceBadge");
  if (!el) return;
  el.textContent = `Source : Open-Meteo · ${getRelativeTime(state.lastRefreshMs)}`;
}

// ============= DAY DETAIL PANEL =============
function openDayDetail(idx) {
  if (!state.lastWeather) return;
  const d = state.lastWeather.daily;
  const h = state.lastWeather.hourly;
  if (!d.time || !d.time[idx]) return;

  setText("dayDetailName", getDayName(d.time[idx]));
  setText("dayDetailDate", getDateLabel(d.time[idx]));
  $("dayDetailIcon").innerHTML = getWeatherIcon(d.weather_code[idx], 56);
  setText("dayDetailLow", fmtTemp(d.temperature_2m_min[idx]));
  setText("dayDetailHigh", fmtTemp(d.temperature_2m_max[idx]));
  setText("dayDetailCondition", getCurrentCondition({ weather_code: d.weather_code[idx] }));

  // Pluie
  const precip = d.precipitation_sum ? d.precipitation_sum[idx] : null;
  const pop = d.precipitation_probability_max ? d.precipitation_probability_max[idx] : null;
  setText("dayDetailRain", precip != null ? `${precip.toFixed(1)} mm` : "—");
  setText("dayDetailRainSub", pop != null ? `${Math.round(pop / 5) * 5}% prob.` : "—");

  // Vent
  const windMax = d.wind_speed_10m_max ? d.wind_speed_10m_max[idx] : null;
  const gustMax = d.wind_gusts_10m_max ? d.wind_gusts_10m_max[idx] : null;
  setText("dayDetailWind", windMax != null ? `${Math.round(windMax)} km/h` : "—");
  setText("dayDetailWindSub", gustMax != null ? `Rafales ${Math.round(gustMax)}` : "—");

  // UV
  const uv = d.uv_index_max ? d.uv_index_max[idx] : null;
  setText("dayDetailUv", uv != null ? Math.round(uv) : "—");
  setText("dayDetailUvSub", uv != null ? uvLabel(uv) : "—");

  // Soleil
  setText("dayDetailSun", d.sunrise[idx] ? `${getTimeLabel(d.sunrise[idx])} / ${getTimeLabel(d.sunset[idx])}` : "—");

  // Hourly breakdown
  const dayStart = new Date(d.time[idx]).getTime();
  const dayEnd = dayStart + 86400000;
  const cells = [];
  for (let i = 0; i < h.time.length; i++) {
    const t = new Date(h.time[i]).getTime();
    if (t < dayStart || t >= dayEnd) continue;
    const hourPop = h.precipitation_probability ? h.precipitation_probability[i] : null;
    const popBadge = hourPop != null && hourPop >= 5 ? `<span class="hour-pop">${Math.round(hourPop / 5) * 5}%</span>` : "";
    cells.push(`
      <div class="hour-cell">
        <div class="hour-time">${getHourLabel(h.time[i])}</div>
        <div class="hour-icon">${getWeatherIcon(h.weather_code[i], 22)}</div>
        <div class="hour-temp">${fmtTemp(h.temperature_2m[i])}</div>
        ${popBadge}
      </div>
    `);
  }
  $("dayDetailHourly").innerHTML = `<div class="hour-row">${cells.join("")}</div>`;

  $("dayDetailPanel").classList.add("open");
}

function closeDayDetail() {
  $("dayDetailPanel").classList.remove("open");
}

// ============= SEARCH =============
let searchDebounce = null;
function setupSearch() {
  const input = $("searchInput");
  const overlay = $("searchOverlay");
  const cancel = $("cancelSearch");
  const btn = $("searchBtn");
  const results = $("searchResults");

  function openSearch() {
    overlay.classList.add("open");
    setTimeout(() => input.focus(), 100);
  }
  function closeSearch() {
    overlay.classList.remove("open");
    input.value = "";
    results.innerHTML = "";
  }

  btn && btn.addEventListener("click", openSearch);
  cancel && cancel.addEventListener("click", closeSearch);

  input && input.addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    const q = e.target.value.trim();
    if (q.length < 2) {
      results.innerHTML = "";
      return;
    }
    searchDebounce = setTimeout(() => doSearch(q), 300);
  });
}

async function doSearch(query) {
  const results = $("searchResults");
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=fr&format=json`;
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) {
      results.innerHTML = "<p style='opacity:0.5;text-align:center;padding:20px'>Aucun résultat</p>";
      return;
    }
    const json = await res.json();
    const arr = json.results || [];
    if (!arr.length) {
      results.innerHTML = "<p style='opacity:0.5;text-align:center;padding:20px'>Aucun résultat</p>";
      return;
    }
    results.innerHTML = arr.map((r) => {
      const isFav = state.favorites.some((f) => f.name === r.name && Math.abs(f.lat - r.lat) < 0.01);
      const region = r.admin1 || r.country || "";
      return `
        <div class="search-result" data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${escapeHtml(r.name)}" data-region="${escapeHtml(region)}">
          <div class="sr-info">
            <div class="sr-name">${escapeHtml(r.name)}</div>
            <div class="sr-region">${escapeHtml(region)}</div>
          </div>
          <button class="fav-star ${isFav ? "active" : ""}" aria-label="Ajouter aux favoris">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
        </div>
      `;
    }).join("");

    results.querySelectorAll(".search-result").forEach((row) => {
      const info = row.querySelector(".sr-info");
      info.addEventListener("click", () => {
        const lat = parseFloat(row.dataset.lat);
        const lon = parseFloat(row.dataset.lon);
        const name = row.dataset.name;
        state.city = { name, lat, lon };
        saveState();
        closeSearch();
        loadWeather();
      });
      const star = row.querySelector(".fav-star");
      star.addEventListener("click", (e) => {
        e.stopPropagation();
        const lat = parseFloat(row.dataset.lat);
        const lon = parseFloat(row.dataset.lon);
        const name = row.dataset.name;
        const region = row.dataset.region;
        toggleFavorite({ name, lat, lon, region });
        star.classList.toggle("active");
        renderFavorites();
      });
    });
  } catch (e) {
    results.innerHTML = "<p style='opacity:0.5;text-align:center;padding:20px'>Erreur de recherche</p>";
  }
}

function toggleFavorite(city) {
  const idx = state.favorites.findIndex((f) => f.name === city.name && Math.abs(f.lat - city.lat) < 0.01);
  if (idx >= 0) state.favorites.splice(idx, 1);
  else state.favorites.push(city);
  saveState();
}

function renderFavorites() {
  const el = $("favoritesList");
  if (!el) return;
  if (!state.favorites.length) {
    el.innerHTML = "<p style='opacity: 0.6; font-size: 13px; text-align: center; padding: 20px 0;'>Aucune ville favorite. Recherchez une ville et appuyez sur l'étoile pour l'ajouter.</p>";
    return;
  }
  el.innerHTML = state.favorites.map((f) => `
    <div class="fav-item">
      <div class="fav-item-info">
        <div class="fav-item-name">${escapeHtml(f.name)}</div>
        <div class="fav-item-region">${escapeHtml(f.region || "")}</div>
      </div>
      <button class="fav-item-remove" data-lat="${f.lat}" data-lon="${f.lon}" data-name="${escapeHtml(f.name)}">×</button>
    </div>
  `).join("");
  el.querySelectorAll(".fav-item").forEach((row) => {
    row.querySelector(".fav-item-info").addEventListener("click", () => {
      state.city = {
        name: row.dataset.name,
        lat: parseFloat(row.dataset.lat),
        lon: parseFloat(row.dataset.lon)
      };
      saveState();
      closeSettings();
      loadWeather();
    });
    row.querySelector(".fav-item-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite({
        name: row.dataset.name,
        lat: parseFloat(row.dataset.lat),
        lon: parseFloat(row.dataset.lon)
      });
      renderFavorites();
    });
  });
}

// ============= SETTINGS =============
function setupSettings() {
  const panel = $("settingsPanel");
  const btn = $("settingsBtn");
  const close = $("closeSettings");
  const refresh = $("refreshBtn");
  const unitToggle = $("unitToggle");

  btn && btn.addEventListener("click", () => panel.classList.add("open"));
  close && close.addEventListener("click", () => panel.classList.remove("open"));
  panel && panel.addEventListener("click", (e) => {
    if (e.target === panel) panel.classList.remove("open");
  });

  refresh && refresh.addEventListener("click", () => {
    panel.classList.remove("open");
    loadWeather(true);
  });

  // Unit toggle
  if (unitToggle) {
    unitToggle.querySelectorAll(".seg").forEach((b) => {
      b.addEventListener("click", () => {
        unitToggle.querySelectorAll(".seg").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        state.unit = b.dataset.unit;
        saveState();
        // Re-render avec la nouvelle unité
        if (state.lastWeather) renderCity(state.lastWeather);
      });
    });
  }

  // Day detail close
  const dayClose = $("dayDetailClose");
  dayClose && dayClose.addEventListener("click", closeDayDetail);
  const dayPanel = $("dayDetailPanel");
  dayPanel && dayPanel.addEventListener("click", (e) => {
    if (e.target === dayPanel) closeDayDetail();
  });
}

function closeSettings() {
  $("settingsPanel").classList.remove("open");
}

// ============= DONATE MODAL =============
function setupDonate() {
  const overlay = $("donateOverlay");
  if (!overlay) return;
  const emailBox = $("donateEmailBox");
  if (emailBox) {
    const a = $("donateEmail");
    if (a) a.href = "mailto:guegan_tom@icloud.com";
  }
  const noShow = $("donateNoShow");
  const later = $("donateLaterBtn");
  const ok = $("donateBtn");
  const close = () => overlay.classList.remove("visible");

  later && later.addEventListener("click", () => {
    if (noShow && noShow.checked) localStorage.setItem("meteo_donate_dismissed", "1");
    close();
  });
  ok && ok.addEventListener("click", () => {
    if (noShow && noShow.checked) localStorage.setItem("meteo_donate_dismissed", "1");
    close();
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // Show after delay
  if (localStorage.getItem("meteo_donate_dismissed") === "1") return;
  setTimeout(() => overlay.classList.add("visible"), 3000);
  setTimeout(() => {
    if (!overlay.classList.contains("visible") && localStorage.getItem("meteo_donate_dismissed") !== "1") {
      overlay.classList.add("visible");
    }
  }, 3500);
}

// ============= AUTO-REFRESH =============
async function tickLive() {
  if (!state.city || !state.lastWeather) return;
  try {
    const { data } = await fetchWeather(state.city.lat, state.city.lon);
    state.lastWeather = data;
    state.lastRefreshMs = Date.now();
    renderCity(data);
  } catch (e) {
    console.warn("[Refresh] failed:", e.message || e);
  }
}

// ============= LOAD WEATHER (main entry) =============
async function loadWeather(showSkeleton = false) {
  if (!state.city) return;
  if (showSkeleton) {
    setText("cityName", "Chargement…");
  }
  try {
    const { data, source } = await fetchWeather(state.city.lat, state.city.lon);
    state.lastWeather = data;
    state.lastRefreshMs = Date.now();
    renderCity(data);
  } catch (e) {
    console.warn("loadWeather failed:", e.message || e);
    setText("cityName", state.city.name || "Erreur");
  }
}

// ============= GEOLOCATION =============
let geoWatchId = null;
let lastGeoLat = null;
let lastGeoLon = null;
let lastGeoUpdate = 0;

function startAutomaticGeolocation() {
  if (geoWatchId !== null || !navigator.geolocation) return;
  geoWatchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const now = Date.now();
      if (lastGeoLat !== null) {
        const dLat = (latitude - lastGeoLat) * 111320;
        const dLon = (longitude - lastGeoLon) * 111320 * Math.cos(latitude * Math.PI / 180);
        const dist = Math.hypot(dLat, dLon);
        if (dist < 500 && now - lastGeoUpdate < 120000) return;
      }
      lastGeoLat = latitude;
      lastGeoLon = longitude;
      lastGeoUpdate = now;
      try {
        const r = await fetchWithTimeout(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=10&addressdetails=1`,
          { headers: { Accept: "application/json" } }
        );
        if (!r.ok) return;
        const d = await r.json();
        const a = d.address || {};
        const city = a.city || a.town || a.village || a.municipality || a.county;
        if (city && (!state.city || state.city.name !== city)) {
          state.city = { name: city, lat: latitude, lon: longitude };
          saveState();
          loadWeather();
        }
      } catch (e) {
        console.warn("Reverse geocoding failed:", e.message || e);
      }
    },
    (err) => {
      console.warn("Geolocation unavailable:", err.message || err);
    },
    { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 }
  );
}

// ============= INIT =============
(async function init() {
  const hasState = loadState();
  document.body.classList.add("loading");

  // Unit toggle UI
  document.querySelectorAll("#unitToggle .seg").forEach((b) => {
    b.classList.toggle("active", b.dataset.unit === state.unit);
  });

  if (hasState) {
    await loadWeather();
  } else {
    // Première visite : Paris d'abord, IP/GPS en arrière-plan
    state.city = { name: "Paris", lat: 48.8566, lon: 2.3522 };
    saveState();
    await loadWeather();

    if (window.GeoIpModule) {
      window.GeoIpModule.tryIpGeolocation().then((ipLoc) => {
        if (ipLoc && state.city && state.city.name === "Paris") {
          console.log("[Init] Upgrade IP:", ipLoc.city);
          state.city = { name: ipLoc.city, lat: ipLoc.lat, lon: ipLoc.lon };
          saveState();
          loadWeather();
        }
      }).catch(() => {});
    }
  }

  document.body.classList.remove("loading");

  // Setup UI
  setupSearch();
  setupSettings();
  setupDonate();
  renderFavorites();

  // GPS en arrière-plan
  setTimeout(() => {
    try { startAutomaticGeolocation(); } catch (e) { console.warn(e); }
  }, 2500);

  // Auto-refresh 60s
  setInterval(tickLive, 60 * 1000);

  // Radar check every 5 min
  setInterval(async () => {
    if (!state.lastWeather || !window.RadarModule || !state.city) return;
    const c = state.lastWeather.current;
    await renderRadarOverlay(c);
  }, 5 * 60 * 1000);
})();
