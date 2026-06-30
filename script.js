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
  const cur = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,surface_pressure,wind_speed_10m,wind_gusts_10m,wind_direction_10m,dew_point_2m,visibility';
  let url;
  if (lite) {
    // Lite : current only (rapide, <1s)
    url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${cur}&wind_speed_unit=kmh&timezone=auto`;
  } else {
    // Full : current + hourly + daily (meteofrance_seamless puis best_match en fallback)
    const hourly = 'temperature_2m,apparent_temperature,weather_code,precipitation_probability,precipitation,rain,showers,snowfall,wind_speed_10m,wind_gusts_10m,cloud_cover,relative_humidity_2m,visibility,dew_point_2m,wind_direction_10m';
    const daily = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,rain_sum,showers_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,visibility_min';
    url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${cur}&hourly=${hourly}&daily=${daily}&wind_speed_unit=kmh&timezone=auto&forecast_days=10&models=meteofrance_seamless`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

// ============================================================
//  REFRESH ENGINE v2 - 60s live + interpolation + smart diffing
// ============================================================
const REFRESH_LIVE_MS = 60 * 1000;     // fetch live chaque 60s
const INTERPOLATE_MS = 1000;           // tick d'interpolation chaque seconde
const REFRESH_FORECAST_MS = 5 * 60 * 1000; // re-render forecast complet chaque 5 min

let prevLiveData = null;
let currLiveData = null;
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
    visibility: lerp(p.visibility ?? n.visibility ?? 0, n.visibility ?? 0, t)
  };
}

// Detection avancee des precipitations
function detectPrecipDetailed(hourly, currentTimeStr, lookaheadHours = 6) {
  const result = {
    raining: false,
    starting: null,  // ms timestamp
    ending: null,    // ms timestamp
    inMinutes: -1,
    intensity: null, // 'legere'|'moderee'|'forte'
    type: null,      // 'pluie'|'neige'|'orage'|'bruine'|'verglas'
    peakMm: 0,
    peakTime: null,
    peakType: null,
    code: null,
    startedAgo: -1,  // si deja en train, minutes depuis debut
    endInMinutes: -1 // minutes avant la fin si en cours
  };
  if (!hourly || !hourly.time || !hourly.weather_code) return result;
  const curMs = currentTimeStr ? new Date(currentTimeStr).getTime() : Date.now();

  const PRECIP = [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99,71,73,75,77,85,86];
  let lastRaining = false;
  for (let i = 0; i < Math.min(lookaheadHours, hourly.time.length); i++) {
    const t = new Date(hourly.time[i]).getTime();
    if (t < curMs) continue;
    const c = hourly.weather_code[i];
    const pop = (hourly.precipitation_probability && hourly.precipitation_probability[i]) || 0;
    const mm = (hourly.precipitation && hourly.precipitation[i]) || 0;
    const isRaining = PRECIP.includes(c);

    if (isRaining) {
      if (!result.raining) {
        result.raining = true;
        result.starting = t;
        result.code = c;
        result.inMinutes = Math.max(0, Math.round((t - curMs) / 60000));
      }
      // Intensite / type
      if ([65, 82].includes(c) || mm >= 4) result.intensity = 'forte';
      else if ([61, 63, 80, 81].includes(c) || mm >= 1) result.intensity = result.intensity || 'moderee';
      else result.intensity = result.intensity || 'legere';
      result.type = codeToPrecipType(c);
      if (mm > result.peakMm) {
        result.peakMm = mm;
        result.peakTime = t;
        result.peakType = result.type;
      }
    } else if (lastRaining && result.starting && !result.ending) {
      result.ending = t;
      result.endInMinutes = Math.round((t - curMs) / 60000);
    }
    lastRaining = isRaining;
  }
  return result;
}

function codeToPrecipType(code) {
  if ([95, 96, 99].includes(code)) return 'orage';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'neige';
  if ([51, 53, 55].includes(code)) return 'bruine';
  if ([56, 57, 66, 67].includes(code)) return 'verglas';
  if ([65, 82].includes(code)) return 'forte_pluie';
  return 'pluie';
}

