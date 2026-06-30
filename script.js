// ============================================================
//  Météo - Application météo style Apple Weather
//  Géolocalisation auto, descriptions IA, auto-refresh
// ============================================================

// ===== WMO codes (style Apple Weather) =====
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

// Libellés de référence (Apple-Weather-like) : vocabulaire étendu pour
// affichage spécialisé si besoin futur (description courte, tooltip, etc.)
const WEATHER_LABELS = [
  "Temps clair","Ciel dégagé","Ensoleillé","Plutôt ensoleillé",
  "Belles éclaircies","Éclaircies","Partiellement nuageux",
  "Nuages prédominants","Nuageux","Très nuageux","Ciel couvert",
  "Couvert","Brumeux","Brouillard","Grisaille",
  "Pluie faible","Pluie","Pluie modérée","Fortes pluies",
  "Averses","Averses éparses","Averses fréquentes","Risque d'averses",
  "Orages","Orages isolés","Orages avec pluie","Orages violents",
  "Neige faible","Neige","Fortes chutes de neige","Averses de neige",
  "Pluie et neige mêlées","Verglas","Givre",
  "Vent fort","Rafales de vent","Tempête"
];

// ===== State =====
const state = {
  city: null,
  unit: "C",
  lastWeather: null,
  lastRefreshMs: 0,
  favorites: [],
  // Compteur de requetes : chaque appel l'incremente. Les requetes obsoletes
  // detectent un mismatch et s'arretent immediatement (meme sans AbortController).
  requestId: 0,
  // Controller courant pour annuler les requetes reseau de l'ancienne ville.
  currentFetchController: null
};

// Bloquer le zoom par double tap, pinch, et copier/coller sur mobile
// MAIS pas sur les inputs (sinon impossible de taper)
function isInEditable(e) {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}
document.addEventListener("gesturestart", e => { if (!isInEditable(e)) e.preventDefault(); });
document.addEventListener("gesturechange", e => { if (!isInEditable(e)) e.preventDefault(); });
document.addEventListener("gestureend", e => { if (!isInEditable(e)) e.preventDefault(); });
// Bloquer le copier coller sur le body (sauf dans les inputs)
document.addEventListener("copy", e => {
  if (!isInEditable(e)) e.preventDefault();
});
document.addEventListener("cut", e => {
  if (!isInEditable(e)) e.preventDefault();
});
document.addEventListener("paste", e => {
  if (!isInEditable(e)) e.preventDefault();
});
// Forcer le focus sur l'input de recherche quand l'overlay s'ouvre (mobile)
function focusSearchInput() {
  setTimeout(() => {
    const inp = $("searchInput");
    if (inp) {
      inp.removeAttribute("readonly");
      inp.focus({ preventScroll: false });
    }
  }, 50);
}
const LS_KEY = "meteo_v5";

// ===== Helpers =====
const $ = id => document.getElementById(id);
const app = $("app");

// ============================================================
//  DRAG SCROLL : permet le scroll horizontal à la souris (PC)
// ============================================================
function initDragScroll(el) {
  if (!el) return;
  let isDown = false;
  let startX = 0;
  let scrollLeftStart = 0;
  let moved = false;

  el.addEventListener("mousedown", (e) => {
    // Ignorer si click sur un enfant interactif
    if (e.target.closest("button, a, input, .interactive")) return;
    isDown = true;
    moved = false;
    el.classList.add("dragging");
    startX = e.pageX - el.offsetLeft;
    scrollLeftStart = el.scrollLeft;
    e.preventDefault();
  });

  el.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startX) * 1.5;
    if (Math.abs(walk) > 5) moved = true;
    el.scrollLeft = scrollLeftStart - walk;
  });

  const stop = () => {
    isDown = false;
    el.classList.remove("dragging");
  };
  el.addEventListener("mouseleave", stop);
  el.addEventListener("mouseup", stop);

  // Empêcher les liens/boutons à l'intérieur d'être cliqués après drag
  el.addEventListener("click", (e) => {
    if (moved) {
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    }
  }, true);
}

// ============================================================
//  CANVAS PARTICLE SYSTEM — 60 FPS rain/snow/stars
// ============================================================
const bgCanvas = $("bgCanvas");
const bgCtx = bgCanvas.getContext("2d");
let particles = [];
let particleType = "none";
let particleRAF = null;

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  bgCanvas.width = window.innerWidth * dpr;
  bgCanvas.height = window.innerHeight * dpr;
  bgCanvas.style.width = window.innerWidth + "px";
  bgCanvas.style.height = window.innerHeight + "px";
  bgCtx.scale(dpr, dpr);
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
  const w = window.innerWidth;
  const h = window.innerHeight;
  bgCtx.clearRect(0, 0, w, h);

  if (particleType === "rain") {
    bgCtx.lineWidth = 1.2;
    for (const p of particles) {
      bgCtx.strokeStyle = `rgba(180,210,240,${p.opacity})`;
      bgCtx.beginPath();
      bgCtx.moveTo(p.x, p.y);
      bgCtx.lineTo(p.x + p.windX * 2, p.y + p.len);
      bgCtx.stroke();
      p.y += p.speed;
      p.x += p.windX;
      if (p.y > h) { p.y = -p.len; p.x = Math.random() * w; }
      if (p.x < -20) p.x = w + 20;
    }
  } else if (particleType === "snow") {
    for (const p of particles) {
      bgCtx.fillStyle = `rgba(255,255,255,${p.opacity})`;
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      bgCtx.fill();
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
      bgCtx.fillStyle = `rgba(255,255,255,${Math.max(0.1, alpha)})`;
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      bgCtx.fill();
      // Subtle glow for brighter stars
      if (p.r > 1.2) {
        bgCtx.fillStyle = `rgba(200,210,240,${Math.max(0.05, alpha * 0.3)})`;
        bgCtx.beginPath();
        bgCtx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
        bgCtx.fill();
      }
    }
  }

  particleRAF = requestAnimationFrame(animateParticles);
}

function setParticleType(type) {
  if (type === particleType) return;
  if (particleRAF) { cancelAnimationFrame(particleRAF); particleRAF = null; }
  const w = window.innerWidth;
  const h = window.innerHeight;
  bgCtx.clearRect(0, 0, w, h);
  if (type === "none") { particles = []; return; }
  initParticles(type);
  animateParticles();
}

window.addEventListener("resize", () => {
  resizeCanvas();
  if (particleType !== "none") initParticles(particleType);
});
resizeCanvas();

function wmoInfo(code, isNight) {
  const c = WMO[code] || { label: "—", icon: "apple-cloudy" };
  return { label: c.label, icon: isNight && c.night ? c.night : c.icon };
}

function icon(name, size) {
  return `<svg class="wicon" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><use href="#${name}"/></svg>`;
}

function fmtTemp(c) {
  if (c == null || isNaN(c)) return "—";
  if (state.unit === "F") return `${Math.round(c * 9/5 + 32)}°`;
  return `${Math.round(c)}°`;
}

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
  const t = getMinutesFromISO(iso);
  if (t) return t;
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function fmtHourLabel(iso) {
  const h = getHourFromISO(iso);
  return h != null ? `${h}h` : "—";
}

function degToCompass(deg) {
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  return dirs[Math.round(deg / 45) % 8];
}

function dayName(dateStr, idx) {
  if (idx === 0) return "Auj.";
  if (idx === 1) return "Dem.";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
}

// Type de précipitation selon le code météo
function getPrecipLabel(code) {
  if ([71,73,75,77,85,86].includes(code)) return "neige";
  if ([95,96,99].includes(code)) return "orage";
  if ([56,57,66,67].includes(code)) return "verglas";
  if ([51,53,55,61,63,65,80,81,82].includes(code)) return "pluie";
  return "pluie"; // par défaut
}

// ============================================================
//  Day/Night cycle : basé sur sunrise/sunset réels de l'API
//  Fonction centrale utilisée par TOUT : icônes, fond, animations
// ============================================================
let dayCycleCache = null;

/**
 * Fonction centrale : détermine si une heure donnée est de JOUR ou de NUIT
 * en utilisant les données sunrise/sunset de l'API pour CETTE date précise.
 * @param {string} isoTime - timestamp ISO de l'heure à tester
 * @param {object} daily - {sunrise:[], sunset:[]} de l'API
 * @returns {boolean} true = jour, false = nuit
 */
function isDaytime(isoTime, daily) {
  if (!daily || !daily.sunrise || !daily.sunset || daily.sunrise.length === 0) {
    // Fallback heuristique : jour entre 6h et 21h
    const m = (isoTime || "").match(/T(\d{2})/);
    const h = m ? parseInt(m[1], 10) : 12;
    return h >= 6 && h < 21;
  }

  const timeMs = new Date(isoTime).getTime();
  if (isNaN(timeMs)) return true;

  // Trouver le jour calendaire de cette heure :
  // Le jour J est celui dont le sunriseMs est <= timeMs et le sunriseMs
  // du jour suivant est > timeMs
  let dayIndex = 0;
  for (let i = 0; i < daily.sunrise.length; i++) {
    const sunriseMs = new Date(daily.sunrise[i]).getTime();
    // L'heure timeMs est dans le jour J si :
    //   timeMs >= sunriseMs de J ET (c'est le dernier jour OU timeMs < sunriseMs de J+1)
    // Pour le dernier jour de la liste, on suppose que le jour suivant existe
    // avec sunrise = sunriseMs + 24h
    if (timeMs >= sunriseMs) {
      if (i === daily.sunrise.length - 1) {
        // Dernier jour : accepter (au-delà, on garde la dernière valeur)
        dayIndex = i;
        break;
      }
      const nextSunriseMs = new Date(daily.sunrise[i + 1]).getTime();
      if (timeMs < nextSunriseMs) {
        dayIndex = i;
        break;
      }
    }
  }

  const sunriseMs = new Date(daily.sunrise[dayIndex]).getTime();
  const sunsetMs = new Date(daily.sunset[dayIndex]).getTime();

  // JOUR strict = heure >= sunrise ET heure < sunset
  // NUIT = heure < sunrise OU heure >= sunset
  return timeMs >= sunriseMs && timeMs < sunsetMs;
}

