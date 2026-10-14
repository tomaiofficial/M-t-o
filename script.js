// ============================================================
//  Météo - Application météo style Apple Weather
//  Géolocalisation auto + IP fallback + descriptions stables
// ============================================================

// ============= SEASONAL BIAS (ajustement long-terme) =============
// Bias en °C (negatif = plus frais), applique au-dela de J+7 daily
// et au-dela de 48h hourly, selon le mois du JOUR CIBLE.
const SEASONAL_BIAS_BY_MONTH = {
  1: -5, 2: -5, 3: -4, 4: -3, 5: -2, 6: -1,
  7:  0, 8:  0, 9: -2, 10: -3, 11: -4, 12: -5
};
const SEASONAL_BIAS_DAILY_MIN_DAYS = 7;
const SEASONAL_BIAS_HOURLY_MIN_HOURS = 48;

function getSeasonalBias(forecastDate) {
  if (!forecastDate) return 0;
  const d = forecastDate instanceof Date ? forecastDate : new Date(forecastDate);
  if (isNaN(d.getTime())) return 0;
  return SEASONAL_BIAS_BY_MONTH[d.getMonth() + 1] || 0;
}

function applySeasonalBiasToTempArray(temps, times, minUnits, isHours) {
  if (!Array.isArray(temps) || !Array.isArray(times) || temps.length !== times.length) return temps;
  const now = Date.now();
  const result = temps.slice();
  for (let i = 0; i < result.length; i++) {
    const t = new Date(times[i]);
    if (isNaN(t.getTime())) continue;
    const offsetUnits = isHours
      ? (t.getTime() - now) / 3600000
      : (t.getTime() - now) / 86400000;
    if (offsetUnits < minUnits) continue;
    result[i] = +(result[i] + getSeasonalBias(t)).toFixed(1);
  }
  return result;
}

function applySeasonalBiasToDaily(daily) {
  if (!daily || !daily.time || !daily.time.length) return daily;
  const out = { ...daily };
  if (daily.temperature_2m_max) {
    out.temperature_2m_max = applySeasonalBiasToTempArray(
      daily.temperature_2m_max, daily.time, SEASONAL_BIAS_DAILY_MIN_DAYS, false);
  }
  if (daily.temperature_2m_min) {
    out.temperature_2m_min = applySeasonalBiasToTempArray(
      daily.temperature_2m_min, daily.time, SEASONAL_BIAS_DAILY_MIN_DAYS, false);
  }
  return out;
}

function applySeasonalBiasToHourly(hourly) {
  if (!hourly || !hourly.time || !hourly.time.length) return hourly;
  const out = { ...hourly };
  if (hourly.temperature_2m) {
    out.temperature_2m = applySeasonalBiasToTempArray(
      hourly.temperature_2m, hourly.time, SEASONAL_BIAS_HOURLY_MIN_HOURS, true);
  }
  if (hourly.apparent_temperature) {
    out.apparent_temperature = applySeasonalBiasToTempArray(
      hourly.apparent_temperature, hourly.time, SEASONAL_BIAS_HOURLY_MIN_HOURS, true);
  }
  return out;
}

// ============= FIRE RISK (FWI simplifie) =============
// Calcul LOCAL du risque incendie meteo (different des incendies en cours).
// Echelle 0-30. Seuils : <5 cache, 5-15 modere (jaune), 15-30 eleve (orange), >30 extreme (rouge).
// Anti-faux-positif : cache si precip >= 3mm/h ou POP >= 60%.
function computeFireRisk(temp, humidity, wind, precipMm, pop) {
  if (precipMm != null && precipMm >= 3) return 0;
  if (pop != null && pop >= 60) return 0;
  if (temp == null || humidity == null) return 0;
  // Formule simplifiee basee sur FWI (Forest Weather Index)
  // Plus c'est chaud + sec + venteux = plus c'est dangereux
  const dryness = Math.max(0, 100 - humidity);
  const heatFactor = Math.max(0, temp - 10) / 30 * 10;  // 0-10
  const dryFactor = dryness / 100 * 10;                  // 0-10
  const windFactor = (wind || 0) / 50 * 10;              // 0-10
  return Math.min(30, Math.round(heatFactor + dryFactor + windFactor));
}

function fireRiskClass(score) {
  if (score < 5) return { class: "fire-hidden", emoji: "" };
  if (score < 15) return { class: "moderate", emoji: "🔥" };
  if (score < 30) return { class: "high", emoji: "🔥" };
  return { class: "extreme", emoji: "🔥" };
}

// ============= ARRIERE-PLAN DYNAMIQUE (particules canvas) =============
// Pluie / neige / etoiles scintillantes selon les conditions meteo.
// Restaure le systeme d'origine : canvas #bgCanvas au-dessus du gradient CSS.
let particles = [];
let particleType = "none";
let particleRAF = null;

