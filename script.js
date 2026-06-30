// ============================================================
// Météo App — version simplifiée + rafraîchissement intelligent
// ============================================================

// ---- Constantes ----
const SAVED_CITIES_KEY = 'savedCities_v1';
const GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';
const WX_API = 'https://api.open-meteo.com/v1/forecast';

// Intervalle de rafraîchissement intelligent (en secondes)
const REFRESH_MIN = 60;
const REFRESH_MAX = 120;
const REFRESH_DEFAULT = 90;

// ---- État global ----
let savedCities = [];
let currentCity = 'Paris';
let currentCoords = { lat: 48.8566, lon: 2.3522 };
let citiesEditMode = false;
let weatherRequestSeq = 0;
let refreshTimer = null;
let lastRefreshTime = 0;
let interpolationFrame = null;

// Cache de la dernière réponse API pour interpolation
let lastWeatherData = null;
// Valeurs affichées (interpolées en temps réel)
let displayedValues = {};
// Cible (dernière valeur reçue de l'API)
let targetValues = {};
// Timestamp de réception de chaque cible
let targetTimestamps = {};

// ---- Helpers ----
function normalizeCityKey(name) {
  return (name || '').trim().toLowerCase();
}

function $(id) { return document.getElementById(id); }

// ---- LocalStorage ----
function loadSavedCities() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_CITIES_KEY));
    if (Array.isArray(raw) && raw.length) return raw;
  } catch (_) {}
  return ['Paris', 'Lyon', 'Marseille'];
}

function saveSavedCities() {
  localStorage.setItem(SAVED_CITIES_KEY, JSON.stringify(savedCities));
}

// ---- API ----
async function searchCityCoords(query) {
  const url = `${GEO_API}?name=${encodeURIComponent(query)}&count=5&language=fr&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.results && data.results.length) {
    const r = data.results[0];
    return { name: r.name, lat: r.latitude, lon: r.longitude, country: r.country, admin1: r.admin1 };
  }
  return null;
}

async function fetchWeather(lat, lon) {
  // Appel enrichi : courants + horaires + minutely_15 (quasi-radar) + quotidiens
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'rain',
      'showers',
      'snowfall',
      'weather_code',
      'cloud_cover',
      'pressure_msl',
      'surface_pressure',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'dew_point_2m',
      'uv_index',
      'visibility'
    ].join(','),
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'dew_point_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'rain',
      'showers',
      'snowfall',
      'weather_code',
      'pressure_msl',
      'cloud_cover',
      'visibility',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'uv_index',
      'is_day'
    ].join(','),
    minutely_15: 'precipitation,weather_code,visibility',
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'rain_sum',
      'showers_sum',
      'snowfall_sum',
      'precipitation_hours',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'wind_direction_10m_dominant',
      'uv_index_max',
      'sunrise',
      'sunset'
    ].join(','),
    timezone: 'auto',
    forecast_days: 10
  });
  const url = `${WX_API}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Erreur API météo');
  return res.json();
}

// ---- Vue liste / détail ----
function showCitiesView() {
  $('cities-view').classList.remove('hidden');
  $('detail-view').classList.add('hidden');
  renderCitiesList();
}

function showDetailView() {
  $('cities-view').classList.add('hidden');
  $('detail-view').classList.remove('hidden');
}

// ---- Description WMO enrichie avec sous-types de précipitations ----
function getWeatherDescription(code) {
  const map = {
    0: 'Ciel dégagé', 1: 'Principalement dégagé', 2: 'Partiellement nuageux',
    3: 'Nuageux', 45: 'Brumeux', 48: 'Brouillard givrant',
    51: 'Bruine légère', 53: 'Bruine modérée', 55: 'Bruine dense',
    56: 'Verglas léger', 57: 'Verglas dense',
    61: 'Pluie légère', 63: 'Pluie modérée', 65: 'Pluie forte',
    66: 'Pluie verglaçante légère', 67: 'Pluie verglaçante forte',
    71: 'Neige légère', 73: 'Neige modérée', 75: 'Neige forte',
    77: 'Grésil', 80: 'Averses légères', 81: 'Averses modérées',
    82: 'Averses violentes', 85: 'Averses de neige légères', 86: 'Averses de neige fortes',
    95: 'Orage', 96: 'Orage avec grêle légère', 99: 'Orage avec grêle forte'
  };
  return map[code] || '—';
}

