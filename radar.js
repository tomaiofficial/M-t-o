// ============================================================
//  RADAR — RainViewer integration pour detection precipitation
//  temps reel (latence 5-10 min vs 5-15 min pour Open-Meteo).
//  Gratuit, sans cle API, CORS autorise.
//  https://www.rainviewer.com/api/weather-maps-api.html
// ============================================================

// URL du manifest JSON listant les frames radar disponibles
const RADAR_META_URL = "https://api.rainviewer.com/public/weather-maps.json";

// Zoom optimal : 9 = tuile d'environ 5km (assez fin pour ville/quartier)
const RADAR_TILE_ZOOM = 9;

// Intervalle de re-verification : 5 min (le radar ne rafraichit pas plus vite)
const RADAR_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Rayon d'echantillonnage autour de la position (3x3 = 9 pixels par tuile)
const RADAR_SAMPLE_RADIUS = 1;

// Palette Universal Blue de RainViewer (scheme 1) - couleurs par intensite.
// On cherche la couleur la plus proche du pixel echantillonne.
// Source : https://www.rainviewer.com/api/color-schemes.html
const RADAR_COLORS = [
  { r: 0,   g: 0,   b: 0,   a: 0,   dbz: 0,  mmh: 0    }, // transparent (pas de pluie)
  { r: 3,   g: 159, b: 247, a: 200, dbz: 5,  mmh: 0.05 }, // bleu tres clair (bruine)
  { r: 2,   g: 136, b: 230, a: 220, dbz: 10, mmh: 0.2  }, // bleu clair
  { r: 2,   g: 113, b: 213, a: 220, dbz: 15, mmh: 0.5  },
  { r: 1,   g: 90,  b: 197, a: 220, dbz: 20, mmh: 1.0  }, // bleu moyen (pluie)
  { r: 0,   g: 65,  b: 180, a: 220, dbz: 25, mmh: 2.5  },
  { r: 78,  g: 187, b: 33,  a: 220, dbz: 30, mmh: 6.0  }, // vert (pluie forte)
  { r: 244, g: 191, b: 0,   a: 220, dbz: 35, mmh: 12.0 }, // jaune
  { r: 245, g: 145, b: 0,   a: 220, dbz: 40, mmh: 25.0 }, // orange
  { r: 240, g: 90,  b: 0,   a: 220, dbz: 45, mmh: 50.0 }, // rouge (tres forte)
  { r: 215, g: 25,  b: 28,  a: 220, dbz: 50, mmh: 90.0 },
  { r: 165, g: 0,   b: 33,  a: 220, dbz: 55, mmh: 150.0 },
  { r: 100, g: 0,   b: 33,  a: 220, dbz: 60, mmh: 250.0 }
];

// Cache pour eviter de re-fetcher le manifest a chaque appel
let radarMetaCache = null;
let radarMetaCachedAt = 0;
const RADAR_META_TTL_MS = 10 * 60 * 1000; // 10 min (le manifest change peu)

// Canvas de decodage des tuiles (reutilise entre les appels)
let radarDecodeCanvas = null;
let radarDecodeCtx = null;

function ensureRadarCanvas() {
  if (!radarDecodeCanvas) {
    radarDecodeCanvas = document.createElement("canvas");
    radarDecodeCanvas.width = 256;
    radarDecodeCanvas.height = 256;
    radarDecodeCtx = radarDecodeCanvas.getContext("2d", { willReadFrequently: true });
  }
}

// Convertit (lat, lon) en coordonnees de tuile + position pixel dans la tuile.
// Formule standard Web Mercator (EPSG:3857 / Slippy Map Tilenames).
function latLonToTilePixel(lat, lon, z) {
  const n = Math.pow(2, z);
  const xf = (lon + 180) / 360 * n;
  const latRad = lat * Math.PI / 180;
  const yf = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
  const tileX = Math.floor(xf);
  const tileY = Math.floor(yf);
  const pixelX = Math.floor((xf - tileX) * 256);
  const pixelY = Math.floor((yf - tileY) * 256);
  return { tileX, tileY, pixelX, pixelY };
}

// Trouve la couleur Radar la plus proche (distance euclidienne RGB).
// Ignore les pixels transparents (a < 30) -> pas de pluie.
function pixelToDbz(r, g, b, a) {
  if (a < 30) return 0; // pixel transparent = pas de pluie
  let bestIdx = 0;
  let minDist = Infinity;
  // On compare seulement avec les couleurs "pluie" (index 1+)
  for (let i = 1; i < RADAR_COLORS.length; i++) {
    const c = RADAR_COLORS[i];
    const dr = r - c.r, dg = g - c.g, db = b - c.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < minDist) {
      minDist = dist;
      bestIdx = i;
    }
  }
  return RADAR_COLORS[bestIdx].dbz;
}

