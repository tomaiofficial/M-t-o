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

// Timeout par defaut pour les appels reseau externes (8s)
// Empeche l'UI de rester bloquee si Nominatim hang.
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.getHours();
}

function getMinutesFromISO(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
 * COMPARAISON PAR CHAINE ISO (timezone-safe) : on extrait la date "YYYY-MM-DD"
 * et l'heure "HH:MM" puis on compare en string, ce qui evite les bugs de
 * fuseau (la cle est que toutes les heures soient au MEME format, sans Z).
 * @param {string} isoTime - timestamp ISO de l'heure à tester (ex: "2026-07-02T10:30")
 * @param {object} daily - {sunrise:[], sunset:[]} de l'API (meme format)
 * @returns {boolean} true = jour, false = nuit
 */
function isDaytime(isoTime, daily) {
  if (!daily || !daily.sunrise || !daily.sunset || daily.sunrise.length === 0) {
    // Fallback heuristique : jour entre 6h et 21h (extraction directe du HH)
    const m = (isoTime || "").match(/T(\d{2})/);
    const h = m ? parseInt(m[1], 10) : 12;
    return h >= 6 && h < 21;
  }
  if (!isoTime || typeof isoTime !== "string") return true;

  // Extraire date (YYYY-MM-DD) et heure-min (HH:MM) de isoTime
  // Format garanti sans fuseau : "2026-07-02T10:30" -> date="2026-07-02", hm="10:30"
  const dateMatch = isoTime.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!dateMatch) {
    // Format non reconnu, fallback heuristique
    const h = parseInt((isoTime.match(/T(\d{2})/) || [])[1], 10);
    return h >= 6 && h < 21;
  }
  const dateStr = dateMatch[1]; // "2026-07-02"
  const hm = dateMatch[2];      // "10:30"

  // Trouver le jour dans daily.sunrise qui correspond a la date
  // (compare sur les 10 premiers caracteres du sunrise ISO = "YYYY-MM-DD")
  let dayIndex = -1;
  for (let i = 0; i < daily.sunrise.length; i++) {
    const sDate = daily.sunrise[i] ? daily.sunrise[i].substring(0, 10) : null;
    if (sDate === dateStr) { dayIndex = i; break; }
  }

  // Cas special : heure entre 00:00 et le sunrise du MEME jour
  // -> appartient au jour precedent (la nuit precedente)
  // Exemple : 02:00 le 2026-07-02, sunrise[0]=2026-07-02 05:51
  // On considere cette heure comme etant dans la "nuit" du 2026-07-01 -> 2026-07-02
  // donc on utilise le sunrise/sunset du 2026-07-01.
  if (dayIndex < 0) {
    // Pas de sunrise aujourd'hui : prendre le DERNIER jour disponible
    // (= le jour precedent, qui contient cette heure de nuit)
    dayIndex = daily.sunrise.length - 1;
  }

  // Maintenant on determine si hm est entre sunrise et sunset du dayIndex
  // (en string, donc timezone-safe)
  const sunriseHm = (daily.sunrise[dayIndex] || "").substring(11, 16); // "05:51"
  const sunsetHm = (daily.sunset[dayIndex] || "").substring(11, 16);   // "21:57"

  if (!sunriseHm || !sunsetHm) {
    // Pas de sunrise/sunset pour ce jour : heuristique
    const h = parseInt(hm.split(":")[0], 10);
    return h >= 6 && h < 21;
  }

  // Comparaison string : "00:00" <= hm <= "23:59"
  // JOUR strict : hm >= sunriseHm ET hm < sunsetHm
  // NUIT : hm < sunriseHm OU hm >= sunsetHm
  return hm >= sunriseHm && hm < sunsetHm;
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
    // Pas de sunrise/sunset dispo : utiliser cur.is_day (precis) ou fallback h
    if (cur && typeof cur.is_day === 'number') {
      isNight = cur.is_day === 0;
      phase = isNight ? "night" : "day";
    } else {
      const h = now.getHours();
      isNight = h >= 21 || h < 6;
      phase = isNight ? "night" : "day";
    }
  } else {
    // Marges crépuscule : 30 min avant lever (aube) / 30 min après coucher (crépuscule)
    const dawnMs = sunriseMs - 30 * 60 * 1000;
    const duskMs = sunsetMs + 30 * 60 * 1000;

    // Priorite a cur.is_day : evite les flicker entre h-based et sun-based
    // (ex: aube a 5h55 avec sunrise a 6h00 -> h-based dit nuit, sun-based dit aube)
    if (cur && typeof cur.is_day === 'number') {
      isNight = cur.is_day === 0;
      if (isNight) {
        phase = (nowMs >= duskMs || nowMs < dawnMs) ? "night" : "night";
      } else {
        phase = (nowMs < sunriseMs) ? "dawn" : (nowMs >= sunsetMs ? "dusk" : "day");
      }
    } else {
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

// ============================================================
//  IA LLM : Génération de descriptions météo en langage naturel
//  Backend : Pollinations.ai (gratuit, sans clé API)
//  Cache  : localStorage par (ville + tranche horaire de 30 min)
// ============================================================
const AI_CACHE_KEY = "meteo_ai_desc_v1";
// TTL eleve : la description IA est generee UNE FOIS et gardee 1h.
// Evite que le user voie plusieurs descriptions differentes se suivre.
// Si la meteo change significativement (voir shouldRefreshAIDescription),
// on regenere quand meme.
const AI_CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure

// Conditions qui declenchent une regeneration de la description IA.
// Le but : detecter un changement meteo MAJEUR (pas un simple drift de
// temperature ou de vent). Si les conditions sont stables, on garde
// la description precedente.
function shouldRefreshAIDescription(prev, cur) {
  if (!prev) return true;
  // 1. Changement de condition (ensoleille -> pluie, etc.)
  if (prev.weather_code !== cur.weather_code) return true;
  // 2. Changement jour/nuit (leve/couche le soleil)
  if ((prev.is_day || 0) !== (cur.is_day || 0)) return true;
  // 3. Pluie qui debute ou s'arrete
  const prevRain = (prev.precipitation || 0) > 0.1;
  const curRain = (cur.precipitation || 0) > 0.1;
  if (prevRain !== curRain) return true;
  // 4. Saut de temperature majeur (>3C par rapport a la description)
  if (Math.abs((prev.temperature_2m || 0) - (cur.temperature_2m || 0)) > 3) return true;
  return false; // conditions stables, on garde la description
}

// Construit un résumé compact des données météo ACTUELLES pour le prompt LLM.
// Objectif : donner à l'IA UNIQUEMENT les conditions du moment présent,
// SANS aucune prévision (ni prochaine pluie, ni amplitude du jour, ni cumul attendu).
// L'IA hallucine si on lui donne trop de contexte : on reste minimal.
function buildWeatherSummary(w) {
  if (!w || !w.current) return null;
  const cur = w.current;
  const code = cur.weather_code;
  const wmo = WMO[code] || { label: "Conditions variables" };
  return {
    condition: wmo.label,
    temperature: Math.round(cur.temperature_2m),
    feelsLike: Math.round(cur.apparent_temperature),
    wind: Math.round(cur.wind_speed_10m),
    humidity: Math.round(cur.relative_humidity_2m),
    precipNow: +(cur.precipitation || 0).toFixed(1), // mm/h en ce moment
    isDay: cur.is_day === 1
  };
}

// Construit le prompt envoyé à l'IA. Strictement "maintenant", aucune prévision.
// On lui donne le strict minimum factuel pour éviter l'hallucination.
function buildAIPrompt(city, summary) {
  const timeOfDay = (() => {
    const h = new Date().getHours();
    if (h < 6) return "nuit";
    if (h < 12) return "matin";
    if (h < 14) return "midi";
    if (h < 18) return "après-midi";
    if (h < 21) return "soirée";
    return "nuit";
  })();
  // Liste STRICTE des conditions possibles (codes WMO) pour cadrer l'IA
  const lines = [
    `Météo actuelle à ${city.name} (${timeOfDay}) :`,
    `- Condition : ${summary.condition}`,
    `- Température : ${summary.temperature}°C (ressenti ${summary.feelsLike}°C)`,
    `- Vent : ${summary.wind} km/h`,
    `- Humidité : ${summary.humidity}%`
  ];
  if (summary.precipNow > 0) {
    lines.push(`- Pluie en ce moment : ${summary.precipNow} mm/h`);
  }
  lines.push(
    "",
    "Consignes STRICTES :",
    "- Décris UNIQUEMENT la condition actuelle ci-dessus. Pas de prévision, pas de 'plus tard', pas de 'cette nuit'.",
    "- Ne change JAMAIS la condition donnée (si on dit 'Couvert', reste sur 'Couvert', n'invente pas 'Orages' ou 'Pluie').",
    "- Phrase courte en français, commence directement par la condition, 1 à 2 phrases, max 150 caractères.",
    "- Pas d'emojis, pas de markdown, pas de listes."
  );
  return lines.join("\n");
}

// Lit le cache de descriptions depuis localStorage.
function readAICache() {
  try {
    const raw = localStorage.getItem(AI_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (e) { return {}; }
}

function writeAICache(cache) {
  try {
    // Nettoie les entrées expirées avant d'écrire
    const now = Date.now();
    const cleaned = {};
    for (const k in cache) {
      if (cache[k] && cache[k].ts && (now - cache[k].ts) < AI_CACHE_TTL_MS * 4) {
        cleaned[k] = cache[k];
      }
    }
    localStorage.setItem(AI_CACHE_KEY, JSON.stringify(cleaned));
  } catch (e) {}
}

// Clé de cache : nom de ville arrondi à l'heure
// Slot 1h pour que la description NE CHANGE PAS en boucle.
function aiCacheKey(city) {
  const slot = Math.floor(Date.now() / (60 * 60 * 1000));
  const name = (city.name || "ville").toLowerCase().replace(/\s+/g, "-");
  return `${name}#${slot}`;
}

// Appelle Pollinations.ai pour générer la description.
// Retourne { ok, text, source } ou { ok:false }.
async function callLLM(prompt) {
  const url = "https://text.pollinations.ai/" + encodeURIComponent(prompt);
  const res = await fetchWithTimeout(url, {}, 15000); // 15s max pour le LLM
  if (!res.ok) return { ok: false };
  const text = (await res.text()).trim();
  if (!text || text.length < 10) return { ok: false };
  // Nettoie les artefacts (markdown, préfixes parasites)
  const cleaned = text
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 400);
  return { ok: true, text: cleaned };
}

// Pipeline principal : tente LLM, fallback sur template.
// Met à jour le DOM dès qu'une réponse est dispo.
async function generateAIDescription(city, w) {
  if (!city || !w || !w.current) return null;
  const summary = buildWeatherSummary(w);
  if (!summary) return null;

  // 1) Cache hit ?
  const cache = readAICache();
  const key = aiCacheKey(city);
  if (cache[key] && (Date.now() - cache[key].ts) < AI_CACHE_TTL_MS) {
    return { text: cache[key].text, source: "cache" };
  }

  // 2) LLM call (avec timeout via fetchWithTimeout)
  const prompt = buildAIPrompt(city, summary);
  const result = await callLLM(prompt);

  if (result.ok) {
    cache[key] = { text: result.text, ts: Date.now() };
    writeAICache(cache);
    return { text: result.text, source: "llm" };
  }

  // 3) Fallback : on retourne null → caller utilise generateDescription
  return null;
}

// Pipeline async qui appelle l'IA et met a jour le DOM si une meilleure
// description est disponible. NE S'APPLIQUE PAS si les conditions meteo
// n'ont pas change (grace a shouldRefreshAIDescription).
// La description est donc stable : une seule par "episode" meteo.
let lastAIDescriptionWeather = null; // pour detection de changement
async function refreshAIDescriptionAsync(city, w) {
  if (!city || !w || !w.current) return;
  // Anti-flicker : si les conditions sont stables, on garde la description
  // precedente et on ne rappelle PAS le LLM.
  if (lastAIDescriptionWeather && !shouldRefreshAIDescription(lastAIDescriptionWeather, w.current)) {
    return; // Conditions stables -> on garde la description existante
  }
  try {
    const result = await generateAIDescription(city, w);
    if (!result || !result.text) return;
    // Remplace UNIQUEMENT si different (evite de re-render pour rien)
    const cur = $('descText');
    if (cur && cur.textContent !== result.text) {
      // Petite animation de transition pour signaler le changement
      cur.classList.add('desc-fade');
      setTimeout(() => {
        cur.textContent = result.text;
        cur.classList.remove('desc-fade');
      }, 200);
    }
    // Memoise les conditions pour les prochains checks
    lastAIDescriptionWeather = { ...w.current };
  } catch (e) {
    // Silencieux : fallback template reste affiche
  }
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
  // La description se concentre UNIQUEMENT sur les conditions meteo (actuelles
  // + a venir). Pas de mention UV, lunettes, creme solaire, etc.
  const sentences = [];

  // ---- Phrase 1 : condition actuelle (courte) ----
  sentences.push(buildConditionSentence(code, period, h));

  // ---- Phrase 2 : precipitations observees MAINTENANT (priorite) ----
  const liveObs = classifyLiveCondition(cur);
  if (liveObs) {
    sentences.push(buildLivePrecipSentence(liveObs, cur));
  } else if (hourly && hourly.precipitation_probability) {
    // ---- Phrase 3 : precipitations a venir (prochaines heures) ----
    const forecastSentence = buildPrecipForecastSentence(hourly, nowMs);
    if (forecastSentence) sentences.push(forecastSentence);
  }

  // ---- Phrase 4 : evolution temperatures (optionnelle) ----
  const evoSentence = buildEvolutionSentence(curT, tempEvo, period, tempTrend);
  if (evoSentence) sentences.push(evoSentence);

  // ---- Phrase 5 : vent significatif ----
  const windSentence = buildWindSentence(wind, dirTxt, period);
  if (windSentence) sentences.push(windSentence);

  // ---- Phrase 6 : visibilite pour brouillard ----
  if ([45, 48].includes(code)) {
    sentences.push("Visibilite tres reduite, prudence sur la route.");
  }

  // ---- Phrase 7 : indice UV (en plein jour seulement) ----
  if (!dayCycle.isNight && daily && daily.uv_index_max) {
    const uvMax = daily.uv_index_max[0];
    if (uvMax >= 8) {
      sentences.push(`UV tres eleve (indice ${uvMax.toFixed(1)}), creme solaire recommandee.`);
    } else if (uvMax >= 6) {
      sentences.push(`UV eleve (indice ${uvMax.toFixed(1)}), protection conseilee.`);
    }
  }

  // ---- Phrase 8 : tendance barometrique (indicateur d'orages) ----
  if (hourly && hourly.surface_pressure && hourly.surface_pressure.length >= 4) {
    // Compare pression actuelle vs il y a 3h
    const idxNow = 0;
    const idxPast = 3;
    const pNow = hourly.surface_pressure[idxNow];
    const pPast = hourly.surface_pressure[idxPast];
    if (pNow != null && pPast != null) {
      const drop = pPast - pNow; // hPa
      if (drop >= 3) {
        sentences.push(`Pression en forte baisse (-${drop.toFixed(1)} hPa en 3h), temps perturbé attendu.`);
      } else if (drop >= 1.5) {
        sentences.push(`Pression en baisse, dégradation possible.`);
      } else if (drop <= -3) {
        sentences.push(`Pression en hausse (+${Math.abs(drop).toFixed(1)} hPa), temps plus stable attendu.`);
      }
    }
  }

  // ---- Phrase 9 : ressenti très différent de la température réelle ----
  if (feelsDiff >= 5) {
    if (feels < curT) {
      sentences.push(`Ressenti ${Math.round(feels)}°C, plus frais que la température réelle.`);
    } else {
      sentences.push(`Ressenti ${Math.round(feels)}°C, plus chaud que la température réelle.`);
    }
  }

  // ---- Phrase 7 : orage avec fiabilite issue de la double validation ----
  // Si fiabilite 'high' (Open-Meteo + Met.no d'accord), mention explicite
  // Si fiabilite 'medium' (une seule source), mention prudente
  // Sinon pas de mention
  const thunderRel = w._thunderReliability;
  if (thunderRel && thunderRel.confidence === 'high') {
    const intensityLabel = thunderRel.maxIntensity === 2
      ? "avec risque de grele forte"
      : thunderRel.maxIntensity === 1
        ? "eventuellement avec grele"
        : "";
    sentences.push(`Orages confirmes par double validation meteorologique${intensityLabel ? ", " + intensityLabel : ""}. Restez a l'abri.`);
  } else if (thunderRel && thunderRel.confidence === 'medium' && isThunderHour(code)) {
    // Orage actuellement observe (code 95/96/99) mais cross-check a echoue
    sentences.push("Orages en cours, restez a l'abri (verification en cours).");
  }

  return sentences.join(" ");
}

// Phrase dediee aux precipitations observees en temps reel
function buildLivePrecipSentence(liveObs, cur) {
  const mm = cur.precipitation || 0;
  const label = liveObs.label.toLowerCase();
  if (label.includes("bruine") || label.includes("crachin")) {
    return `Bruine en cours (${mm.toFixed(1)} mm/h).`;
  }
  if (label.includes("averse")) {
    return `Averses en cours (${mm.toFixed(1)} mm/h).`;
  }
  if (label.includes("forte")) {
    return `Fortes precipitations en cours (${mm.toFixed(1)} mm/h), prudence.`;
  }
  if (label.includes("orage")) {
    return `Orages en cours, restez a l'abri.`;
  }
  if (label.includes("neige")) {
    return `Chutes de neige en cours.`;
  }
  if (label.includes("grele")) {
    return `Grele en cours, protegez-vous.`;
  }
  if (label.includes("verglas")) {
    return `Verglas en cours, attention aux routes.`;
  }
  return `${liveObs.label} en cours (${mm.toFixed(1)} mm/h).`;
}

// Phrase dediee aux precipitations a venir (prochaines 6h)
function buildPrecipForecastSentence(hourly, nowMs) {
  if (!hourly || !hourly.precipitation_probability || !hourly.time) return null;
  // Trouve la prochaine heure avec PoP >= 30% ou mm >= 0.3
  let nextEvent = null;
  for (let i = 0; i < Math.min(12, hourly.time.length); i++) {
    const tMs = new Date(hourly.time[i]).getTime();
    if (tMs <= nowMs) continue;
    const pop = hourly.precipitation_probability[i] || 0;
    const mm = (hourly.precipitation && hourly.precipitation[i]) || 0;
    const code = hourly.weather_code ? hourly.weather_code[i] : null;
    const isPrecipCode = code != null && [51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(code);
    if (pop >= 30 || mm >= 0.3 || isPrecipCode) {
      nextEvent = { i, tMs, pop, mm, code };
      break;
    }
  }
  if (!nextEvent) return null;

  // Trouve la fin de l'episode precipitant
  let endEvent = null;
  for (let j = nextEvent.i; j < Math.min(12, hourly.time.length); j++) {
    const popJ = hourly.precipitation_probability[j] || 0;
    const mmJ = (hourly.precipitation && hourly.precipitation[j]) || 0;
    const codeJ = hourly.weather_code ? hourly.weather_code[j] : null;
    const isPrecipCodeJ = codeJ != null && [51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(codeJ);
    if (popJ < 20 && mmJ < 0.2 && !isPrecipCodeJ) {
      endEvent = { i: j, tMs: new Date(hourly.time[j]).getTime() };
      break;
    }
  }
  // Si pas de fin trouvee, fin = prochaine+6h
  if (!endEvent) {
    const endIdx = Math.min(nextEvent.i + 6, hourly.time.length - 1);
    endEvent = { i: endIdx, tMs: new Date(hourly.time[endIdx]).getTime() };
  }

  // Calcul timing
  const inMin = Math.round((nextEvent.tMs - nowMs) / 60000);
  const endMin = Math.round((endEvent.tMs - nowMs) / 60000);
  const peakPop = Math.max(nextEvent.pop, (hourly.precipitation_probability[endEvent.i] || 0));
  const peakMm = Math.max(nextEvent.mm, (hourly.precipitation && hourly.precipitation[endEvent.i]) || 0);

  // Determine le type
  let typeLabel = "pluie";
  const codes = [nextEvent.code, ...(hourly.weather_code ? hourly.weather_code.slice(nextEvent.i, endEvent.i + 1) : [])];
  if (codes.some(c => [95, 96, 99].includes(c))) typeLabel = "orage";
  else if (codes.some(c => [71, 73, 75, 85, 86].includes(c))) typeLabel = "neige";
  else if (codes.some(c => [77].includes(c))) typeLabel = "grele";
  else if (codes.some(c => [51, 53, 55, 56, 57].includes(c))) typeLabel = "bruine";
  else if (codes.some(c => [65, 82].includes(c))) typeLabel = "fortes pluies";

  // Construit la phrase
  const popText = Math.round(peakPop) + "%";
  let timingText;
  if (inMin <= 5) timingText = "imminent";
  else if (inMin < 60) timingText = `dans ${inMin} min`;
  else timingText = `dans ${Math.round(inMin / 60)}h${inMin % 60 > 0 ? ` ${inMin % 60}` : ""}`;

  let durationText = "";
  const dur = endMin - inMin;
  if (dur >= 60) {
    durationText = ` (duree ~${Math.round(dur / 60)}h${dur % 60 > 0 ? ` ${dur % 60}` : ""})`;
  }

  if (typeLabel === "orage") {
    return `Orages ${timingText}, ${popText} de probabilite${durationText}, prudence.`;
  }
  if (typeLabel === "neige") {
    return `Chutes de neige ${timingText}, ${popText} de probabilite${durationText}.`;
  }
  if (typeLabel === "grele") {
    return `Risque de grele ${timingText}, ${popText} de probabilite${durationText}.`;
  }
  if (typeLabel === "fortes pluies") {
    return `Fortes pluies ${timingText}, ${popText} de probabilite${durationText}.`;
  }
  if (typeLabel === "bruine") {
    return `Bruine ${timingText}, ${popText} de probabilite${durationText}.`;
  }
  return `Pluie ${timingText}, ${popText} de probabilite${durationText}.`;
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
//  AI Climatique : Générateur météo procédural temps réel
//  Zero API, zero serveur, zero clé - 100% dans le navigateur
//  Modélisation climatique + cycles diurnes + chaîne de Markov
// ============================================================

// ============================================================
// Open-Meteo API : donnees meteo reelles, GRATUIT, sans cle
// https://api.open-meteo.com/v1/forecast
// Donne : current + hourly 24h + daily jusqu'a 16 jours
// ============================================================
const OPEN_METEO_FORECAST_DAYS = 10;

// ============================================================
//  RETRY INTELLIGENT : exponential backoff pour les fetch reseau
//  - 3 tentatives max
//  - Delais : 500ms, 1.5s, 4s (avec jitter)
//  - Ne retry PAS les erreurs 4xx (sauf 408, 429, 503)
//  - Timeout par tentative : 8s
// ============================================================
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  const { signal: externalSignal, ...rest } = options;
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (externalSignal && externalSignal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    // Delais avec jitter : 500ms, 1500ms, 4000ms + random 0-300ms
    const baseDelays = [500, 1500, 4000];
    if (attempt > 0) {
      const delay = baseDelays[attempt - 1] + Math.random() * 300;
      await new Promise(r => setTimeout(r, delay));
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      // Lie le signal externe pour propager l'annulation
      if (externalSignal) {
        externalSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
      }
      const res = await fetch(url, { ...rest, signal: ctrl.signal });
      clearTimeout(timer);
      // Erreurs 4xx non-retry (sauf rate-limit 429 et timeout 408)
      if (!res.ok && res.status >= 400 && res.status < 500
          && res.status !== 408 && res.status !== 429) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok && res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue; // retry sur 5xx
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (e.name === 'AbortError') throw e; // pas de retry si annule
      // Erreur reseau (timeout, DNS, etc.) -> retry
      console.warn(`[Retry] Tentative ${attempt + 1}/${maxRetries} echouee: ${e.message}`);
    }
  }
  throw lastErr || new Error('Fetch failed after retries');
}

// ============================================================
//  VALIDATION DES DONNEES : sanity check avant utilisation
//  Detecte les donnees aberrantes (temp=NaN, precip=999mm, etc.)
//  Retourne { ok: true, score: 0-100 } ou { ok: false, reason }
// ============================================================
function validateWeatherData(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'no-data' };
  }
  const issues = [];
  let score = 100;
  if (!data.current) {
    return { ok: false, reason: 'no-current' };
  }
  const c = data.current;
  // Temperature raisonnable : -60C a 60C
  const t = c.temperature_2m;
  if (t == null || isNaN(t)) {
    issues.push('temp-null');
    score -= 30;
  } else if (t < -60 || t > 60) {
    issues.push(`temp-extreme:${t}`);
    score -= 50;
  }
  // Weather code valide (WMO 0-99)
  const wc = c.weather_code;
  if (wc != null && (wc < 0 || wc > 99)) {
    issues.push(`weather-code-invalid:${wc}`);
    score -= 20;
  }
  // Precipitation raisonnable : 0-100mm/h (au-dela = erreur)
  const p = c.precipitation;
  if (p != null && (p < 0 || p > 100)) {
    issues.push(`precip-invalid:${p}`);
    score -= 25;
  }
  // Humidite : 0-100%
  const h = c.relative_humidity_2m;
  if (h != null && (h < 0 || h > 100)) {
    issues.push(`humidity-invalid:${h}`);
    score -= 10;
  }
  // Vent : 0-200 km/h (au-dela = erreur)
  const w = c.wind_speed_10m;
  if (w != null && (w < 0 || w > 200)) {
    issues.push(`wind-invalid:${w}`);
    score -= 20;
  }
  // Hourly : au moins quelques heures
  if (!data.hourly || !data.hourly.time || data.hourly.time.length < 4) {
    issues.push('hourly-too-short');
    score -= 30;
  }
  return {
    ok: score >= 50,  // 50 = minimum vital
    score: Math.max(0, score),
    issues
  };
}

// ============================================================
//  CACHE OFFLINE : derniere donnee valide mise en localStorage
//  En cas de perte reseau, l'app garde la derniere meteo connue
//  avec un badge "donnees anciennes" pour transparence
// ============================================================
const CACHE_KEY_PREFIX = 'meteo_cache_';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h max

function saveToCache(lat, lon, data) {
  try {
    const key = CACHE_KEY_PREFIX + lat.toFixed(2) + '_' + lon.toFixed(2);
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {}
}

function loadFromCache(lat, lon) {
  try {
    const key = CACHE_KEY_PREFIX + lat.toFixed(2) + '_' + lon.toFixed(2);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null; // trop vieux
    return { data, ts, ageMin: Math.round((Date.now() - ts) / 60000) };
  } catch (e) { return null; }
}

// Appel Open-Meteo : retourne current + hourly (24h) + daily (10 jours)
async function callOpenMeteo(lat, lon, signal = null) {
  const params = [
    `latitude=${lat}`,
    `longitude=${lon}`,
    `current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,` +
      `precipitation,rain,showers,snowfall,weather_code,cloud_cover,` +
      `pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m`,
    `hourly=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,` +
      `precipitation_probability,precipitation,rain,showers,snowfall,weather_code,` +
      `pressure_msl,surface_pressure,cloud_cover,visibility,wind_speed_10m,` +
      `wind_direction_10m,wind_gusts_10m`,
    `daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,` +
      `daylight_duration,uv_index_max,precipitation_sum,precipitation_hours,` +
      `precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,` +
      `wind_direction_10m_dominant`,
    `forecast_days=${OPEN_METEO_FORECAST_DAYS}`,
    `timezone=auto`
  ].join("&");
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  // Utilise fetchWithRetry : 3 tentatives avec backoff exponentiel
  const res = await fetchWithRetry(url, { signal }, 3);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = await res.json();
  const data = openMeteoToInternal(json);
  // Validation : rejette les donnees aberrantes
  const validation = validateWeatherData(data);
  if (!validation.ok) {
    throw new Error(`Open-Meteo data invalid (score ${validation.score}): ${validation.issues.join(',')}`);
  }
  data._quality = validation;
  data._source = 'Open-Meteo';
  return data;
}

// ============================================================
// Met.no (Institut Meteorologique Norvegien) : DONNEES TRES FIABLES
// Gratuit, sans cle, modele numerique de haute qualite (Arome-MetCoCo + ECMWF)
// Endpoint: https://api.met.no/weatherapi/locationforecast/2.0/complete
// IMPORTANT : requiert un User-Agent (le bloque sinon avec 403)
// IMPORTANT : ne pas appeler plus de 1 fois / 10 secondes / IP (rate limit)
// ============================================================
const MET_NO_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min cache anti rate-limit
const metNoCache = new Map();

async function callMetNo(lat, lon, signal = null) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const now = Date.now();
  if (metNoCache.has(key)) {
    const cached = metNoCache.get(key);
    if (now - cached.ts < MET_NO_CACHE_TTL_MS) {
      return cached.data;
    }
  }
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete` +
              `?lat=${lat}&lon=${lon}&altitude=0`;
  // Retry : 3 tentatives, mais IMPORTANT : respecter le rate-limit de Met.no
  // qui est de 1 req / 10s par IP. Si une retry tape trop vite, elle sera
  // probablement 429. Donc on laisse les delais du backoff faire le job.
  const res = await fetchWithRetry(url, {
    signal,
    headers: {
      "User-Agent": "MeteoApp/1.0 tomtechclair.github.io"
    }
  }, 2); // 2 tentatives max pour Met.no (rate-limit serre)
  if (!res.ok) throw new Error(`Met.no HTTP ${res.status}`);
  const json = await res.json();
  const data = metNoToInternal(json);
  // Validation
  const validation = validateWeatherData(data);
  if (!validation.ok) {
    throw new Error(`Met.no data invalid: ${validation.issues.join(',')}`);
  }
  data._quality = validation;
  data._source = 'Met.no';
  metNoCache.set(key, { ts: now, data });
  return data;
}

// Convertit les codes Met.no en codes WMO standard (compatible app)
// Reference : https://api.met.no/weatherapi/weathericon/1.1/documentation
function metNoToWmo(symbolCode) {
  const m = {
    "clearsky": 0,
    "fair": 1, // peu nuageux
    "partlycloudy": 2,
    "cloudy": 3,
    "fog": 45,
    "lightrain": 61,
    "rain": 63,
    "heavyrain": 65,
    "lightsleet": 67,
    "sleet": 67,
    "heavysleet": 67,
    "lightsnow": 71,
    "snow": 73,
    "heavysnow": 75,
    "lightrainandthunder": 95,
    "rainandthunder": 95,
    "heavyrainandthunder": 96,
    "lightsnowandthunder": 95,
    "snowandthunder": 95,
    "heavysnowandthunder": 96,
    "lightrainshowers": 80,
    "rainshowers": 81,
    "heavyrainshowers": 82,
    "lightsleetshowers": 67,
    "sleetshowers": 67,
    "heavysleetshowers": 67,
    "lightsnowshowers": 85,
    "snowshowers": 86,
    "heavysnowshowers": 86
  };
  return m[symbolCode] != null ? m[symbolCode] : 3;
}

// Convertit la reponse Met.no vers le format interne.
// Endpoint "complete" retourne series temporelles tres precises.
function metNoToInternal(json) {
  const series = json && json.properties && json.properties.timeseries;
  if (!series || !series.length) throw new Error("Met.no: timeseries vide");
  const latest = series[0];
  const cur = latest.data.instant.details || {};
  const next1h = latest.data.next_1_hours;
  const next6h = latest.data.next_6_hours;

  // ---- CURRENT ----
  const symbolCode = (next1h && next1h.summary && next1h.summary.symbol_code) ||
                     (next6h && next6h.summary && next6h.summary.symbol_code) ||
                     "clearsky";
  const curCode = metNoToWmo(symbolCode);
  // L'API Met.no n'a pas is_day direct mais on peut l'inferer du sunrise/sunset
  const sunRiseRaw = cur.sunrise || (latest.data.instant.details && latest.data.instant.details.sunrise);
  const sunSetRaw = cur.sunset || (latest.data.instant.details && latest.data.instant.details.sunset);
  const isDay = cur.shortwave_radiation != null ? cur.shortwave_radiation > 0 : true;

  const current = {
    time: latest.time,
    temperature_2m: cur.air_temperature,
    apparent_temperature: cur.apparent_temperature || cur.air_temperature,
    relative_humidity_2m: cur.relative_humidity,
    dew_point_2m: cur.dew_point_temperature,
    pressure_msl: cur.air_pressure_at_sea_level,
    surface_pressure: cur.air_pressure_at_sea_level,
    wind_speed_10m: cur.wind_speed,
    wind_direction_10m: cur.wind_from_direction,
    wind_gusts_10m: cur.wind_speed_of_gust || cur.wind_speed,
    weather_code: curCode,
    is_day: isDay ? 1 : 0,
    precipitation: cur.precipitation_amount || 0,
    rain: cur.precipitation_amount || 0,
    snowfall: cur.snowfall_amount || 0,
    showers: 0,
    cloud_cover: cur.cloud_area_fraction != null ? cur.cloud_area_fraction : 50,
    visibility: cur.visibility != null ? cur.visibility / 1000 : 10 // Met.no donne en m
  };

  // ---- HOURLY (prochaines 24h) ----
  const hOut = {
    time: [], temperature_2m: [], apparent_temperature: [], weather_code: [],
    precipitation_probability: [], precipitation: [], wind_speed_10m: [],
    wind_gusts_10m: [], cloud_cover: [], relative_humidity_2m: [],
    wind_direction_10m: [], dew_point_2m: [], visibility: []
  };
  // L'API complete a des donnees horaires precises (interval ~ 1h)
  for (const entry of series.slice(0, 24)) {
    if (entry.data.instant && entry.data.instant.details) {
      const d = entry.data.instant.details;
      const n1 = entry.data.next_1_hours;
      const sym = (n1 && n1.summary && n1.summary.symbol_code) || "clearsky";
      hOut.time.push(entry.time);
      hOut.temperature_2m.push(d.air_temperature);
      hOut.apparent_temperature.push(d.apparent_temperature || d.air_temperature);
      hOut.weather_code.push(metNoToWmo(sym));
      hOut.precipitation_probability.push(n1 ? Math.round((n1.details && n1.details.precipitation_amount || 0) * 10) : 0);
      hOut.precipitation.push((n1 && n1.details && n1.details.precipitation_amount) || 0);
      hOut.wind_speed_10m.push(d.wind_speed);
      hOut.wind_gusts_10m.push(d.wind_speed_of_gust || d.wind_speed);
      hOut.cloud_cover.push(d.cloud_area_fraction != null ? d.cloud_area_fraction : 50);
      hOut.relative_humidity_2m.push(d.relative_humidity);
      hOut.wind_direction_10m.push(d.wind_from_direction);
      hOut.dew_point_2m.push(d.dew_point_temperature);
      hOut.visibility.push((d.visibility != null ? d.visibility / 1000 : 10));
    }
  }

  // ---- DAILY (10 jours) ----
  // Pas de donnees daily directes : on agrege depuis hourly.
  // (Met.no a un endpoint forecast qui le fait, mais complete n'agrège pas)
  const dayMap = new Map();
  for (const entry of series) {
    if (entry.data.instant && entry.data.instant.details) {
      const dateKey = entry.time.split("T")[0];
      const d = entry.data.instant.details;
      const n1 = entry.data.next_1_hours;
      const sym = (n1 && n1.summary && n1.summary.symbol_code) || "clearsky";
      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, {
          time: dateKey,
          temps: [],
          syms: [],
          sunRise: null,
          sunSet: null,
          precipitation: 0,
          precipitation_prob: 0,
          uv: 0,
          windMax: 0,
          windGustMax: 0
        });
      }
      const bucket = dayMap.get(dateKey);
      if (d.air_temperature != null) bucket.temps.push(d.air_temperature);
      if (sym) bucket.syms.push(sym);
      if (d.precipitation_amount) bucket.precipitation += d.precipitation_amount;
      if (n1) bucket.precipitation_prob = Math.max(bucket.precipitation_prob,
        n1.details && n1.details.precipitation_amount ? Math.round(n1.details.precipitation_amount * 10) : 0);
      if (d.wind_speed != null) bucket.windMax = Math.max(bucket.windMax, d.wind_speed);
      if (d.wind_speed_of_gust != null) bucket.windGustMax = Math.max(bucket.windGustMax, d.wind_speed_of_gust);
    }
  }
  const dOut = {
    time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [],
    sunrise: [], sunset: [], uv_index_max: [], precipitation_probability_max: [],
    precipitation_sum: [], wind_speed_10m_max: [], wind_gusts_10m_max: [],
    wind_direction_10m_dominant: []
  };
  for (const [dateKey, bucket] of Array.from(dayMap.entries()).slice(0, 10)) {
    dOut.time.push(bucket.time);
    // Symbole dominant du jour (le plus frequent ou le plus severe)
    const symCounts = {};
    bucket.syms.forEach(s => { symCounts[s] = (symCounts[s] || 0) + 1; });
    const dominantSym = Object.entries(symCounts).sort((a, b) => b[1] - a[1])[0][0];
    dOut.weather_code.push(metNoToWmo(dominantSym));
    const tmax = Math.max(...bucket.temps);
    const tmin = Math.min(...bucket.temps);
    dOut.temperature_2m_max.push(tmax);
    dOut.temperature_2m_min.push(tmin);
    dOut.sunrise.push(bucket.sunRise || `${dateKey}T06:00:00Z`);
    dOut.sunset.push(bucket.sunSet || `${dateKey}T18:00:00Z`);
    dOut.uv_index_max.push(bucket.uv);
    dOut.precipitation_probability_max.push(bucket.precipitation_prob);
    dOut.precipitation_sum.push(bucket.precipitation);
    dOut.wind_speed_10m_max.push(bucket.windMax);
    dOut.wind_gusts_10m_max.push(bucket.windGustMax);
    dOut.wind_direction_10m_dominant.push(180); // approx, pas dispo precis en hourly
  }

  return { current, hourly: hOut, daily: dOut };
}

// ============================================================
// Detection d'orage : helper partage entre Open-Meteo et Met.no
// Les codes WMO 95/96/99 et les variantes Met.no "andthunder"
// indiquent tous un orage (avec ou sans grele, intense ou pas).
// ============================================================
const THUNDER_WMO_CODES = new Set([95, 96, 99]);

function isThunderHour(weatherCode) {
  return THUNDER_WMO_CODES.has(weatherCode);
}

// Analyse une serie horaire pour determiner si elle contient des orages
// et quand. Retourne { thunderHours: [indices], maxIntensity: 0..2 }
function analyzeThunder(weatherCodes, hourly = null) {
  const thunderHours = [];
  let maxIntensity = 0;
  for (let i = 0; i < weatherCodes.length; i++) {
    const c = weatherCodes[i];
    if (isThunderHour(c)) {
      thunderHours.push(i);
      // 95 = orage, 96 = orage + grele legere, 99 = orage + grele forte
      maxIntensity = Math.max(maxIntensity, c === 99 ? 2 : (c === 96 ? 1 : 1));
    }
  }
  // Renforce via proba precip + taux : heuristique convective
  if (hourly && hourly.precipitation_probability && hourly.precipitation) {
    for (let i = 0; i < weatherCodes.length; i++) {
      if (thunderHours.includes(i)) continue;
      const pop = hourly.precipitation_probability[i] || 0;
      const mm = hourly.precipitation[i] || 0;
      const code = weatherCodes[i];
      const looksConvective = (mm > 2 && pop > 60) || (pop > 80 && mm > 0.5);
      const isHeavy = code === 65 || code === 82;
      if (looksConvective && isHeavy) {
        thunderHours.push(i);
        maxIntensity = Math.max(maxIntensity, 1);
      }
    }
  }
  return { thunderHours, maxIntensity };
}

// ============================================================
// Resolution multi-sources avec CROSS-VALIDATION des orages
// Strategie :
//  1) Open-Meteo en premier (complet, 10j, sans cle)
//  2) Si Open-Meteo predit des orages (prochaines 24h), on appelle
//     AUSSI Met.no pour confirmation croisee. Si Met.no confirme
//     -> fiabilite HAUTE. Sinon MEDIUM.
//  3) Si Open-Meteo a reussi mais ne predit PAS d'orage, on
//     n'appelle pas Met.no (economie). On note fiabilite NORMAL.
//  4) Si Open-Meteo a echoue, Met.no prend le relais (fallback)
//     avec fiabilite MEDIUM (pas de confirmation croisee).
//  5) Si tout echoue, procedural en dernier recours.
// ============================================================

function attachThunderReliability(w, sourceName) {
  if (!w || !w.hourly || !w.hourly.weather_code) {
    w._thunderReliability = { confidence: 'unknown', sources: [sourceName], thunderHours: [], maxIntensity: 0 };
    return w;
  }
  const codes = w.hourly.weather_code;
  const analysis = analyzeThunder(codes, w.hourly);
  // Determine le timestamp du premier orage (pour affichage)
  let firstThunderTime = null;
  if (analysis.thunderHours.length > 0 && w.hourly.time) {
    firstThunderTime = w.hourly.time[analysis.thunderHours[0]];
  }
  w._thunderReliability = {
    confidence: analysis.thunderHours.length > 0 ? 'medium' : 'none',
    sources: [sourceName],
    thunderHours: analysis.thunderHours.slice(0, 6), // max 6 prochaines heures
    maxIntensity: analysis.maxIntensity,
    firstThunderTime
  };
  return w;
}

function mergeThunderReliability(wOpenMeteo, wMetNo) {
  if (!wOpenMeteo) return wMetNo;
  if (!wMetNo) {
    // Pas de cross-check : fiabilite MEDIUM si OM predit des orages, NONE sinon
    if (wOpenMeteo._thunderReliability && wOpenMeteo._thunderReliability.confidence === 'medium') {
      wOpenMeteo._thunderReliability.confidence = 'medium';
    }
    return wOpenMeteo;
  }
  // Cross-validation reussie : Open-Meteo + Met.no
  const aOpen = wOpenMeteo._thunderReliability || {};
  const aMetNo = wMetNo._thunderReliability || {};
  const bothHaveThunder = aOpen.thunderHours.length > 0 && aMetNo.thunderHours.length > 0;
  const oneHasThunder = aOpen.thunderHours.length > 0 || aMetNo.thunderHours.length > 0;

  let confidence = 'none';
  if (bothHaveThunder) confidence = 'high';
  else if (oneHasThunder) confidence = 'medium';

  wOpenMeteo._thunderReliability = {
    confidence,
    sources: ['open-meteo', 'met.no'],
    thunderHours: aOpen.thunderHours.length >= aMetNo.thunderHours.length ? aOpen.thunderHours : aMetNo.thunderHours,
    thunderHoursAlt: aMetNo.thunderHours,
    maxIntensity: Math.max(aOpen.maxIntensity || 0, aMetNo.maxIntensity || 0),
    firstThunderTime: aOpen.firstThunderTime || aMetNo.firstThunderTime
  };
  return wOpenMeteo;
}

// ============================================================
//  AIR QUALITY : Open-Meteo Air Quality API (gratuit, sans cle)
//  Endpoint: https://air-quality-api.open-meteo.com/v1/air-quality
//  Retourne PM2.5, PM10, ozone, NO2, etc. Utilise pour calculer
//  l'indice AQI europeen simplifie.
// ============================================================
const AQI_CACHE_MS = 30 * 60 * 1000; // 30 min
const aqiCache = new Map();

async function fetchAirQuality(cur, w) {
  if (!state.city) return null;
  const key = `${state.city.lat.toFixed(2)},${state.city.lon.toFixed(2)}`;
  const now = Date.now();
  // Cache hit
  if (aqiCache.has(key)) {
    const c = aqiCache.get(key);
    if (now - c.ts < AQI_CACHE_MS) return c.data;
  }
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?` +
    `latitude=${state.city.lat}&longitude=${state.city.lon}` +
    `&current=pm10,pm2_5,ozone,uv_index,uv_index_clear_sky` +
    `&timezone=auto`;
  try {
    const res = await fetchWithRetry(url, {}, 2);
    if (!res.ok) throw new Error(`AQI HTTP ${res.status}`);
    const json = await res.json();
    const data = json.current || {};
    const pm25 = data.pm2_5;
    const pm10 = data.pm10;
    const o3 = data.ozone;
    // Calcul AQI europeen simplifie (le plus defavorable des 3)
    const aqiPm25 = pm25 != null ? pm25ToAqi(pm25) : null;
    const aqiPm10 = pm10 != null ? pm10ToAqi(pm10) : null;
    const aqiO3 = o3 != null ? o3ToAqi(o3) : null;
    const vals = [aqiPm25, aqiPm10, aqiO3].filter(v => v != null);
    if (vals.length === 0) return null;
    const aqi = Math.max(...vals);
    const result = { aqi, pm25, pm10, o3, aqiPm25, aqiPm10, aqiO3 };
    aqiCache.set(key, { ts: now, data: result });
    return result;
  } catch (e) {
    console.warn('[AQI] Fetch failed:', e.message);
    return null;
  }
}

// Conversions AQI (European AQI simplifie, seuils EEA)
// Source: https://www.airqualitynow.eu/about_indices_definition.php
function pm25ToAqi(pm25) {
  // Seuils EEA PM2.5 (ug/m3 -> AQI 0-100)
  const b = [0, 10, 20, 25, 50, 75, 800]; // breaks
  const i = [0, 25, 50, 75, 100, 150, 200];
  for (let k = 0; k < b.length - 1; k++) {
    if (pm25 <= b[k + 1]) {
      const ratio = (pm25 - b[k]) / (b[k + 1] - b[k]);
      return Math.round(i[k] + ratio * (i[k + 1] - i[k]));
    }
  }
  return 200;
}
function pm10ToAqi(pm10) {
  const b = [0, 20, 40, 50, 100, 150, 1200];
  const i = [0, 25, 50, 75, 100, 150, 200];
  for (let k = 0; k < b.length - 1; k++) {
    if (pm10 <= b[k + 1]) {
      const ratio = (pm10 - b[k]) / (b[k + 1] - b[k]);
      return Math.round(i[k] + ratio * (i[k + 1] - i[k]));
    }
  }
  return 200;
}
function o3ToAqi(o3) {
  // O3 en ug/m3 (open-meteo)
  const b = [0, 60, 120, 180, 240, 360, 800];
  const i = [0, 25, 50, 75, 100, 150, 200];
  for (let k = 0; k < b.length - 1; k++) {
    if (o3 <= b[k + 1]) {
      const ratio = (o3 - b[k]) / (b[k + 1] - b[k]);
      return Math.round(i[k] + ratio * (i[k + 1] - i[k]));
    }
  }
  return 200;
}

// Niveau + label pour l'AQI
function aqiLevel(aqi) {
  if (aqi <= 25) return { label: "Excellent", color: "#34c759", emoji: "🟢" };
  if (aqi <= 50) return { label: "Bon", color: "#a3d977", emoji: "🟢" };
  if (aqi <= 75) return { label: "Moyen", color: "#ffd60a", emoji: "🟡" };
  if (aqi <= 100) return { label: "Médiocre", color: "#ff9500", emoji: "🟠" };
  if (aqi <= 150) return { label: "Mauvais", color: "#ff3b30", emoji: "🔴" };
  return { label: "Très mauvais", color: "#af52de", emoji: "🟣" };
}

function renderAqi(aqiData) {
  const aqi = $("aqi");
  const aqiSub = $("aqiSub");
  const aqiBar = $("aqiBar");
  if (!aqi || !aqiSub) return;
  const lvl = aqiLevel(aqiData.aqi);
  aqi.textContent = `${aqiData.aqi}`;
  aqiSub.textContent = `${lvl.emoji} ${lvl.label}`;
  if (aqiBar) {
    // Bar de 0-200, on remplit selon aqi/200
    const pct = Math.min(100, (aqiData.aqi / 200) * 100);
    aqiBar.style.width = `${pct}%`;
    aqiBar.style.background = lvl.color;
  }
}

async function fetchWeatherReliable(lat, lon, signal = null) {
  // ============================================================
  // CROSS-VALIDATION OPEN-METEO + MET.NO :
  // - Fetch Open-Meteo (principal, tres complet)
  // - Si orage predit, fetch Met.no pour confirmer (gratuit, ultra-fiable)
  // - Si Open-Meteo KO, fallback Met.no
  // ============================================================
  // Essai 1 : Open-Meteo
  let openMeteoData = null;
  let metNoData = null;
  try {
    openMeteoData = await callOpenMeteo(lat, lon, signal);
    openMeteoData = attachThunderReliability(openMeteoData, 'open-meteo');
  } catch (e1) {
    console.warn("[Meteo] Open-Meteo echec, essai Met.no :", e1.message);
  }

  // Detection orage par Open-Meteo : predire pour decider si on appelle Met.no
  const omPredictsThunder = openMeteoData &&
    openMeteoData._thunderReliability &&
    openMeteoData._thunderReliability.thunderHours.length > 0;

  if (openMeteoData) {
    if (omPredictsThunder) {
      // Open-Meteo predit un orage -> on appelle Met.no pour cross-validation
      try {
        metNoData = await callMetNo(lat, lon, signal);
        metNoData = attachThunderReliability(metNoData, 'met.no');
        const merged = mergeThunderReliability(openMeteoData, metNoData);
        // Track les sources utilisees pour le badge UI
        merged._source = 'Open-Meteo + Met.no';
        merged._sourcesUsed = ['Open-Meteo', 'Met.no'];
        return merged;
      } catch (eMet) {
        console.warn("[Meteo] Met.no cross-check a echoue (orage non confirme par 2e source) :", eMet.message);
        // On garde Open-Meteo seul -> fiabilite MEDIUM
        return openMeteoData;
      }
    }
    // Pas d'orage predit : Open-Meteo seul suffit, pas de 2e appel
    return openMeteoData;
  }

  // Open-Meteo a totalement echoue -> fallback Met.no
  try {
    metNoData = await callMetNo(lat, lon, signal);
    metNoData = attachThunderReliability(metNoData, 'met.no');
    return metNoData;
  } catch (e2) {
    console.warn("[Meteo] Met.no echec aussi :", e2.message);
  }
  // Echec total
  throw new Error("Toutes les sources meteo ont echoue");
}

// Convertit la reponse Open-Meteo vers le format interne de l'app.
// Renvoie directement { current, hourly, daily } avec les memes champs
// que ceux consommes par le reste du code.
function openMeteoToInternal(json) {
  const cur = json.current || {};
  const h = json.hourly || {};
  const d = json.daily || {};

  // Trouver l'index de l'heure la plus proche de maintenant dans hourly.
  // IMPORTANT : utiliser un buffer de 2h en arriere pour garantir que
  // l'heure COURANTE est toujours incluse. Open-Meteo a des entrees
  // horaires sur l'heure pile (10:00, 11:00). Si on est a 10h59, le
  // buffer doit depasser 1h59 sinon l'array commence a 10:00 et la
  // cellule "Maint." affiche 11:00 (heure suivante) au lieu de 10:00.
  // Avec 2h de buffer, on a toujours au moins 2h d'historique en memoire,
  // et le code de rendu utilise une comparaison de timestamps pour
  // positionner la cellule "Maint." exactement sur l'heure courante.
  const nowMs = Date.now();
  let startIdx = 0;
  if (h.time && h.time.length) {
    for (let i = 0; i < h.time.length; i++) {
      if (new Date(h.time[i]).getTime() >= nowMs - 120 * 60000) {
        startIdx = i;
        break;
      }
    }
  }
  // Garde 48h a partir de maintenant (2 jours) pour eviter les trous
  const sliceEnd = Math.min(startIdx + 48, h.time ? h.time.length : 0);

  const hourly = {
    time: h.time ? h.time.slice(startIdx, sliceEnd) : [],
    temperature_2m: h.temperature_2m ? h.temperature_2m.slice(startIdx, sliceEnd) : [],
    apparent_temperature: h.apparent_temperature ? h.apparent_temperature.slice(startIdx, sliceEnd) : [],
    weather_code: h.weather_code ? h.weather_code.slice(startIdx, sliceEnd) : [],
    precipitation_probability: h.precipitation_probability ? h.precipitation_probability.slice(startIdx, sliceEnd) : [],
    precipitation: h.precipitation ? h.precipitation.slice(startIdx, sliceEnd) : [],
    rain: h.rain ? h.rain.slice(startIdx, sliceEnd) : [],
    showers: h.showers ? h.showers.slice(startIdx, sliceEnd) : [],
    snowfall: h.snowfall ? h.snowfall.slice(startIdx, sliceEnd) : [],
    wind_speed_10m: h.wind_speed_10m ? h.wind_speed_10m.slice(startIdx, sliceEnd) : [],
    wind_gusts_10m: h.wind_gusts_10m ? h.wind_gusts_10m.slice(startIdx, sliceEnd) : [],
    wind_direction_10m: h.wind_direction_10m ? h.wind_direction_10m.slice(startIdx, sliceEnd) : [],
    cloud_cover: h.cloud_cover ? h.cloud_cover.slice(startIdx, sliceEnd) : [],
    relative_humidity_2m: h.relative_humidity_2m ? h.relative_humidity_2m.slice(startIdx, sliceEnd) : [],
    pressure_msl: h.pressure_msl ? h.pressure_msl.slice(startIdx, sliceEnd) : [],
    surface_pressure: h.surface_pressure ? h.surface_pressure.slice(startIdx, sliceEnd) : [],
    dew_point_2m: h.dew_point_2m ? h.dew_point_2m.slice(startIdx, sliceEnd) : [],
    visibility: h.visibility ? h.visibility.slice(startIdx, sliceEnd) : []
  };

  // daily : Open-Meteo retourne jusqu'a forecast_days (10) jours
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

  // current : on s'assure que tous les champs attendus sont la
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
    snowfall: cur.snowfall,
    showers: cur.showers,
    cloud_cover: cur.cloud_cover,
    visibility: h.visibility ? h.visibility[startIdx] : null
  };

  return { current, hourly, daily };
}

// ---------- Données climatiques mensuelles ----------
// 5 bandes de latitude : 0=polaire(66-90°), 1=subpolaire(55-66°),
// 2=tempérée(40-55°), 3=subtropicale(25-40°), 4=tropicale(0-25°)
// Pour chaque bande : 12 mois de [temp_moy, ampl_diurne, hum%, precip_j/30, nuages%, vent_kmh]
const CLIMATE = [
  // Bande 0: Polaire 66-90° (Arctique, Antarctique) - inchangé, déjà réaliste
  [[-16,-14,-10,-4,2,8,12,10,6,0,-6,-12],[3,4,5,6,8,10,10,9,7,5,3,3],[82,80,78,75,72,68,70,74,78,80,82,83],[16,14,13,11,9,7,9,11,13,15,17,17],[72,70,66,62,56,50,52,58,64,68,72,74],[24,22,20,18,16,14,15,16,18,20,22,24]],
  // Bande 1: Subpolaire 55-66° (Scandinavie, Sibérie) - léger ajustement amplitude
  [[-7,-5,0,5,10,15,17,16,11,5,0,-5],[4,5,6,8,10,11,11,10,9,7,5,4],[84,82,78,74,70,66,68,72,76,80,82,84],[18,16,15,13,11,10,11,13,15,17,19,20],[76,74,70,64,58,54,54,58,64,70,74,76],[20,18,16,15,14,13,13,14,15,16,18,20]],
  // Bande 2: Tempérée 40-55° (France, UK, Allemagne, nord USA)
  // CORRIGÉ : été moins chaud, amplitude réduite, plus de pluie
  [[4,5,8,11,15,18,20,20,16,12,7,5],[5,6,7,8,9,10,10,9,8,7,6,5],[83,80,76,72,68,64,62,64,68,74,80,84],[13,12,12,11,10,9,9,10,11,12,14,14],[70,66,62,56,52,48,46,48,52,58,64,70],[18,17,16,14,12,11,11,12,14,16,17,18]],
  // Bande 3: Subtropicale 25-40° (Méditerranée, Japon, sud USA)
  // CORRIGÉ : été moins extrême, plus de précipitations, amplitude réduite
  [[9,11,14,17,21,25,27,27,24,19,14,10],[7,8,9,10,11,11,11,11,10,9,8,7],[72,68,64,60,56,55,55,56,58,62,68,74],[10,9,9,7,5,5,5,5,6,8,9,10],[54,50,46,42,36,32,30,32,36,42,48,54],[13,12,11,10,9,8,8,9,10,11,12,13]],
  // Bande 4: Tropicale 0-25° (Amazonie, Indonésie, Congo)
  // CORRIGÉ : plus de précipitations cohérent avec climats tropicaux
  [[25,25,26,26,27,27,27,27,27,27,26,25],[8,8,8,8,8,8,8,8,8,8,8,8],[80,78,76,74,72,70,70,72,74,76,78,80],[12,10,10,8,6,4,4,6,8,10,12,14],[60,56,52,48,44,40,40,44,48,52,58,62],[8,8,7,7,6,6,6,6,7,7,8,8]]
];

const MEAN_PRESSURE = [1008,1012,1015,1017,1010];
const DOMINANT_WIND = [270,260,250,90,85];

// États météo WMO : [code, nom, facteur_nuage, facteur_precip, seuil_temp_neige]
const STATES = [
  [0,'clear',0.05,0,-99],[1,'mainly_clear',0.2,0,-99],[2,'partly_cloudy',0.4,0.05,-99],
  [3,'overcast',0.85,0.1,-99],[45,'fog',0.9,0,-99],[51,'drizzle',0.85,0.3,-99],
  [61,'rain',0.9,0.6,2],[65,'heavy_rain',0.95,0.9,2],[71,'snow',0.9,0.6,99],
  [75,'heavy_snow',0.95,0.9,99],[95,'thunderstorm',0.95,0.85,5]
];

// ---------- RNG déterministe ----------
function seededRand(seed) {
  let t = seed >>> 0; t = Math.imul(t ^ (t >>> 15), 1 | t);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- Helpers climatiques ----------
function getBand(lat) { const a=Math.abs(lat); return a>=66?0: a>=55?1: a>=40?2: a>=25?3: 4; }

function smoothVal(data, day) {
  const p = (day/365*12)%12; const i=Math.floor(p); const f=p-i; const t=f*f*(3-2*f);
  return data[i] + (data[(i+1)%12]-data[i])*t;
}

// ---------- Calculs astronomiques ----------
function calcSun(lat, lon, day) {
  const rad=Math.PI/180;
  const clampedLat=Math.max(-66.5,Math.min(66.5,lat));
  const dec=23.44*rad*Math.sin((2*Math.PI/365)*(day-81));
  const latR=clampedLat*rad;
  const cosH=-Math.tan(latR)*Math.tan(dec);
  // acos retourne des radians → convertir en heures : *180/π puis /15
  const dayHalfHours=Math.acos(Math.max(-1,Math.min(1,cosH)))*12/Math.PI;
  const noon=12-lon/15;
  if(dayHalfHours===0) return{sunrise:12,sunset:12}; // nuit polaire
  return{sunrise:noon-dayHalfHours,sunset:noon+dayHalfHours};
}

function dateToISO(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0'),h=String(date.getHours()).padStart(2,'0'),min=String(date.getMinutes()).padStart(2,'0');return y+'-'+m+'-'+d+'T'+h+':'+min;}

// ---------- Calculs dérivés ----------
function dewPt(t,h){const a=17.27,b=237.7,g=a*t/(b+t)+Math.log(h/100);return b*g/(a-g);}
function appTemp(t,wind,hum){
  if(t<10&&wind>5){const wc=13.12+0.6215*t-11.37*wind**0.16+0.3965*t*wind**0.16;return+wc.toFixed(1);}
  if(t>20&&hum>40){const hi=-8.7847+1.6114*t+2.3385*hum-0.1461*t*hum-0.0123*t*t-0.0164*hum*hum+0.0022*t*t*hum+0.0007*t*hum*hum-0.00001*t*t*hum*hum;return+hi.toFixed(1);}
  return t;
}

// ---------- Distribution météo par bande/mois ----------
function weatherWeights(band, month, seed) {
  const rng = () => seededRand(seed++);
  const c=CLIMATE[band]; const m=month-1;
  const t=c[0][m], pDays=c[3][m], cloud=c[4][m], hum=c[2][m];
  const pProb=pDays/30; const isCold=t<5; const isWarm=t>18; const isHot=t>28; const isHumid=hum>50;
  const clearW=Math.max(0.02,(100-cloud)/100);
  const cloudW=Math.max(0.02,cloud/100);
  const w=[0,0,0,0,0,0,0,0,0,0,0];
  // Ciel dégagé → couvert basé sur la couverture nuageuse
  // Plus de poids sur les états nuageux quand cloud est élevé
  w[0]=clearW*0.20;   w[1]=clearW*0.18;
  w[2]=0.10+0.08*cloudW; // partiellement nuageux corrélé à la couverture
  w[3]=cloudW*0.35;
  // Brouillard (quand humide et frais)
  if(hum>75&&t<18&&t>-3) w[4]=0.06+0.06*rng();
  // Précipitations (seuil abaissé à 1% pour inclure les mois secs)
  if(pProb>0.01){
    const rainBase=Math.min(pProb,0.5)*0.7;
    if(isCold){w[8]=rainBase*0.45;w[9]=rainBase*0.10;w[6]=rainBase*0.10;}
    else{w[5]=rainBase*0.15;w[6]=rainBase*0.45;w[7]=rainBase*0.12;}
    // Orages : quand chaud + humide ou instable
    if((isHot&&hum>40)||(isWarm&&isHumid))w[10]=Math.min(pProb,0.4)*0.5+0.04*rng();
    // Bruine possible même par faible proba
    if(!isCold&&pProb<0.2)w[5]=Math.max(w[5],0.02+0.03*rng());
  }
  return w;
}

// Choisit un état météo selon les poids, avec persistance Markov
// Retourne l'index du tableau STATES
function pickState(weights, prevState, persist) {
  if(prevState!=null&&seededRand(~~(persist*1e6))<0.55) return prevState;
  const total=weights.reduce((a,b)=>a+b,0); if(total<=0) return 0;
  const r=seededRand(~~(persist*1e6+prevState*100))*total;
  let acc=0;
  for(let i=0;i<weights.length;i++){acc+=weights[i];if(r<acc)return i;}
  return weights.length-1;
}

// ---------- Génération météo pour un jour ----------
function genDayWeather(band, lat, lon, dayOfYear, daySeed, isToday) {
  const rad=Math.PI/180; const rng=()=>seededRand(daySeed++);
  // Ajustement hémisphère sud : décaler le climat de 6 mois
  const hemAdj=lat<0?183:0; const adjDay=(dayOfYear+hemAdj)%365||365;
  const month=((adjDay/365*12)%12)+1;
  const c=CLIMATE[band]; const tMean=smoothVal(c[0],adjDay);
  const tRange=smoothVal(c[1],adjDay); const hMean=smoothVal(c[2],adjDay);
  const wMean=smoothVal(c[5],adjDay); const cloudMean=smoothVal(c[4],adjDay);
  const HOURS=[];

  // Choisir l'état météo du jour
  const weights=weatherWeights(band,month,daySeed+1000);
  const stateIdx=pickState(weights,isToday?null: (daySeed%100<30?0:3), daySeed);
  const state=STATES[stateIdx]; const wmoCode=state[0]; const cloudFactor=state[2];
  const precipFactor=state[3]; const snowThreshold=state[4];

  // Température de base du jour (moyenne ± variation aléatoire réaliste)
  const dayTempBase=tMean+(rng()-0.5)*tRange*0.6;
  const isSnow=wmoCode>=71&&wmoCode<=75;
  const isRain=wmoCode>=51&&wmoCode<=65||wmoCode===95;
  const tempAdj=isSnow?-2:isRain?-1:0;

  // Date de base = minuit UTC du jour
  const baseDate=new Date(dayOfYear*86400000+new Date(Date.UTC(2024,0,0)).getTime());
  // Heures de lever/coucher (format ISO en UTC avec Z)
  const sun=calcSun(lat,lon,dayOfYear);
  // Gestion du débordement jour UTC (sunset après minuit / sunrise avant)
  const riseH=((sun.sunrise%24)+24)%24; const riseDayOff=Math.floor(sun.sunrise/24);
  const setH=((sun.sunset%24)+24)%24; const setDayOff=Math.floor(sun.sunset/24);
  const riseDate=new Date(Date.UTC(2024,0,dayOfYear+riseDayOff,Math.floor(riseH),Math.round((riseH%1)*60)));
  const setDate=new Date(Date.UTC(2024,0,dayOfYear+setDayOff,Math.floor(setH),Math.round((setH%1)*60)));
  // Formater "YYYY-MM-DDTHH:MMZ" (UTC explicite)
  function fmtUTC(d){const y=d.getUTCFullYear(),mo=String(d.getUTCMonth()+1).padStart(2,'0'),da=String(d.getUTCDate()).padStart(2,'0'),h=String(d.getUTCHours()).padStart(2,'0'),mi=String(d.getUTCMinutes()).padStart(2,'0');return y+'-'+mo+'-'+da+'T'+h+':'+mi+'Z';}
  const sunriseStr=fmtUTC(riseDate); const sunsetStr=fmtUTC(setDate);

  // Générer les 24h

  for(let h=0;h<24;h++){
    // Température diurne : min à 5h, max à 17h (5 PM) - sinusoïde réaliste
    const diurnalFactor=-Math.cos(2*Math.PI*(h-5)/24); // -1 à 5h, +1 à 17h
    const hourTemp=dayTempBase+tempAdj+diurnalFactor*tRange/2+(rng()-0.5)*1.5;

    // Humidité
    const hourHum=Math.min(98,Math.max(20,hMean-(diurnalFactor*8)+(isRain?12:0)+(rng()-0.5)*6));

    // Nuages
    const hourCloud=Math.min(100,Math.max(0,cloudMean*0.3+cloudFactor*70+(rng()-0.5)*15));

    // Précipitations
    let precip=0,pop=0;
    if(isRain||isSnow){
      pop=Math.min(100,Math.round(precipFactor*90+15*(rng()-0.5)));
      if(rng()<precipFactor*0.6+0.2){
        precip=+(rng()*precipFactor*4+(stateIdx===7||stateIdx===9?rng()*6:0)).toFixed(1);
      }
    }

    // Vent
    const baseWind=wMean+(rng()-0.5)*8;
    const gust=baseWind*(1.3+rng()*0.5);
    const windDir=DOMINANT_WIND[band]+Math.round((rng()-0.5)*40);

    // Point de rosée
    const dew=dewPt(hourTemp,hourHum);

    // Timestamp ISO en heure locale (sans fuseau, comme Open-Meteo)
    const dt=new Date(baseDate); dt.setHours(h,0,0,0);
    const iso=dateToISO(dt);

    HOURS.push({
      time:iso, temperature_2m:+hourTemp.toFixed(1),
      apparent_temperature:+appTemp(hourTemp,baseWind,hourHum).toFixed(1),
      weather_code:wmoCode, precipitation_probability:pop,
      precipitation:precip, wind_speed_10m:+Math.max(0,baseWind).toFixed(1),
      wind_gusts_10m:+Math.max(0,gust).toFixed(1),
      cloud_cover:Math.round(hourCloud),
      relative_humidity_2m:Math.round(hourHum),
      wind_direction_10m:(windDir+360)%360
    });
  }

  // Agrégats journaliers
  const temps=HOURS.map(h=>h.temperature_2m);
  const tMax=Math.max(...temps); const tMin=Math.min(...temps);
  const pops=HOURS.map(h=>h.precipitation_probability);
  const maxPop=Math.max(...pops);
  const totalPrecip=+HOURS.reduce((s,h)=>s+h.precipitation,0).toFixed(1);
  const windMax=+Math.max(...HOURS.map(h=>h.wind_speed_10m)).toFixed(1);
  const gustMax=+Math.max(...HOURS.map(h=>h.wind_gusts_10m)).toFixed(1);
  const domWind=HOURS.reduce((a,h)=>a+h.wind_direction_10m,0)/24;

  const dayDateStr=baseDate.toISOString().split('T')[0];

  return {
    daily:{time:dayDateStr,weather_code:wmoCode,temperature_2m_max:+tMax.toFixed(1),temperature_2m_min:+tMin.toFixed(1),
      sunrise:sunriseStr,sunset:sunsetStr,uv_index_max:+Math.max(0,6*Math.sin(Math.PI*(month+1)/12)+rng()*2-1).toFixed(1),
      precipitation_probability_max:maxPop,precipitation_sum:totalPrecip,
      wind_speed_10m_max:windMax,wind_gusts_10m_max:gustMax,wind_direction_10m_dominant:Math.round(domWind)},
    hourly:HOURS,
    stateIdx
  };
}

// ---------- Point d'entrée : récupère la météo REELLE via sources multiples ----------
// Ordre : Open-Meteo -> Met.no -> fallback procedural
async function fetchWeather(lat, lon, lite = false, signal = null) {
  try {
    const data = await fetchWeatherReliable(lat, lon, signal);
    // Sauvegarde dans le cache offline (seulement les donnees completes)
    if (!lite && data) {
      saveToCache(lat, lon, data);
    }
    return data;
  } catch (e) {
    // Toutes les sources ont echoue. Essai 1 : cache offline.
    if (!lite) {
      const cached = loadFromCache(lat, lon);
      if (cached && cached.data) {
        console.warn(`[Meteo] Sources KO, fallback cache offline (${cached.ageMin} min)`);
        // Marquer comme "donnees anciennes"
        cached.data._fromCache = true;
        cached.data._cacheAgeMin = cached.ageMin;
        return cached.data;
      }
    }
    // Essai 2 : procedural (derniere chance)
    console.warn("[Meteo] toutes les sources ont echoue, fallback procedural :", e.message);
    return await fetchWeatherProcedural(lat, lon, lite, signal);
  }
}

async function fetchWeatherProcedural(lat, lon, lite = false, signal = null) {
  const now=new Date();
  const dayOfYear=Math.floor((now-new Date(now.getFullYear(),0,0))/86400000);
  const hour=now.getHours(); const minute=now.getMinutes();
  const band=getBand(lat);
  const baseSeed=Math.round((lat+lon)*100+dayOfYear*31);

  // ---- Jour 0 (aujourd'hui) ----
  const today=genDayWeather(band,lat,lon,dayOfYear,baseSeed,true);
  const hourIdx=Math.min(hour,23);
  const cur=today.hourly[hourIdx];

  // ---- Jours 1-9 ----
  const dailyArr=[today.daily];
  // On accumule le stateIdx pour la chaîne de Markov
  let prevStateIdx=today.stateIdx;
  for(let d=1;d<10;d++){
    const day=genDayWeather(band,lat,lon,dayOfYear+d,baseSeed+d*1000,false);
    // Ajuster l'état pour la cohérence Markov
    const hemAdj=lat<0?183:0; const adjDayM=(dayOfYear+d+hemAdj)%365||365;
    const w=weatherWeights(band,Math.floor(adjDayM/365*12)%12+1,baseSeed+d*2000);
    day.stateIdx=pickState(w,prevStateIdx,baseSeed+d*3000);
    prevStateIdx=day.stateIdx;
    const st=STATES[day.stateIdx];
    // Ré-générer avec le bon état
    const fixedDay=genDayWeather(band,lat,lon,dayOfYear+d,baseSeed+d*1000+day.stateIdx*500,false);
    // Corriger le weather_code du daily
    fixedDay.daily.weather_code=st[0];
    dailyArr.push(fixedDay.daily);
  }

  // ---- Assembler le résultat ----
  const result={
    current:{
      time:cur.time,
      temperature_2m:cur.temperature_2m,
      relative_humidity_2m:cur.relative_humidity_2m,
      apparent_temperature:cur.apparent_temperature,
      is_day:cur.time?(()=>{
        const h=new Date(cur.time).getUTCHours();
        const s=calcSun(lat,lon,dayOfYear);
        return(h>=s.sunrise&&h<s.sunset)?1:0;
      })():1,
      precipitation:cur.precipitation,
      rain:cur.precipitation,
      showers:0,
      snowfall:(STATES[today.stateIdx][0]>=71)?cur.precipitation:0,
      weather_code:cur.weather_code,
      cloud_cover:cur.cloud_cover,
      pressure_msl:+MEAN_PRESSURE[band],
      surface_pressure:+MEAN_PRESSURE[band],
      wind_speed_10m:cur.wind_speed_10m,
      wind_gusts_10m:cur.wind_gusts_10m,
      wind_direction_10m:cur.wind_direction_10m,
      dew_point_2m:+dewPt(cur.temperature_2m,cur.relative_humidity_2m).toFixed(1),
      visibility:STATES[today.stateIdx][0]>=45?(2+seededRand(baseSeed+hour)*8):(15+seededRand(baseSeed+hour)*20)
    },
    hourly:{
      time:today.hourly.map(h=>h.time),
      temperature_2m:today.hourly.map(h=>h.temperature_2m),
      apparent_temperature:today.hourly.map(h=>h.apparent_temperature),
      weather_code:today.hourly.map(h=>h.weather_code),
      precipitation_probability:today.hourly.map(h=>h.precipitation_probability),
      precipitation:today.hourly.map(h=>h.precipitation),
      wind_speed_10m:today.hourly.map(h=>h.wind_speed_10m),
      wind_gusts_10m:today.hourly.map(h=>h.wind_gusts_10m),
      cloud_cover:today.hourly.map(h=>h.cloud_cover),
      relative_humidity_2m:today.hourly.map(h=>h.relative_humidity_2m),
      wind_direction_10m:today.hourly.map(h=>h.wind_direction_10m)
    },
    daily:{
      time:dailyArr.map(d=>d.time),
      weather_code:dailyArr.map(d=>d.weather_code),
      temperature_2m_max:dailyArr.map(d=>d.temperature_2m_max),
      temperature_2m_min:dailyArr.map(d=>d.temperature_2m_min),
      sunrise:dailyArr.map(d=>d.sunrise),
      sunset:dailyArr.map(d=>d.sunset),
      uv_index_max:dailyArr.map(d=>d.uv_index_max),
      precipitation_probability_max:dailyArr.map(d=>d.precipitation_probability_max),
      precipitation_sum:dailyArr.map(d=>d.precipitation_sum),
      wind_speed_10m_max:dailyArr.map(d=>d.wind_speed_10m_max),
      wind_gusts_10m_max:dailyArr.map(d=>d.wind_gusts_10m_max),
      wind_direction_10m_dominant:dailyArr.map(d=>d.wind_direction_10m_dominant)
    }
  };

  return result;
}

// ============================================================
//  REFRESH ENGINE v3 - full refresh 60s + interpolation + smart diffing
// ============================================================
const REFRESH_LIVE_MS = 60 * 1000;     // fetch live chaque 60s
const INTERPOLATE_MS = 1000;           // tick d'interpolation chaque seconde
const REFRESH_FORECAST_MS = 60 * 1000; // re-render forecast complet chaque 60s (etait 5 min)
// FAST POLL : micro-fetch toutes les 20s pour detecter la pluie/orage
// le plus tot possible (sans attendre 60s). Cible uniquement les
// parametres "current" (tres leger, pas de forecast).
const FAST_POLL_MS = 20 * 1000;
let fastPollTimerId = null;
let lastObservedMm = 0; // pour detecter le debut/fin de pluie

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

  // ===== ETAPE 2 : Forecast prochaine fenetre (avec detection POP amelioree) =====
  let lastRaining = false;
  for (let i = 0; i < Math.min(lookaheadHours, hourly.time.length); i++) {
    const t = new Date(hourly.time[i]).getTime();
    // Pendant la premiere heure, le code WMO hourly reflete souvent
    // l'observation actuelle. On le skip si on a deja une observation.
    if (t < curMs + 30 * 60 * 1000) continue;
    const c = hourly.weather_code[i];
    const pop = (hourly.precipitation_probability && hourly.precipitation_probability[i]) || 0;
    const mm = (hourly.precipitation && hourly.precipitation[i]) || 0;
    // Detection amelioree avec 3 niveaux :
    // 1. Code WMO precip connu (certain)
    // 2. POP eleve + mm >= 0.1 (probable)
    // 3. POP tres eleve (>=70%) meme sans mm (risque)
    const isRaining = PRECIP.includes(c)
                   || (pop >= 40 && mm >= 0.1)
                   || (pop >= 70);

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
      // Detection neige (temp basse + POP)
      const curTemp = (hourly.temperature_2m && hourly.temperature_2m[i]) || 5;
      if (curTemp <= 1.5 && pop >= 30 && (c === 71 || c === 73 || c === 75 || c === 77 || c === 85 || c === 86)) {
        result.snowRisk = true;
      }
    } else if (lastRaining && result.starting && !result.ending) {
      result.ending = t;
      result.endInMinutes = Math.round((t - curMs) / 60000);
    }
    // Detection POP eleve SANS pluie confirmee : risque
    if (!isRaining && pop >= 70) {
      result.popRisk = pop;
      if (!result.raining) {
        result.raining = true;
        result.starting = t;
        result.inMinutes = Math.max(0, Math.round((t - curMs) / 60000));
      }
    }
    lastRaining = isRaining || (pop >= 70);
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

  // Orage observe : UNIQUEMENT si on observe aussi de la pluie/precipitation
  // Sinon le code 95/96/99 (prevu par modele) est affiche alors qu'aucun orage
  // n'est reellement visible -> flash desagreable "Orages" puis mise a jour.
  if (code >= 95 && code <= 99 && (mm > 0.05 || rainMm > 0.05 || showerMm > 0.05)) {
    if (code === 99 || (mm >= 8)) return { code: 99, label: 'Orages violents', icon: 'thunder-storm', override: true };
    return { code: 95, label: 'Orages', icon: 'thunder', override: true };
  }
  // Garde anti-faux-orage : si code 95/96/99 mais AUCUNE precip observee
  // et que le code horaire suivant n'est PAS un orage -> on demod l'affichage
  // vers un label plus realiste (couvert) pour eviter le flash "Orages".
  if (code >= 95 && code <= 99) {
    const cloudCover = (cur && (cur.cloud_cover !== undefined ? cur.cloud_cover : null));
    if (cloudCover === null || cloudCover >= 70) {
      // Couverture nuageuse elevee SANS pluie : orage "prevu" mais pas observe
      // On affiche "Couvert" au lieu de "Orages" pour eviter le flash faux.
      return { code: 3, label: 'Couvert', icon: 'cloudy', override: true, realCode: code };
    }
    // Sinon ciel partiellement nuageux : "Risque d'orages" (info mais moins alarmiste)
    return { code: code, label: code === 99 ? 'Risque d\'orages violents' : 'Risque d\'orages', icon: code === 99 ? 'thunder-storm' : 'thunder', override: true, realCode: code };
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
    const fetchStartMs = Date.now();
    const lite = await fetchWeather(city.lat, city.lon, true);
    const fetchMs = Date.now() - fetchStartMs;
    // Verifie que la requete est toujours pertinente
    if (myRequestId !== state.requestId) return;
    if (!lite || !lite.current) return;

    console.log(`[Refresh] tickLive fetch OK en ${fetchMs}ms (prochain dans 60s)`);

    // Lissage des temperatures lite pour stabilite visuelle
    smoothTemperature(lite);

    prevLiveData = currLiveData;
    currLiveData = lite;
    lastFetchMs = Date.now();
    state.lastRefreshMs = lastFetchMs;

    // Synchronise state.lastWeather.current avec l'observation live
    // pour que generateDescription/condition voient toujours les dernieres donnees
    if (state.lastWeather) {
      state.lastWeather.current = lite.current;
    }

    // Met a jour aussi hourly + daily avec les donnees live pour eviter
    // que la barre de previsions reste figee entre deux full refresh (5 min)
    if (state.lastWeather && lite.hourly && lite.hourly.time && lite.hourly.time.length > 0) {
      state.lastWeather.hourly = lite.hourly;
    }
    if (state.lastWeather && lite.daily && lite.daily.time && lite.daily.time.length > 0) {
      state.lastWeather.daily = lite.daily;
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
          // Reset du lisseur lors d'un premier fetch (pas d'historique)
          resetTempSmoother();
          smoothTemperature(full);
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
    if (myRequestId === state.requestId) {
      applyLiveTick();
      flashRefreshIndicator();
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (myRequestId !== state.requestId) return;
    console.warn('tickLive failed:', e);
  }
  if (myRequestId === state.requestId) updateUpdatedAt();
}

// ============================================================
//  FAST TICK (20s) : micro-poll des precipitations pour detecter
//  pluie/orage le plus vite possible. Cible uniquement les
//  parametres "current" (tres leger : ~1KB de reponse).
//  Limite : Open-Meteo met a jour ses donnees toutes les ~5-15min,
//  donc ce poll ne detecte que ce qui est deja observe par leur station.
// ============================================================
let fastPollInFlight = false;
async function fastTick() {
  if (!state.city) return;
  if (fastPollInFlight) return; // anti-stacking
  if (document.body.classList.contains("loading")) return;
  fastPollInFlight = true;
  const myRequestId = state.requestId;
  try {
    // Fetch ultra-leger : juste current (precipitation + weather_code + temperature)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${state.city.lat}&longitude=${state.city.lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timeout);
    if (myRequestId !== state.requestId) return;
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.current) return;
    const cur = data.current;
    // Met a jour currLiveData.current avec les dernieres observations
    if (currLiveData) {
      currLiveData.current = { ...currLiveData.current, ...cur };
    } else if (state.lastWeather && state.lastWeather.current) {
      state.lastWeather.current = { ...state.lastWeather.current, ...cur };
    }
    // Detection "instantanee" : si precipitation passe de 0 a >0 (ou >2)
    // et que le weather_code devient pluie/orage -> mise a jour immediate
    const mm = (cur.precipitation || 0);
    const code = cur.weather_code;
    const wasRaining = lastObservedMm > 0.05;
    const isRaining = mm > 0.05;
    const rainStarted = isRaining && !wasRaining;
    const rainStopped = !isRaining && wasRaining;
    const isThunder = code >= 95 && code <= 99;
    if (rainStarted || rainStopped || isThunder) {
      console.log(`[FastTick] Pluie ${rainStarted ? 'demarree' : rainStopped ? 'arretée' : ''} ${isThunder ? '+ orage' : ''} (${mm.toFixed(2)}mm/h, code=${code})`);
      // Force applyLiveTick pour mettre a jour la condition visuellement
      applyLiveTick();
      // Met a jour la banniere pluie / orage maintenant
      updateRainAlert();
      updateThunderBanner();
      flashRefreshIndicator();
    }
    lastObservedMm = mm;
    // Maj de lastRefreshMs pour le compteur "Mis a jour il y a"
    lastFetchMs = Date.now();
    state.lastRefreshMs = lastFetchMs;
    updateUpdatedAt();
  } catch (e) {
    // Silencieux : c'est un fast poll, pas grave si echoue
  } finally {
    fastPollInFlight = false;
  }
}

function startFastPoll() {
  if (fastPollTimerId) return;
  // Premier check rapide 5s apres lancement
  setTimeout(fastTick, 5 * 1000);
  // Puis toutes les 20s
  fastPollTimerId = setInterval(fastTick, FAST_POLL_MS);
  console.log(`[FastTick] Poll precip toutes les ${FAST_POLL_MS/1000}s`);
}

function stopFastPoll() {
  if (fastPollTimerId) {
    clearInterval(fastPollTimerId);
    fastPollTimerId = null;
  }
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

  // Maj description generee : throttled intelligent
  // Evite de regenerer chaque seconde : ne regenere que si le contenu change
  if (state.lastWeather) {
    const newDesc = generateDescription(state.lastWeather);
    const curDesc = $('descText').textContent;
    if (newDesc && newDesc !== curDesc) {
      setText('descText', newDesc);
    }
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

  // Detection vigilance precoce (2-3h avant)
  updateVigilanceBanner();

  // Mode demo : cycle de conditions pour tester l'UI
  applyDemoMode();

  // Mettre a jour uniquement les % du hourly sans re-render complet
  applyHourlyInterpolation();
}

// ============================================================
// MODE DEMO / AUTO-TEST
// Active via ?demo=1 dans l'URL ou en tapant "demo" sur le clavier.
// Cycle de conditions meteo toutes les 60s pour verifier que
// toutes les animations, icones, descriptions et bandeaux marchent.
// Apres un cycle complet, revient aux donnees reelles.
// ============================================================
const DEMO_CODES = [
  { code: 0,  label: "Ciel clair" },
  { code: 1,  label: "Plutot ensoleille" },
  { code: 2,  label: "Partiellement nuageux" },
  { code: 3,  label: "Nuageux" },
  { code: 45, label: "Brouillard" },
  { code: 48, label: "Brouillard givrant" },
  { code: 51, label: "Bruine legere" },
  { code: 61, label: "Pluie faible" },
  { code: 63, label: "Pluie moderee" },
  { code: 65, label: "Forte pluie" },
  { code: 71, label: "Neige faible" },
  { code: 75, label: "Forte neige" },
  { code: 80, label: "Averses" },
  { code: 95, label: "Orage" },
  { code: 96, label: "Orage + grele" },
  { code: 99, label: "Orage violent" }
];
let demoActive = false;
let demoIndex = 0;
let demoLastSwitchMs = 0;
const DEMO_INTERVAL_MS = 60 * 1000; // 60s par condition

function checkDemoMode() {
  // Detection via URL : ?demo=1
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1') {
    demoActive = true;
  }
  // Detection via touche "demo" tapee au clavier
  let keyBuffer = '';
  document.addEventListener('keydown', (e) => {
    if (e.key && e.key.length === 1) {
      keyBuffer += e.key.toLowerCase();
      if (keyBuffer.length > 10) keyBuffer = keyBuffer.slice(-10);
      if (keyBuffer.endsWith('demo')) {
        demoActive = !demoActive;
        keyBuffer = '';
        if (demoActive) {
          demoIndex = 0;
          demoLastSwitchMs = 0;
          console.log('[DEMO] Mode demo active');
        } else {
          console.log('[DEMO] Mode demo desactive');
          // Force un re-render avec les vraies donnees
          if (state.lastWeather && state.city) {
            renderCity(state.city, state.lastWeather);
          }
        }
      }
    }
  });
}

function applyDemoMode() {
  const badge = $('demoBadge');
  if (!demoActive) {
    if (badge) badge.classList.remove('visible');
    return;
  }
  if (!state.lastWeather) return;
  const now = Date.now();

  // Premier passage
  if (demoLastSwitchMs === 0) {
    demoLastSwitchMs = now;
  }

  // Toutes les 60s, on passe a la condition suivante
  if (now - demoLastSwitchMs >= DEMO_INTERVAL_MS) {
    demoLastSwitchMs = now;
    demoIndex = (demoIndex + 1) % DEMO_CODES.length;

    // Si on a fait un cycle complet, on desactive le mode demo
    if (demoIndex === 0) {
      // Apres un cycle complet, on refait un render avec les vraies donnees
      console.log('[DEMO] Cycle complet, retour aux donnees reelles');
      demoActive = false;
      if (badge) badge.classList.remove('visible');
      if (state.lastWeather && state.city) {
        renderCity(state.city, state.lastWeather);
      }
      return;
    }
  }

  // Applique la condition demo sur les donnees courantes
  const demo = DEMO_CODES[demoIndex];
  if (demo && state.lastWeather.current) {
    state.lastWeather.current.weather_code = demo.code;
    // Simule des precipitations pour les codes pluvieux
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(demo.code)) {
      state.lastWeather.current.precipitation = demo.code >= 65 ? 2.5 : (demo.code >= 61 ? 1.0 : 0.3);
      state.lastWeather.current.rain = state.lastWeather.current.precipitation;
    } else {
      state.lastWeather.current.precipitation = 0;
      state.lastWeather.current.rain = 0;
    }
    // Simule l'orage pour les codes 95+
    if ([95, 96, 99].includes(demo.code)) {
      state.lastWeather._thunderReliability = {
        confidence: 'high',
        sources: ['demo'],
        thunderHours: [0],
        maxIntensity: demo.code === 99 ? 2 : 1,
        firstThunderTime: new Date().toISOString()
      };
    } else {
      state.lastWeather._thunderReliability = { confidence: 'none', sources: [], thunderHours: [], maxIntensity: 0 };
    }
  }

  // Affiche le badge demo
  if (badge) {
    badge.textContent = `MODE DEMO - ${demo.label} (${demoIndex + 1}/${DEMO_CODES.length})`;
    badge.classList.add('visible');
  }

  // Re-render la description et les bandeaux avec la condition simulee
  if (state.lastWeather) {
    const newDesc = generateDescription(state.lastWeather);
    if (newDesc) setText('descText', newDesc);
    updateRainAlert();
    updateThunderBanner();
    updateVigilanceBanner();
  }
}

// ============================================================
// VIGILANCE PRECOCE : detecte pluie/orage 2-3h avant l'arrivee
// Niveau de vigilance :
//   - VERT : aucun risque dans les 3 prochaines heures
//   - JAUNE : risque (PoP >= 30%) dans 2-3h
//   - ORANGE : risque dans 1-2h
//   - ROUGE : risque dans < 1h (imminent)
// ============================================================
function updateVigilanceBanner() {
  const banner = $('vigilanceBanner');
  if (!banner) return;
  if (!state.lastWeather || !state.lastWeather.hourly) {
    banner.classList.remove('visible');
    return;
  }
  const hourly = state.lastWeather.hourly;
  if (!hourly.time || !hourly.weather_code) {
    banner.classList.remove('visible');
    return;
  }

  const now = Date.now();
  const PRECIP_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
  const THUNDER_CODES = [95, 96, 99];

  // Scanne les 3 prochaines heures
  let firstPrecip = null;  // { tMs, code, pop, mm }
  let firstThunder = null; // { tMs, code }

  for (let i = 0; i < Math.min(3, hourly.time.length); i++) {
    const tMs = new Date(hourly.time[i]).getTime();
    if (isNaN(tMs)) continue;
    const inMin = Math.round((tMs - now) / 60000);
    if (inMin < 0) continue; // skip past hours

    const code = hourly.weather_code[i];
    const pop = (hourly.precipitation_probability && hourly.precipitation_probability[i]) || 0;
    const mm = (hourly.precipitation && hourly.precipitation[i]) || 0;

    const isPrecip = PRECIP_CODES.includes(code) || (pop >= 40 && mm >= 0.1);
    const isThunder = THUNDER_CODES.includes(code);

    if (!firstPrecip && isPrecip) {
      firstPrecip = { tMs, code, pop, mm, inMin };
    }
    if (!firstThunder && isThunder) {
      firstThunder = { tMs, code, inMin };
    }
    if (firstPrecip && firstThunder) break;
  }

  // Si rien dans les 3h, on cache
  if (!firstPrecip && !firstThunder) {
    banner.classList.remove('visible');
    return;
  }

  // Determiner le niveau et le message
  const event = firstThunder || firstPrecip;
  const inMin = event.inMin;
  const isThunder = !!firstThunder;

  let level, icon, msg;

  if (inMin <= 60) {
    // ROUGE : < 1h
    level = 'level-red';
    icon = isThunder ? '&#9889;' : '&#127783;&#65039;';
    msg = isThunder ? 'Orage imminent' : 'Pluie imminente';
  } else if (inMin <= 120) {
    // ORANGE : 1-2h
    level = 'level-orange';
    icon = isThunder ? '&#9889;' : '&#127783;&#65039;';
    msg = isThunder ? 'Orage dans 1-2h' : 'Pluie dans 1-2h';
  } else {
    // JAUNE : 2-3h
    level = 'level-yellow';
    icon = isThunder ? '&#9889;' : '&#128167;';
    msg = isThunder ? 'Vigilance orage 2-3h' : 'Vigilance pluie 2-3h';
  }

  // Ajoute le detail de probabilite
  let detail = '';
  if (firstPrecip && firstPrecip.pop > 0) {
    detail = ` (${Math.round(firstPrecip.pop)}% de probabilite)`;
  }

  const timingLabel = inMin <= 60 ? `~${inMin} min` : `~${Math.round(inMin / 60)}h`;
  const html = `<span class="vigilance-icon">${icon}</span>${msg}${detail}<span class="vigilance-timing">${timingLabel}</span>`;

  if (banner.innerHTML !== html) {
    banner.innerHTML = html;
    banner.className = 'vigilance-banner ' + level;
  }
  banner.classList.add('visible');
}

// Met a jour les % hourly avec interpolation
function applyHourlyInterpolation() {
  if (!state.lastWeather || !hourlyCells.length) return;
  // Priorite : livePrecipHourly (refresh chaque minute) > state.lastWeather.hourly
  const hourly = livePrecipHourly || (state.lastWeather && state.lastWeather.hourly);
  if (!hourly || !hourly.time) return;
  const now = Date.now();

  hourlyCells.forEach(cell => {
    const i = cell.idx;
    // Skip cells sans donnees (placeholder en attente du full)
    if (!hourly.time || hourly.time[i] == null) return;
    if (!hourly.precipitation_probability || hourly.precipitation_probability[i] == null) return;
    const targetPop = hourly.precipitation_probability[i];
    const targetMm = (hourly.precipitation && hourly.precipitation[i]) || 0;
    // IMPORTANT : affichage DIRECT (pas d'interpolation entre prev et target).
    // L'interpolation lisse trop les % et cache les changements reels.
    // On veut voir le % tel qu'il est MAINTENANT dans les donnees, pas une
    // moyenne qui ne bouge presque pas.
    // Arrondi a 5% pres pour eviter le clignotement si la valeur oscille
    // entre 47 et 49 par exemple.
    const rounded = Math.round(targetPop / 5) * 5;
    const visible = rounded >= 5;
    const txt = visible ? rounded + '%' : '';
    const heavy = targetPop >= 70 || targetMm >= 4;
    const medium = !heavy && (targetPop >= 30 || targetMm >= 1);
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
  // Risque pluie (POP eleve sans mm confirme): bandeau "Risque de pluie"
  if (!msg && info.popRisk) {
    msg = `Risque de pluie (${info.popRisk}%) dans ${info.inMinutes} min.`;
  }
  // Risque neige (temp basse + POP)
  if (!msg && info.snowRisk) {
    msg = `Risque de neige dans ${info.inMinutes} min.`;
  }

  if (msg) {
    if (banner.textContent !== msg) banner.textContent = msg;
    banner.classList.add('visible');
  } else {
    banner.classList.remove('visible');
  }

  // Bandeau orage : uniquement si fiabilite 'high' (double validation OK)
  updateThunderBanner();
}

// Bandeau d'alerte orage (cross-validation Open-Meteo + Met.no)
// SEUIL ABAISSE : on affiche aussi en fiabilite 'medium' (1 seule source
// detecte l'orage). L'utilisateur prefere etre alerte meme si une seule
// source le predit plutot que de rater un orage reel.
function updateThunderBanner() {
  const banner = $('thunderBanner');
  if (!banner) return;
  const w = state.lastWeather;
  if (!w) { banner.classList.remove('visible'); return; }
  const rel = w._thunderReliability;
  // Detection locale depuis le current weather_code (toujours dispo)
  const curCode = w.current && w.current.weather_code;
  const isCurThunder = curCode && [95, 96, 99].includes(curCode);
  // Detection croisee Open-Meteo + Met.no
  const omPredictsThunder = rel && rel.thunderHours && rel.thunderHours.length > 0;
  // Detection par proba orageuse (POP eleve + code precip intense)
  let popThreat = false;
  if (w.hourly && w.hourly.precipitation_probability && w.hourly.weather_code) {
    for (let i = 0; i < Math.min(6, w.hourly.time.length); i++) {
      const pop = w.hourly.precipitation_probability[i] || 0;
      const code = w.hourly.weather_code[i];
      if (pop >= 70 && code && [61, 63, 65, 80, 81, 82].includes(code)) {
        popThreat = true;
        break;
      }
    }
  }
  // On affiche SI :
  // - Orage detecte par 2 sources (high confidence), OU
  // - Orage detecte par 1 source (medium confidence), OU
  // - Orage EN COURS (current weather_code 95/96/99), OU
  // - Pluie intense imminente avec forte probabilite
  if (!omPredictsThunder && !isCurThunder && !popThreat) {
    banner.classList.remove('visible');
    return;
  }
  // Determiner le label de confiance
  let confidenceLabel = '';
  if (rel && rel.confidence === 'high') confidenceLabel = 'CONFIRME 2 sources';
  else if (rel && rel.confidence === 'medium') confidenceLabel = 'Prevu par 1 source';
  else if (isCurThunder) confidenceLabel = 'En cours';
  else confidenceLabel = 'Risque eleve';
  // Intensite
  const intensityLabel = rel && rel.maxIntensity === 2 ? " avec risque de grele forte"
                       : rel && rel.maxIntensity === 1 ? " avec grele possible"
                       : "";
  // Timing
  let timing = "imminent";
  let firstTime = rel && rel.firstThunderTime;
  // Fallback: chercher la premiere heure avec code 95/96/99 dans hourly
  if (!firstTime && w.hourly && w.hourly.time && w.hourly.weather_code) {
    for (let i = 0; i < w.hourly.time.length; i++) {
      if ([95, 96, 99].includes(w.hourly.weather_code[i])) {
        firstTime = w.hourly.time[i];
        break;
      }
    }
  }
  if (firstTime && w.hourly && w.hourly.time) {
    const now = Date.now();
    const tMs = new Date(firstTime).getTime();
    const inMin = Math.round((tMs - now) / 60000);
    if (inMin > 5 && inMin < 60) timing = `dans ${inMin} min`;
    else if (inMin >= 60 && inMin < 180) timing = `dans ${Math.round(inMin / 60)}h`;
    else if (inMin >= 180) timing = `dans ${Math.round(inMin / 60)}h`;
    else if (inMin <= 5) timing = "imminent";
  }
  const msg = `<span class="thunder-icon">&#9889;</span>Orages ${timing}${intensityLabel}<span class="thunder-confidence">${confidenceLabel}</span>`;
  if (banner.innerHTML !== msg) banner.innerHTML = msg;
  banner.classList.add('visible');
}

// ============================================================
// LISSEUR DE TEMPERATURES : elimine les micro-variations entre
// les sources et lisse temporellement entre deux fetch.
// Objectif : stabilite visuelle sans perte de reactivite.
// ============================================================
const tempSmoother = {
  history: [],          // [{tMs, t, feels, humidity, wind, pop}, ...]
  maxLen: 5,            // 5 dernieres observations
  maxJump: 2.5          // saut max tolere entre 2 obs (degC) sinon rejet
};

function smoothTemperature(newData) {
  if (!newData || !newData.current) return newData;
  const cur = newData.current;
  const rawT = cur.temperature_2m;
  const rawFeels = cur.apparent_temperature;
  const rawHum = cur.relative_humidity_2m;
  if (typeof rawT !== 'number') return newData;

  // IMPORTANT : on stocke les valeurs BRUTES dans l'historique, pas les
  // valeurs lissees, sinon le lissage se cumule a chaque appel et la
  // temperature devient de plus en plus inertielle (bug precedent).

  // Etape 1 : rejet des outliers (saut > 2.5 degC vs derniere obs brute)
  let t = rawT, feels = rawFeels, hum = rawHum;
  const lastRaw = tempSmoother.history[tempSmoother.history.length - 1];
  if (lastRaw && tempSmoother.history.length >= 2 &&
      Math.abs(rawT - lastRaw.rawT) > tempSmoother.maxJump) {
    // Saut absurde : remplace par la mediane des 3 dernieres observations BRUTES
    const recent = tempSmoother.history.slice(-3).map(h => h.rawT).sort((a, b) => a - b);
    t = recent[1];
    if (typeof rawFeels === 'number') {
      const recentF = tempSmoother.history.slice(-3).map(h => h.rawFeels).sort((a, b) => a - b);
      feels = recentF[1];
    }
  }

  // Etape 2 : moyenne ponderee avec la derniere observation LISSEE
  // (pour stabilite visuelle sans accumuler l'inertie)
  let smoothedT = t;
  let smoothedFeels = feels;
  let smoothedHum = hum;
  const lastSmoothed = tempSmoother.history.length > 0
    ? tempSmoother.history[tempSmoother.history.length - 1] : null;
  if (lastSmoothed && typeof lastSmoothed.smoothedT === 'number') {
    const alpha = 0.7; // 70% nouvelle obs brute, 30% ancien lissE
    smoothedT = alpha * t + (1 - alpha) * lastSmoothed.smoothedT;
    if (typeof feels === 'number' && typeof lastSmoothed.smoothedFeels === 'number') {
      smoothedFeels = alpha * feels + (1 - alpha) * lastSmoothed.smoothedFeels;
    }
    if (typeof hum === 'number' && typeof lastSmoothed.smoothedHum === 'number') {
      smoothedHum = alpha * hum + (1 - alpha) * lastSmoothed.smoothedHum;
    }
  }

  // Etape 3 : ecriture des valeurs lissees dans current
  cur.temperature_2m = smoothedT;
  if (typeof smoothedFeels === 'number') cur.apparent_temperature = smoothedFeels;
  if (typeof smoothedHum === 'number') cur.relative_humidity_2m = smoothedHum;

  // Etape 4 : push en memoire (BRUT + LISSE pour les deux usages)
  tempSmoother.history.push({
    tMs: Date.now(),
    rawT, rawFeels, rawHum,         // pour detection outlier et mediane
    smoothedT, smoothedFeels, smoothedHum  // pour moyenne ponderee
  });
  if (tempSmoother.history.length > tempSmoother.maxLen) {
    tempSmoother.history.shift();
  }
  return newData;
}

function resetTempSmoother() {
  tempSmoother.history.length = 0;
}

// Re-render complet du forecast (hourly + daily + description)
// Appele apres chaque fetch live pour les donnees de forecast
async function refreshForecastIfNeeded() {
  if (!state.city || !lastFullRenderMs) return;
  if (Date.now() - lastFullRenderMs < REFRESH_FORECAST_MS) return;
  // Ne pas resync si un changement de ville est en cours (skeleton actif)
  if (document.body.classList.contains("loading")) return;
  const myRequestId = state.requestId;
  const refreshStartMs = Date.now();
  try {
    const full = await fetchWeather(state.city.lat, state.city.lon, false);
    if (myRequestId !== state.requestId) return;
    if (full && full.current) {
      // Lissage des temperatures pour stabilite visuelle
      smoothTemperature(full);
      state.lastWeather = full;
      lastFullRenderMs = Date.now();
      state.lastRefreshMs = Date.now();  // MAJ horodatage refresh pour UI
      renderCity(state.city, full);
      updateUpdatedAt();
      // Log console pour verification
      const fetchMs = Date.now() - refreshStartMs;
      console.log(`[Refresh] Forecast complet OK en ${fetchMs}ms (next dans ${REFRESH_FORECAST_MS/1000}s)`);
      // Flash visuel sur le hourly pour feedback utilisateur
      flashRefreshIndicator();
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (myRequestId !== state.requestId) return;
    console.warn('[Refresh] Forecast refresh failed:', e);
  }
}

// Flash visuel bref quand le forecast se met a jour (sinon invisible si donnees identiques)
function flashRefreshIndicator() {
  const hourly = $('hourly');
  if (!hourly) return;
  hourly.classList.add('refresh-flash');
  setTimeout(() => hourly.classList.remove('refresh-flash'), 600);
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
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=fr&zoom=12`,
      { headers: { "Accept": "application/json" } },
      6000
    );
    if (!res.ok) return "Position actuelle";
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
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&accept-language=fr&addressdetails=1`,
      { headers: { "Accept": "application/json" } },
      6000
    );
    if (!res.ok) return [];
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
  // IMPORTANT : utiliser classifyLiveCondition EN PREMIER pour que le rendu
  // initial soit coherent avec ce que applyLiveTick affichera juste apres.
  // Sinon on voit 1 flash "Orages" puis 1 sec apres la vraie condition.
  const liveInfo = classifyLiveCondition(cur);
  const info = liveInfo || wmoInfo(code, isNight);
  const finalCode = liveInfo ? liveInfo.code : code;

  // Theme
  app.className = "app " + themeFor(finalCode, dayCycle, cur.wind_speed_10m);

  // Canvas particles based on weather (basé sur code override inclus)
  if ([95,96,99].includes(finalCode)) {
    setParticleType("rain"); // Storm = heavy rain particles
  } else if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(finalCode)) {
    setParticleType("rain");
  } else if ([71,73,75,77,85,86].includes(finalCode)) {
    setParticleType("snow");
  } else if (isNight && [0,1,2].includes(finalCode)) {
    setParticleType("stars");
  } else {
    setParticleType("none");
  }

  // Location
  $("cityName").textContent = city.name;
  $("temp").textContent = fmtTemp(cur.temperature_2m);
  $("condition").textContent = info.label;
  $("hilo").textContent = `H:${fmtTemp(daily.temperature_2m_max[0])}  L:${fmtTemp(daily.temperature_2m_min[0])}`;

  // Description : template instantane + IA en arriere-plan (refresh 60s)
  // Description : UNIQUEMENT le template intelligent local.
// Aucun appel LLM : evite le "hop" template -> IA desagable.
// Le template analyse meteo + heure + tendance temperature + pluie
// + vent + ressenti pour generer UNE description stable.
  const descEl = $("descText");
  if (descEl) {
    descEl.textContent = generateDescription(w);
    descEl.dataset.rendered = "1";
  }

  // ===== Hourly =====
  const $hourly = $("hourly");
  $hourly.innerHTML = "";
  hourlyCells.length = 0;

  // Determiner l'heure actuelle
  const currentHour = getHourFromISO(cur.time);
  // Trouver l'index de l'heure courante dans hourly.time.
  // On cherche par comparaison de timestamps REELS (pas juste l'heure) pour
  // eviter les bugs a 9H30, 10H30 ou les changements d'heure sont ambigus.
  let nowIdx = -1;
  if (hourly && hourly.time && hourly.time.length > 0) {
    const curMs = cur.time ? new Date(cur.time).getTime() : Date.now();
    if (!isNaN(curMs)) {
      // Trouve l'heure la plus proche de curMs (precedente ou egale)
      let bestDiff = Infinity;
      for (let i = 0; i < hourly.time.length; i++) {
        const tMs = new Date(hourly.time[i]).getTime();
        if (isNaN(tMs)) continue;
        if (tMs <= curMs) {
          const diff = curMs - tMs;
          if (diff < bestDiff) {
            bestDiff = diff;
            nowIdx = i;
          }
        }
      }
    }
    if (nowIdx < 0) {
      // Fallback : match par heure uniquement
      nowIdx = hourly.time.findIndex(t => getHourFromISO(t) === currentHour);
    }
    if (nowIdx < 0) nowIdx = 0; // dernier fallback
  }
  // Forcer 24 cellules meme si hourly est vide (lite phase)
  const TOTAL_HOURS = 24;
  const hasHourlyData = hourly && hourly.time && hourly.time.length > 0;

  for (let k = 0; k < TOTAL_HOURS; k++) {
    const i = hasHourlyData ? (nowIdx + k) : k;
    const hasData = hasHourlyData && i < hourly.time.length;
    const h = document.createElement("div");
    h.className = "hour";
    const isNow = k === 0;
    let timeLabel;
    let hourCode;
    let hourTemp;
    let hourIsNight;
    let pop = 0;
    let mmHour = 0;
    let popVisible = false;
    let popClass = '';
    if (hasData) {
      timeLabel = isNow ? "Maint." : fmtHourLabel(hourly.time[i]);
      hourCode = isNow ? cur.weather_code : hourly.weather_code[i];
      hourTemp = isNow ? cur.temperature_2m : hourly.temperature_2m[i];
      hourIsNight = isNow ? isNight : isHourAtNight(hourly.time[i], daily);
      pop = (hourly.precipitation_probability && hourly.precipitation_probability[i]) || 0;
      mmHour = (hourly.precipitation && hourly.precipitation[i]) || 0;
      popVisible = pop >= 1;
      if (pop >= 70 || mmHour >= 4) popClass = ' heavy';
      else if (pop >= 30 || mmHour >= 1) popClass = ' medium';
    } else {
      // Pas de donnee : construire l'heure depuis maintenant + k
      const baseTime = cur.time ? new Date(cur.time) : new Date();
      baseTime.setMinutes(0, 0, 0);
      baseTime.setHours(baseTime.getHours() + k);
      timeLabel = isNow ? "Maint." : fmtHourLabel(baseTime.toISOString());
      hourCode = cur.weather_code || 0;
      hourTemp = cur.temperature_2m;
      hourIsNight = baseTime.getHours() >= 21 || baseTime.getHours() < 6;
      // Pas de precip connue -> placeholder
    }
    const wi = wmoInfo(hourCode, hourIsNight);
    // IMPORTANT : meme arrondi a 5% pres que applyHourlyInterpolation
    // pour eviter le flash "3%" -> "5%" au lancement. Avant, le render
    // initial utilisait Math.round(pop) (unite) puis l'interpolation
    // passait a Math.round(pop/5)*5 (5% pres) -> saute de 3 a 5.
    const popRounded = Math.round(pop / 5) * 5;
    const popVisibleRounded = popRounded >= 5;
    h.innerHTML = `
      <div class="hour-time">${timeLabel}</div>
      <div class="hour-icon">${icon(wi.icon, 32)}</div>
      <div class="hour-pop${popVisibleRounded ? popClass : " empty"}">${popVisibleRounded ? popRounded + "%" : ""}</div>
      <div class="hour-temp${hasData ? "" : " pending"}">${hasData ? fmtTemp(hourTemp) : "—"}</div>
    `;
    $hourly.appendChild(h);
    hourlyCells.push({
      idx: i,
      root: h,
      elTime: h.querySelector(".hour-time"),
      elIcon: h.querySelector(".hour-icon"),
      elPop: h.querySelector(".hour-pop"),
      elTemp: h.querySelector(".hour-temp"),
      isNight: hourIsNight,
      isPopVisible: popVisible,
      isNow,
      hasData,
      k
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
    if (hasData = true) di.classList.add("clickable"); // toujours cliquable
    const lo = daily.temperature_2m_min[i];
    const hi = daily.temperature_2m_max[i];
    const hasData = lo != null && hi != null;
    const startPct = hasData ? ((lo - allMin) / range) * 100 : 0;
    const endPct = hasData ? ((hi - allMin) / range) * 100 : 100;
    const wi = wmoInfo(daily.weather_code[i], false);
    const popDay = (daily.precipitation_probability_max && daily.precipitation_probability_max[i]) || 0;
    const popVisible = popDay >= 5;
    if (!hasData) di.classList.add("day-empty");
    di.setAttribute("role", "button");
    di.setAttribute("tabindex", "0");
    di.setAttribute("data-day-idx", i);
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
    // Click handler : ouvre le panneau de detail du jour
    di.addEventListener("click", () => openDayDetail(i, w));
    di.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDayDetail(i, w);
      }
    });
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
  // Tendance pression : compare avec il y a 3h (indicateur meteo)
  const pressureArrow = $("pressureTrendArrow");
  if (pressureArrow && w.hourly && w.hourly.surface_pressure) {
    const pNow = w.hourly.surface_pressure[0];
    const pPast = w.hourly.surface_pressure[3];
    if (pNow != null && pPast != null) {
      const delta = pNow - pPast;
      if (delta > 0.5) {
        pressureArrow.textContent = "↑";
        pressureArrow.className = "trend-arrow rising";
        $("pressureSub").textContent = `En hausse (+${delta.toFixed(1)} hPa/3h)`;
      } else if (delta < -0.5) {
        pressureArrow.textContent = "↓";
        pressureArrow.className = "trend-arrow falling";
        $("pressureSub").textContent = `En baisse (${delta.toFixed(1)} hPa/3h)`;
      } else {
        pressureArrow.textContent = "→";
        pressureArrow.className = "trend-arrow stable";
        $("pressureSub").textContent = "Stable";
      }
    } else {
      pressureArrow.textContent = "";
      $("pressureSub").textContent = (cur.surface_pressure || cur.pressure_msl) > 1013 ? "Au-dessus moyenne" : "En dessous moyenne";
    }
  }
  // Declenche le fetch qualite de l'air (async, non-bloquant)
  fetchAirQuality(cur, w).then(aqiData => {
    if (aqiData) renderAqi(aqiData);
  }).catch(() => {
    // Silencieux : pas d'AQI si l'API echoue
    const aqi = $("aqi");
    const aqiSub = $("aqiSub");
    if (aqi) aqi.textContent = "—";
    if (aqiSub) aqiSub.textContent = "Indice indisponible";
  });

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
  const el = $("updatedAt");
  if (!el) return;
  const diff = Math.floor((Date.now() - state.lastRefreshMs) / 1000);
  // Si on est en mode cache (reseau KO), badge special "donnees anciennes"
  if (state.lastWeather && state.lastWeather._fromCache) {
    const ageMin = state.lastWeather._cacheAgeMin || Math.floor(diff / 60);
    el.textContent = `⚠️ Données en cache (${ageMin} min) — réseau indisponible`;
    el.classList.add('stale');
  } else {
    el.classList.remove('stale');
    if (diff < 60) {
      el.textContent = `Mis à jour il y a ${diff}s`;
    } else {
      const min = Math.floor(diff / 60);
      el.textContent = `Mis à jour il y a ${min} min`;
    }
  }
  // Badge source : montre quelle API a fourni les donnees + score qualite
  const badge = $("sourceBadge");
  if (badge && state.lastWeather) {
    const src = state.lastWeather._source || state.lastWeather._sourcesUsed;
    const q = state.lastWeather._quality && state.lastWeather._quality.score;
    if (src) {
      const sources = Array.isArray(src) ? src.join(' + ') : src;
      const qualityLabel = q != null
        ? `<span class="quality">qualité ${q}/100</span>`
        : '';
      badge.innerHTML = `Source : ${sources}${qualityLabel}`;
    } else {
      badge.textContent = '';
    }
  }
}

// ============================================================
//  Load : Charger la météo pour une ville
// ============================================================
//  DAY DETAIL : panneau de details quand on clique sur un jour
//  dans la liste des 10 jours. Affiche temp min/max, condition,
//  precip, vent, UV, lever/coucher, et le detail heure par heure.
// ============================================================
function openDayDetail(dayIdx, w) {
  if (!w || !w.daily || !w.daily.time || !w.daily.time[dayIdx]) return;
  const d = w.daily;
  const h = w.hourly || {};
  const dayDate = d.time[dayIdx];
  const code = d.weather_code[dayIdx];
  const lo = d.temperature_2m_min[dayIdx];
  const hi = d.temperature_2m_max[dayIdx];
  const rainSum = (d.precipitation_sum && d.precipitation_sum[dayIdx]) || 0;
  const rainHours = (d.precipitation_hours && d.precipitation_hours[dayIdx]) || 0;
  const popMax = (d.precipitation_probability_max && d.precipitation_probability_max[dayIdx]) || 0;
  const windMax = (d.wind_speed_10m_max && d.wind_speed_10m_max[dayIdx]) || 0;
  const gustMax = (d.wind_gusts_10m_max && d.wind_gusts_10m_max[dayIdx]) || windMax * 1.4;
  const uvMax = (d.uv_index_max && d.uv_index_max[dayIdx]) || 0;
  const sunrise = d.sunrise && d.sunrise[dayIdx];
  const sunset = d.sunset && d.sunset[dayIdx];

  // Nom du jour (Auj. / Dem. / jour de la semaine)
  const name = dayName(dayDate, dayIdx);
  $("dayDetailName").textContent = name;
  // Date formatee
  try {
    const dateObj = new Date(dayDate);
    $("dayDetailDate").textContent = dateObj.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long"
    });
  } catch (e) {
    $("dayDetailDate").textContent = dayDate;
  }

  // Hero : icone + min/max + condition
  const wi = wmoInfo(code, false);
  $("dayDetailIcon").innerHTML = icon(wi.icon, 64);
  $("dayDetailLow").textContent = lo != null ? fmtTemp(lo) : "—";
  $("dayDetailHigh").textContent = hi != null ? fmtTemp(hi) : "—";
  $("dayDetailCondition").textContent = wi.label;

  // Stats : pluie / vent / UV / soleil
  if (rainSum > 0) {
    $("dayDetailRain").textContent = `${rainSum.toFixed(1)} mm`;
    $("dayDetailRainSub").textContent = `${rainHours.toFixed(1)}h · ${Math.round(popMax)}%`;
  } else {
    $("dayDetailRain").textContent = "0 mm";
    $("dayDetailRainSub").textContent = `${Math.round(popMax)}% proba.`;
  }
  $("dayDetailWind").textContent = `${Math.round(windMax)} km/h`;
  $("dayDetailWindSub").textContent = `Rafales ${Math.round(gustMax)}`;
  $("dayDetailUv").textContent = uvMax.toFixed(1);
  $("dayDetailUvSub").textContent = uvLevel(uvMax).label;
  $("dayDetailSun").textContent = sunrise ? fmtTime(sunrise) : "--";
  $("dayDetailSunSub").textContent = sunset ? `↓ ${fmtTime(sunset)}` : "";

  // Detail heure par heure pour ce jour
  const hourlyEl = $("dayDetailHourly");
  hourlyEl.innerHTML = "";
  if (h.time && h.time.length) {
    // Trouve toutes les heures qui correspondent a ce jour
    const dayStr = dayDate.substring(0, 10); // "YYYY-MM-DD"
    const dayHours = [];
    for (let i = 0; i < h.time.length; i++) {
      if (h.time[i] && h.time[i].startsWith(dayStr)) {
        dayHours.push(i);
      }
      // Stop apres 24 entrees (max 1 jour)
      if (dayHours.length >= 24) break;
    }
    if (dayHours.length === 0) {
      // Fallback : prendre 24h a partir de minuit du jour
      for (let i = 0; i < h.time.length && dayHours.length < 24; i++) {
        dayHours.push(i);
      }
    }
    dayHours.forEach((idx) => {
      const t = h.time[idx];
      const temp = h.temperature_2m ? h.temperature_2m[idx] : null;
      const codeH = h.weather_code ? h.weather_code[idx] : 0;
      const popH = h.precipitation_probability ? (h.precipitation_probability[idx] || 0) : 0;
      const mmH = h.precipitation ? (h.precipitation[idx] || 0) : 0;
      const wiH = wmoInfo(codeH, isHourAtNight(t, d));
      const rounded = Math.round(popH / 5) * 5;
      const popVis = rounded >= 5;
      const row = document.createElement("div");
      row.className = "day-detail-hour-row";
      row.innerHTML = `
        <div class="ddh-time">${fmtHourLabel(t)}</div>
        <div class="ddh-icon">${icon(wiH.icon, 22)}</div>
        <div class="ddh-temp">${temp != null ? fmtTemp(temp) : "—"}</div>
        <div class="ddh-pop${popVis ? "" : " empty"}">${popVis ? rounded + "%" : ""}</div>
      `;
      hourlyEl.appendChild(row);
    });
  } else {
    hourlyEl.innerHTML = "<p style='opacity:0.5; text-align:center; padding:20px'>Données horaires indisponibles</p>";
  }

  // Ouvre le panneau
  $("dayDetailPanel").classList.add("open");
}

function closeDayDetail() {
  $("dayDetailPanel").classList.remove("open");
}

// Niveau d'UV (label pour le detail du jour)
function uvLevel(uv) {
  if (uv < 3) return { label: "Faible" };
  if (uv < 6) return { label: "Modéré" };
  if (uv < 8) return { label: "Élevé" };
  if (uv < 11) return { label: "Très élevé" };
  return { label: "Extrême" };
}

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
  // Reinitialise l'animation shimmer en supprimant/ajoutant la classe
  // sur tous les elements qui ont le shimmer inline (defense en profondeur)
  const shimmered = document.querySelectorAll('.temp, .condition, .hilo, .desc-card p, .detail-value, .detail-sub, .hour-time, .hour-temp, .hour-icon, .day-name, .day-low, .day-high, #cityName');
  shimmered.forEach(el => {
    el.style.color = '';
    el.style.background = '';
    el.style.animation = '';
  });
  // Force aussi cityName::after (spinner) a disparaitre
  const cityName = $('cityName');
  if (cityName) cityName.classList.remove('loading-city');
}

// Point d'entree unique pour changer de ville. Annule toute requete
// precedente, vide l'UI, affiche le skeleton, puis lance le fetch.
async function switchCity(city) {
  if (!city || city.lat == null || city.lon == null) return;

  // Ferme le panneau de detail d'un jour s'il est ouvert
  const dayDetail = $("dayDetailPanel");
  if (dayDetail) dayDetail.classList.remove("open");

  // 1) Annule toutes les requetes reseau en cours
  if (state.currentFetchController) {
    try { state.currentFetchController.abort(); } catch (e) {}
  }
  const controller = new AbortController();
  state.currentFetchController = controller;

  // Reset le flag "first render" pour que la nouvelle ville
  // beneficie du template instantane + IA en arriere-plan
  const descEl = $("descText");
  if (descEl) delete descEl.dataset.rendered;

  // SECURITE : timeout 8s pour forcer la suppression du skeleton
  const skeletonTimeout = setTimeout(() => {
    if (document.body.classList.contains('loading')) {
      console.warn('Skeleton timeout - force disable');
      disableSkeleton();
      // Affiche un message d'erreur clair
      const c = $('cityName');
      if (c && (c.textContent.includes('…') || c.textContent.includes('Chargement'))) {
        c.textContent = "Ville introuvable";
        $("temp").textContent = "—";
        $("condition").textContent = "Réseau lent";
      }
    }
  }, 4000);

  // 2) Incremente le requestId pour invalider toute operation async en cours
  const myRequestId = ++state.requestId;

  // 3) Vide immediatement TOUTES les donnees affichees + skeleton
  clearAllWeatherUI();
  $("cityName").textContent = city.name + " …";

  // 4) Mets a jour la ville courante tout de suite
  state.city = city;

  // Reset du lisseur de temperature (changement de ville)
  resetTempSmoother();

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
    if (e.name === 'AbortError') {
      clearTimeout(skeletonTimeout);
      return;
    }
    if (myRequestId !== state.requestId) {
      clearTimeout(skeletonTimeout);
      return;
    }
    // SECURITE : on retire le skeleton pour ne pas rester bloque visuellement
    disableSkeleton();
    // Continue quand meme vers le full fetch en fallback
  }

  // 6) PHASE 2 : FULL FETCH (3-5s) - en arriere-plan, ajoute 10 jours, hourly 24h
  if (myRequestId !== state.requestId) {
    clearTimeout(skeletonTimeout);
    return;
  }
  try {
    const full = await fetchWeather(city.lat, city.lon, false, controller.signal);
    if (myRequestId !== state.requestId) {
      clearTimeout(skeletonTimeout);
      return;
    } // nouvelle ville demandee
    if (!full || !full.current) {
      // Silencieux : le lite est deja affiche. Mais on enleve le skeleton au cas ou.
      disableSkeleton();
      clearTimeout(skeletonTimeout);
      return;
    }

    // Met a jour avec les donnees completes sans reflicker
    state.lastWeather = full;
    state.lastRefreshMs = Date.now();
    lastFullRenderMs = Date.now();
    // Mets a jour currLiveData.current (le reste est garde du lite)
    if (currLiveData) currLiveData.current = full.current;
    renderCity(city, full);
    disableSkeleton(); // SECURITE : assure que le skeleton est bien enleve
  } catch (e) {
    if (e.name === 'AbortError') {
      clearTimeout(skeletonTimeout);
      return;
    }
    if (myRequestId !== state.requestId) {
      clearTimeout(skeletonTimeout);
      return;
    }
    // Si on a deja le lite affiche, on n'affiche pas d'erreur
    if (!state.lastWeather) {
      $("cityName").textContent = "Erreur";
      $("temp").textContent = "—";
      $("condition").textContent = "Vérifiez votre connexion";
    }
    disableSkeleton();
  } finally {
    clearTimeout(skeletonTimeout);
  }
}