function isHourAtNight(isoHour, daily) {
  return !isDaytime(isoHour, daily);
}

/**
 * Détermine la phase actuelle du jour (dawn/day/dusk/night) avec marges
 * de crépuscule pour le FOND visuellement progressif.
 * Utilise les données sunrise/sunset de l'API.
 */
function getDayCycleInfo(cur, daily) {
  let sunriseStr = daily && daily.sunrise && daily.sunrise[0];
  let sunsetStr = daily && daily.sunset && daily.sunset[0];

  const now = cur && cur.time ? new Date(cur.time) : new Date();
  const nowMs = now.getTime();

  let sunriseMs = sunriseStr ? new Date(sunriseStr).getTime() : null;
  let sunsetMs = sunsetStr ? new Date(sunsetStr).getTime() : null;

  let isNight;
  let phase;

  if (sunriseMs == null || sunsetMs == null) {
    const h = now.getHours();
    isNight = h >= 21 || h < 6;
    phase = isNight ? "night" : "day";
  } else {
    // Marges crépuscule : 30 min avant lever (aube) / 30 min après coucher (crépuscule)
    const dawnMs = sunriseMs - 30 * 60 * 1000;
    const duskMs = sunsetMs + 30 * 60 * 1000;

    if (nowMs < dawnMs) {
      isNight = true;
      phase = "night";
    } else if (nowMs < sunriseMs) {
      isNight = false;
      phase = "dawn";
    } else if (nowMs < duskMs && nowMs >= sunsetMs) {
      isNight = false;
      phase = "dusk";
    } else if (nowMs >= duskMs) {
      isNight = true;
      phase = "night";
    } else {
      isNight = false;
      phase = "day";
    }
  }

  // Calcul sunProgress : 0 = lever, 1 = coucher, intermediate = position du soleil
  let sunProgress = 0.5;
  if (sunriseMs != null && sunsetMs != null && sunriseMs < sunsetMs) {
    if (nowMs <= sunriseMs) sunProgress = 0;
    else if (nowMs >= sunsetMs) sunProgress = 1;
    else sunProgress = (nowMs - sunriseMs) / (sunsetMs - sunriseMs);
  }

  dayCycleCache = { isNight, phase, sunriseMs, sunsetMs, nowMs, sunProgress };
  return dayCycleCache;
}

// ===== Theme =====
function themeFor(code, dayCycle, windSpeed) {
  const isNight = dayCycle.isNight;
  const phase = dayCycle.phase;
  const isWindy = (windSpeed || 0) > 25;

  // Météo prioritaire : storm, snow, rain, fog masquent le cycle jour/nuit
  if ([95,96,99].includes(code)) return "theme-storm";
  if (isWindy && [0,1,2,3].includes(code)) return "theme-windy";
  if ([71,73,75,77,85,86].includes(code)) return "theme-snow";
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return "theme-rain";
  if ([45,48].includes(code)) return "theme-fog";

  // Pour les autres conditions, respecter le cycle jour/nuit
  if (isNight) return "theme-night-clear";
  if (phase === "dawn") return "theme-dawn";
  if (phase === "dusk") return "theme-dusk";

  if (code === 2) return "theme-partly-cloudy";
  if (code === 3) return "theme-cloudy";
  if (code === 0 || code === 1) return "theme-day-clear";
  return "theme-day-clear";
}

// ============================================================
//  Description dynamique Apple-Weather-like
//  Texte entièrement basé sur l'heure locale réelle + sunrise/sunset
// ============================================================

/**
 * Détermine le moment de la journée avec une expression française naturelle.
 * Utilise sunrise/sunset réels + plages horaires pour la cohérence.
 * Retourne { key, label } où key est utilisé pour les décisions logiques
 * et label est l'expression française naturelle.
 */
function getTimePeriod(nowMs, sunriseMs, sunsetMs) {
  const now = new Date(nowMs);
  const h = now.getHours();
  const hasSun = sunriseMs != null && sunsetMs != null;

  // 1. Plages strictes d'abord (selon les règles)
  // 00:00 - 04:59 : nuit
  if (h < 5) {
    return { key: "nuit", label: "cette nuit", article: "cette" };
  }

  // 5h-11h59 : matin (mais ajusté si on est avant le lever)
  if (h >= 5 && h < 12) {
    if (hasSun && nowMs < sunriseMs) {
      // Avant le lever du soleil
      return { key: "fin_nuit", label: "en fin de nuit", article: "en" };
    }
    if (h < 9) {
      return { key: "matin_tot", label: "tôt ce matin", article: "ce" };
    }
    if (h < 11) {
      return { key: "matin", label: "ce matin", article: "ce" };
    }
    // 11h-11h59 : en matinée
    return { key: "matinee", label: "en matinée", article: "en" };
  }

  // 12h-17h59 : après-midi
  if (h >= 12 && h < 18) {
    if (h < 14) {
      return { key: "debut_aprem", label: "en début d'après-midi", article: "en" };
    }
    return { key: "aprem", label: "cet après-midi", article: "cet" };
  }

  // 18h jusqu'au coucher du soleil : fin de journée / soirée
  if (h >= 18 && h < 22) {
    if (hasSun && nowMs >= sunsetMs) {
      // Déjà après le coucher → bascule sur "ce soir"
      if (h < 21) {
        return { key: "soir", label: "ce soir", article: "ce" };
      }
      return { key: "nuit", label: "cette nuit", article: "cette" };
    }
    // 18h-sunset : fin de journée
    if (h < 20) {
      return { key: "fin_journee", label: "en cette fin de journée", article: "en" };
    }
    // 20h-sunset : soirée
    return { key: "soiree", label: "en soirée", article: "en" };
  }

  // 22h-23h59 : nuit
  return { key: "nuit", label: "cette nuit", article: "cette" };
}

/**
 * Trouve la température minimale/maximale des prochaines heures
 * pour donner une évolution naturelle.
 */
function findTempEvolution(hourly, nowMs) {
  if (!hourly || !hourly.temperature_2m) return null;
  // Cherche la température extrême (min ou max) dans les 12 prochaines heures
  let extremeIdx = 0;
  let extremeVal = hourly.temperature_2m[0];
  let extremeType = "min"; // "min" ou "max"
  for (let i = 0; i < Math.min(12, hourly.temperature_2m.length); i++) {
    if (hourly.temperature_2m[i] < extremeVal) {
      extremeVal = hourly.temperature_2m[i];
      extremeIdx = i;
      extremeType = "min";
    }
  }
  let minVal = hourly.temperature_2m[0], maxVal = hourly.temperature_2m[0];
  for (let i = 0; i < Math.min(12, hourly.temperature_2m.length); i++) {
    if (hourly.temperature_2m[i] < minVal) minVal = hourly.temperature_2m[i];
    if (hourly.temperature_2m[i] > maxVal) maxVal = hourly.temperature_2m[i];
  }
  return {
    min: minVal,
    minHour: hourly.time && hourly.time[0] ? new Date(hourly.time[0]) : null,
    max: maxVal,
    maxHour: hourly.time && hourly.time[0] ? new Date(hourly.time[0]) : null
  };
}

function generateDescription(w) {
  const cur = w.current;
  const daily = w.daily;
  const hourly = w.hourly;
  const code = cur.weather_code;
  const dayCycle = getDayCycleInfo(cur, daily);

  const sunriseMs = dayCycle.sunriseMs;
  const sunsetMs = dayCycle.sunsetMs;
  const nowMs = dayCycle.nowMs;
  const now = new Date(nowMs);
  const h = now.getHours();

  // ============== Déterminer le moment de la journée ==============
  const period = getTimePeriod(nowMs, sunriseMs, sunsetMs);

  // ============== Calculer l'évolution des températures ==============
  const tempEvo = findTempEvolution(hourly, nowMs);
  const curT = cur.temperature_2m;
  const feels = cur.apparent_temperature;
  const feelsDiff = Math.abs(feels - curT);

  // ============== Tendance à court terme ==============
  let tempTrend = "stable";
  if (hourly && hourly.temperature_2m) {
    const t3 = hourly.temperature_2m[3];
    if (t3 != null) {
      if (t3 > curT + 2) tempTrend = "hausse";
      else if (t3 < curT - 2) tempTrend = "baisse";
    }
  }

  // ============== Vent ==============
  const wind = Math.round(cur.wind_speed_10m || 0);
  const dirTxt = cur.wind_direction_10m != null ? ` ${degToCompass(cur.wind_direction_10m)}` : "";

  // ============== Construction des phrases ==============
  const sentences = [];

  // ---- Phrase 1 : condition + moment de la journée ----
  sentences.push(buildConditionSentence(code, period, h));

  // ---- Phrase 2 : température actuelle + ressenti si notable ----
  sentences.push(buildTempCurrentSentence(curT, feels, feelsDiff));

  // ---- Phrase 3 : évolution des températures (si différente) ----
  const evoSentence = buildEvolutionSentence(curT, tempEvo, period, tempTrend);
  if (evoSentence) sentences.push(evoSentence);

  // ---- Phrase 4 : vent si significatif ----
  const windSentence = buildWindSentence(wind, dirTxt, period);
  if (windSentence) sentences.push(windSentence);

  // ---- Phrase 5 : UV si élevé en journée ----
  if (period.key !== "nuit" && period.key !== "fin_nuit" && daily.uv_index_max) {
    const uv = daily.uv_index_max[0];
    if (uv >= 7) {
      sentences.push(`Indice UV ${uv >= 8 ? "très" : ""} élevé, ${uv >= 8 ? "protégez-vous" : "lunettes recommandées"}.`);
    }
  }

  // ---- Phrase 6 : visibilité pour brouillard ----
  if ([45, 48].includes(code)) {
    sentences.push("Visibilité très réduite, prudence sur la route.");
  }

  return sentences.join(" ");
}

