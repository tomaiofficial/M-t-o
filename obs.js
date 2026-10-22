// ============================================================
// OBSERVATIONS REELLES - stations Meteo-France (SYNOP)
// Source : meteo.comptoir.net (donnees SYNOP OMM, licence ouverte Etalab)
// Aucune cle API, CORS ouvert.
//
// But : afficher les VRAIES mesures (temperature, rafales) au lieu des
// valeurs du modele, quand une station est proche (< 40 km) et que la
// mesure est recente (< 90 min). Sinon on garde le modele (Open-Meteo).
// ============================================================
const OBS_API = "https://meteo.comptoir.net/api";
const OBS_STATIONS_KEY = "meteo_obs_stations_v1";
const OBS_MAX_DIST_KM = 40;
const OBS_MAX_AGE_MIN = 90;
const OBS_REFRESH_MS = 5 * 60 * 1000;

let obsStations = null; // liste des stations (cache memoire + localStorage 24h)
let realObs = null; // derniere mesure reelle retenue
let obsLastTryMs = 0;
let obsFetching = false;

function obsHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function loadObsStations() {
  if (obsStations) return obsStations;
  try {
    const raw = localStorage.getItem(OBS_STATIONS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.ts && Date.now() - p.ts < 24 * 3600 * 1000 && Array.isArray(p.list) && p.list.length) {
        obsStations = p.list;
        return obsStations;
      }
    }
  } catch (e) {}
  const res = await fetchWithTimeout(`${OBS_API}/stations`, {}, 10000);
  if (!res.ok) throw new Error(`stations HTTP ${res.status}`);
  const json = await res.json();
  const list = (json.stations || []).filter((s) => s.latitude != null && s.longitude != null);
  if (!list.length) throw new Error("liste stations vide");
  obsStations = list;
  try {
    localStorage.setItem(OBS_STATIONS_KEY, JSON.stringify({ ts: Date.now(), list }));
  } catch (e) {}
  return obsStations;
}

function nearestObsStation(lat, lon) {
  if (!obsStations) return null;
  let best = null;
  for (const s of obsStations) {
    const d = obsHaversine(lat, lon, s.latitude, s.longitude);
    if (!best || d < best.distKm) best = { station: s, distKm: d };
  }
  return best;
}

// "2026-10-22 18:00:00" (UTC) -> timestamp ms
function parseObsTime(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(str || "");
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

async function refreshRealObs(lat, lon) {
  try {
    await loadObsStations();
    const near = nearestObsStation(lat, lon);
    if (!near || near.distKm > OBS_MAX_DIST_KM) {
      realObs = null;
      return null;
    }
    const code = String(near.station.omm_code).padStart(5, "0");
    const res = await fetchWithTimeout(`${OBS_API}/synops/${code}?last=1`, {}, 10000);
    if (!res.ok) return realObs;
    const json = await res.json();
    const m = (json.measures || [])[0];
    if (!m) return realObs;
    const ms = parseObsTime(m.measured_at);
    const ageMin = ms ? (Date.now() - ms) / 60000 : null;
    if (ageMin == null || ageMin > OBS_MAX_AGE_MIN) return realObs; // mesure trop vieille
    const tempC = typeof m.t === "number" ? m.t - 273.15 : null;
    if (tempC == null || tempC < -60 || tempC > 60) return realObs;
    realObs = {
      tempC,
      gustKmh: typeof m.raf10 === "number" ? m.raf10 * 3.6 : null,
      gustPeriodKmh: typeof m.rafper === "number" ? m.rafper * 3.6 : null,
      windKmh: typeof m.ff === "number" ? m.ff * 3.6 : null,
      dirDeg: typeof m.dd === "number" ? m.dd : null,
      rain1h: typeof m.rr1 === "number" ? m.rr1 : null,
      humidity: typeof m.u === "number" ? m.u : null,
      station: near.station.name,
      distKm: near.distKm,
      ageMin,
      obsMs: ms,
      timeLabel: ms
        ? new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : "",
    };
    realObs.bias = computeObsBias(realObs);
    return realObs;
  } catch (e) {
    return realObs; // silencieux : le modele reste la reference
  }
}

// Ecart entre la MESURE reelle et le modele, au moment de la mesure.
// On s'en sert pour corriger le modele : la temperature affichee reste
// ancree sur la vraie mesure, tout en suivant la tendance en direct
// (sinon elle ne bougerait qu'une fois par heure, au rythme SYNOP).
function computeObsBias(obs) {
  const w = state.lastWeather;
  if (!w || !w.hourly || !Array.isArray(w.hourly.time) || !Array.isArray(w.hourly.temperature_2m)) return null;
  if (obs.obsMs == null) return null;
  const times = w.hourly.time;
  const temps = w.hourly.temperature_2m;
  for (let i = 0; i < times.length - 1; i++) {
    const t0 = new Date(times[i]).getTime();
    const t1 = new Date(times[i + 1]).getTime();
    if (isNaN(t0) || isNaN(t1) || obs.obsMs < t0 || obs.obsMs > t1) continue;
    const v0 = temps[i];
    const v1 = temps[i + 1];
    if (typeof v0 !== "number" || typeof v1 !== "number") return null;
    const ratio = t1 === t0 ? 0 : (obs.obsMs - t0) / (t1 - t0);
    const modelAtObs = v0 + (v1 - v0) * ratio;
    const bias = obs.tempC - modelAtObs;
    // Ecart aberrant (station en altitude, donnee douteuse) -> on ignore
    if (!isFinite(bias) || Math.abs(bias) > 8) return null;
    return bias;
  }
  return null;
}

// Applique les mesures reelles sur les donnees "current" AVANT le rendu :
// ainsi la temperature du haut, la cellule "Maint", les details et la
// description restent coherents entre eux (aucun double rendu).
function applyRealObsToCurrent(c) {
  if (!realObs || !c) return false;
  // Temperature : mesure reelle + tendance du modele depuis la mesure
  if (realObs.tempC != null) {
    if (c._modelTemp == null) c._modelTemp = c.temperature_2m;
    c.temperature_2m = realObs.bias != null ? c._modelTemp + realObs.bias : realObs.tempC;
  }
  if (realObs.gustKmh != null) c.wind_gusts_10m = realObs.gustKmh;
  if (realObs.windKmh != null) c.wind_speed_10m = realObs.windKmh;
  if (realObs.dirDeg != null) c.wind_direction_10m = realObs.dirDeg;
  if (realObs.humidity != null) c.relative_humidity_2m = realObs.humidity;
  c._obs = realObs;
  return true;
}

// Rafraichit les observations si besoin (throttle 5 min) puis corrige
// l'affichage seulement si la temperature affichee change vraiment.
function refreshRealObsIfStale() {
  if (!state.city || obsFetching) return;
  if (Date.now() - obsLastTryMs < OBS_REFRESH_MS) return;
  obsLastTryMs = Date.now();
  obsFetching = true;
  const lat = state.city.lat;
  const lon = state.city.lon;
  refreshRealObs(lat, lon)
    .then(() => {
      obsFetching = false;
      const w = state.lastWeather;
      if (!w || !w.current) return;
      const shownBefore = Math.round(w.current.temperature_2m);
      applyRealObsToCurrent(w.current);
      if (Math.round(w.current.temperature_2m) !== shownBefore) {
        renderCity(w); // coherence complete (haut + "Maint" + details)
      } else {
        renderSourceBadge();
      }
    })
    .catch(() => {
      obsFetching = false;
    });
}

function obsBadgeText() {
  if (!realObs) return "";
  const name = realObs.station
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join("-");
  return `obs. ${name} ${realObs.timeLabel}`;
}