async function loadWeather(city) {
  // Wrapper conserve pour retrocompatibilite : delegue a switchCity
  return switchCity(city);
}

// ============================================================
//  Géolocalisation : Détection automatique de la position
//  Utilise watchPosition() pour tracking continu + indicateur UI
// ============================================================
let geoIndicatorEl = null;
let geoLabelEl = null;
let watchId = null; // ID du watchPosition pour pouvoir l'arreter

function showGeoIndicator(label = "Localisation en cours...") {
  geoIndicatorEl = $("geoIndicator");
  geoLabelEl = geoIndicatorEl ? geoIndicatorEl.querySelector(".geo-label") : null;
  if (geoIndicatorEl) {
    geoIndicatorEl.classList.add("visible");
    if (geoLabelEl) geoLabelEl.textContent = label;
  }
}

function updateGeoLabel(label) {
  if (geoLabelEl) geoLabelEl.textContent = label;
}

function hideGeoIndicator() {
  geoIndicatorEl = $("geoIndicator");
  if (geoIndicatorEl) {
    geoIndicatorEl.classList.remove("visible");
  }
}

// Helper : formate un message d'erreur selon le code GeolocationPositionError
function geoErrorMessage(err) {
  if (!err) return "Erreur géolocalisation inconnue";
  switch (err.code) {
    case 1: return "Géolocalisation refusée par l'utilisateur";
    case 2: return "Position indisponible (GPS désactivé ?)";
    case 3: return "Délai dépassé pour la géolocalisation";
    default: return err.message || "Erreur géolocalisation";
  }
}