function buildConditionSentence(code, period, hour) {
  const isNight = period.key === "nuit" || period.key === "fin_nuit";
  const art = period.article;
  const lbl = period.label;

  // Libellé pour la phrase (issu de la liste de référence)
  const wmoLabel = (WMO[code] && WMO[code].label) || "Conditions variables";

  // Pluie actuelle
  if ([51, 53, 55].includes(code)) {
    if (isNight) return `${wmoLabel} ${lbl}.`;
    return `${wmoLabel} ${lbl}.`;
  }
  if ([56, 57].includes(code)) {
    if (isNight) return `${wmoLabel} ${lbl}, prudence accrue.`;
    return `${wmoLabel} ${lbl}, attention aux routes glissantes.`;
  }
  if (code === 61) {
    if (isNight) return `Pluie faible ${lbl}.`;
    return `Pluie faible ${lbl}.`;
  }
  if (code === 63 || code === 80 || code === 81) {
    if (isNight) return `Averses ${lbl}.`;
    return `Averses ${lbl}, ${wmoLabel.toLowerCase().includes("averse") ? "ponctuelles" : "à prévoir"}.`;
  }
  if (code === 65) {
    if (isNight) return `Fortes pluies ${lbl}, prudence sur la route.`;
    return `Fortes pluies ${lbl}, restez vigilant.`;
  }
  if (code === 82) {
    if (isNight) return `Violentes averses ${lbl}, prudence sur la route.`;
    return `Violentes averses ${lbl}.`;
  }
  if (code === 66 || code === 67) {
    if (isNight) return `Verglas ${lbl}, prudence accrue.`;
    return `Verglas ${lbl}, attention aux routes glissantes.`;
  }
  if ([95, 96].includes(code)) {
    if (isNight) return `Orages ${lbl}, restez à l'abri.`;
    return `Orages ${lbl}, restez prudent.`;
  }
  if (code === 99) {
    if (isNight) return `Orages violents ${lbl}, restez à l'abri.`;
    return `Orages violents ${lbl}, soyez très prudent.`;
  }
  if (code === 71) {
    if (isNight) return `Neige faible ${lbl}.`;
    return `Neige faible ${lbl},${hour >= 12 && hour < 18 ? " paysage hivernal" : " prudence"}.`;
  }
  if (code === 73) {
    if (isNight) return `Neige ${lbl}, attention sur les routes.`;
    return `Neige ${lbl}, prévoyez des vêtements chauds.`;
  }
  if (code === 75) {
    if (isNight) return `Fortes chutes de neige ${lbl}, restez prudent.`;
    return `Fortes chutes de neige ${lbl}, évitez les déplacements.`;
  }
  if (code === 77) {
    if (isNight) return `Grains de neige ${lbl}.`;
    return `Grains de neige ${lbl}, attention à la visibilité.`;
  }
  if ([85, 86].includes(code)) {
    if (isNight) return `Averses de neige ${lbl}.`;
    return `Averses de neige ${lbl},${hour >= 7 && hour < 20 ? " chaussées glissantes" : " prudence"}.`;
  }
  if (code === 45 || code === 48) {
    if (isNight) return `Brouillard ${lbl}, visibilité très réduite.`;
    return `Brouillard ${lbl}, visibilité réduite.`;
  }

  // Conditions calmes
  if (code === 0) {
    if (isNight) {
      return hour >= 1 && hour < 4
        ? `Nuit calme et dégagée.`
        : `Ciel dégagé ${lbl}, conditions idéales.`;
    }
    if (period.key === "matin" || period.key === "matin_tot") {
      return `Ciel dégagé ${lbl}, une belle journée s'annonce.`;
    }
    if (period.key === "matinee") {
      return `Ciel dégagé ${lbl}, profitez du soleil.`;
    }
    if (period.key === "aprem" || period.key === "debut_aprem") {
      return `Ciel dégagé ${lbl}, idéal pour sortir.`;
    }
    if (period.key === "fin_journee" || period.key === "soiree" || period.key === "soir") {
      return `Ciel dégagé ${lbl}.`;
    }
    return `Ciel dégagé ${lbl}.`;
  }

  if (code === 1) {
    if (isNight) return `Plutôt ensoleillé ${lbl}.`;
    if (period.key === "fin_journee" || period.key === "soiree" || period.key === "soir") {
      return `Plutôt ensoleillé ${lbl}.`;
    }
    if (period.key === "matin" || period.key === "matin_tot") {
      return `Plutôt ensoleillé ${lbl}, belle journée en perspective.`;
    }
    if (period.key === "matinee") return `Plutôt ensoleillé ${lbl}.`;
    return `Plutôt ensoleillé ${lbl}.`;
  }

  if (code === 2) {
    if (isNight) return `Éclaircies ${lbl}.`;
    if (period.key === "fin_journee") return `Belles éclaircies ${lbl}.`;
    if (period.key === "soiree") return `Éclaircies ${lbl}.`;
    if (period.key === "soir") return `Éclaircies ${lbl}.`;
    if (period.key === "matin" || period.key === "matin_tot") {
      return `Éclaircies ${lbl}, le soleil perce à travers les nuages.`;
    }
    return `Éclaircies ${lbl}.`;
  }

  if (code === 3) {
    if (isNight) return `Ciel couvert ${lbl}.`;
    if (period.key === "fin_journee") return `Ciel couvert ${lbl}, ambiance maussade.`;
    if (period.key === "soiree") return `Couvert ${lbl}.`;
    if (period.key === "soir") return `Couvert ${lbl}.`;
    if (period.key === "matin" || period.key === "matin_tot") {
      return `Couvert ${lbl}, ambiance grise au réveil.`;
    }
    return `Couvert ${lbl}.`;
  }

  return `${wmoLabel} ${lbl}.`;
}

function buildTempCurrentSentence(temp, feels, feelsDiff) {
  if (feelsDiff >= 5) {
    if (feels < temp) {
      return `Il fait actuellement ${fmtTemp(temp)} mais le ressenti est plus frais, ${fmtTemp(feels)}.`;
    } else {
      return `Il fait actuellement ${fmtTemp(temp)} avec un ressenti plus chaud, ${fmtTemp(feels)}.`;
    }
  }
  return `Il fait actuellement ${fmtTemp(temp)}.`;
}

function buildEvolutionSentence(curT, tempEvo, period, tempTrend) {
  if (!tempEvo) return "";

  // Pendant la journée (matin ou après-midi) : parler du max à venir
  if (period.key === "matin" || period.key === "matin_tot" || period.key === "matinee"
      || period.key === "debut_aprem") {
    if (tempEvo.max > curT + 2) {
      return `Les températures monteront progressivement vers ${fmtTemp(tempEvo.max)} ${period.key === "debut_aprem" ? "cet après-midi" : "au plus chaud de la journée"}.`;
    }
    return "";
  }

  // Fin d'après-midi / fin de journée : transition vers la soirée
  if (period.key === "aprem") {
    if (tempEvo.max > curT + 2) {
      return `Le pic de chaleur est attendu vers ${fmtTemp(tempEvo.max)} dans les prochaines heures.`;
    }
    return `Les températures vont commencer à baisser en fin de journée.`;
  }

  // Fin de journée (18h-sunset) : transition vers le soir
  if (period.key === "fin_journee") {
    if (tempEvo.min < curT - 2) {
      return `Les températures descendront progressivement vers ${fmtTemp(tempEvo.min)} ce soir.`;
    }
    return `Les températures vont se rafraîchir au fil des heures.`;
  }

  // Soirée (20h-sunset)
  if (period.key === "soiree") {
    if (tempEvo.min < curT - 2) {
      return `Les températures descendront progressivement vers ${fmtTemp(tempEvo.min)} cette nuit.`;
    }
    return `Les températures se maintiendront ${fmtTemp(tempEvo.min)} dans les prochaines heures.`;
  }

  // Soir (juste après le coucher, jusqu'à 22h)
  if (period.key === "soir") {
    if (tempEvo.min < curT - 2) {
      return `Les températures descendront progressivement vers ${fmtTemp(tempEvo.min)} cette nuit.`;
    }
    return `Les températures resteront stables ${fmtTemp(curT)} dans les prochaines heures.`;
  }

  // Nuit (après 22h) : continuer de baisser jusqu'à l'aube
  if (period.key === "nuit" || period.key === "fin_nuit") {
    if (tempEvo.min < curT - 2) {
      return `Les températures continueront de baisser jusqu'à ${fmtTemp(tempEvo.min)} à l'aube.`;
    }
    return `Les températures resteront stables ${fmtTemp(curT)} dans les prochaines heures.`;
  }

  return "";
}

function buildWindSentence(wind, dirTxt, period) {
  if (wind >= 50) {
    return `Vent très fort à ${wind} km/h${dirTxt}, attention aux chutes d'objets.`;
  }
  if (wind >= 30) {
    return `Vent fort à ${wind} km/h${dirTxt}.`;
  }
  if (wind >= 15) {
    return `Vent modéré à ${wind} km/h${dirTxt}.`;
  }
  // Vent faible : petite mention adaptée au moment
  if (wind > 0) {
    if (period.key === "nuit" || period.key === "fin_nuit") {
      return `Vent faible.`;
    }
    return `Brise légère à ${wind} km/h.`;
  }
  // Pas de vent
  if (period.key === "nuit" || period.key === "fin_nuit") {
    return `Vent nul, nuit calme.`;
  }
  return ``;
}