// ---- Détection du type de précipitation selon intensité (mm/h) ----
function classifyPrecipIntensity(rain, showers, snow, precipTotal) {
  // Combine pluie + averses ; neige séparée
  const water = (rain || 0) + (showers || 0);
  const w = precipTotal != null ? precipTotal : water;

  if ((snow || 0) > 0.1) {
    if ((snow || 0) < 0.5) return { type: 'snow', label: 'Neige faible', code: 71 };
    if ((snow || 0) < 2)   return { type: 'snow', label: 'Neige modérée', code: 73 };
    return { type: 'snow', label: 'Forte chute de neige', code: 75 };
  }
  if (w > 0) {
    if (w < 0.1) return { type: 'drizzle', label: 'Crachin', code: 51 };
    if (w < 0.3) return { type: 'drizzle', label: 'Bruine', code: 53 };
    if (w < 1)   return { type: 'rain', label: 'Pluie très faible', code: 61 };
    if (w < 2.5) return { type: 'rain', label: 'Pluie faible', code: 61 };
    if (w < 7.5) return { type: 'rain', label: 'Pluie modérée', code: 63 };
    return { type: 'rain', label: 'Forte pluie', code: 65 };
  }
  return null;
}

// Direction cardinale
function degToCardinal(deg) {
  if (deg == null) return '—';
  const dirs = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest'];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}

// Tendance pression
function pressureTrend(hourly, idx) {
  if (!hourly || !hourly.pressure_msl || idx == null) return { label: 'Stable', sign: '' };
  const now = hourly.pressure_msl[idx];
  const prev = idx > 0 ? hourly.pressure_msl[idx - 1] : now;
  const diff = now - prev;
  if (diff > 0.5) return { label: 'En hausse', sign: '↗' };
  if (diff < -0.5) return { label: 'En baisse', sign: '↘' };
  return { label: 'Stable', sign: '→' };
}

// ---- Détection cellules de pluie entrantes via minutely_15 ----
function detectIncomingPrecip(minutely) {
  if (!minutely || !minutely.precipitation) return null;
  const series = minutely.precipitation;
  const codes = minutely.weather_code || [];
  const startTime = minutely.time ? new Date(minutely.time[0]) : new Date();

  // Cherche la prochaine tranche avec précipitations significatives sur 2h
  let rainStart = -1, rainEnd = -1, peakIntensity = 0, peakCode = null;
  for (let i = 0; i < Math.min(8, series.length); i++) {
    if (series[i] > 0.05) {
      if (rainStart === -1) rainStart = i;
      rainEnd = i;
      if (series[i] > peakIntensity) {
        peakIntensity = series[i];
        peakCode = codes[i] || null;
      }
    }
  }
  if (rainStart === -1) return null;

  const minutesToStart = rainStart * 15;
  const minutesToEnd = (rainEnd + 1) * 15;
  const startDate = new Date(startTime.getTime() + minutesToStart * 60000);
  const endDate = new Date(startTime.getTime() + minutesToEnd * 60000);

  return {
    minutesToStart,
    minutesToEnd,
    peakIntensity,
    peakCode,
    startLabel: formatRelativeTime(startDate),
    endLabel: formatRelativeTime(endDate)
  };
}

function formatRelativeTime(d) {
  const now = new Date();
  const diffMin = Math.round((d - now) / 60000);
  if (diffMin <= 0) return 'maintenant';
  if (diffMin < 60) return `dans ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `dans ${h}h${m}` : `dans ${h}h`;
}

// ---- Décision : condition actuelle basée sur observation + radar ----
// Priorité : observation temps réel > minutely_15 > hourly forecast
function resolveCurrentCondition(current, minutely) {
  const rain = current.rain || 0;
  const showers = current.showers || 0;
  const snow = current.snowfall || 0;
  const precipTotal = current.precipitation || 0;

  const observed = classifyPrecipIntensity(rain, showers, snow, precipTotal);
  if (observed && precipTotal > 0.05) {
    return { source: 'observation', ...observed };
  }

  // Sinon : regarde minutely_15 (cellules entrantes très proches)
  if (minutely && minutely.precipitation) {
    const next1h = minutely.precipitation.slice(0, 4);
    const maxNext = Math.max(...next1h, 0);
    if (maxNext > 0.1) {
      const code = minutely.weather_code && minutely.weather_code[0];
      const baseCode = current.weather_code || code || 0;
      const detected = classifyPrecipIntensity(maxNext, 0, snow, maxNext);
      if (detected) return { source: 'nowcast', ...detected };
    }
  }

  // Sinon : code WMO courant
  return { source: 'forecast', type: null, label: getWeatherDescription(current.weather_code), code: current.weather_code };
}

// ---- Affichage détail ----
function renderWeatherDetail(cityData, data) {
  lastWeatherData = data;
  const current = data.current;
  const daily = data.daily;
  const hourly = data.hourly;
  const minutely = data.minutely_15;

  // --- En-tête ---
  document.querySelector('.city').textContent = currentCity;
  setTarget('bigTemp', roundHalf(current.temperature_2m));

  // Condition + icône : décide via resolveCurrentCondition (priorité observation)
  const condition = resolveCurrentCondition(current, minutely);
  const weatherCode = condition.code != null ? condition.code : current.weather_code;
  const conditionText = condition.label;
  document.querySelector('.condition').textContent = conditionText;

  // --- Hi/Lo ---
  const hl = document.querySelector('.high-low');
  if (hl && daily) {
    hl.innerHTML = `<span>H:${Math.round(daily.temperature_2m_max[0])}°</span><span>L:${Math.round(daily.temperature_2m_min[0])}°</span>`;
  }

  // --- Icône météo ---
  const hero = document.querySelector('.weather-hero');
  let iconWrap = hero ? hero.querySelector('.weather-icon-container') : null;
  if (!iconWrap && hero) {
    iconWrap = document.createElement('div');
    iconWrap.className = 'weather-icon-container';
    iconWrap.style.cssText = 'display:flex;justify-content:center;margin-bottom:10px';
    const bigTemp = hero.querySelector('.big-temp');
    if (bigTemp) hero.insertBefore(iconWrap, bigTemp);
    else hero.prepend(iconWrap);
  }
  if (iconWrap) {
    iconWrap.innerHTML = createWeatherIconSVG(weatherCode, current.is_day !== 0, 80);
  }

  // --- Mise à jour valeurs cibles (interpolation s'en charge) ---
  if (current.relative_humidity_2m != null) setTarget('humidity', Math.round(current.relative_humidity_2m));
  if (current.wind_speed_10m != null) setTarget('wind', Math.round(current.wind_speed_10m));
  if (current.pressure_msl != null) setTarget('pressure', Math.round(current.pressure_msl));
  if (current.precipitation != null) setTarget('precip', Number(current.precipitation.toFixed(2)));
  if (current.cloud_cover != null) setTarget('clouds', Math.round(current.cloud_cover));
  if (current.dew_point_2m != null) setTarget('dewpoint', Math.round(current.dew_point_2m));
  if (current.uv_index != null) setTarget('uv', Number(current.uv_index.toFixed(1)));
  if (current.visibility != null) setTarget('visibility', (current.visibility / 1000));
  if (current.wind_gusts_10m != null) setTarget('gusts', Math.round(current.wind_gusts_10m));
  if (current.wind_direction_10m != null) setTarget('windDirDeg', current.wind_direction_10m);
  if (current.apparent_temperature != null) setTarget('feelsLike', Math.round(current.apparent_temperature));
  if (daily && daily.sunrise) setTarget('sunriseTime', daily.sunrise[0]);
  if (daily && daily.sunset) setTarget('sunsetTime', daily.sunset[0]);

  // --- Descriptions calculées ---
  setText('precip-desc', precipDesc(current));
  setText('wind-direction', `${degToCardinal(current.wind_direction_10m)}`);
  setText('visibility-desc', visibilityDesc(current.visibility));
  setText('pressure-trend', pressureTrend(hourly, currentHourIndex(hourly)).label);
  setText('cloud-desc', cloudDesc(current.cloud_cover));
  setText('dew-desc', dewDesc(current.dew_point_2m, current.relative_humidity_2m));
  setText('uv-desc', uvDesc(current.uv_index));

  // Qualité de l'air (placeholder)
  setText('air-quality', '—');
  setText('air-quality-desc', 'Données bientôt');

  // --- Alerte basée sur radar + observation ---
  renderAlert(current, minutely, daily);

  // --- Horaire (ajusté si cellule détectée) ---
  renderHourly(hourly, minutely);

  // --- Quotidien ---
  renderDaily(daily);

  // --- Pluie prochaine heure (basée sur minutely_15 = radar) ---
  updateNextHourRain(hourly, minutely, condition);

  // --- IA (placeholder) ---
  renderIA(current, condition);

  // Lance la boucle d'interpolation
  startInterpolationLoop();
  // Met à jour immédiatement la première fois
  flushDisplayedValues();
}

// Arrondi à 0.5 près pour interpolation plus douce visuellement
function roundHalf(v) { return Math.round(v * 2) / 2; }

// Descriptions calculées
function precipDesc(current) {
  const r = current.rain || 0, s = current.showers || 0, sn = current.snowfall || 0;
  const total = current.precipitation || 0;
  if (sn > 0.1) return `Neige · ${sn.toFixed(1)} mm/h`;
  if (total > 0.05) {
    const cls = classifyPrecipIntensity(r, s, sn, total);
    return cls ? cls.label : `${total.toFixed(1)} mm/h`;
  }
  return 'Aucune précipitation';
}
function visibilityDesc(v) {
  if (v == null) return '—';
  const km = v / 1000;
  if (km >= 20) return 'Excellente';
  if (km >= 10) return 'Très bonne';
  if (km >= 5)  return 'Bonne';
  if (km >= 2)  return 'Réduite';
  return 'Très réduite';
}
function cloudDesc(c) {
  if (c == null) return '—';
  if (c < 10) return 'Ciel dégagé';
  if (c < 30) return 'Quelques nuages';
  if (c < 60) return 'Partiellement nuageux';
  if (c < 85) return 'Nuages prédominants';
  return 'Temps couvert';
}
function dewDesc(d, h) {
  if (d == null || h == null) return '—';
  const spread = d - (-((h/100)*5)); // pas précis, fallback
  if (h < 40) return 'Air sec';
  if (h < 70) return 'Confortable';
  if (h < 85) return 'Humide';
  return 'Très humide';
}
function uvDesc(u) {
  if (u == null) return '—';
  if (u < 3) return 'Faible';
  if (u < 6) return 'Modéré';
  if (u < 8) return 'Élevé';
  if (u < 11) return 'Très élevé';
  return 'Extrême';
}

function currentHourIndex(hourly) {
  if (!hourly || !hourly.time) return 0;
  const now = new Date();
  for (let i = 0; i < hourly.time.length; i++) {
    const t = new Date(hourly.time[i]);
    if (t >= now) return i;
  }
  return 0;
}

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}
function setInnerHTML(id, val) {
  const el = $(id);
  if (el) el.innerHTML = val;
}

// ---- Gestion des cibles pour interpolation ----
function setTarget(key, value) {
  if (value == null || isNaN(value)) return;
  // Initialise la valeur affichée si pas encore connue
  if (displayedValues[key] == null) {
    displayedValues[key] = value;
  }
  targetValues[key] = value;
  targetTimestamps[key] = Date.now();
}

// ---- Interpolation douce entre la valeur affichée et la cible ----
function lerp(a, b, t) { return a + (b - a) * t; }

function interpolateValues() {
  const now = Date.now();
  const TRANSITION_MS = 1500; // 1.5s pour transition douce
  let changed = false;

  for (const key in targetValues) {
    const target = targetValues[key];
    const current = displayedValues[key];
    if (current == null) { displayedValues[key] = target; changed = true; continue; }
    if (Math.abs(target - current) < 0.01) continue;

    const since = now - (targetTimestamps[key] || now);
    const t = Math.min(1, since / TRANSITION_MS);
    // Easing cubique ease-out pour sensation naturelle
    const eased = 1 - Math.pow(1 - t, 3);
    displayedValues[key] = lerp(current, target, eased);
    changed = true;
  }
  return changed;
}

function flushDisplayedValues() {
  for (const key in targetValues) {
    displayedValues[key] = targetValues[key];
  }
  paintDisplayedValues();
}

function paintDisplayedValues() {
  const v = displayedValues;
  if (v.bigTemp != null) {
    const el = document.querySelector('.big-temp');
    if (el) el.innerHTML = `${Math.round(v.bigTemp * 2) / 2}°`;
  }
  if (v.humidity != null) setText('humidity', `${Math.round(v.humidity)}%`);
  if (v.wind != null) setInnerHTML('wind', `${Math.round(v.wind)} <span class="unit">km/h</span>`);
  if (v.pressure != null) setInnerHTML('pressure', `${Math.round(v.pressure)} <span class="unit">hPa</span>`);
  if (v.precip != null) setInnerHTML('precipitation', `${v.precip.toFixed(1)} <span class="unit">mm</span>`);
  if (v.clouds != null) setInnerHTML('clouds', `${Math.round(v.clouds)} <span class="unit">%</span>`);
  if (v.dewpoint != null) setText('dewpoint', `${Math.round(v.dewpoint)}°`);
  if (v.visibility != null) setInnerHTML('visibility-value', `${v.visibility.toFixed(1)} <span class="unit">km</span>`);
  if (v.uv != null) setText('uv-index', `${v.uv.toFixed(1)}`);
  if (v.feelsLike != null) setText('feels-like', `${Math.round(v.feelsLike)}°`);
}

function startInterpolationLoop() {
  if (interpolationFrame) return;
  const tick = () => {
    if (interpolateValues()) {
      paintDisplayedValues();
    }
    interpolationFrame = requestAnimationFrame(tick);
  };
  interpolationFrame = requestAnimationFrame(tick);
}

function stopInterpolationLoop() {
  if (interpolationFrame) {
    cancelAnimationFrame(interpolationFrame);
    interpolationFrame = null;
  }
}

// ---- Horaire ----
function renderHourly(hourly, minutely) {
  const container = $('hourly-list');
  if (!container) return;

  const times = hourly.time || [];
  const temps = hourly.temperature_2m || [];
  const codes = hourly.weather_code || [];
  const probs = hourly.precipitation_probability || [];
  const precips = hourly.precipitation || [];

  // Ajustement : si minutely_15 montre une cellule arrivant < 1h,
  // relever la prob et l'intensité de la première heure
  const adjustedProbs = probs.slice();
  const adjustedPrecips = precips.slice();
  if (minutely && minutely.precipitation && adjustedProbs[0] != null) {
    const next30min = minutely.precipitation.slice(0, 2);
    const maxNext = Math.max(...next30min, 0);
    if (maxNext > 0.1) {
      adjustedProbs[0] = Math.max(adjustedProbs[0], 70);
      adjustedPrecips[0] = Math.max(adjustedPrecips[0], maxNext);
    }
  }

  let html = '';
  for (let i = 0; i < Math.min(24, times.length); i++) {
    const h = new Date(times[i]).getHours();
    const label = i === 0 ? 'Maintenant' : `${h}h`;
    const icon = createWeatherIconSVG(codes[i], true, 28);
      html += `<div class="hour-card">
        <div class="time">${label}</div>
        <div class="icon">${icon}</div>
        <div class="temp">${Math.round(temps[i] || 0)}°</div>
        ${adjustedProbs[i] != null ? `<div class="rain">${adjustedProbs[i]}%</div>` : ''}
      </div>`;
  }
  container.innerHTML = html;
}

// ---- Quotidien ----
function renderDaily(daily) {
  const container = $('daily-list');
  if (!container) return;

  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const times = daily.time || [];
  const maxs = daily.temperature_2m_max || [];
  const mins = daily.temperature_2m_min || [];
  const codes = daily.weather_code || [];
  const precips = daily.precipitation_sum || [];
  let html = '';

  for (let i = 0; i < Math.min(10, times.length); i++) {
    const date = new Date(times[i] + 'T12:00:00');
    const dayName = i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : days[date.getDay()] || '';
    const icon = createWeatherIconSVG(codes[i], true, 28);
    const cond = getWeatherDescription(codes[i]);
    const precip = precips[i] ? `${precips[i]}mm` : '';
    html += `<div class="daily-item">
      <div class="day">${dayName}</div>
      <div class="icon">${icon}</div>
      <div class="condition">${cond}</div>
      <div class="daily-precip">${precip}</div>
      <div class="-temps">
        <span class="temp-high">${Math.round(maxs[i])}°</span>
        <span class="temp-low">${Math.round(mins[i])}°</span>
      </div>
    </div>`;
  }
  container.innerHTML = html;
}

// ---- Pluie prochaine heure : radar minutely_15 prioritaire ----
function updateNextHourRain(hourly, minutely, condition) {
  const probEl = $('next-hour-rain-prob');
  const textEl = $('next-hour-rain-text');
  if (!probEl || !textEl) return;

  // 1) Observation immédiate ?
  if (condition && condition.source === 'observation' && condition.type) {
    probEl.textContent = `100%`;
    textEl.textContent = condition.label;
    return;
  }

  // 2) Nowcast via minutely_15 (radar)
  if (minutely && minutely.precipitation) {
    const next1h = minutely.precipitation.slice(0, 4);
    const maxNext = Math.max(...next1h, 0);
    const cell = detectIncomingPrecip(minutely);
    if (maxNext > 0.1) {
      const cls = classifyPrecipIntensity(maxNext, 0, 0, maxNext);
      const startLabel = cell ? cell.startLabel : 'bientôt';
      probEl.textContent = `${Math.round(maxNext * 30 + 50)}%`;
      textEl.textContent = `${cls ? cls.label : 'Pluie'} ${startLabel}`;
      return;
    }
  }

  // 3) Fallback : forecast horaire
  const probs = hourly.precipitation_probability || [];
  const nextProb = probs[0] || 0;
  probEl.textContent = `${nextProb}%`;
  if (nextProb > 60) textEl.textContent = 'Risque élevé de pluie';
  else if (nextProb > 30) textEl.textContent = 'Risque de pluie';
  else if (nextProb > 10) textEl.textContent = 'Pluie possible';
  else textEl.textContent = 'Pas de pluie prévue';
}

// ---- Alerte météo : déclenchée par radar + observation ----
function renderAlert(current, minutely, daily) {
  const titleEl = $('alert-title');
  const descEl = $('alert-desc');
  if (!titleEl || !descEl) return;

  // 1) Alerte immédiate : fortes précipitations observées
  const total = current.precipitation || 0;
  const cls = classifyPrecipIntensity(current.rain || 0, current.showers || 0, current.snowfall || 0, total);
  if (cls && total > 7.5) {
    titleEl.textContent = '⚠️ Fortes précipitations';
    descEl.textContent = `${cls.label} · ${total.toFixed(1)} mm/h en cours`;
    return;
  }

  // 2) Cellule entrante dans < 30 min
  const cell = detectIncomingPrecip(minutely);
  if (cell && cell.minutesToStart <= 30 && cell.peakIntensity > 0.5) {
    titleEl.textContent = '☔ Pluie imminente';
    descEl.textContent = `Cellule détectée · ${cell.startLabel} (${cell.peakIntensity.toFixed(1)} mm/h)`;
    return;
  }

  // 3) Cellule entrante dans < 2h
  if (cell && cell.minutesToStart <= 120 && cell.peakIntensity > 1) {
    titleEl.textContent = '🌧 Pluie attendue';
    descEl.textContent = `Cellule ${cell.startLabel} · pic ${cell.peakIntensity.toFixed(1)} mm/h`;
    return;
  }

  // 4) Orage (code 95-99)
  const code = current.weather_code;
  if (code >= 95 && code <= 99) {
    titleEl.textContent = '⛈ Orage en cours';
    descEl.textContent = getWeatherDescription(code);
    return;
  }

  // 5) Pas d'alerte
  titleEl.textContent = 'Aucune alerte';
  descEl.textContent = '—';
}

// ---- IA ----
function renderIA(current, condition) {
  const iaContent = $('ia-meteo-content');
  if (!iaContent) return;
  const t = Math.round(current.temperature_2m);
  const h = current.relative_humidity_2m;
  let advice = '';
  if (condition && condition.source === 'observation' && condition.type) {
    advice = `Il ${condition.label.toLowerCase()} actuellement. ${precipAdvice(condition.type)}`;
  } else if (condition && condition.source === 'nowcast') {
    advice = `${condition.label} attendue à court terme. ${precipAdvice(condition.type)}`;
  } else if (t > 30) {
    advice = 'Il fait très chaud aujourd\'hui. Pensez à vous hydrater et éviter les efforts aux heures les plus chaudes.';
  } else if (t < 5) {
    advice = 'Températures froides aujourd\'hui. Couvrez-vous bien et faites attention au verglas possible.';
  } else if (current.weather_code >= 61 && current.weather_code <= 67) {
    advice = 'De la pluie est prévue aujourd\'hui. N\'oubliez pas votre parapluie !';
  } else if (current.weather_code >= 71 && current.weather_code <= 77) {
    advice = 'Chutes de neige attendues. Soyez prudent sur les routes et prévoyez des vêtements chauds.';
  } else if (current.weather_code >= 95) {
    advice = 'Orages possibles aujourd\'hui. Restez à l\'abri et évitez les activités en extérieur.';
  } else {
    advice = `Belle journée avec ${t}°C et ${h}% d'humidité. Profitez-en !`;
  }
  iaContent.innerHTML = `<div style="font-size:14px;line-height:1.5;color:rgba(255,255,255,0.85);padding:8px 0">${advice}</div>`;
}
function precipAdvice(type) {
  switch (type) {
    case 'drizzle': return 'Bruine fine — un imperméable léger suffit.';
    case 'rain': return 'Pensez à prendre un parapluie.';
    case 'snow': return 'Routes glissantes possibles, attention si vous conduisez.';
    default: return 'Restez vigilant·e.';
  }
}