// Demarre le tracking continu via watchPosition.
// Retourne true si OK, false si KO.
async function tryGeolocate() {
  if (!navigator.geolocation) {
    console.warn("[Geo] API non disponible");
    return false;
  }
  // file:// = API geoloc non fonctionnelle
  if (window.location.protocol === "file:") {
    console.warn("[Geo] file:// protocol, pas de geoloc");
    return false;
  }

  // Si deja en cours, ne relance pas
  if (watchId !== null) {
    console.log("[Geo] Deja en cours de tracking");
    return true;
  }

  showGeoIndicator("Localisation en cours...");

  return new Promise((resolve) => {
    let firstFix = true;
    let initialResolved = false;

    // Demarre le tracking continu via watchPosition
    watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // Premier fix : on charge la meteo tout de suite
        if (firstFix) {
          firstFix = false;
          try {
            updateGeoLabel("Position trouvée...");
            const placeName = await reverseGeocode(latitude, longitude);
            state.city = { name: placeName, lat: latitude, lon: longitude };
            lastKnownLocation = { lat: latitude, lon: longitude, ts: Date.now() };
            saveState();
            await loadWeather(state.city);
            updateGeoLabel(`Suivi GPS actif (${pos.coords.accuracy.toFixed(0)}m)`);
            // Cache l'indicateur apres 2s
            setTimeout(() => hideGeoIndicator(), 2000);
            if (!initialResolved) {
              initialResolved = true;
              resolve(true);
            }
          } catch (e) {
            console.warn("[Geo] Erreur fix initial:", e);
            hideGeoIndicator();
            if (!initialResolved) {
              initialResolved = true;
              resolve(false);
            }
          }
        } else {
          // Mises a jour suivantes : watchPosition nous notifie.
          // Le watcher periodique (5min/5km) gere le switch de ville.
          lastKnownLocation = { lat: latitude, lon: longitude, ts: Date.now() };
        }
      },
      (err) => {
        const msg = geoErrorMessage(err);
        console.warn("[Geo] Erreur:", msg);
        updateGeoLabel(msg);
        setTimeout(() => hideGeoIndicator(), 3000);
        if (!initialResolved) {
          initialResolved = true;
          resolve(false);
        }
      },
      {
        enableHighAccuracy: true,    // GPS precis (pas WiFi triangulation)
        timeout: 15000,               // 15s max pour le 1er fix
        maximumAge: 60000             // Accepte un fix < 60s pour eviter fix immediat
      }
    );
    console.log(`[Geo] watchPosition demarre (watchId=${watchId})`);
  });
}