function resizeCanvas() {
  const bgCanvas = $("bgCanvas");
  if (!bgCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  bgCanvas.width = window.innerWidth * dpr;
  bgCanvas.height = window.innerHeight * dpr;
  bgCanvas.style.width = window.innerWidth + "px";
  bgCanvas.style.height = window.innerHeight + "px";
  const ctx = bgCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initParticles(type) {
  particles = [];
  particleType = type;
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (type === "rain") {
    const count = Math.min(250, Math.floor(w / 4));
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        len: 12 + Math.random() * 18,
        speed: 10 + Math.random() * 10,
        opacity: 0.2 + Math.random() * 0.4,
        windX: -1.5
      });
    }
  } else if (type === "snow") {
    const count = Math.min(180, Math.floor(w / 5));
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1 + Math.random() * 3,
        speed: 0.4 + Math.random() * 1.2,
        drift: (Math.random() - 0.5) * 1.5,
        opacity: 0.4 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2
      });
    }
  } else if (type === "stars") {
    const count = Math.min(120, Math.floor(w / 6));
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.65,
        r: 0.5 + Math.random() * 1.5,
        twinkle: Math.random() * Math.PI * 2,
        speed: 0.015 + Math.random() * 0.025,
        baseAlpha: 0.3 + Math.random() * 0.5
      });
    }
  }
}

function animateParticles() {
  const bgCanvas = $("bgCanvas");
  if (!bgCanvas) return;
  const ctx = bgCanvas.getContext("2d");
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);

  if (particleType === "rain") {
    ctx.lineWidth = 1.2;
    for (const p of particles) {
      ctx.strokeStyle = `rgba(180,210,240,${p.opacity})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.windX * 2, p.y + p.len);
      ctx.stroke();
      p.y += p.speed;
      p.x += p.windX;
      if (p.y > h) { p.y = -p.len; p.x = Math.random() * w; }
      if (p.x < -20) p.x = w + 20;
    }
  } else if (particleType === "snow") {
    for (const p of particles) {
      ctx.fillStyle = `rgba(255,255,255,${p.opacity})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.y += p.speed;
      p.phase += 0.02;
      p.x += Math.sin(p.phase) * p.drift;
      if (p.y > h) { p.y = -p.r; p.x = Math.random() * w; }
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
    }
  } else if (particleType === "stars") {
    for (const p of particles) {
      p.twinkle += p.speed;
      const alpha = p.baseAlpha + Math.sin(p.twinkle) * 0.3;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0.1, alpha)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (p.r > 1.2) {
        ctx.fillStyle = `rgba(200,210,240,${Math.max(0.05, alpha * 0.3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  particleRAF = requestAnimationFrame(animateParticles);
}

function setParticleType(type) {
  if (type === particleType) return;
  if (particleRAF) { cancelAnimationFrame(particleRAF); particleRAF = null; }
  const bgCanvas = $("bgCanvas");
  if (bgCanvas) {
    const ctx = bgCanvas.getContext("2d");
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
  if (type === "none") { particles = []; particleType = "none"; return; }
  initParticles(type);
  animateParticles();
}

// Choisit les particules selon le code meteo + jour/nuit
function updateBackgroundParticles(code, isNight) {
  if ([95, 96, 99].includes(code)) {
    setParticleType("rain"); // Orage = pluie forte
  } else if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    setParticleType("rain");
  } else if ([71, 73, 75, 77, 85, 86].includes(code)) {
    setParticleType("snow");
  } else if (isNight && [0, 1, 2].includes(code)) {
    setParticleType("stars");
  } else {
    setParticleType("none");
  }
}

// ============= WMO CODES + ICONS (SVG inline) =============
const WMO = {
  0:  { label: "Ciel dégagé",            icon: "apple-clear-day",         night: "apple-clear-night" },
  1:  { label: "Plutôt ensoleillé",      icon: "apple-clear-day",         night: "apple-clear-night" },
  2:  { label: "Partiellement nuageux",  icon: "apple-partly-cloudy-day", night: "apple-partly-cloudy-night" },
  3:  { label: "Ciel couvert",           icon: "apple-cloudy",            night: "apple-cloudy" },
  45: { label: "Brouillard",             icon: "apple-fog",               night: "apple-fog" },
  48: { label: "Brouillard givrant",     icon: "apple-fog",               night: "apple-fog" },
  51: { label: "Bruine",                 icon: "apple-drizzle",           night: "apple-drizzle" },
  53: { label: "Bruine",                 icon: "apple-drizzle",           night: "apple-drizzle" },
  55: { label: "Bruine dense",           icon: "apple-drizzle",           night: "apple-drizzle" },
  56: { label: "Bruine verglaçante",     icon: "apple-icy",               night: "apple-icy" },
  57: { label: "Bruine verglaçante",     icon: "apple-icy",               night: "apple-icy" },
  61: { label: "Pluie faible",           icon: "apple-rain",              night: "apple-rain" },
  63: { label: "Pluie",                  icon: "apple-rain",              night: "apple-rain" },
  65: { label: "Fortes pluies",          icon: "apple-heavy-rain",        night: "apple-heavy-rain" },
  66: { label: "Pluie verglaçante",      icon: "apple-icy",               night: "apple-icy" },
  67: { label: "Verglas",                icon: "apple-icy",               night: "apple-icy" },
  71: { label: "Neige faible",           icon: "apple-snow",              night: "apple-snow" },
  73: { label: "Neige",                  icon: "apple-snow",              night: "apple-snow" },
  75: { label: "Fortes chutes de neige", icon: "apple-snow",              night: "apple-snow" },
  77: { label: "Grains de neige",        icon: "apple-snow",              night: "apple-snow" },
  80: { label: "Averses",                icon: "apple-rain",              night: "apple-rain" },
  81: { label: "Averses",                icon: "apple-rain",              night: "apple-rain" },
  82: { label: "Violentes averses",      icon: "apple-heavy-rain",        night: "apple-heavy-rain" },
  85: { label: "Averses de neige",       icon: "apple-snow",              night: "apple-snow" },
  86: { label: "Averses de neige",       icon: "apple-snow",              night: "apple-snow" },
  95: { label: "Orages",                 icon: "apple-thunder",           night: "apple-thunder" },
  96: { label: "Orages avec pluie",      icon: "apple-thunder",           night: "apple-thunder" },
  99: { label: "Orages violents",        icon: "apple-thunder",           night: "apple-thunder" }
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
// 12s : 8s etait trop court sur connexion lente / reveil de l'appareil
// -> "signal is aborted without reason" au premier chargement
const FETCH_TIMEOUT_MS = 12000;
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

  // "Maintenant" vu depuis le fuseau de la VILLE (timezone=auto).
  // Les heures ISO d'Open-Meteo ("2026-10-12T08:00") sont en heure locale
  // de la ville et sont parsees par JS comme heure locale de l'appareil.
  // Pour comparer correctement il faut donc le "maintenant" en heure de
  // la ville, sinon decalage quand la ville est dans un autre fuseau.
  const utcOffsetSec = typeof json.utc_offset_seconds === "number" ? json.utc_offset_seconds : null;
  const nowMs = utcOffsetSec != null
    ? Date.now() + utcOffsetSec * 1000 + new Date().getTimezoneOffset() * 60000
    : Date.now();
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
    utcOffsetSeconds: utcOffsetSec,
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

  // SEASONAL BIAS : ajustement long-terme (J+7+ daily, 48h+ hourly)
  const dailyBiased = applySeasonalBiasToDaily(daily);
  const hourlyBiased = applySeasonalBiasToHourly(hourly);

  return { current, hourly: hourlyBiased, daily: dailyBiased };
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
    // Fallback 1 : Met.no (API norvegienne officielle, gratuite, CORS OK)
    // -> l'app continue de marcher meme si Open-Meteo est en panne (503)
    try {
      const data = await callMetNo(lat, lon);
      saveToCache(lat, lon, data);
      return { data, source: "Met.no" };
    } catch (e2) {
      console.warn("[Meteo] Met.no failed:", e2.message || e2);
    }
    // Fallback 2 : cache local
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

// ============= MET.NO (fallback quand Open-Meteo est en panne) =============
const metNoCache = new Map();
const MET_NO_CACHE_TTL_MS = 10 * 60 * 1000;

async function callMetNo(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const now = Date.now();
  if (metNoCache.has(key)) {
    const cached = metNoCache.get(key);
    if (now - cached.ts < MET_NO_CACHE_TTL_MS) return cached.data;
  }
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}&altitude=0`;
  const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } }, 2);
  if (!res.ok) throw new Error(`Met.no HTTP ${res.status}`);
  const json = await res.json();
  const data = metNoToInternal(json);
  metNoCache.set(key, { ts: now, data });
  return data;
}