// ============================================================
//  API : Open-Meteo (gratuit, sans clé)
// ============================================================
async function fetchWeather(lat, lon, lite = false, signal = null) {
  const cur = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_gusts_10m,wind_direction_10m,dew_point_2m';
  // Wrapper qui passe le signal d'annulation automatiquement
  const f = (url) => fetch(url, signal ? { signal } : {});
  // lite = current + next 12h precip (pour detection pluie temps reel chaque minute)
  if (lite) {
    const liteHourly = 'precipitation_probability,precipitation,weather_code';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${cur}&hourly=${liteHourly}&forecast_hours=12&wind_speed_unit=kmh&timezone=auto`;
    const res = await f(url);
    if (!res.ok) throw new Error("API error lite");
    return res.json();
  }
  const hourly = 'temperature_2m,apparent_temperature,weather_code,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,cloud_cover,relative_humidity_2m,wind_direction_10m';
  const daily = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant';
  function isDailyComplete(d, minValid = 8) {
    if (!d || !d.daily || !d.daily.time || !d.daily.temperature_2m_max || !d.daily.temperature_2m_min) return false;
    let valid = 0;
    for (let i = 0; i < d.daily.time.length; i++) {
      if (d.daily.temperature_2m_max[i] != null && d.daily.temperature_2m_min[i] != null) valid++;
    }
    return valid >= minValid;
  }
  // Essai 1 : meteofrance_seamless 10 jours
  try {
    const url1 = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${cur}&hourly=${hourly}&daily=${daily}&wind_speed_unit=kmh&timezone=auto&forecast_days=10&models=meteofrance_seamless`;
    const r1 = await f(url1);
    if (r1.ok) {
      const d = await r1.json();
      if (d && d.current && d.current.temperature_2m != null) {
        if (!isDailyComplete(d, 8)) {
          try {
            const url1b = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${cur}&hourly=${hourly}&daily=${daily}&wind_speed_unit=kmh&timezone=auto&forecast_days=10`;
            const r1b = await f(url1b);
            if (r1b.ok) {
              const db = await r1b.json();
              if (isDailyComplete(db, 8)) {
                db.current = d.current;
                db.hourly = d.hourly;
                return db;
              }
            }
          } catch (e) {}
        }
        return d;
      }
    }
  } catch (e) { if (e.name === 'AbortError') throw e; /* continue */ }
  try {
    const url2 = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${cur}&hourly=${hourly}&daily=${daily}&wind_speed_unit=kmh&timezone=auto&forecast_days=10`;
    const r2 = await f(url2);
    if (r2.ok) {
      const d = await r2.json();
      if (d && d.current && d.current.temperature_2m != null) return d;
    }
  } catch (e) { if (e.name === 'AbortError') throw e; }
  try {
    const url3 = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${cur}&hourly=${hourly}&daily=${daily}&wind_speed_unit=kmh&timezone=auto&forecast_days=10&models=gfs_seamless`;
    const r3 = await f(url3);
    if (r3.ok) {
      const d = await r3.json();
      if (d && d.current && d.current.temperature_2m != null) return d;
    }
  } catch (e) { if (e.name === 'AbortError') throw e; }
  try {
    const url4 = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,is_day,precipitation,apparent_temperature&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&timezone=auto&forecast_days=10`;
    const r4 = await f(url4);
    if (r4.ok) {
      const d = await r4.json();
      if (d && d.current && d.current.temperature_2m != null) return d;
    }
  } catch (e) { if (e.name === 'AbortError') throw e; }
  throw new Error("API error: tous les modeles ont echoue");
}

// ============================================================
//  REFRESH ENGINE v2 - 60s live + interpolation + smart diffing
// ============================================================
const REFRESH_LIVE_MS = 60 * 1000;     // fetch live chaque 60s
const INTERPOLATE_MS = 1000;           // tick d'interpolation chaque seconde
const REFRESH_FORECAST_MS = 5 * 60 * 1000; // re-render forecast complet chaque 5 min

let prevLiveData = null;
let currLiveData = null;
let livePrecipHourly = null; // hourly precip rafraîchi chaque minute (lite fetch)
let lastFetchMs = 0;
let lastFullRenderMs = 0;
let interpTimerId = null;
let lastRainInfoMs = 0;
let lastRainInfo = null;
let liveRainBanner = null;
let pendingRainStartTime = null;  // for "Pluie dans X min" detection

// Cache des éléments hourly pour diffing intelligent
const hourlyCells = []; // [{ idx, elTime, elIcon, elPop, elTemp, isNight, isPopVisible }]

// Smart diffing helper : ne touche au DOM que si la valeur a change
function setText(elOrId, text) {
  const el = typeof elOrId === 'string' ? $(elOrId) : elOrId;
  if (!el) return;
  const newText = String(text);
  if (el.textContent !== newText) {
    el.textContent = newText;
  }
}

function setClass(elOrId, cls, on) {
  const el = typeof elOrId === 'string' ? $(elOrId) : elOrId;
  if (!el) return;
  const has = el.classList.contains(cls);
  if (on && !has) el.classList.add(cls);
  else if (!on && has) el.classList.remove(cls);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Interpolation de la meteo "current" entre deux fetches successifs
function computeInterpolatedCurrent(elapsedMs) {
  if (!currLiveData) return null;
  if (!prevLiveData || elapsedMs >= REFRESH_LIVE_MS) return currLiveData.current;
  const t = Math.max(0, Math.min(1, elapsedMs / REFRESH_LIVE_MS));
  const p = prevLiveData.current;
  const n = currLiveData.current;
  return {
    temperature_2m: lerp(p.temperature_2m ?? n.temperature_2m, n.temperature_2m, t),
    apparent_temperature: lerp(p.apparent_temperature ?? n.apparent_temperature, n.apparent_temperature, t),
    relative_humidity_2m: lerp(p.relative_humidity_2m ?? n.relative_humidity_2m, n.relative_humidity_2m, t),
    wind_speed_10m: lerp(p.wind_speed_10m ?? n.wind_speed_10m, n.wind_speed_10m, t),
    wind_gusts_10m: lerp(p.wind_gusts_10m ?? 0, n.wind_gusts_10m ?? 0, t),
    precipitation: lerp(p.precipitation ?? 0, n.precipitation ?? 0, t),
    rain: lerp(p.rain ?? 0, n.rain ?? 0, t),
    cloud_cover: lerp(p.cloud_cover ?? 0, n.cloud_cover ?? 0, t),
    dew_point_2m: lerp(p.dew_point_2m ?? n.dew_point_2m, n.dew_point_2m, t),
    surface_pressure: lerp(p.surface_pressure ?? n.surface_pressure, n.surface_pressure, t),
    pressure_msl: lerp(p.pressure_msl ?? n.pressure_msl, n.pressure_msl, t),
    weather_code: n.weather_code,
    is_day: n.is_day,
    wind_direction_10m: n.wind_direction_10m,
    visibility: lerp(p.visibility ?? n.visibility ?? 0, n.visibility ?? 0, t),
    snowfall: lerp(p.snowfall ?? 0, n.snowfall ?? 0, t),
    showers: lerp(p.showers ?? 0, n.showers ?? 0, t)
  };
}

// Detection avancee des precipitations
// Detection precipitations tres sensible : prend en compte WMO code ET mm reels.
// Priorite aux observations (current.precipitation > 0) qui surclassent le forecast.
function detectPrecipDetailed(hourly, currentTimeStr, lookaheadHours = 6, liveCurrent = null) {
  const result = {
    raining: false,
    starting: null,
    ending: null,
    inMinutes: -1,
    intensity: null, // 'crachin'|'legere'|'moderee'|'forte'|'violente'
    type: null,      // 'bruine'|'pluie'|'neige'|'grele'|'orage'|'verglas'|'neige_fondue'
    peakMm: 0,
    peakTime: null,
    peakType: null,
    peakIntensity: null,
    code: null,
    startedAgo: -1,
    endInMinutes: -1,
    // Observation temps reel (override si dispo)
    observedNow: false,
    observedMm: 0,
    observedType: null
  };
  if (!hourly || !hourly.time || !hourly.weather_code) return result;
  const curMs = currentTimeStr ? new Date(currentTimeStr).getTime() : Date.now();

  // WMO codes precipitation (toutes formes)
  const PRECIP = [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99,71,73,75,77,85,86];

  // ===== ETAPE 1 : Observation temps reel =====
  // Si current.precipitation > 0.05 mm/h, on considere qu'il pleut MAINTENANT.
  // Ce signal est plus fiable que le forecast pour la condition courante.
  if (liveCurrent && typeof liveCurrent.precipitation === 'number') {
    const mm = liveCurrent.precipitation;
    const snowMm = liveCurrent.snowfall || 0;
    const rainMm = liveCurrent.rain || 0;
    const showerMm = liveCurrent.showers || 0;
    if (mm > 0.05 || snowMm > 0 || rainMm > 0 || showerMm > 0) {
      result.observedNow = true;
      result.observedMm = mm;
      // Type par observation
      if (snowMm > 0.1 && mm < 0.1) {
        result.observedType = 'neige';
      } else if (liveCurrent.weather_code === 77) {
        result.observedType = 'grele';
      } else if (liveCurrent.weather_code >= 95 && liveCurrent.weather_code <= 99) {
        result.observedType = 'orage';
      } else if ([51, 53, 55, 56, 57].includes(liveCurrent.weather_code) || mm < 0.5) {
        result.observedType = 'bruine';
      } else {
        result.observedType = 'pluie';
      }
      // Intensite reelle
      if (mm < 0.3) result.intensity = 'crachin';
      else if (mm < 1) result.intensity = 'legere';
      else if (mm < 4) result.intensity = 'moderee';
      else if (mm < 8) result.intensity = 'forte';
      else result.intensity = 'violente';
      result.type = result.observedType;
      result.raining = true;
      result.starting = curMs; // il pleut maintenant
      result.startedAgo = 0;
      if (mm > result.peakMm) {
        result.peakMm = mm;
        result.peakTime = curMs;
        result.peakType = result.observedType;
        result.peakIntensity = result.intensity;
      }
    }
  }

  // ===== ETAPE 2 : Forecast prochaine fenetre =====
  let lastRaining = false;
  for (let i = 0; i < Math.min(lookaheadHours, hourly.time.length); i++) {
    const t = new Date(hourly.time[i]).getTime();
    // Pendant la premiere heure, le code WMO hourly reflete souvent
    // l'observation actuelle. On le skip si on a deja une observation.
    if (t < curMs + 30 * 60 * 1000) continue;
    const c = hourly.weather_code[i];
    const pop = (hourly.precipitation_probability && hourly.precipitation_probability[i]) || 0;
    const mm = (hourly.precipitation && hourly.precipitation[i]) || 0;
    // Detection amelioree : on inclut aussi PoP eleve (>=40%) meme si WMO != precip
    // car WMO code hourly peut etre en retard sur les micro-intensites.
    const isRaining = PRECIP.includes(c) || (pop >= 40 && mm >= 0.1);

    if (isRaining) {
      if (!result.raining || (result.raining && result.starting > t)) {
        // Si on observe deja de la pluie maintenant, on garde starting=curMs
        if (!result.observedNow) {
          result.raining = true;
          result.starting = t;
          result.inMinutes = Math.max(0, Math.round((t - curMs) / 60000));
          result.code = c;
        }
      }
      // Intensite : meme logique plus fine
      const isHeavy = [65, 82, 99].includes(c) || mm >= 4;
      const isModerate = [61, 63, 80, 81].includes(c) || mm >= 1;
      const isLight = [51, 53, 55, 80].includes(c) || mm >= 0.3;
      if (isHeavy) {
        if (result.intensity !== 'violente') result.intensity = 'forte';
      } else if (isModerate) {
        if (!['forte', 'violente'].includes(result.intensity)) result.intensity = 'moderee';
      } else if (isLight) {
        if (!result.intensity || ['crachin'].includes(result.intensity)) result.intensity = 'legere';
      }
      // Type : garde le plus severe rencontre
      const tp = codeToPrecipType(c);
      result.type = mergeType(result.type, tp);
      if (mm > result.peakMm) {
        result.peakMm = mm;
        result.peakTime = t;
        result.peakType = result.type;
        result.peakIntensity = result.intensity;
      }
    } else if (lastRaining && result.starting && !result.ending) {
      result.ending = t;
      result.endInMinutes = Math.round((t - curMs) / 60000);
    }
    lastRaining = isRaining;
  }
  return result;
}

// Fusion de types : garde le plus severe (orage > neige > verglas > forte_pluie > pluie > bruine)
function mergeType(a, b) {
  if (!a) return b;
  if (!b) return a;
  const rank = { orage: 6, grele: 5, neige: 4, verglas: 3, forte_pluie: 2.5, pluie: 2, bruine: 1, neige_fondue: 2 };
  return (rank[a] || 0) >= (rank[b] || 0) ? a : b;
}

function codeToPrecipType(code) {
  if ([95, 96, 99].includes(code)) return 'orage';
  if (code === 77) return 'grele';
  if ([71, 73, 75, 85, 86].includes(code)) return 'neige';
  if ([51, 53, 55].includes(code)) return 'bruine';
  if ([56, 57, 66, 67].includes(code)) return 'verglas';
  if ([65, 82].includes(code)) return 'forte_pluie';
  return 'pluie';
}

// Classifie la condition actuelle en fonction des observations temps reel.
// Priorite aux donnees observees sur le forecast WMO hourly.
function classifyLiveCondition(cur) {
  if (!cur) return null;
  const mm = cur.precipitation || 0;
  const snowMm = cur.snowfall || 0;
  const showerMm = cur.showers || 0;
  const rainMm = cur.rain || 0;
  const code = cur.weather_code;

  // Detection par observation directe (mm)
  if (snowMm > 0.1 && mm < 0.1) {
    if (snowMm >= 3) return { code: 75, label: 'Fortes chutes de neige', icon: 'snow-heavy', override: true };
    if (snowMm >= 1) return { code: 73, label: 'Neige modérée', icon: 'snow', override: true };
    return { code: 71, label: 'Neige faible', icon: 'snow', override: true };
  }
  if (code === 77) return { code: 77, label: 'Grêle', icon: 'hail', override: true };

  // Orage observe
  if (code >= 95 && code <= 99) {
    if (code === 99 || (mm >= 8)) return { code: 99, label: 'Orages violents', icon: 'thunder-storm', override: true };
    return { code: 95, label: 'Orages', icon: 'thunder', override: true };
  }

  // Pluie observee
  if (mm > 0.05 || rainMm > 0.05 || showerMm > 0.05) {
    if (mm >= 8 || showerMm >= 8) return { code: 82, label: 'Fortes averses', icon: 'rain-heavy', override: true };
    if (mm >= 4) return { code: 65, label: 'Fortes pluies', icon: 'rain-heavy', override: true };
    if (mm >= 1) {
      if (showerMm > rainMm) return { code: 81, label: 'Averses', icon: 'rain', override: true };
      return { code: 63, label: 'Pluie modérée', icon: 'rain', override: true };
    }
    if (mm >= 0.3) return { code: 61, label: 'Pluie faible', icon: 'rain', override: true };
    if (mm > 0.05) return { code: 51, label: 'Bruine', icon: 'drizzle', override: true };
  }
  return null;
}

// Tick live : recupere la meteo courante (pas le forecast) toutes les 60s
async function tickLive() {
  if (!state.city) return;
  const city = state.city;
  // Capture le requestId actuel : si switchCity est appele pendant le fetch,
  // le compteur change et on annule toutes les operations de cet ancien tick.
  const myRequestId = state.requestId;
  // Si un skeleton est affiche (switch en cours), ne rien faire : c'est
  // switchCity qui fera le render avec les donnees completes.
  if (document.body.classList.contains("loading")) return;
  try {
    const lite = await fetchWeather(city.lat, city.lon, true);
    // Verifie que la requete est toujours pertinente
    if (myRequestId !== state.requestId) return;
    if (!lite || !lite.current) return;

    prevLiveData = currLiveData;
    currLiveData = lite;
    lastFetchMs = Date.now();
    state.lastRefreshMs = lastFetchMs;

    // Synchronise state.lastWeather.current avec l'observation live
    // pour que generateDescription/condition voient toujours les dernieres donnees
    if (state.lastWeather) {
      state.lastWeather.current = lite.current;
    }

    // Stocke le hourly precip pour la detection pluie temps reel
    if (lite.hourly && lite.hourly.time && lite.hourly.precipitation_probability) {
      livePrecipHourly = lite.hourly;
    }

    // Premier fetch : full render
    if (!state.lastWeather || !lastFullRenderMs) {
      try {
        const full = await fetchWeather(city.lat, city.lon, false);
        if (myRequestId !== state.requestId) return;
        if (full && full.current) {
          state.lastWeather = full;
          renderCity(city, full);
          lastFullRenderMs = Date.now();
          state.lastRefreshMs = Date.now();
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
        if (myRequestId !== state.requestId) return;
        renderCity(city, lite); // fallback
      }
    }

    // Si pas de difference majeure, juste tick d'interpolation
    if (myRequestId === state.requestId) applyLiveTick();
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (myRequestId !== state.requestId) return;
    console.warn('tickLive failed:', e);
  }
  if (myRequestId === state.requestId) updateUpdatedAt();
}

// Tick d'interpolation (1s) : met a jour progressivement les valeurs actuelles
let interpDebounceMs = 0;
function applyLiveTick() {
  if (!currLiveData) return;
  const now = Date.now();
  const elapsed = now - lastFetchMs;
  const cur = computeInterpolatedCurrent(elapsed);
  if (!cur) return;

  // Temp + ressent
  setText('temp', fmtTemp(cur.temperature_2m));
  setText('feels', fmtTemp(cur.apparent_temperature));
  setText('feelsLbl', 'Ressenti');

  // Autres infos live : humidite, vent, rafales, precip, nuages, point de rosee, pression
  const hum = Math.round(cur.relative_humidity_2m);
  const wind = Math.round(cur.wind_speed_10m);
  const gust = Math.round(cur.wind_gusts_10m || 0);
  const clouds = Math.round(cur.cloud_cover);
  const dew = Math.round(cur.dew_point_2m);
  const press = Math.round(cur.surface_pressure || cur.pressure_msl);
  const mm = (cur.precipitation || 0).toFixed(1);

  setText('humidity', hum + '%');
  setText('windSpeed', wind);
  setText('windGusts', gust);
  setText('cloudCover', 'Nuages ' + clouds + '%');
  setText('dewPoint', 'Point de rosée ' + fmtTemp(dew));
  setText('pressure', press + ' hPa');
  setText('precipNow', mm + ' mm/h');

  // Rafales differentes du vent moyen : les afficher
  setClass('gustsRow', 'hidden', !(gust > wind + 5));

  // Direction du vent (uniquement si elle change significativement)
  const dirTxt = cur.wind_direction_10m != null ? ` ${degToCompass(cur.wind_direction_10m)}` : '';
  setText('windDir', dirTxt.trim());

  // ===== OVERRIDE CONDITION par observation temps reel =====
  // Si on observe de la pluie/bruine/neige actuellement, on met a jour
  // immediatement la condition affichee (sans attendre le forecast).
  const liveInfo = classifyLiveCondition(cur);
  if (liveInfo) {
    setText('condition', liveInfo.label);
    // Theme dynamique selon la nouvelle condition observee
    const dayCycle = state.lastWeather ? getDayCycleInfo(cur, state.lastWeather.daily) : { isNight: false };
    app.className = "app " + themeFor(liveInfo.code, dayCycle, cur.wind_speed_10m);
  } else if (state.lastWeather && state.lastWeather.current && state.lastWeather.current.weather_code !== cur.weather_code) {
    // Le code observe a change : on suit l'observation
    const dayCycle = getDayCycleInfo(cur, state.lastWeather.daily);
    const isNight = dayCycle.isNight;
    const info = wmoInfo(cur.weather_code, isNight);
    setText('condition', info.label);
    app.className = "app " + themeFor(cur.weather_code, dayCycle, cur.wind_speed_10m);
  }

  // Maj description generee si pluie observee ou changements majeurs
  if (state.lastWeather && (liveInfo || Math.abs((cur.precipitation || 0) - (prevLiveData?.current?.precipitation || 0)) > 0.5)) {
    const desc = generateDescription(state.lastWeather);
    setText('descText', desc);
  }

  // ===== UV live (mise a jour depuis forecast si dispo) =====
  if (state.lastWeather && state.lastWeather.daily && state.lastWeather.daily.uv_index_max) {
    const dayCycle = getDayCycleInfo(cur, state.lastWeather.daily);
    if (!dayCycle.isNight) {
      // Interpole UV entre celui d'il y a 1h et maintenant
      const sunProgress = dayCycle.sunProgress || 0;
      const uvMax = state.lastWeather.daily.uv_index_max[0] || 0;
      const uvCurrent = Math.max(0, uvMax * Math.sin(Math.PI * sunProgress));
      const uvText = uvCurrent.toFixed(1);
      if ($('uv').textContent !== uvText) {
        $('uv').textContent = uvText;
        const uvLabels = ["Faible","Faible","Faible","Modéré","Modéré","Modéré","Élevé","Élevé","Très élevé","Extrême","Extrême"];
        $('uvSub').textContent = uvLabels[Math.min(10, Math.round(uvCurrent))] || '—';
        $('uvBar').style.width = `${Math.min(100, uvCurrent * 10)}%`;
      }
    } else {
      // Nuit : UV = 0
      if ($('uv').textContent !== '0.0') {
        $('uv').textContent = '0.0';
        $('uvSub').textContent = 'Aucun (nuit)';
        $('uvBar').style.width = '0%';
      }
    }
  }

  // Detection pluie pour le bandeau d'alerte
  updateRainAlert();

  // Mettre a jour uniquement les % du hourly sans re-render complet
  applyHourlyInterpolation();
}

// Met a jour les % hourly avec interpolation
function applyHourlyInterpolation() {
  if (!state.lastWeather || !hourlyCells.length) return;
  // Priorite : livePrecipHourly (refresh chaque minute) > state.lastWeather.hourly
  const hourly = livePrecipHourly || (state.lastWeather && state.lastWeather.hourly);
  if (!hourly || !hourly.time) return;
  const now = Date.now();
  const REFR = REFRESH_LIVE_MS;

  hourlyCells.forEach(cell => {
    const i = cell.idx;
    if (!hourly.precipitation_probability || hourly.precipitation_probability[i] == null) return;
    const targetPop = hourly.precipitation_probability[i];
    const targetMm = (hourly.precipitation && hourly.precipitation[i]) || 0;
    const prevPop = prevLiveData && prevLiveData.hourly && prevLiveData.hourly.precipitation_probability
      ? (prevLiveData.hourly.precipitation_probability[i] ?? targetPop) : targetPop;
    const t = Math.min(1, (now - lastFetchMs) / REFR);
    const interpPop = lerp(prevPop, targetPop, t);
    // Seuil 1% : affiche des qu'il y a un risque
    const visible = interpPop >= 1;
    const txt = visible ? Math.round(interpPop) + '%' : '';
    // Intensite : heavy si pop>=70% OU mm>=4
    const heavy = interpPop >= 70 || targetMm >= 4;
    const medium = !heavy && (interpPop >= 30 || targetMm >= 1);
    const wantClass = visible ? (heavy ? ' heavy' : (medium ? ' medium' : '')) : ' empty';
    if (cell.elPop.textContent !== txt) cell.elPop.textContent = txt;
    if (wantClass !== cell.popClass) {
      cell.elPop.className = 'hour-pop' + wantClass;
      cell.popClass = wantClass;
      cell.isPopVisible = visible;
    }
  });
}

// Detection pluie en temps reel (bandeau alerte)
function updateRainAlert() {
  if (!state.lastWeather) return;
  // Priorite : livePrecipHourly (refresh chaque minute) > state.lastWeather.hourly
  const hourly = livePrecipHourly || state.lastWeather.hourly;
  if (!hourly) return;
  const now = Date.now();

  // Detection pas trop frequente (1s pour reactivite max)
  if (now - lastRainInfoMs < 1000) return;
  lastRainInfoMs = now;

  // Passe currLiveData.current en priorite pour les observations temps reel
  const liveCur = currLiveData && currLiveData.current ? currLiveData.current : null;
  const info = detectPrecipDetailed(hourly, state.lastWeather.current ? state.lastWeather.current.time : null, 6, liveCur);
  lastRainInfo = info;

  // Afficher le bandeau selon l'etat detecte
  const banner = $('rainBanner');
  if (!banner) return;

  let msg = '';
  const live = classifyLiveCondition(liveCur);
  if (live) {
    // Observation directe : "Pluie faible en ce moment."
    msg = `${live.label} en ce moment.`;
  } else if (info.raining && info.inMinutes > 0 && info.inMinutes <= 5) {
    msg = `Pluie dans ${info.inMinutes || "quelques"} min${info.intensity ? ` (${info.intensity})` : ''}.`;
  } else if (info.raining && info.inMinutes > 5 && info.inMinutes <= 60) {
    msg = `Pluie attendue dans ${info.inMinutes} min${info.intensity ? ` (${info.intensity})` : ''}.`;
  } else if (info.raining && info.peakMm >= 0.5) {
    msg = `Pluie en cours${info.intensity ? ` (${info.intensity})` : ''}.`;
  }

  if (msg) {
    if (banner.textContent !== msg) banner.textContent = msg;
    banner.classList.add('visible');
  } else {
    banner.classList.remove('visible');
  }
}

// Re-render complet du forecast (hourly + daily + description)
// Appele apres chaque fetch live pour les donnees de forecast
async function refreshForecastIfNeeded() {
  if (!state.city || !lastFullRenderMs) return;
  if (Date.now() - lastFullRenderMs < REFRESH_FORECAST_MS) return;
  // Ne pas resync si un changement de ville est en cours (skeleton actif)
  if (document.body.classList.contains("loading")) return;
  const myRequestId = state.requestId;
  try {
    const full = await fetchWeather(state.city.lat, state.city.lon, false);
    if (myRequestId !== state.requestId) return;
    if (full && full.current) {
      state.lastWeather = full;
      lastFullRenderMs = Date.now();
      renderCity(state.city, full);
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (myRequestId !== state.requestId) return;
    console.warn('Forecast refresh failed:', e);
  }
}

// Demarre la boucle d'interpolation
function startInterpolate() {
  if (interpTimerId) return;
  interpTimerId = setInterval(() => {
    if (!currLiveData) return;
    if (document.body.classList.contains("loading")) return;
    applyLiveTick();
    refreshForecastIfNeeded();
  }, INTERPOLATE_MS);
}

// ============================================================
//  Géolocalisation : Nominatim (OpenStreetMap)
// ============================================================
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=fr&zoom=12`,
      { headers: { "Accept": "application/json" } }
    );
    const data = await res.json();
    if (data && data.address) {
      const a = data.address;
      return a.city || a.town || a.village || a.municipality || a.suburb || a.county || a.state || a.country || "Position actuelle";
    }
  } catch (e) {
    console.warn("Reverse geocoding failed", e);
  }
  return "Position actuelle";
}

async function searchCities(q) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&accept-language=fr&addressdetails=1`,
      { headers: { "Accept": "application/json" } }
    );
    const data = await res.json();
    return data.map(r => ({
      name: (r.address && (r.address.city || r.address.town || r.address.village)) || r.display_name.split(",")[0],
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      region: [r.address && r.address.county, r.address && r.address.country].filter(Boolean).join(", ")
    }));
  } catch (e) {
    return [];
  }
}

// ============================================================
//  Render : Affichage des données météo
// ============================================================
function renderCity(city, w) {
  if (!w || !w.current) {
    console.error("Invalid weather data", w);
    return;
  }

  state.lastWeather = w;
  state.lastRefreshMs = Date.now();

  const cur = w.current;
  const daily = w.daily;
  const hourly = w.hourly;
  // Cycle jour/nuit basé sur sunrise/sunset réels (pas cur.is_day qui peut être imprécis)
  const dayCycle = getDayCycleInfo(cur, daily);
  const isNight = dayCycle.isNight;
  const code = cur.weather_code;
  const info = wmoInfo(code, isNight);

  // Theme
  app.className = "app " + themeFor(code, dayCycle, cur.wind_speed_10m);

  // Canvas particles based on weather
  if ([95,96,99].includes(code)) {
    setParticleType("rain"); // Storm = heavy rain particles
  } else if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) {
    setParticleType("rain");
  } else if ([71,73,75,77,85,86].includes(code)) {
    setParticleType("snow");
  } else if (isNight && [0,1,2].includes(code)) {
    setParticleType("stars");
  } else {
    setParticleType("none");
  }

  // Location
  $("cityName").textContent = city.name;
  $("temp").textContent = fmtTemp(cur.temperature_2m);
  $("condition").textContent = info.label;
  $("hilo").textContent = `H:${fmtTemp(daily.temperature_2m_max[0])}  L:${fmtTemp(daily.temperature_2m_min[0])}`;

  // Description IA
  $("descText").textContent = generateDescription(w);

  // ===== Hourly =====
  const $hourly = $("hourly");
  $hourly.innerHTML = "";
  hourlyCells.length = 0;

  const currentHour = getHourFromISO(cur.time);
  const nowIdx = currentHour != null
    ? hourly.time.findIndex(t => getHourFromISO(t) === currentHour)
    : 0;
  const startIdx = nowIdx >= 0 ? nowIdx : 0;

  for (let i = startIdx; i < Math.min(startIdx + 24, hourly.time.length); i++) {
    const h = document.createElement("div");
    h.className = "hour";
    const isNow = i === startIdx;
    const timeLabel = isNow ? "Maint." : fmtHourLabel(hourly.time[i]);
    const hHour = getHourFromISO(hourly.time[i]);
    // Pour "Maint.", utiliser les données current (réelles) au lieu de hourly (prévision)
    const hourCode = isNow ? cur.weather_code : hourly.weather_code[i];
    const hourTemp = isNow ? cur.temperature_2m : hourly.temperature_2m[i];
    const hourIsNight = isNow ? isNight : isHourAtNight(hourly.time[i], daily);
    const wi = wmoInfo(hourCode, hourIsNight);
    const pop = (hourly.precipitation_probability && hourly.precipitation_probability[i]) || 0;
    const mmHour = (hourly.precipitation && hourly.precipitation[i]) || 0;
    // Afficher les % a partir de 1% (avec code couleur d'intensite)
    const popVisible = pop >= 1;
    let popClass = '';
    if (pop >= 70 || mmHour >= 4) popClass = ' heavy';
    else if (pop >= 30 || mmHour >= 1) popClass = ' medium';
    h.innerHTML = `
      <div class="hour-time">${timeLabel}</div>
      <div class="hour-icon">${icon(wi.icon, 32)}</div>
      <div class="hour-pop${popVisible ? popClass : " empty"}">${popVisible ? Math.round(pop) + "%" : ""}</div>
      <div class="hour-temp">${fmtTemp(hourTemp)}</div>
    `;
    $hourly.appendChild(h);
    // Stocke les references DOM pour le diffing ulterieur
    hourlyCells.push({
      idx: i,
      root: h,
      elTime: h.querySelector(".hour-time"),
      elIcon: h.querySelector(".hour-icon"),
      elPop: h.querySelector(".hour-pop"),
      elTemp: h.querySelector(".hour-temp"),
      isNight: hourIsNight,
      isPopVisible: popVisible,
      isNow
    });
  }

  // ===== Daily =====
  const $daily = $("daily");
  $daily.innerHTML = "";
  // Filtre : jours avec min ET max non-null
  const validIndices = [];
  for (let i = 0; i < daily.time.length; i++) {
    if (daily.temperature_2m_max[i] != null && daily.temperature_2m_min[i] != null) {
      validIndices.push(i);
    }
  }
  // Si le modele renvoie tous les jours OK, prendre tout ; sinon filtrer
  const indices = validIndices.length >= Math.max(5, daily.time.length / 2)
    ? Array.from({ length: daily.time.length }, (_, i) => i)
    : validIndices;
  if (indices.length === 0) {
    // Plan B : tous les indices, meme ceux potentiellement vides
    for (let i = 0; i < daily.time.length; i++) indices.push(i);
  }
  const allMax = Math.max(...indices.map(i => daily.temperature_2m_max[i] ?? -Infinity));
  const allMin = Math.min(...indices.map(i => daily.temperature_2m_min[i] ?? Infinity));
  const range = Math.max(1, allMax - allMin);

  for (let i = 0; i < daily.time.length; i++) {
    const di = document.createElement("div");
    di.className = "day";
    const lo = daily.temperature_2m_min[i];
    const hi = daily.temperature_2m_max[i];
    const hasData = lo != null && hi != null;
    const startPct = hasData ? ((lo - allMin) / range) * 100 : 0;
    const endPct = hasData ? ((hi - allMin) / range) * 100 : 100;
    const wi = wmoInfo(daily.weather_code[i], false);
    const popDay = (daily.precipitation_probability_max && daily.precipitation_probability_max[i]) || 0;
    const popVisible = popDay >= 5;
    if (!hasData) di.classList.add("day-empty");
    di.innerHTML = `
      <div class="day-name">${dayName(daily.time[i], i)}</div>
      <div class="day-icon-wrap">
        <div class="day-icon">${icon(wi.icon, 28)}</div>
        <div class="day-pop${popVisible ? "" : " empty"}">${popVisible ? popDay + "%" : ""}</div>
      </div>
      <div class="day-low">${hasData ? fmtTemp(lo) : "—"}</div>
      <div class="day-bar"><span class="fill" style="left:${hasData ? startPct : 50}%; right:${hasData ? 100 - endPct : 50}%"></span></div>
      <div class="day-high">${hasData ? fmtTemp(hi) : "—"}</div>
    `;
    $daily.appendChild(di);
  }

  // ===== Details =====
  $("sunrise").textContent = fmtTime(daily.sunrise[0]);
  $("sunset").textContent = fmtTime(daily.sunset[0]);
  $("windSpeed").textContent = Math.round(cur.wind_speed_10m);
  $("windDir").textContent = cur.wind_direction_10m != null ? degToCompass(cur.wind_direction_10m) : "—";
  const gusts = Math.round(cur.wind_gusts_10m || cur.wind_speed_10m * 1.4);
  $("windGusts").textContent = gusts;
  $("gustsRow").classList.toggle("hidden", !(gusts > Math.round(cur.wind_speed_10m) + 5));
  $("precip").textContent = `${(daily.precipitation_sum[0] || 0).toFixed(1)} mm`;
  $("precipSub").textContent = `Risque ${daily.precipitation_probability_max[0] || 0}% aujourd'hui`;
  $("precipNow").textContent = cur.precipitation != null ? `${(cur.precipitation || 0).toFixed(1)} mm/h` : "—";
  $("humidity").textContent = `${Math.round(cur.relative_humidity_2m)}%`;
  $("dewPoint").textContent = `Point de rosée ${fmtTemp(cur.dew_point_2m || (cur.temperature_2m - (100 - cur.relative_humidity_2m) / 5))}`;
  $("cloudCover").textContent = `Nuages ${Math.round(cur.cloud_cover || 0)}%`;
  $("feels").textContent = fmtTemp(cur.apparent_temperature);
  $("feelsSub").textContent = cur.apparent_temperature < cur.temperature_2m - 0.5 ? "Plus frais" : cur.apparent_temperature > cur.temperature_2m + 0.5 ? "Plus chaud" : "Similaire";
  // Visibilite reelle via API (km)
  if (cur.visibility != null) {
    $("vis").textContent = cur.visibility >= 1000 ? `${(cur.visibility / 1000).toFixed(0)}+ km` : `${Math.round(cur.visibility)} m`;
  } else {
    $("vis").textContent = "—";
  }
  $("pressure").textContent = `${Math.round(cur.surface_pressure || cur.pressure_msl)} hPa`;
  $("pressureSub").textContent = (cur.surface_pressure || cur.pressure_msl) > 1013 ? "Au-dessus moyenne" : "En dessous moyenne";

  // Detection pluie pour le bandeau d'alerte
  updateRainAlert();

  // UV
  const uv = (daily.uv_index_max && daily.uv_index_max[0]) || 0;
  $("uv").textContent = uv.toFixed(1);
  const uvLabels = ["Faible","Faible","Faible","Modéré","Modéré","Modéré","Élevé","Élevé","Très élevé","Extrême","Extrême"];
  $("uvSub").textContent = uvLabels[Math.min(10, Math.round(uv))] || "—";
  $("uvBar").style.width = `${Math.min(100, uv * 10)}%`;

  // Updated at
  updateUpdatedAt();
}

function updateUpdatedAt() {
  if (!state.lastRefreshMs) return;
  const diff = Math.floor((Date.now() - state.lastRefreshMs) / 1000);
  if (diff < 60) {
    $("updatedAt").textContent = `Mis à jour il y a ${diff}s`;
  } else {
    const min = Math.floor(diff / 60);
    $("updatedAt").textContent = `Mis à jour il y a ${min} min`;
  }
}

// ============================================================
//  Load : Charger la météo pour une ville
// ============================================================
// ============================================================
//  CITY CHANGE : annulation des requetes + vidage complet + skeleton
// ============================================================
// Vide immediatement TOUTES les donnees affichees pour eviter tout
// melange avec une nouvelle ville. Appele avant chaque changement.
function clearAllWeatherUI() {
  // Reset de l'etat live
  currLiveData = null;
  prevLiveData = null;
  livePrecipHourly = null;
  lastFetchMs = 0;
  lastFullRenderMs = 0;
  state.lastWeather = null;
  state.lastRefreshMs = 0;
  hourlyCells.length = 0;
  lastRainInfoMs = 0;
  lastRainInfo = null;

  // Vidage DOM : temperature, condition, descriptions, alertes
  $("temp").textContent = "—";
  $("condition").textContent = "—";
  $("hilo").textContent = "H:—  L:—";
  $("descText").textContent = "—";
  $("feels").textContent = "—";
  $("feelsSub").textContent = "—";
  $("humidity").textContent = "—";
  $("windSpeed").textContent = "—";
  $("windDir").textContent = "—";
  $("windGusts").textContent = "—";
  $("gustsRow").classList.add("hidden");
  $("precip").textContent = "—";
  $("precipNow").textContent = "—";
  $("precipSub").textContent = "—";
  $("dewPoint").textContent = "—";
  $("cloudCover").textContent = "—";
  $("vis").textContent = "—";
  $("pressure").textContent = "—";
  $("pressureSub").textContent = "—";
  $("uv").textContent = "—";
  $("uvSub").textContent = "—";
  $("uvBar").style.width = "0%";
  $("sunrise").textContent = "—";
  $("sunset").textContent = "—";

  // Vidage listes
  $("hourly").innerHTML = "";
  $("daily").innerHTML = "";

  // Bandeau pluie cache
  const banner = $("rainBanner");
  if (banner) { banner.textContent = ""; banner.classList.remove("visible"); }

  // Skeleton : on l'active puis le desactive apres render
  document.body.classList.add("loading");
  $("cityName").textContent = "Chargement…";
}

// Desactive le skeleton (apres render reussi)
function disableSkeleton() {
  document.body.classList.remove("loading");
}

// Point d'entree unique pour changer de ville. Annule toute requete
// precedente, vide l'UI, affiche le skeleton, puis lance le fetch.
async function switchCity(city) {
  if (!city || city.lat == null || city.lon == null) return;

  // 1) Annule toutes les requetes reseau en cours
  if (state.currentFetchController) {
    try { state.currentFetchController.abort(); } catch (e) {}
  }
  const controller = new AbortController();
  state.currentFetchController = controller;

  // 2) Incremente le requestId pour invalider toute operation async en cours
  const myRequestId = ++state.requestId;

  // 3) Vide immediatement TOUTES les donnees affichees + skeleton
  clearAllWeatherUI();
  $("cityName").textContent = city.name + " …";

  // 4) Mets a jour la ville courante tout de suite
  state.city = city;

  // 5) PHASE 1 : LITE FETCH (~1s) - affiche rapidement temperature, condition,
  //              humidite, vent + 12h de precipitations pour la detection live
  try {
    const lite = await fetchWeather(city.lat, city.lon, true, controller.signal);
    if (myRequestId !== state.requestId) return; // nouvelle ville demandee
    if (!lite || !lite.current) throw new Error("Invalid lite data");

    // Construit un objet weather minimal pour le premier render rapide
    const w = {
      current: lite.current,
      hourly: lite.hourly || { time: [], temperature_2m: [], weather_code: [], precipitation_probability: [], precipitation: [], wind_speed_10m: [], relative_humidity_2m: [], wind_direction_10m: [], apparent_temperature: [], wind_gusts_10m: [], cloud_cover: [], dew_point_2m: [] },
      // Daily minimal : utilise des valeurs par defaut pour H/L (sera corrige par le full)
      daily: {
        time: [new Date().toISOString().split('T')[0]],
        temperature_2m_max: [lite.current.temperature_2m || 0],
        temperature_2m_min: [lite.current.temperature_2m || 0],
        sunrise: [],
        sunset: [],
        uv_index_max: [0],
        precipitation_probability_max: [0],
        precipitation_sum: [lite.current.precipitation || 0],
        wind_speed_10m_max: [lite.current.wind_speed_10m || 0],
        wind_gusts_10m_max: [lite.current.wind_gusts_10m || 0],
        wind_direction_10m_dominant: [lite.current.wind_direction_10m || 0],
        weather_code: [lite.current.weather_code]
      }
    };
    // Sunrise/sunset approx : on les laisse vides, le full les remplacera

    // Initialise le moteur live pour cette ville
    currLiveData = w;
    prevLiveData = null;
    lastFetchMs = Date.now();
    livePrecipHourly = lite.hourly || null;
    state.lastWeather = w;
    state.lastRefreshMs = Date.now();
    renderCity(city, w);
    disableSkeleton();
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (myRequestId !== state.requestId) return;
    // Continue quand meme vers le full fetch en fallback
  }

  // 6) PHASE 2 : FULL FETCH (3-5s) - en arriere-plan, ajoute 10 jours, hourly 24h
  if (myRequestId !== state.requestId) return;
  try {
    const full = await fetchWeather(city.lat, city.lon, false, controller.signal);
    if (myRequestId !== state.requestId) return; // nouvelle ville demandee
    if (!full || !full.current) return; // silencieux si echec (lite est deja affiche)

    // Met a jour avec les donnees completes sans reflicker
    state.lastWeather = full;
    state.lastRefreshMs = Date.now();
    lastFullRenderMs = Date.now();
    // Mets a jour currLiveData.current (le reste est garde du lite)
    if (currLiveData) currLiveData.current = full.current;
    renderCity(city, full);
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (myRequestId !== state.requestId) return;
    // Si on a deja le lite affiche, on n'affiche pas d'erreur
    if (!state.lastWeather) {
      $("cityName").textContent = "Erreur";
      $("temp").textContent = "—";
      $("condition").textContent = "Vérifiez votre connexion";
    }
    disableSkeleton();
  }
}

async function loadWeather(city) {
  // Wrapper conserve pour retrocompatibilite : delegue a switchCity
  return switchCity(city);
}

// ============================================================
//  Géolocalisation : Détection automatique de la position
// ============================================================
async function tryGeolocate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(false); return; }
    if (window.location.protocol === "file:") { resolve(false); return; }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const placeName = await reverseGeocode(latitude, longitude);
        state.city = { name: placeName, lat: latitude, lon: longitude };
        saveState();
        await loadWeather(state.city);
        resolve(true);
      },
      (err) => {
        console.warn("Geolocation failed:", err.message);
        resolve(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  });
}