// Stoppe le tracking continu
function stopGeolocationTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    console.log(`[Geo] watchPosition arrete (watchId=${watchId})`);
    watchId = null;
  }
}

// ============================================================
//  GEOLOCATION WATCHER : vérifie periodiquement la position
//  pour detecter si l'utilisateur a change de ville/commune.
//  - Toutes les 5 min
//  - Seuil de 5km pour declencher (evite les micro-deplacements)
//  - Demande confirmation avant switch via banniere
// ============================================================
const GEO_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const GEO_DISTANCE_THRESHOLD_KM = 5; // 5km minimum
let geoWatcherTimerId = null;
let lastKnownLocation = null; // { lat, lon, ts }

// Calcule la distance Haversine entre 2 points (km)
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // rayon Terre en km
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Vérifie la position actuelle et propose un switch si deplace de >5km
async function checkGeoLocation() {
  if (!navigator.geolocation) return;
  // Le suivi auto est TOUJOURS actif (plus de toggle dans l'UI)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // Compare avec la derniere position connue
        if (lastKnownLocation) {
          const dist = haversineKm(
            lastKnownLocation.lat, lastKnownLocation.lon,
            latitude, longitude
          );
          if (dist < GEO_DISTANCE_THRESHOLD_KM) {
            resolve(false);
            return;
          }
        }
        lastKnownLocation = { lat: latitude, lon: longitude, ts: Date.now() };
        // Geocoder la nouvelle position pour obtenir le nom de ville
        const placeName = await reverseGeocode(latitude, longitude);
        // Afficher une notification : "Nouvelle ville détectée : X"
        showGeoSwitchBanner(placeName, latitude, longitude);
        resolve(true);
      },
      (err) => {
        resolve(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  });
}