// Codes Met.no -> codes WMO (compatibles avec le reste de l'app)
function metNoToWmo(symbolCode) {
  const base = String(symbolCode || "").replace(/_(day|night|polartwilight)$/, "");
  const m = {
    clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
    lightrain: 61, rain: 63, heavyrain: 65,
    lightsleet: 67, sleet: 67, heavysleet: 67,
    lightsnow: 71, snow: 73, heavysnow: 75,
    lightrainandthunder: 95, rainandthunder: 95, heavyrainandthunder: 96,
    lightsnowandthunder: 95, snowandthunder: 95, heavysnowandthunder: 96,
    lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
    lightsleetshowers: 67, sleetshowers: 67, heavysleetshowers: 67,
    lightsnowshowers: 85, snowshowers: 86, heavysnowshowers: 86
  };
  return m[base] != null ? m[base] : 3;
}

// Convertit la reponse Met.no vers le format interne { current, hourly, daily }
// Les heures Met.no sont en ISO UTC ("...Z") -> parsees en absolu par JS,
// donc pas besoin d'utcOffsetSeconds (comparaisons directes avec Date.now()).
function metNoToInternal(json) {
  const series = json && json.properties && json.properties.timeseries;
  if (!series || !series.length) throw new Error("Met.no: timeseries vide");
  const latest = series[0];
  const cur = latest.data.instant.details || {};
  const next1h = latest.data.next_1_hours;
  const next6h = latest.data.next_6_hours;

  const symbolCode = (next1h && next1h.summary && next1h.summary.symbol_code) ||
                     (next6h && next6h.summary && next6h.summary.symbol_code) ||
                     "clearsky";
  const isDay = cur.shortwave_radiation != null ? cur.shortwave_radiation > 0 : !String(symbolCode).endsWith("_night");

  const current = {
    time: latest.time,
    temperature_2m: cur.air_temperature,
    apparent_temperature: cur.air_temperature,
    relative_humidity_2m: cur.relative_humidity,
    dew_point_2m: cur.dew_point_temperature,
    pressure_msl: cur.air_pressure_at_sea_level,
    surface_pressure: cur.air_pressure_at_sea_level,
    wind_speed_10m: cur.wind_speed,
    wind_direction_10m: cur.wind_from_direction,
    wind_gusts_10m: cur.wind_speed_of_gust || cur.wind_speed,
    weather_code: metNoToWmo(symbolCode),
    is_day: isDay ? 1 : 0,
    precipitation: (next1h && next1h.details && next1h.details.precipitation_amount) || 0,
    rain: (next1h && next1h.details && next1h.details.precipitation_amount) || 0,
    snowfall: 0,
    showers: 0,
    cloud_cover: cur.cloud_area_fraction != null ? cur.cloud_area_fraction : 50,
    visibility: 10
  };

  // ---- HOURLY (24h) ----
  const hOut = {
    time: [], temperature_2m: [], apparent_temperature: [], weather_code: [],
    precipitation_probability: [], precipitation: [], wind_speed_10m: [],
    wind_gusts_10m: [], cloud_cover: [], relative_humidity_2m: [],
    wind_direction_10m: [], dew_point_2m: [], visibility: []
  };
  for (const entry of series.slice(0, 24)) {
    if (!entry.data.instant || !entry.data.instant.details) continue;
    const det = entry.data.instant.details;
    const n1 = entry.data.next_1_hours;
    const sym = (n1 && n1.summary && n1.summary.symbol_code) || "clearsky";
    const precipMm = (n1 && n1.details && n1.details.precipitation_amount) || 0;
    hOut.time.push(entry.time);
    hOut.temperature_2m.push(det.air_temperature);
    hOut.apparent_temperature.push(det.air_temperature);
    hOut.weather_code.push(metNoToWmo(sym));
    hOut.precipitation_probability.push(Math.min(100, Math.round(precipMm * 25)));
    hOut.precipitation.push(precipMm);
    hOut.wind_speed_10m.push(det.wind_speed);
    hOut.wind_gusts_10m.push(det.wind_speed_of_gust || det.wind_speed);
    hOut.cloud_cover.push(det.cloud_area_fraction != null ? det.cloud_area_fraction : 50);
    hOut.relative_humidity_2m.push(det.relative_humidity);
    hOut.wind_direction_10m.push(det.wind_from_direction);
    hOut.dew_point_2m.push(det.dew_point_temperature);
    hOut.visibility.push(10);
  }

  // ---- DAILY (agrege depuis les series horaires, ~9-10 jours) ----
  const dayMap = new Map();
  for (const entry of series) {
    if (!entry.data.instant || !entry.data.instant.details) continue;
    const dateKey = entry.time.split("T")[0];
    const det = entry.data.instant.details;
    const n1 = entry.data.next_1_hours;
    const sym = (n1 && n1.summary && n1.summary.symbol_code) || "clearsky";
    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, { temps: [], syms: [], precip: 0, windMax: 0, gustMax: 0 });
    }
    const b = dayMap.get(dateKey);
    if (det.air_temperature != null) b.temps.push(det.air_temperature);
    b.syms.push(sym);
    const p = (n1 && n1.details && n1.details.precipitation_amount) || 0;
    b.precip += p;
    if (det.wind_speed != null) b.windMax = Math.max(b.windMax, det.wind_speed);
    if (det.wind_speed_of_gust != null) b.gustMax = Math.max(b.gustMax, det.wind_speed_of_gust);
  }
  const dOut = {
    time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [],
    sunrise: [], sunset: [], daylight_duration: [], uv_index_max: [],
    precipitation_sum: [], precipitation_hours: [], precipitation_probability_max: [],
    wind_speed_10m_max: [], wind_gusts_10m_max: [], wind_direction_10m_dominant: []
  };
  for (const [dateKey, b] of Array.from(dayMap.entries()).slice(0, 10)) {
    if (!b.temps.length) continue;
    const symCounts = {};
    b.syms.forEach((s) => { symCounts[s] = (symCounts[s] || 0) + 1; });
    const dominant = Object.entries(symCounts).sort((a, c) => c[1] - a[1])[0][0];
    dOut.time.push(dateKey);
    dOut.weather_code.push(metNoToWmo(dominant));
    dOut.temperature_2m_max.push(Math.max(...b.temps));
    dOut.temperature_2m_min.push(Math.min(...b.temps));
    // Pas de sunrise/sunset chez Met.no -> valeurs generiques
    // (isHourDay les utilise en string HH:MM, suffisant pour jour/nuit)
    dOut.sunrise.push(`${dateKey}T07:00`);
    dOut.sunset.push(`${dateKey}T20:00`);
    dOut.daylight_duration.push(13 * 3600);
    dOut.uv_index_max.push(0);
    dOut.precipitation_sum.push(Math.round(b.precip * 10) / 10);
    dOut.precipitation_hours.push(0);
    dOut.precipitation_probability_max.push(Math.min(100, Math.round(b.precip * 20)));
    dOut.wind_speed_10m_max.push(b.windMax);
    dOut.wind_gusts_10m_max.push(b.gustMax);
    dOut.wind_direction_10m_dominant.push(0);
  }

  return { current, hourly: hOut, daily: dOut };
}