// ============================================================
//  State : Sauvegarde / chargement localStorage
// ============================================================
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
    const s = JSON.parse(raw);
    if (s && s.city) {
      state.city = s.city;
      state.unit = s.unit || "C";
      state.favorites = s.favorites || [];
      return true;
    }
  } catch (e) {}
  return false;
}

// ============================================================
//  Favoris : Ajouter/retirer des villes
// ============================================================
function toggleFavorite(city) {
  const idx = state.favorites.findIndex(f => f.name === city.name && Math.abs(f.lat - city.lat) < 0.01);
  if (idx >= 0) {
    state.favorites.splice(idx, 1);
  } else {
    state.favorites.push(city);
  }
  saveState();
  renderFavorites();
}

function removeFavorite(idx) {
  state.favorites.splice(idx, 1);
  saveState();
  renderFavorites();
}

function renderFavorites() {
  const list = $("favoritesList");
  if (!list) return;
  if (state.favorites.length === 0) {
    list.innerHTML = `<p style="opacity: 0.6; font-size: 13px; text-align: center; padding: 20px 0;">Aucune ville favorite. Recherchez une ville et appuyez sur l'étoile pour l'ajouter.</p>`;
    return;
  }
  list.innerHTML = "";
  state.favorites.forEach((f, idx) => {
    const div = document.createElement("div");
    div.className = "fav-item";
    div.innerHTML = `
      <div class="fav-item-info">
        <div class="fav-item-name">${f.name}</div>
      </div>
      <button class="fav-item-remove" data-idx="${idx}" aria-label="Retirer">×</button>
    `;
    div.querySelector(".fav-item-info").addEventListener("click", () => {
      state.city = { name: f.name, lat: f.lat, lon: f.lon };
      saveState();
      closeSettings();
      loadWeather(state.city);
    });
    div.querySelector(".fav-item-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      removeFavorite(idx);
    });
    list.appendChild(div);
  });
}