// Affiche un bandeau de notification pour proposer le switch de ville
function showGeoSwitchBanner(placeName, lat, lon) {
  let banner = document.getElementById('geoSwitchBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'geoSwitchBanner';
    banner.className = 'geo-switch-banner';
    document.body.appendChild(banner);
  }
  banner.innerHTML = `
    <span class="geo-icon">📍</span>
    <span class="geo-text">Nouvelle position : <strong>${placeName}</strong></span>
    <button class="geo-accept">Aller à cette ville</button>
    <button class="geo-ignore">Ignorer</button>
  `;
  banner.classList.add('visible');
  banner.querySelector('.geo-accept').onclick = async () => {
    state.city = { name: placeName, lat, lon };
    saveState();
    await loadWeather(state.city);
    banner.classList.remove('visible');
  };
  banner.querySelector('.geo-ignore').onclick = () => {
    banner.classList.remove('visible');
  };
}

function startGeolocationWatcher() {
  if (geoWatcherTimerId) return;
  // Premier check rapide (30s apres lancement)
  setTimeout(() => checkGeoLocation(), 30 * 1000);
  // Puis checks periodiques toutes les 5 min
  geoWatcherTimerId = setInterval(checkGeoLocation, GEO_CHECK_INTERVAL_MS);
  console.log('[Geo] Watcher demarre (verif toutes les 5min, seuil 5km)');
}

