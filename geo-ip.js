// ============================================================
//  GEO-IP — Fallback de geolocalisation par IP quand le GPS
//  est refuse ou indisponible. Silencieux (zero UI).
//  API : https://geo.kamero.ai (gratuit, sans cle, CORS OK)
// ============================================================

const GEO_IP_API = "https://geo.kamero.ai/api/geo";
const GEO_IP_TIMEOUT_MS = 4000; // 4s max, on ne veut pas bloquer l'app
const GEO_IP_CACHE_TTL_MS = 24 * 3600 * 1000; // 24h cache (l'IP ne change pas souvent)
const GEO_IP_CACHE_KEY = "meteo_geoip_cache_v1";

let geoIpCache = null;
let geoIpInFlight = null; // dedup des appels concurrents

function loadGeoIpCache() {
  if (geoIpCache) return geoIpCache;
  try {
    const raw = localStorage.getItem(GEO_IP_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.timestamp || !obj.data) return null;
    if (Date.now() - obj.timestamp > GEO_IP_CACHE_TTL_MS) return null;
    geoIpCache = obj.data;
    return geoIpCache;
  } catch (e) {
    return null;
  }
}

function saveGeoIpCache(data) {
  try {
    localStorage.setItem(GEO_IP_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: data
    }));
    geoIpCache = data;
  } catch (e) {
    // localStorage plein ou desactive -> tant pis
  }
}

// Tente la geolocalisation par IP.
// Retourne { lat, lon, city, country, region, source: "IP" } ou null si echec.
// JAMAIS d'exception levee : tous les cas d'erreur renvoient null.
async function tryIpGeolocation(force = false) {
  // 1. Cache local (rapide, aucun appel reseau)
  if (!force) {
    const cached = loadGeoIpCache();
    if (cached) return cached;
  }

  // 2. Dedup : si un appel est deja en cours, on attend son resultat
  if (geoIpInFlight) return geoIpInFlight;

  geoIpInFlight = (async () => {
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), GEO_IP_TIMEOUT_MS);
      const res = await fetch(GEO_IP_API, {
        signal: ctrl.signal,
        headers: { "Accept": "application/json" }
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`[GeoIP] HTTP ${res.status}`);
        return null;
      }

      const data = await res.json();

      // Validation minimale
      if (typeof data.latitude !== "number" || typeof data.longitude !== "number") {
        console.warn("[GeoIP] Coordonnees invalides");
        return null;
      }
      // Rejet si c'est au milieu de l'ocean (cas IP non resolue)
      if (Math.abs(data.latitude) < 0.5 && Math.abs(data.longitude) < 0.5) {
        console.warn("[GeoIP] Coordonnees = 0,0 (ocean) -> ignore");
        return null;
      }

      const result = {
        lat: data.latitude,
        lon: data.longitude,
        city: data.city || data.region || "Position detectee",
        country: data.country || "",
        region: data.region || "",
        timezone: data.timezone || "",
        source: "IP"
      };

      saveGeoIpCache(result);
      console.log("[GeoIP] Position detectee:", result.city, result.country, `(${result.lat.toFixed(2)},${result.lon.toFixed(2)})`);
      return result;
    } catch (e) {
      if (e.name === "AbortError") {
        console.warn("[GeoIP] Timeout (>4s)");
      } else {
        console.warn("[GeoIP] Erreur:", e.message || e);
      }
      return null;
    } finally {
      geoIpInFlight = null;
    }
  })();

  return geoIpInFlight;
}

// Expose au reste de l'app
window.GeoIpModule = {
  tryIpGeolocation,
  GEO_IP_TIMEOUT_MS
};