// ============= HELPERS: weather state =============
function getCurrentCondition(c) {
  return (WMO[c.weather_code] || { label: "Conditions variables" }).label;
}

function wmoInfo(code, isNight) {
  const c = WMO[code] || { label: "—", icon: "apple-cloudy" };
  return { label: c.label, icon: isNight && c.night ? c.night : c.icon };
}

// Icone Apple haute qualite : reference le sprite SVG dans index.html
function getWeatherIcon(code, size = 28, isNight = false) {
  const info = wmoInfo(code, isNight);
  return `<svg class="wicon" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><use href="#${info.icon}"/></svg>`;
}

// Jour/nuit timezone-safe pour une heure ISO ("2026-10-12T14:00")
// Compare en STRING avec les sunrise/sunset du bon jour -> synchronise
// avec la meteo affichee en haut (soleil la jour, lune la nuit)
function isHourDay(isoTime, daily) {
  if (!isoTime || typeof isoTime !== "string") return true;
  if (!daily || !daily.sunrise || !daily.sunset || daily.sunrise.length === 0) {
    const m = isoTime.match(/T(\d{2})/);
    const h = m ? parseInt(m[1], 10) : 12;
    return h >= 6 && h < 21;
  }
  const dateMatch = isoTime.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!dateMatch) {
    const h = parseInt((isoTime.match(/T(\d{2})/) || [])[1], 10);
    return h >= 6 && h < 21;
  }
  const dateStr = dateMatch[1];
  const hm = dateMatch[2];
  let dayIndex = -1;
  for (let i = 0; i < daily.sunrise.length; i++) {
    const sDate = daily.sunrise[i] ? daily.sunrise[i].substring(0, 10) : null;
    if (sDate === dateStr) { dayIndex = i; break; }
  }
  if (dayIndex < 0) dayIndex = daily.sunrise.length - 1;
  const sunriseHm = (daily.sunrise[dayIndex] || "").substring(11, 16);
  const sunsetHm = (daily.sunset[dayIndex] || "").substring(11, 16);
  if (!sunriseHm || !sunsetHm) {
    const h = parseInt(hm.split(":")[0], 10);
    return h >= 6 && h < 21;
  }
  return hm >= sunriseHm && hm < sunsetHm;
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
  return `${h}h`;
}