// ---- Chargement météo + déclencheur de boucle de rafraîchissement ----
async function updateWeatherByCoords(lat, lon) {
  await loadWeatherFor(lat, lon, /*reverseGeo*/ true);
}

async function updateWeather(cityName) {
  const requestId = ++weatherRequestSeq;
  const cityEl = document.querySelector('.city');
  const tempEl = document.querySelector('.big-temp');
  const condEl = document.querySelector('.condition');
  if (cityEl) cityEl.textContent = cityName;
  if (tempEl) tempEl.textContent = '...';
  if (condEl) condEl.textContent = 'Recherche…';

  const cityData = await searchCityCoords(cityName);
  if (requestId !== weatherRequestSeq) return;

  if (!cityData) {
    if (condEl) condEl.textContent = 'Ville non trouvée';
    return;
  }
  currentCity = cityData.name;
  currentCoords = { lat: cityData.lat, lon: cityData.lon };
  if (cityEl) cityEl.textContent = currentCity;
  if (condEl) condEl.textContent = 'Chargement…';

  await loadWeatherFor(currentCoords.lat, currentCoords.lon, false);
}

async function loadWeatherFor(lat, lon, doReverseGeo) {
  const requestId = ++weatherRequestSeq;

  if (doReverseGeo) {
    let cityName = 'Ma position';
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=fr`, {
        headers: { 'User-Agent': 'MeteoApp/1.0' }
      });
      const geo = await res.json();
      if (geo && geo.address) {
        cityName = geo.address.city || geo.address.town || geo.address.village || geo.address.county || 'Ma position';
      }
    } catch (_) {}
    if (requestId !== weatherRequestSeq) return;
    currentCoords = { lat, lon };
    currentCity = cityName;
  }

  const cityEl = document.querySelector('.city');
  const tempEl = document.querySelector('.big-temp');
  const condEl = document.querySelector('.condition');
  if (cityEl) cityEl.textContent = currentCity;
  if (tempEl) tempEl.textContent = '...';
  if (condEl) condEl.textContent = 'Chargement…';

  try {
    const weather = await fetchWeather(lat, lon);
    if (requestId !== weatherRequestSeq) return;
    // Reset des valeurs affichées pour éviter interpolation depuis une autre ville
    displayedValues = {};
    targetValues = {};
    targetTimestamps = {};
    renderWeatherDetail(null, weather);
    showDetailView();
    lastRefreshTime = Date.now();
    scheduleRefresh();
  } catch (err) {
    console.error(err);
    if (condEl) condEl.textContent = 'Erreur de connexion';
  }
}

// ---- Boucle de rafraîchissement intelligent 60-120s ----
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  // Ne rafraîchit pas si l'onglet est caché
  if (document.hidden) {
    document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
    return;
  }
  const interval = computeAdaptiveInterval();
  refreshTimer = setTimeout(() => {
    refreshWeatherSilent();
  }, interval * 1000);
}

function computeAdaptiveInterval() {
  // Conditions variables ? Intervalle court. Stable ? Un peu plus long.
  if (!lastWeatherData || !lastWeatherData.current) return REFRESH_DEFAULT;
  const c = lastWeatherData.current;
  const w = c.wind_speed_10m || 0;
  const g = c.wind_gusts_10m || 0;
  const precip = c.precipitation || 0;

  // Fortes rafales, fortes précipitations → 60s (réactif)
  if (precip > 1 || g > 50 || w > 30) return REFRESH_MIN;
  // Conditions calmes → 110-120s (économie)
  if (precip === 0 && w < 10 && g < 25) return Math.min(REFRESH_MAX, 120);
  // Standard
  return REFRESH_DEFAULT;
}

async function refreshWeatherSilent() {
  if (!currentCoords || currentCoords.lat == null) return;
  try {
    const weather = await fetchWeather(currentCoords.lat, currentCoords.lon);
    lastWeatherData = weather;
    // Conserve l'historique : on met à jour les cibles SANS reset
    updateTargetsFromLatest(weather);
    lastRefreshTime = Date.now();
    // Repeint les éléments non interpolés (icônes, horaires, quotidien, alertes)
    repaintNonInterpolated(weather);
    // Planifie la suite
    scheduleRefresh();
  } catch (err) {
    console.warn('[silent refresh] echec, nouvelle tentative dans 60s', err);
    refreshTimer = setTimeout(refreshWeatherSilent, REFRESH_MIN * 1000);
  }
}

function updateTargetsFromLatest(data) {
  const c = data.current;
  if (!c) return;
  if (c.temperature_2m != null) setTarget('bigTemp', roundHalf(c.temperature_2m));
  if (c.relative_humidity_2m != null) setTarget('humidity', Math.round(c.relative_humidity_2m));
  if (c.wind_speed_10m != null) setTarget('wind', Math.round(c.wind_speed_10m));
  if (c.pressure_msl != null) setTarget('pressure', Math.round(c.pressure_msl));
  if (c.precipitation != null) setTarget('precip', Number(c.precipitation.toFixed(2)));
  if (c.cloud_cover != null) setTarget('clouds', Math.round(c.cloud_cover));
  if (c.dew_point_2m != null) setTarget('dewpoint', Math.round(c.dew_point_2m));
  if (c.uv_index != null) setTarget('uv', Number(c.uv_index.toFixed(1)));
  if (c.visibility != null) setTarget('visibility', (c.visibility / 1000));
  if (c.wind_gusts_10m != null) setTarget('gusts', Math.round(c.wind_gusts_10m));
  if (c.wind_direction_10m != null) setTarget('windDirDeg', c.wind_direction_10m);
  if (c.apparent_temperature != null) setTarget('feelsLike', Math.round(c.apparent_temperature));
}

function repaintNonInterpolated(data) {
  const current = data.current;
  const hourly = data.hourly;
  const minutely = data.minutely_15;
  const daily = data.daily;

  // Recalcul de la condition avec les nouvelles données
  const condition = resolveCurrentCondition(current, minutely);
  document.querySelector('.condition').textContent = condition.label;

  // Icône
  const hero = document.querySelector('.weather-hero');
  const iconWrap = hero ? hero.querySelector('.weather-icon-container') : null;
  if (iconWrap) {
    const code = condition.code != null ? condition.code : current.weather_code;
    iconWrap.innerHTML = createWeatherIconSVG(code, current.is_day !== 0, 80);
  }

  // Hi/Lo
  if (daily) {
    const hl = document.querySelector('.high-low');
    if (hl) hl.innerHTML = `<span>H:${Math.round(daily.temperature_2m_max[0])}°</span><span>L:${Math.round(daily.temperature_2m_min[0])}°</span>`;
  }

  // Descriptions
  setText('precip-desc', precipDesc(current));
  setText('wind-direction', `${degToCardinal(current.wind_direction_10m)}`);
  setText('visibility-desc', visibilityDesc(current.visibility));
  setText('pressure-trend', pressureTrend(hourly, currentHourIndex(hourly)).label);
  setText('cloud-desc', cloudDesc(current.cloud_cover));
  setText('dew-desc', dewDesc(current.dew_point_2m, current.relative_humidity_2m));
  setText('uv-desc', uvDesc(current.uv_index));

  // Alerte + horaire + prochaine heure + IA
  renderAlert(current, minutely, daily);
  renderHourly(hourly, minutely);
  updateNextHourRain(hourly, minutely, condition);
  renderIA(current, condition);
}

function onVisibilityChange() {
  if (!document.hidden) {
    // Page visible à nouveau → refresh immédiat
    refreshWeatherSilent();
  }
}

// ---- Liste des villes ----
function renderCitiesList() {
  const container = $('cities-list');
  if (!container) return;

  if (savedCities.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:rgba(255,255,255,0.5)">Ajoutez une ville avec la recherche</div>';
    return;
  }

  let html = '';
  for (const city of savedCities) {
    html += `<div class="city-card" data-city="${city.replace(/"/g, '&quot;')}">
      ${citiesEditMode ? `<button class="city-card-delete" data-city="${city.replace(/"/g, '&quot;')}">✕</button>` : ''}
      <div class="city-card-name">${city}</div>
      <div class="city-card-temp">--°</div>
    </div>`;
  }
  container.innerHTML = html;

  container.querySelectorAll('.city-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('city-card-delete')) return;
      updateWeather(card.dataset.city);
    });
  });

  container.querySelectorAll('.city-card-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const city = btn.dataset.city;
      savedCities = savedCities.filter(c => normalizeCityKey(c) !== normalizeCityKey(city));
      saveSavedCities();
      renderCitiesList();
    });
  });
}

// ---- Recherche ----
function setupSearchListeners() {
  const inputs = ['city-input', 'city-input-2'];

  for (const id of inputs) {
    const input = $(id);
    if (!input) continue;

    const doSearch = async () => {
      const query = input.value.trim();
      if (query.length < 2) { hideSuggestions(); return; }

      const url = `${GEO_API}?name=${encodeURIComponent(query)}&count=6&language=fr&format=json`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        showSuggestions(data.results || []);
      } catch (_) {
        hideSuggestions();
      }
    };

    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(doSearch, 300);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(timer);
        const query = input.value.trim();
        if (query) {
          hideSuggestions();
          updateWeather(query);
        }
      }
    });

    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2) doSearch();
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) hideSuggestions();
  });
}

function showSuggestions(results) {
  const container = $('search-suggestions');
  if (!container) return;

  if (!results || results.length === 0) {
    container.classList.add('hidden');
    return;
  }

  let html = '';
  for (const r of results) {
    const label = `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}${r.country ? ', ' + r.country : ''}`;
    html += `<div class="suggestion-item" data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${r.name.replace(/"/g, '&quot;')}">${label}</div>`;
  }
  container.innerHTML = html;
  container.classList.remove('hidden');

  container.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.name;
      currentCoords = { lat: parseFloat(item.dataset.lat), lon: parseFloat(item.dataset.lon) };

      if (!savedCities.some(c => normalizeCityKey(c) === normalizeCityKey(name))) {
        savedCities.push(name);
        saveSavedCities();
      }

      hideSuggestions();
      ['city-input', 'city-input-2'].forEach(id => { const el = $(id); if (el) el.value = ''; });
      updateWeather(name);
    });
  });
}

function hideSuggestions() {
  const container = $('search-suggestions');
  if (container) container.classList.add('hidden');
}

// ---- Initialisation ----
document.addEventListener('DOMContentLoaded', () => {
  savedCities = loadSavedCities();
  showCitiesView();
  setupSearchListeners();

  const backBtn = $('back-to-cities');
  if (backBtn) backBtn.addEventListener('click', showCitiesView);

  const closeBtn = $('cities-close');
  if (closeBtn) closeBtn.addEventListener('click', showCitiesView);

  const editBtn = $('cities-edit');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      citiesEditMode = !citiesEditMode;
      $('cities-list')?.classList.toggle('cities-edit-mode', citiesEditMode);
      renderCitiesList();
    });
  }

  // Charge Paris au démarrage
  updateWeather('Paris');

  // Géolocalisation en arrière-plan
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        try {
          localStorage.setItem('lastCoords', JSON.stringify({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            timestamp: Date.now()
          }));
        } catch (_) {}
        updateWeatherByCoords(pos.coords.latitude, pos.coords.longitude);
      },
      () => {},
      { timeout: 5000, maximumAge: 300000 }
    );
  }
});