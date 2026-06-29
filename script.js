// ============================================================
//  Météo - Application météo style Apple Weather
//  Géolocalisation auto, descriptions IA, auto-refresh
// ============================================================

// ===== WMO codes (style Apple Weather) =====
const WMO = {
  0:  { label: "Ciel dégagé",            icon: "apple-clear-day",         night: "apple-clear-night" },
  1:  { label: "Plutôt clair",           icon: "apple-clear-day",         night: "apple-clear-night" },
  2:  { label: "Partiellement nuageux",  icon: "apple-partly-cloudy-day", night: "apple-partly-cloudy-night" },
  3:  { label: "Couvert",                icon: "apple-cloudy",            night: "apple-cloudy" },
  45: { label: "Brouillard",             icon: "apple-fog",               night: "apple-fog" },
  48: { label: "Brouillard givrant",     icon: "apple-fog",               night: "apple-fog" },
  51: { label: "Légère bruine",          icon: "apple-drizzle",           night: "apple-drizzle" },
  53: { label: "Bruine",                 icon: "apple-drizzle",           night: "apple-drizzle" },
  55: { label: "Bruine dense",           icon: "apple-drizzle",           night: "apple-drizzle" },
  56: { label: "Bruine verglaçante",     icon: "apple-icy",               night: "apple-icy" },
  57: { label: "Bruine verglaçante",     icon: "apple-icy",               night: "apple-icy" },
  61: { label: "Pluie légère",           icon: "apple-rain",              night: "apple-rain" },
  63: { label: "Pluie",                  icon: "apple-rain",              night: "apple-rain" },
  65: { label: "Pluie forte",            icon: "apple-heavy-rain",        night: "apple-heavy-rain" },
  66: { label: "Pluie verglaçante",      icon: "apple-icy",               night: "apple-icy" },
  67: { label: "Pluie verglaçante",      icon: "apple-icy",               night: "apple-icy" },
  71: { label: "Légère neige",           icon: "apple-snow",              night: "apple-snow" },
  73: { label: "Neige",                  icon: "apple-snow",              night: "apple-snow" },
  75: { label: "Forte neige",            icon: "apple-snow",              night: "apple-snow" },
  77: { label: "Grains de neige",        icon: "apple-snow",              night: "apple-snow" },
  80: { label: "Averses",                icon: "apple-rain",              night: "apple-rain" },
  81: { label: "Averses",                icon: "apple-rain",              night: "apple-rain" },
  82: { label: "Violentes averses",      icon: "apple-heavy-rain",        night: "apple-heavy-rain" },
  85: { label: "Averses de neige",       icon: "apple-snow",              night: "apple-snow" },
  86: { label: "Fortes averses de neige", icon: "apple-snow",             night: "apple-snow" },
  95: { label: "Orage",                  icon: "apple-thunder",           night: "apple-thunder" },
  96: { label: "Orage avec grêle",       icon: "apple-thunder",           night: "apple-thunder" },
  99: { label: "Orage avec grêle",       icon: "apple-thunder",           night: "apple-thunder" }
};

// ===== State =====
const state = {
  city: null,
  unit: "C",
  lastWeather: null,
  lastRefreshMs: 0,
  favorites: []
};

// Bloquer le zoom par double tap, pinch, et copier/coller sur mobile
document.addEventListener("gesturestart", e => e.preventDefault());
document.addEventListener("gesturechange", e => e.preventDefault());
document.addEventListener("gestureend", e => e.preventDefault());
// Bloquer le copier coller sur le body (sauf dans les inputs)
document.addEventListener("copy", e => {
  if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
    e.preventDefault();
  }
});
document.addEventListener("cut", e => {
  if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
    e.preventDefault();
  }
});
document.addEventListener("paste", e => {
  if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
    e.preventDefault();
  }
});
const LS_KEY = "meteo_v5";

// ===== Helpers =====
const $ = id => document.getElementById(id);
const app = $("app");

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
// ============================================================
let dayCycleCache = null;