// Theme : determine le theme CSS en fonction du temps actuel
// Themes : day-clear, partly-cloudy, cloudy, rain, storm, snow, fog, sunset, windy, night-clear, night-cloudy
function getWeatherTheme(c) {
  const day = isDaytime(c);
  const code = c.weather_code;
  // Pluie / bruine
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  // Orages
  if ([95, 96, 99].includes(code)) return "storm";
  // Neige
  if ([71, 73, 75, 85, 86].includes(code)) return "snow";
  // Brouillard
  if ([45, 48].includes(code)) return "fog";
  // Couvert
  if (code === 3) return day ? "cloudy" : "night-cloudy";
  // Partiellement nuageux
  if (code === 2) return "partly-cloudy";
  // Ciel degage / peu nuageux
  if (code === 0 || code === 1) {
    if (!day) return "night-clear";
    // Lever/coucher de soleil ?
    const hr = new Date().getHours();
    if ((hr >= 18 && hr <= 21) || (hr >= 5 && hr <= 7)) return "sunset";
    return "day-clear";
  }
  // Defaut
  return day ? "day-clear" : "night-clear";
}

function setTheme(c, d) {
  const theme = getWeatherTheme(c);
  // Retire toutes les classes theme-*
  document.body.className = document.body.className
    .replace(/\btheme-[a-z-]+/g, "")
    .trim();
  document.body.classList.add(`theme-${theme}`);

  // Temp-based theme (hot / cold)
  if (c.temperature_2m != null) {
    document.body.classList.remove("theme-hot", "theme-cold");
    if (c.temperature_2m >= 30) document.body.classList.add("theme-hot");
    else if (c.temperature_2m <= 5) document.body.classList.add("theme-cold");
  }

  // Particules canvas (pluie / neige / etoiles) selon conditions
  updateBackgroundParticles(c.weather_code, !isDaytime(c));
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

  // Theme switching (atmospheric effects via CSS)
  setTheme(c, d);

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
  renderHourly(h, d, c);

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

  // Banners meteo severe (vigilance, thunder)
  renderBanners(c);
}