// ============================================================
//  Search : Recherche de villes
// ============================================================
const searchOverlay = $("searchOverlay");
const searchInput = $("searchInput");
const searchResults = $("searchResults");
let searchTimer = null;

function openSearch() {
  searchOverlay.classList.add("open");
  searchInput.value = "";
  searchResults.innerHTML = "";
  // Force le focus et declenche le clavier mobile
  setTimeout(() => {
    searchInput.removeAttribute("readonly");
    searchInput.removeAttribute("disabled");
    searchInput.focus({ preventScroll: false });
    // Astuce iOS : declenche un click pour faire monter le clavier
    try { searchInput.click(); } catch (e) {}
  }, 100);
}

function closeSearch() {
  searchOverlay.classList.remove("open");
}

// Bouton loupe dans la topbar = ouvrir la recherche
$("searchBtn").addEventListener("click", openSearch);

$("cancelSearch").addEventListener("click", closeSearch);
searchOverlay.addEventListener("click", (e) => {
  if (e.target === searchOverlay) closeSearch();
});

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (q.length < 2) {
    searchResults.innerHTML = "";
    return;
  }
  searchTimer = setTimeout(async () => {
    const results = await searchCities(q);
    searchResults.innerHTML = "";
    results.forEach(r => {
      const isFav = state.favorites.some(f => f.name === r.name && Math.abs(f.lat - r.lat) < 0.01);
      const div = document.createElement("div");
      div.className = "search-result";
      div.innerHTML = `
        <div class="sr-info">
          <div class="sr-name">${r.name}</div>
          <div class="sr-region">${r.region}</div>
        </div>
        <button class="fav-star ${isFav ? "active" : ""}" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${r.name.replace(/"/g, "&quot;")}" data-region="${r.region.replace(/"/g, "&quot;")}" aria-label="Ajouter aux favoris">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
      `;
      // Click sur la zone principale = sélectionner la ville
      div.querySelector(".sr-info").addEventListener("click", () => {
        state.city = { name: r.name, lat: r.lat, lon: r.lon };
        saveState();
        closeSearch();
        loadWeather(state.city);
      });
      // Click sur l'étoile = ajouter/retirer des favoris
      div.querySelector(".fav-star").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite({ name: r.name, lat: r.lat, lon: r.lon });
        div.querySelector(".fav-star").classList.toggle("active");
      });
      searchResults.appendChild(div);
    });
  }, 300);
});