// Recupere le manifest JSON des frames radar (avec cache 10 min)
async function getRadarMeta() {
  const now = Date.now();
  if (radarMetaCache && now - radarMetaCachedAt < RADAR_META_TTL_MS) {
    return radarMetaCache;
  }
  const res = await fetch(RADAR_META_URL);
  if (!res.ok) throw new Error(`Radar meta HTTP ${res.status}`);
  const data = await res.json();
  radarMetaCache = data;
  radarMetaCachedAt = now;
  return data;
}

// Echantillonne la precipitation a (lat, lon).
// Retourne { mmHour, dbz, hasRain, sourceTime, latencyMs } ou null si erreur.
async function sampleRadarAt(lat, lon) {
  try {
    const meta = await getRadarMeta();
    // Frame la plus recente (past frame la plus recente)
    const past = meta && meta.radar && meta.radar.past;
    if (!past || !past.length) return null;
    const latest = past[past.length - 1];
    if (!latest || !latest.path || !meta.host) return null;

    const z = RADAR_TILE_ZOOM;
    const { tileX, tileY, pixelX, pixelY } = latLonToTilePixel(lat, lon, z);

    // Validation : la tuile existe dans la grille
    const maxTile = Math.pow(2, z);
    if (tileX < 0 || tileX >= maxTile || tileY < 0 || tileY >= maxTile) return null;

    // URL de la tuile radar (scheme 1 = Universal Blue, options 1_1 = smooth + snow)
    const tileUrl = `${meta.host}${latest.path}/256/${z}/${tileX}/${tileY}/1/1_1.png`;
    const res = await fetch(tileUrl);
    if (!res.ok) return null;
    const blob = await res.blob();

    ensureRadarCanvas();
    const bitmap = await createImageBitmap(blob);
    radarDecodeCtx.clearRect(0, 0, 256, 256);
    radarDecodeCtx.drawImage(bitmap, 0, 0, 256, 256);
    if (bitmap.close) bitmap.close();

    // Echantillonne une fenetre 3x3 autour du pixel central
    // (le radar peut etre en bordure de cellule, on moyenne)
    const r = RADAR_SAMPLE_RADIUS;
    const x0 = Math.max(0, pixelX - r);
    const y0 = Math.max(0, pixelY - r);
    const x1 = Math.min(256, pixelX + r + 1);
    const y1 = Math.min(256, pixelY + r + 1);
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return null;
    const data = radarDecodeCtx.getImageData(x0, y0, w, h).data;

    let totalColoredPixels = 0;
    let maxDbz = 0;
    let sumDbz = 0;
    const totalPixels = w * h;
    for (let i = 0; i < data.length; i += 4) {
      const dbz = pixelToDbz(data[i], data[i + 1], data[i + 2], data[i + 3]);
      if (dbz > 0) {
        totalColoredPixels++;
        sumDbz += dbz;
        if (dbz > maxDbz) maxDbz = dbz;
      }
    }

    // Conversion dBZ -> mm/h via relation Marshall-Palmer simplifiee
    // R = ((10^(dBZ/10)) / 200) ^ (1/1.6)
    let mmHour = 0;
    if (maxDbz > 0) {
      const z = Math.pow(10, maxDbz / 10);
      const r = Math.pow(z / 200, 1 / 1.6);
      mmHour = r;
    }

    const hasRain = totalColoredPixels > 0;
    const sourceTimeMs = latest.time * 1000;
    return {
      mmHour,
      dbz: maxDbz,
      coloredPixels: totalColoredPixels,
      totalPixels,
      hasRain,
      sourceTime: sourceTimeMs,
      latencyMs: Date.now() - sourceTimeMs
    };
  } catch (e) {
    console.warn("[Radar] sample failed:", e.message || e);
    return null;
  }
}

// Verifie si une coordonnee (lat, lon) est dans un cache de tuile adjacent.
// RainViewer couvre le monde entier donc generalement OK, mais on evite
// de tomber sur une tuile ocean/limite en bordure de zoom.
function tileLooksValid(meta, tileX, tileY, z) {
  if (!meta || !meta.host) return false;
  const maxTile = Math.pow(2, z);
  return tileX >= 0 && tileX < maxTile && tileY >= 0 && tileY < maxTile;
}

// Convertit une intensite radar en code WMO approximatif.
// Permet d'override la condition affichee par l'app.
function radarIntensityToWmo(precip) {
  if (!precip || !precip.hasRain) return 0; // pas de pluie
  if (precip.dbz >= 45) return 95;          // orages (rouge)
  if (precip.dbz >= 35) return 82;          // averses fortes
  if (precip.dbz >= 25) return 65;          // pluie forte
  if (precip.dbz >= 15) return 63;          // pluie moderee
  return 51;                                // bruine / pluie legere
}

// Expose au reste de l'app
window.RadarModule = {
  sampleRadarAt,
  radarIntensityToWmo,
  RADAR_CHECK_INTERVAL_MS
};
