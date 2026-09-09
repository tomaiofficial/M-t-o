// ============================================================
//  Météo - Application météo style Apple Weather
//  Géolocalisation auto, descriptions IA, auto-refresh
// ============================================================

// ===== WMO codes (style Apple Weather) =====
// Les codes WMO sont fournis directement par Open-Meteo
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
  96: { label: "Orages avec pluie",      icon: "apple-thunder",             night: "apple-thunder" },
  99: { label: "Orages violents",        icon: "apple-thunder",           night: "apple-thunder" }
};

const state = { city: null, unit: "C", lastWeather: null, lastRefreshMs: 0, favorites: [], requestId: 0, currentFetchController: null };
const $ = id => document.getElementById(id);
const FETCH_TIMEOUT_MS = 8000;
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

// ===== Géolocalisation automatique =====
let geoWatchId = null;
let lastGeo = null;
let lastGeoWeatherAt = 0;

function startAutomaticGeolocation() {
  if (!navigator.geolocation || geoWatchId !== null) return;

  geoWatchId = navigator.geolocation.watchPosition(async (position) => {
    const { latitude, longitude, accuracy } = position.coords;
    const now = Date.now();

    if (lastGeo && now - lastGeoWeatherAt < 60000) {
      const dLat = latitude - lastGeo.latitude;
      const dLon = longitude - lastGeo.longitude;
      const moved = Math.sqrt(dLat * dLat + dLon * dLon) * 111320;
      if (moved < 500) return;
    }

    lastGeo = { latitude, longitude, accuracy };
    lastGeoWeatherAt = now;

    try {
      const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=10&addressdetails=1`;
      const response = await fetchWithTimeout(geoUrl, { headers: { Accept: "application/json" } }, 8000);
      if (!response.ok) return;
      const data = await response.json();
      const a = data.address || {};
      const city = a.city || a.town || a.village || a.municipality || a.county;
      if (!city) return;

      if (state.city !== city) {
        // Compatibilité avec les fonctions météo existantes.
        if (typeof loadWeatherForCoordinates === "function") {
          await loadWeatherForCoordinates(latitude, longitude, city);
        } else if (typeof loadWeather === "function") {
          await loadWeather(city);
        } else {
          // Si aucune fonction dédiée n'est exposée, on conserve la position
          // afin que le code météo existant puisse la récupérer au prochain cycle.
          state.city = city;
        }
      }
    } catch (err) {
      console.warn("Géolocalisation automatique :", err);
    }
  }, (error) => {
    console.warn("Géolocalisation indisponible :", error.message);
  }, {
    enableHighAccuracy: true,
    maximumAge: 60000,
    timeout: 15000
  });
}

// ============================================================
//  RESTE DU SCRIPT ORIGINAL À CONSERVER
// ============================================================
