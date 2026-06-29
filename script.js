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
  favorites: []
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

  dayCycleCache = { isNight, phase, sunriseMs, sunsetMs, nowMs };
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
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,apparent_temperature,weather_code,precipitation_probability,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum&timezone=auto&forecast_days=10`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("API error");
  return res.json();
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
    // Afficher les % de précipitations à partir de 5% (juste le chiffre)
    const popVisible = pop >= 5;
    h.innerHTML = `
      <div class="hour-time">${timeLabel}</div>
      <div class="hour-icon">${icon(wi.icon, 32)}</div>
      <div class="hour-pop${popVisible ? "" : " empty"}">${popVisible ? pop + "%" : ""}</div>
      <div class="hour-temp">${fmtTemp(hourTemp)}</div>
    `;
    $hourly.appendChild(h);
  }

  // ===== Daily =====
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
    const popDay = (daily.precipitation_probability_max && daily.precipitation_probability_max[i]) || 0;
    const popVisible = popDay >= 5;
    di.innerHTML = `
      <div class="day-name">${dayName(daily.time[i], i)}</div>
      <div class="day-icon-wrap">
        <div class="day-icon">${icon(wi.icon, 28)}</div>
        <div class="day-pop${popVisible ? "" : " empty"}">${popVisible ? popDay + "%" : ""}</div>
      </div>
      <div class="day-low">${fmtTemp(lo)}</div>
      <div class="day-bar"><span class="fill" style="left:${startPct}%; right:${100 - endPct}%"></span></div>
      <div class="day-high">${fmtTemp(hi)}</div>
    `;
    $daily.appendChild(di);
  }

  // ===== Details =====
  $("sunrise").textContent = fmtTime(daily.sunrise[0]);
  $("sunset").textContent = fmtTime(daily.sunset[0]);
  $("wind").textContent = `${Math.round(cur.wind_speed_10m)} km/h`;
  $("windDir").textContent = `${degToCompass(cur.wind_direction_10m)} · Rafales ${Math.round(cur.wind_speed_10m * 1.4)} km/h`;
  $("precip").textContent = `${(daily.precipitation_sum[0] || 0).toFixed(1)} mm`;
  $("precipSub").textContent = `Risque ${daily.precipitation_probability_max[0] || 0}% aujourd'hui`;
  $("humidity").textContent = `${cur.relative_humidity_2m}%`;
  $("dew").textContent = `Point de rosée ${fmtTemp(cur.temperature_2m - (100 - cur.relative_humidity_2m) / 5)}`;
  $("feels").textContent = fmtTemp(cur.apparent_temperature);
  $("feelsSub").textContent = cur.apparent_temperature < cur.temperature_2m ? "Plus frais à cause du vent" : "Similaire à la réelle";
  $("vis").textContent = "10+ km";
  $("pressure").textContent = `${Math.round(cur.surface_pressure)} hPa`;
  $("pressureSub").textContent = cur.surface_pressure > 1013 ? "Au-dessus de la moyenne" : "En dessous de la moyenne";

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
async function loadWeather(city) {
  try {
    $("cityName").textContent = city.name + " …";
    const w = await fetchWeather(city.lat, city.lon);
    if (!w || !w.current) throw new Error("Invalid data");
    renderCity(city, w);
  } catch (e) {
    console.error("loadWeather error:", e);
    $("cityName").textContent = "Erreur";
    $("temp").textContent = "—";
    $("condition").textContent = "Vérifiez votre connexion";
  }
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

  // Auto-refresh des données météo toutes les 2 minutes
  // Re-fetch depuis l'API : garantit cohérence entre current et hourly
  setInterval(async () => {
    if (state.city) {
      await loadWeather(state.city);
    }
  }, 2 * 60 * 1000);

  // Mise à jour du "Mis à jour il y a X min"
  setInterval(updateUpdatedAt, 30 * 1000);

  // Drag-scroll : permet le scroll à la souris sur les listes horizontales
  initDragScroll($("hourly"));
  initDragScroll($("daily"));
})();