function stopGeolocationWatcher() {
  if (geoWatcherTimerId) {
    clearInterval(geoWatcherTimerId);
    geoWatcherTimerId = null;
  }
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
      // Nettoie l'ancien flag "geoloc desactive" des preferences :
      // la geoloc auto est maintenant TOUJOURS active.
      try { localStorage.removeItem('meteo_geoloc_enabled'); } catch (e) {}
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

// Panneau détails d'un jour (10 jours)
const dayDetailPanel = $("dayDetailPanel");
$("dayDetailClose").addEventListener("click", closeDayDetail);
dayDetailPanel.addEventListener("click", (e) => {
  if (e.target === dayDetailPanel) closeDayDetail();
});
// Echap pour fermer aussi
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && dayDetailPanel.classList.contains("open")) {
    closeDayDetail();
  }
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
  // Activer le mode demo si ?demo=1 dans l'URL
  checkDemoMode();

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
    // Premiere visite : on charge Paris immediatement pour eviter
    // que l'app reste bloquee sur le prompt de geoloc.
    state.city = { name: "Paris", lat: 48.8566, lon: 2.3522 };
    saveState();
    await loadWeather(state.city);

    // Geoloc en best-effort : si elle reussit, on bascule vers la vraie ville.
    setTimeout(() => {
      if (state.city && state.city.name === "Paris") {
        tryGeolocate().then(geoOk => {
          if (geoOk && state.city && state.city.name !== "Paris") {
            saveState();
            loadWeather(state.city);
          }
        }).catch(() => {});
      }
    }, 1500);
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

  // Demarre le watcher de geolocalisation : verifie periodiquement
  // (toutes les 5 min) si l'utilisateur a change de ville/commune.
  // Propose un switch via une banniere si deplace de >5km.
  startGeolocationWatcher();

  // Demarre le fast poll : verifie les precipitations toutes les 20s
  // pour detecter pluie/orage le plus rapidement possible.
  startFastPoll();
})();