// Tick live : recupere la meteo courante (pas le forecast) toutes les 60s
async function tickLive() {
  if (!state.city) return;
  const city = state.city;
  try {
    const lite = await fetchWeather(city.lat, city.lon, true);
    if (!lite || !lite.current) return;

    prevLiveData = currLiveData;
    currLiveData = lite;
    lastFetchMs = Date.now();
    state.lastRefreshMs = lastFetchMs;

    // Premier fetch : full render
    if (!state.lastWeather || !lastFullRenderMs) {
      try {
        const full = await fetchWeather(city.lat, city.lon, false);
        if (full && full.current) {
          state.lastWeather = full;
          renderCity(city, full);
          lastFullRenderMs = Date.now();
          state.lastRefreshMs = Date.now();
        }
      } catch (e) {
        renderCity(city, lite); // fallback
      }
    }

    // Si pas de difference majeure, juste tick d'interpolation
    applyLiveTick();
  } catch (e) {
    console.warn('tickLive failed:', e);
  }
  updateUpdatedAt();
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

  // Detection pluie pour le bandeau d'alerte
  updateRainAlert();

  // Mettre a jour uniquement les % du hourly sans re-render complet
  applyHourlyInterpolation();
}

// Met a jour les % hourly avec interpolation
function applyHourlyInterpolation() {
  if (!state.lastWeather || !hourlyCells.length) return;
  const hourly = state.lastWeather.hourly;
  if (!hourly || !hourly.time) return;
  const now = Date.now();
  const REFR = REFRESH_LIVE_MS;

  hourlyCells.forEach(cell => {
    const i = cell.idx;
    if (!hourly.precipitation_probability || hourly.precipitation_probability[i] == null) return;
    const targetPop = hourly.precipitation_probability[i];
    // Trouver la valeur precedente equivalente (approximation)
    const prevPop = prevLiveData && prevLiveData.hourly && prevLiveData.hourly.precipitation_probability
      ? (prevLiveData.hourly.precipitation_probability[i] ?? targetPop) : targetPop;
    const t = Math.min(1, (now - lastFetchMs) / REFR);
    const interpPop = lerp(prevPop, targetPop, t);
    const visible = interpPop >= 5;
    const txt = visible ? Math.round(interpPop) + '%' : '';
    if (cell.elPop.textContent !== txt) cell.elPop.textContent = txt;
    if (visible !== cell.isPopVisible) {
      cell.elPop.classList.toggle('empty', !visible);
      cell.isPopVisible = visible;
    }
  });
}

// Detection pluie en temps reel (bandeau alerte)
function updateRainAlert() {
  if (!state.lastWeather) return;
  const hourly = state.lastWeather.hourly;
  if (!hourly) return;
  const now = Date.now();

  // Detection pas trop frequente (5s min)
  if (now - lastRainInfoMs < 5000) return;
  lastRainInfoMs = now;

  const info = detectPrecipDetailed(hourly, state.lastWeather.current ? state.lastWeather.current.time : null, 6);
  lastRainInfo = info;

  // Afficher le bandeau si pluie imminente ou en cours
  const banner = $('rainBanner');
  if (!banner) return;

  let msg = '';
  if (info.raining && info.inMinutes <= 5) {
    msg = `Pluie dans ${info.inMinutes || "quelques"} min${info.intensity ? ` (${info.intensity})` : ''}.`;
  } else if (info.raining && info.inMinutes > 5 && info.inMinutes <= 60) {
    msg = `Pluie attendue dans ${info.inMinutes} min${info.intensity ? ` (${info.intensity})` : ''}.`;
  } else if (info.raining && info.inMinutes === 0 && info.peakMm >= 0.5) {
    msg = `Pluie en cours${info.intensity ? ` ${info.intensity}` : ''}.`;
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
  try {
    const full = await fetchWeather(state.city.lat, state.city.lon, false);
    if (full && full.current) {
      state.lastWeather = full;
      lastFullRenderMs = Date.now();
      renderCity(state.city, full);
    }
  } catch (e) { console.warn('Forecast refresh failed:', e); }
}

// Demarre la boucle d'interpolation
function startInterpolate() {
  if (interpTimerId) return;
  interpTimerId = setInterval(() => {
    if (!currLiveData) return;
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
    // Afficher les % de précipitations à partir de 5% (juste le chiffre)
    const popVisible = pop >= 5;
    h.innerHTML = `
      <div class="hour-time">${timeLabel}</div>
      <div class="hour-icon">${icon(wi.icon, 32)}</div>
      <div class="hour-pop${popVisible ? "" : " empty"}">${popVisible ? pop + "%" : ""}</div>
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
async function loadWeather(city) {
  try {
    $("cityName").textContent = city.name + " …";
    const w = await fetchWeather(city.lat, city.lon);
    if (!w || !w.current) throw new Error("Invalid data");
    // Initialise le moteur live
    if (!currLiveData) {
      currLiveData = w;
      lastFetchMs = Date.now();
    }
    state.lastWeather = w;
    state.lastRefreshMs = Date.now();
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