// ============================================================
//  Settings : Panneau des paramètres
// ============================================================
const settingsPanel = $("settingsPanel");

function openSettings() {
  settingsPanel.classList.add("open");
}

function closeSettings() {
  settingsPanel.classList.remove("open");
}

$("settingsBtn").addEventListener("click", openSettings);
$("closeSettings").addEventListener("click", closeSettings);
settingsPanel.addEventListener("click", (e) => {
  if (e.target === settingsPanel) closeSettings();
});

// Bouton actualiser
$("refreshBtn").addEventListener("click", async () => {
  closeSettings();
  if (state.city) await loadWeather(state.city);
});

// Toggle unité °C/°F
const unitToggle = $("unitToggle");
unitToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".seg");
  if (!btn) return;
  const newUnit = btn.dataset.unit;
  if (newUnit === state.unit) return;
  state.unit = newUnit;
  // Update active button
  unitToggle.querySelectorAll(".seg").forEach(b => {
    b.classList.toggle("active", b.dataset.unit === newUnit);
  });
  saveState();
  // Re-render with new unit
  if (state.lastWeather && state.city) {
    renderCity(state.city, state.lastWeather);
  }
});

// ============================================================
//  Init : Démarrage de l'application
// ============================================================
(async function init() {
  // Charger l'état sauvegardé
  const ok = loadState();

  // Mettre à jour le toggle d'unité
  unitToggle.querySelectorAll(".seg").forEach(b => {
    b.classList.toggle("active", b.dataset.unit === state.unit);
  });

  // Afficher les favoris
  renderFavorites();

  if (ok && state.city) {
    await loadWeather(state.city);
  } else {
    $("cityName").textContent = "Localisation…";
    const geoOk = await tryGeolocate();
    if (!geoOk) {
      state.city = { name: "Paris", lat: 48.8566, lon: 2.3522 };
      await loadWeather(state.city);
    }
  }

  // Auto-refresh "live" toutes les 60s (lite fetch : current seulement)
  setInterval(tickLive, 60 * 1000);

  // Boucle d'interpolation + diffing toutes les secondes
  startInterpolate();

  // Mise à jour du "Mis à jour il y a X min"
  setInterval(updateUpdatedAt, 30 * 1000);

  // Drag-scroll : permet le scroll à la souris sur les listes horizontales
  initDragScroll($("hourly"));
  initDragScroll($("daily"));
})();