function renderBanners(c) {
  const vigilance = $("vigilanceBanner");
  const thunder = $("thunderBanner");
  const rain = $("rainBanner");
  if (!vigilance || !thunder || !rain) return;

  // Reset
  vigilance.classList.remove("visible");
  thunder.classList.remove("visible");
  rain.classList.remove("visible");

  // Vigilance (extreme chaud/froid)
  if (c.temperature_2m != null) {
    if (c.temperature_2m >= 35) {
      vigilance.textContent = "🔥 Canicule — Restez hydraté";
      vigilance.classList.add("visible");
    } else if (c.temperature_2m <= -5) {
      vigilance.textContent = "🥶 Grand froid — Couvrez-vous";
      vigilance.classList.add("visible");
    }
  }

  // Orage
  if ([95, 96, 99].includes(c.weather_code)) {
    thunder.textContent = "⚡ Orage en cours";
    thunder.classList.add("visible");
  }

  // Pluie forte (precipitation > 2mm/h)
  if (c.precipitation != null && c.precipitation >= 2) {
    rain.textContent = `🌧️ Pluie — ${c.precipitation.toFixed(1)} mm/h`;
    rain.classList.add("visible");
  }
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
function renderHourly(h, d, c) {
  const el = $("hourly");
  if (!el) return;
  if (!h.time || !h.time.length) {
    el.innerHTML = "<p style='opacity:0.5;text-align:center;padding:20px'>Données horaires indisponibles</p>";
    return;
  }

  // "Maintenant" dans le fuseau de la ville (les heures ISO sont en heure
  // locale de la ville, parsees comme heure locale de l'appareil)
  const nowMs = h.utcOffsetSeconds != null
    ? Date.now() + h.utcOffsetSeconds * 1000 + new Date().getTimezoneOffset() * 60000
    : Date.now();
  // Positionne "Maint" EXACTEMENT sur l'heure courante : le creneau [H:00, H+1:00)
  // qui contient maintenant. L'ancien code (buffer 30 min) faisait sauter
  // "Maint" sur l'heure SUIVANTE passe 30 min -> decalage d'une heure.
  const startIdx = h.time.findIndex((t) => {
    const ms = new Date(t).getTime();
    return !isNaN(ms) && ms + 3600000 > nowMs;
  });
  const fromIdx = Math.max(0, startIdx);
  const toIdx = Math.min(h.time.length, fromIdx + 24);

  const cells = [];
  for (let i = fromIdx; i < toIdx; i++) {
    const t = h.time[i];
    const isNow = i === fromIdx;
    // Premiere cellule ("Maint") = temperature et icone ACTUELLES,
    // synchronisees avec la meteo affichee en haut (sinon 14 vs 13)
    let temp = h.temperature_2m ? h.temperature_2m[i] : null;
    let code = h.weather_code ? h.weather_code[i] : null;
    if (isNow && c) {
      if (c.temperature_2m != null) temp = c.temperature_2m;
      if (c.weather_code != null) code = c.weather_code;
    }
    const pop = h.precipitation_probability ? h.precipitation_probability[i] : null;
    // Jour/nuit synchronise avec sunrise/sunset -> meme icone que la meteo en haut
    const isNight = isNow && c ? !isDaytime(c) : !isHourDay(t, d);
    // Premiere cellule = heure courante -> "Maint"
    const timeLabel = isNow ? "Maint" : getHourLabel(t);

    const popRounded = pop != null ? Math.round(pop / 5) * 5 : 0;
    const popVisible = pop != null && pop >= 5;
    const popClass = popVisible ? (popRounded >= 60 ? "heavy" : popRounded >= 30 ? "medium" : "") : "empty";

    // Structure attendue par le CSS : .hour enfant direct de #hourly (flex horizontal)
    cells.push(`
      <div class="hour">
        <div class="hour-time">${timeLabel}</div>
        <div class="hour-icon">${getWeatherIcon(code, 22, isNight)}</div>
        <div class="hour-pop ${popClass}">${popVisible ? `${popRounded}%` : "0%"}</div>
        <div class="hour-temp">${fmtTemp(temp)}</div>
      </div>
    `);
  }
  el.innerHTML = cells.join("");
}

// ============= RENDER: daily 10 jours =============
function renderDaily(d, h) {
  const el = $("daily");
  if (!el) return;
  if (!d.time || !d.time.length) {
    el.innerHTML = "<p style='opacity:0.5;text-align:center;padding:20px'>Données 10 jours indisponibles</p>";
    return;
  }

  // Bornes globales pour la barre de temperature (style Apple Weather)
  let weekMin = Infinity, weekMax = -Infinity;
  for (let i = 0; i < Math.min(d.time.length, 10); i++) {
    if (d.temperature_2m_min && d.temperature_2m_min[i] != null) weekMin = Math.min(weekMin, d.temperature_2m_min[i]);
    if (d.temperature_2m_max && d.temperature_2m_max[i] != null) weekMax = Math.max(weekMax, d.temperature_2m_max[i]);
  }
  const weekRange = Math.max(1, weekMax - weekMin);

  const rows = [];
  for (let i = 0; i < Math.min(d.time.length, 10); i++) {
    const code = d.weather_code ? d.weather_code[i] : null;
    const tmax = d.temperature_2m_max ? d.temperature_2m_max[i] : null;
    const tmin = d.temperature_2m_min ? d.temperature_2m_min[i] : null;
    const pop = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;

    const popRounded = pop != null ? Math.round(pop / 5) * 5 : 0;
    const popDisplay = pop != null && pop >= 5 ? `${popRounded}%` : "";
    const popClass = pop != null && pop >= 5 ? "" : "empty";

    // Barre de plage de temperature : position + largeur en % de la semaine
    let barHtml = `<div class="day-bar"><div class="fill" style="left:0%;width:100%"></div></div>`;
    if (tmin != null && tmax != null && isFinite(weekMin)) {
      const left = ((tmin - weekMin) / weekRange) * 100;
      const width = Math.max(4, ((tmax - tmin) / weekRange) * 100);
      barHtml = `<div class="day-bar"><div class="fill" style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></div></div>`;
    }

    rows.push(`
      <div class="day" data-day-idx="${i}">
        <div class="day-name">${getDayName(d.time[i])}</div>
        <div class="day-icon-wrap">
          <div class="day-icon">${getWeatherIcon(code, 24, false)}</div>
          <div class="day-pop ${popClass}">${popDisplay}</div>
        </div>
        <div class="day-low">${fmtTemp(tmin)}</div>
        ${barHtml}
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

// ============= DEMO MODE (test sans geoloc) =============
function checkDemoMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1") {
    state.city = { name: "Paris (démo)", lat: 48.8566, lon: 2.3522 };
    state.demoMode = true;
    const badge = $("demoBadge");
    if (badge) {
      badge.textContent = "🧪 MODE DÉMO";
      badge.classList.add("visible");
    }
  }
}

// Update le compteur "Mis à jour il y a X" toutes les secondes
setInterval(() => {
  if (!state.lastRefreshMs) return;
  setText("updatedAt", `Mis à jour il y a ${getRelativeTime(state.lastRefreshMs)}`);
  renderSourceBadge();
}, 1000);

// ============= DAY DETAIL PANEL =============
function openDayDetail(idx) {
  if (!state.lastWeather) return;
  const d = state.lastWeather.daily;
  const h = state.lastWeather.hourly;
  if (!d.time || !d.time[idx]) return;

  setText("dayDetailName", getDayName(d.time[idx]));
  setText("dayDetailDate", getDateLabel(d.time[idx]));
  $("dayDetailIcon").innerHTML = getWeatherIcon(d.weather_code[idx], 56, false);
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
  if (d.sunrise[idx]) setText("dayDetailSun", getTimeLabel(d.sunrise[idx]));
  if (d.sunset[idx]) setText("dayDetailSunSub", getTimeLabel(d.sunset[idx]));

  // Hourly breakdown (24h du jour)
  // ATTENTION : d.time[idx] = "2026-10-12" (date seule) -> parse en minuit UTC
  // par JS, alors que les heures hourly sont en heure locale -> decalage 2h
  // (la journee commencait a 02h et finissait a 01h le lendemain).
  // On force le parsing en minuit LOCAL avec "T00:00".
  const dayStart = new Date(d.time[idx] + "T00:00").getTime();
  const dayEnd = dayStart + 86400000;
  const cells = [];
  for (let i = 0; i < h.time.length; i++) {
    const t = new Date(h.time[i]).getTime();
    if (t < dayStart || t >= dayEnd) continue;
    const hourPop = h.precipitation_probability ? h.precipitation_probability[i] : null;
    const hourTemp = h.temperature_2m ? h.temperature_2m[i] : null;
    const hourCode = h.weather_code ? h.weather_code[i] : null;
    const popRounded = hourPop != null ? Math.round(hourPop / 5) * 5 : 0;
    const popVisible = hourPop != null && hourPop >= 5;
    // Structure attendue par le CSS : .day-detail-hour-row (grid vertical)
    cells.push(`
      <div class="day-detail-hour-row">
        <span class="ddh-time">${getHourLabel(h.time[i])}</span>
        <span class="ddh-icon">${getWeatherIcon(hourCode, 20, !isHourDay(h.time[i], d))}</span>
        <span class="ddh-temp">${fmtTemp(hourTemp)}</span>
        <span class="ddh-pop ${popVisible ? "" : "empty"}">${popVisible ? `${popRounded}%` : "0%"}</span>
      </div>
    `);
  }
  $("dayDetailHourly").innerHTML = cells.join("");

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

  // Touche Entree : selectionne le premier resultat directement
  input && input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // Si des resultats sont deja la, cliquer le premier
    let first = results.querySelector(".search-result .sr-info");
    if (!first) {
      // Sinon lancer la recherche immediatement (sans attendre le debounce)
      const q = input.value.trim();
      if (q.length < 2) return;
      clearTimeout(searchDebounce);
      await doSearch(q);
      first = results.querySelector(".search-result .sr-info");
    }
    if (first) first.click();
  });
}

// Globale : les clics de doSearch() l'appellent (ReferenceError sinon)
function closeSearch() {
  const overlay = $("searchOverlay");
  const input = $("searchInput");
  const results = $("searchResults");
  overlay && overlay.classList.remove("open");
  if (input) input.value = "";
  if (results) results.innerHTML = "";
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
    smoothTemperature(data);
    renderCity(data);
  } catch (e) {
    console.warn("[Refresh] failed:", e.message || e);
  }
}

// ============= TEMPERATURE SMOOTHING (anti-flicker) =============
// Quand la temperature change (nouveau fetch), on l'anime de l'ancienne
// vers la nouvelle au lieu d'un saut brutal. Effet subtil 1.5s.
let smoothAnim = null;
function smoothTemperature(data) {
  const newTemp = data.current && data.current.temperature_2m;
  const tempEl = $("temp");
  if (newTemp == null || !tempEl) return;

  const oldText = tempEl.textContent;
  // Parse old temp (format "23°" ou "73°")
  const oldMatch = oldText.match(/-?\d+/);
  if (!oldMatch) return;
  const oldTemp = parseFloat(oldMatch[0]);
  if (isNaN(oldTemp) || Math.abs(oldTemp - newTemp) < 0.3) return;

  const startTemp = oldTemp;
  const delta = newTemp - oldTemp;
  const duration = 1500;
  const startTime = performance.now();

  if (smoothAnim) cancelAnimationFrame(smoothAnim);

  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    // easeOutCubic
    const eased = 1 - Math.pow(1 - t, 3);
    const current = startTemp + delta * eased;
    tempEl.textContent = fmtTemp(current);
    if (t < 1) smoothAnim = requestAnimationFrame(step);
  }
  smoothAnim = requestAnimationFrame(step);
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
    // Auto-reessai dans 30s : une panne temporaire (503) ne doit pas
    // laisser l'app vide jusqu'au prochain refresh manuel
    clearTimeout(loadWeatherRetryTimer);
    loadWeatherRetryTimer = setTimeout(() => {
      console.log("[Meteo] Reessai automatique apres echec...");
      loadWeather();
    }, 30000);
  }
}
let loadWeatherRetryTimer = null;

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

  // Demo mode (?demo=1) — override city AVANT loadWeather
  checkDemoMode();

  // Unit toggle UI
  document.querySelectorAll("#unitToggle .seg").forEach((b) => {
    b.classList.toggle("active", b.dataset.unit === state.unit);
  });

  // IMPORTANT : attacher l'UI AVANT tout chargement meteo.
  // Pendant une panne Open-Meteo, loadWeather peut prendre 30s+
  // (timeouts + retries + fallback) -> si la recherche est attachee
  // apres, le bouton et la touche Entree sont morts pendant tout ce temps.
  setupSearch();
  setupSettings();
  setupDonate();
  renderFavorites();

  // Canvas background : taille initiale + resize
  resizeCanvas();
  window.addEventListener("resize", () => {
    resizeCanvas();
    if (particleType !== "none") initParticles(particleType);
  });

  if (state.demoMode) {
    // Force reload sur ville demo
    saveState();
    loadWeather();
  } else if (hasState) {
    loadWeather();

    // Geoloc IP des le debut : si la ville sauvegardee est loin de la
    // position IP (> ~50 km), on bascule dessus sans attendre le GPS.
    if (window.GeoIpModule && state.city) {
      window.GeoIpModule.tryIpGeolocation().then((ipLoc) => {
        if (!ipLoc || !state.city) return;
        const dLat = Math.abs(state.city.lat - ipLoc.lat);
        const dLon = Math.abs(state.city.lon - ipLoc.lon);
        if (dLat > 0.5 || dLon > 0.5) {
          console.log("[Init] Ville sauvegardee loin de l'IP, upgrade:", ipLoc.city);
          state.city = { name: ipLoc.city, lat: ipLoc.lat, lon: ipLoc.lon };
          saveState();
          loadWeather();
        }
      }).catch(() => {});
    }
  } else {
    // Première visite : Paris d'abord, IP/GPS en arrière-plan
    state.city = { name: "Paris", lat: 48.8566, lon: 2.3522 };
    saveState();
    loadWeather();

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

  // GPS en arrière-plan
  setTimeout(() => {
    try { startAutomaticGeolocation(); } catch (e) { console.warn(e); }
  }, 1000);

  // Auto-refresh 60s
  setInterval(tickLive, 60 * 1000);

  // Radar check every 5 min
  setInterval(async () => {
    if (!state.lastWeather || !window.RadarModule || !state.city) return;
    const c = state.lastWeather.current;
    await renderRadarOverlay(c);
  }, 5 * 60 * 1000);
})();