function isHourAtNight(isoHour, daily) {
  // Détermine si une heure donnée est de nuit en utilisant sunrise/sunset
  // du jour correspondant. Retourne true si nuit.
  if (!daily || !daily.sunrise || !daily.sunset) {
    // Fallback : 21h-6h si pas de données
    const m = (isoHour || "").match(/T(\d{2})/);
    const h = m ? parseInt(m[1], 10) : 12;
    return h >= 21 || h < 6;
  }

  const hourMs = new Date(isoHour).getTime();
  if (isNaN(hourMs)) return false;

  // Trouver le bon jour (utiliser sunrise/sunset le plus proche)
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < daily.sunrise.length; i++) {
    const sunriseMs = new Date(daily.sunrise[i]).getTime();
    const diff = Math.abs(sunriseMs - hourMs);
    if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
  }

  const sunriseMs = new Date(daily.sunrise[bestIdx]).getTime();
  const sunsetMs = new Date(daily.sunset[bestIdx]).getTime();

  // Nuit = avant sunrise (crépuscule terminé) ou après sunset + 30min (crépuscule terminé)
  return hourMs < sunriseMs || hourMs >= sunsetMs + 30 * 60 * 1000;
}

function getDayCycleInfo(cur, daily) {
  // Récupère sunrise/sunset du jour actuel depuis l'API
  let sunriseStr = daily && daily.sunrise && daily.sunrise[0];
  let sunsetStr = daily && daily.sunset && daily.sunset[0];

  // Fallback si pas encore chargé : utiliser l'heure actuelle comme référence
  const now = cur && cur.time ? new Date(cur.time) : new Date();
  const nowMs = now.getTime();

  // Calculer sunrise/sunset en millisecondes (heure locale du lieu)
  let sunriseMs = sunriseStr ? new Date(sunriseStr).getTime() : null;
  let sunsetMs = sunsetStr ? new Date(sunsetStr).getTime() : null;

  // Déterminer la phase du jour
  // Si on n'a pas sunrise/sunset, fallback basé sur l'heure actuelle (mieux que rien)
  let isNight;
  let phase; // 'dawn', 'day', 'dusk', 'night'

  if (sunriseMs == null || sunsetMs == null) {
    // Fallback heuristique : nuit entre 21h et 6h
    const h = now.getHours();
    isNight = h >= 21 || h < 6;
    phase = isNight ? "night" : "day";
  } else {
    // Utiliser la position relative au lever/coucher du soleil
    // Twilight windows : 30 min avant lever (dawn) / 30 min après coucher (dusk)
    const dawnMs = sunriseMs - 30 * 60 * 1000; // 30 min avant lever
    const duskMs = sunsetMs + 30 * 60 * 1000;  // 30 min après coucher

    if (nowMs < dawnMs) {
      // Nuit profonde (avant le début du crépuscule du matin)
      isNight = true;
      phase = "night";
    } else if (nowMs < sunriseMs) {
      // Crépuscule du matin (aube)
      isNight = false;
      phase = "dawn";
    } else if (nowMs < duskMs && nowMs >= sunsetMs) {
      // Crépuscule du soir (entre coucher et nuit)
      isNight = false;
      phase = "dusk";
    } else if (nowMs >= duskMs) {
      // Nuit (après le crépuscule)
      isNight = true;
      phase = "night";
    } else {
      // Plein jour (entre lever et coucher)
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
//  IA : Générateur de descriptions météo intelligentes
//  Analyse 15+ paramètres pour générer un texte naturel et contextuel
// ============================================================
function generateDescription(w) {
  const cur = w.current;
  const daily = w.daily;
  const hourly = w.hourly;
  const code = cur.weather_code;
  const isNight = cur.is_day === 0;
  const temp = cur.temperature_2m;
  const feels = cur.apparent_temperature;
  const humidity = cur.relative_humidity_2m;
  const wind = Math.round(cur.wind_speed_10m);
  const windDir = degToCompass(cur.wind_direction_10m);
  const popToday = daily.precipitation_probability_max[0] || 0;
  const precip = daily.precipitation_sum[0] || 0;
  const uv = (daily.uv_index_max && daily.uv_index_max[0]) || 0;
  const pressure = cur.surface_pressure;
  const hi = daily.temperature_2m_max[0];
  const lo = daily.temperature_2m_min[0];
  const sunrise = daily.sunrise[0];
  const sunset = daily.sunset[0];

  // Déterminer le moment de la journée basé sur sunrise/sunset réels
  const dayCycle = getDayCycleInfo(cur, daily);
  const sunriseDate = daily.sunrise && daily.sunrise[0] ? new Date(daily.sunrise[0]) : null;
  const sunsetDate = daily.sunset && daily.sunset[0] ? new Date(daily.sunset[0]) : null;
  const sunriseMs = sunriseDate ? sunriseDate.getTime() : null;
  const sunsetMs = sunsetDate ? sunsetDate.getTime() : null;
  const nowDate = cur.time ? new Date(cur.time) : new Date();
  const nowMs = nowDate.getTime();

  let timeOfDay = "";
  if (sunriseMs == null || sunsetMs == null) {
    // Fallback si pas de données
    const currentHour = getHourFromISO(cur.time);
    if (currentHour >= 5 && currentHour < 12) timeOfDay = "matin";
    else if (currentHour >= 12 && currentHour < 18) timeOfDay = "après-midi";
    else if (currentHour >= 18 && currentHour < 22) timeOfDay = "soirée";
    else timeOfDay = "nuit";
  } else {
    if (nowMs < sunriseMs) {
      timeOfDay = "nuit";
    } else if (nowMs < sunriseMs + 2 * 60 * 60 * 1000) {
      timeOfDay = "matin";
    } else if (nowMs < sunsetMs - 2 * 60 * 60 * 1000) {
      timeOfDay = "après-midi";
    } else if (nowMs < sunsetMs) {
      timeOfDay = "soirée";
    } else if (nowMs < sunsetMs + 60 * 60 * 1000) {
      timeOfDay = "crépuscule";
    } else {
      timeOfDay = "nuit";
    }
  }
  const currentHour = nowDate.getHours();

  // Analyser les prochaines heures (24h)
  const nextHours = [];
  if (hourly && hourly.time) {
    for (let i = 0; i < Math.min(24, hourly.time.length); i++) {
      const h = getHourFromISO(hourly.time[i]);
      if (h != null && h >= currentHour) {
        nextHours.push({
          hour: h,
          code: hourly.weather_code[i],
          pop: (hourly.precipitation_probability && hourly.precipitation_probability[i]) || 0,
          temp: hourly.temperature_2m[i]
        });
      }
    }
  }

  // Détecter pluie à venir + intensité + timing précis
  let rainComing = false;
  let rainInHours = -1;
  let rainIntensity = "";
  let clearComing = false;
  let clearInHours = -1;
  let tempTrend = "";
  let nextTemp = temp;

  for (let i = 0; i < Math.min(12, nextHours.length); i++) {
    const nh = nextHours[i];
    const hoursAhead = nh.hour - currentHour;

    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(nh.code) && nh.pop > 30 && !rainComing) {
      rainComing = true;
      rainInHours = hoursAhead;
      if ([65,82].includes(nh.code)) rainIntensity = "forte";
      else if ([61,63,80,81].includes(nh.code)) rainIntensity = "modérée";
      else rainIntensity = "légère";
    }
    if ((nh.code === 0 || nh.code === 1) && [51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code) && !clearComing) {
      clearComing = true;
      clearInHours = hoursAhead;
    }
    if (i === 2) nextTemp = nh.temp;
  }

  // Tendance température
  if (nextTemp > temp + 2) tempTrend = "en hausse";
  else if (nextTemp < temp - 2) tempTrend = "en baisse";
  else tempTrend = "stable";

  let parts = [];

  // 1. Condition principale avec moment de la journée
  parts.push(getConditionText(code, isNight, timeOfDay));

  // 2. Température avec tendance
  if (tempTrend === "en hausse" && !isNight) {
    parts.push(`Il fait ${fmtTemp(temp)}, les températures montent vers ${fmtTemp(hi)}`);
  } else if (tempTrend === "en baisse") {
    parts.push(`Il fait ${fmtTemp(temp)}, les températures descendent vers ${fmtTemp(lo)}`);
  } else {
    parts.push(`Maximales ${fmtTemp(hi)}, minimales ${fmtTemp(lo)}`);
  }

  // 3. Pluie à venir avec timing précis
  if (rainComing && ![51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) {
    const hourText = rainInHours <= 1 ? "dans l'heure" : rainInHours <= 2 ? "dans 2 heures" : `vers ${currentHour + rainInHours}h`;
    parts.push(`Pluie ${rainIntensity} attendue ${hourText}`);
  }

  // 4. Éclaircissement à venir
  if (clearComing) {
    const hourText = clearInHours <= 1 ? "dans l'heure" : `dans ${clearInHours} heures`;
    parts.push(`Éclaircissements prévus ${hourText}`);
  }

  // 5. Probabilité de précipitations
  if (popToday >= 40 && ![51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) {
    parts.push(`Risque de précipitations de ${popToday}%`);
  } else if (popToday >= 60 && [51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) {
    parts.push(`Risque de ${popToday}%`);
  }

  // 6. Vent avec direction
  if (wind > 50) {
    parts.push(`Vent très fort ${wind} km/h venant de ${windDir}`);
  } else if (wind > 30) {
    parts.push(`Vent fort ${wind} km/h venant de ${windDir}`);
  } else if (wind > 15) {
    parts.push(`Vent ${wind} km/h venant de ${windDir}`);
  }

  // 7. UV avec recommandations
  if (uv >= 8 && !isNight) {
    parts.push("Indice UV très élevé, protégez-vous du soleil");
  } else if (uv >= 6 && !isNight) {
    parts.push("Indice UV élevé, lunettes de soleil recommandées");
  } else if (uv >= 3 && !isNight && timeOfDay === "matin") {
    parts.push("Indice UV modéré");
  }

  // 8. Humidité
  if (humidity >= 90) {
    parts.push("Air très humide");
  } else if (humidity >= 80 && code !== 3) {
    parts.push("Air humide");
  }

  // 9. Pression
  if (pressure < 1005) {
    parts.push("Pression basse, perturbations possibles");
  } else if (pressure > 1020) {
    parts.push("Pression haute, temps stable");
  }

  // 10. Ressenti
  if (Math.abs(feels - temp) >= 5) {
    if (feels < temp) {
      parts.push(`Ressenti plus frais : ${fmtTemp(feels)}`);
    } else {
      parts.push(`Ressenti plus chaud : ${fmtTemp(feels)}`);
    }
  }

  // 11. Précipitations
  if (precip > 5) {
    parts.push(`${precip.toFixed(1)} mm attendus aujourd'hui`);
  }

  // 12. Contexte lever/coucher du soleil (basé sur sunrise/sunset réels)
  if (!dayCycle.isNight && nowMs < sunsetMs + 60 * 60 * 1000 && nowMs > sunsetMs - 90 * 60 * 1000) {
    parts.push(`Coucher de soleil à ${fmtTime(sunset)}`);
  }
  if (dayCycle.isNight && sunriseMs && nowMs > sunriseMs - 90 * 60 * 1000 && nowMs < sunriseMs) {
    parts.push(`Lever de soleil à ${fmtTime(sunrise)}`);
  }

  return parts.join(". ") + ".";
}

function getConditionText(code, isNight, timeOfDay) {
  // Gestion correcte des articles : "ce" ou "cet" selon voyelle, "cette" pour nuit
  let art;
  if (isNight) art = "cette";
  else if (["matin", "après-midi"].includes(timeOfDay)) art = "cet";
  else art = "ce";

  if (code === 0) {
    return isNight ? "Ciel dégagé cette nuit" : `Beau temps ${art} ${timeOfDay}, ciel dégagé`;
  }
  if (code === 1) return `Plutôt clair ${art} ${timeOfDay}`;
  if (code === 2) return `Partiellement nuageux ${art} ${timeOfDay}`;
  if (code === 3) return "Ciel couvert toute la journée";
  if ([45,48].includes(code)) return `Brouillard ${art} ${timeOfDay}, visibilité réduite`;
  if ([51,53,55].includes(code)) return `Bruine légère ${art} ${timeOfDay}`;
  if ([56,57].includes(code)) return "Bruine verglaçante, attention aux routes";
  if ([61,63].includes(code)) return `Pluie ${art} ${timeOfDay}`;
  if (code === 65) return `Pluie forte ${art} ${timeOfDay}`;
  if ([66,67].includes(code)) return "Pluie verglaçante, prudence sur la route";
  if ([71,73].includes(code)) return `Neige ${art} ${timeOfDay}`;
  if (code === 75) return "Forte neige, restez au chaud";
  if (code === 77) return `Grains de neige ${art} ${timeOfDay}`;
  if ([80,81].includes(code)) return `Averses ${art} ${timeOfDay}`;
  if (code === 82) return "Violentes averses, restez à l'abri";
  if ([85,86].includes(code)) return `Averses de neige ${art} ${timeOfDay}`;
  if ([95,96,99].includes(code)) return `Orages ${art} ${timeOfDay}, restez prudent`;
  return "";
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
  setTimeout(() => searchInput.focus(), 50);
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
})();
