// Icônes météo (wrapper)
// Objectif: retrouver les icônes Apple comme avant.
// - apple-weather-icons.js expose getWeatherIcon(code, isDay, size)
// - createWeatherIconSVG est utilisé partout dans script.js

function createWeatherIconSVG(code, isDay = true, size = 32) {
    // ============================================================
    // ✅ Pack d'icônes "Apple/iPhone" (PNG) dans assets/iphone-icons
    // ============================================================
    // On utilise d'abord les PNG (look iPhone), puis fallback sur les SVG.
    const ICON_ASSET_VERSION = 5; // incrémente si on remplace/ajoute des PNG
    const base = `assets/iphone-icons`;
    const c = Number(code || 0);

    const byCode = () => {
        // Mapping WMO -> icônes iPhone disponibles
        // Ciel dégagé
        if (c === 0) return isDay ? 'clear_day.png' : 'clear_night.png';
        // Nuages
        if (c === 1 || c === 2) return isDay ? 'partly_cloudy_day.png' : 'partly_cloudy_night.png';
        if (c === 3) return 'cloudy.png';
        // Brume / brouillard (Apple distingue les deux)
        // 45: brume (on utilise une variante jour/nuit)
        // 48: brouillard givrant (on garde "fog")
        if (c === 45) return isDay ? 'haze_day.png' : 'haze_night.png';
        if (c === 48) return 'fog.png';
        // Bruine
        if (c >= 51 && c <= 55) return 'drizzle.png';
        // Verglas / grésil
        if (c === 56 || c === 57) return 'cloud_sleet.png';
        // Pluie (nuit: lune + pluie si dispo)
        if (!isDay && (c === 61 || c === 63 || c === 80 || c === 81)) return 'partly_cloudy_night_rain.png';
        if (c === 61 || c === 63) return 'rain.png';
        if (c === 65) return 'heavy_rain.png';
        if (c === 66 || c === 67) return 'cloud_sleet.png';
        // Neige
        if (c === 71 || c === 73 || c === 77) return 'snowflake.png';
        // Neige abondante / Blizzard
        if (c === 75) return 'blizzard.png';
        if (c === 85 || c === 86) return 'cloud_snow.png';
        // Averses
        if (c === 80 || c === 81) return 'rain.png';
        if (c === 82) return 'heavy_rain.png';
        // Orage
        if (c >= 95 && c <= 99) return 'thunder_rain.png';
        return null;
    };

    const png = byCode();
    if (png) {
        const src = `${base}/${png}?v=${ICON_ASSET_VERSION}`;
        return `<img class="wx-iphone-icon" src="${src}" alt="" style="width:${size}px;height:${size}px" loading="lazy" decoding="async">`;
    }

    // ============================================================
    // Fallback: SVG (apple-weather-icons.js)
    // ============================================================
    if (typeof getWeatherIcon === 'function') {
        return getWeatherIcon(c, isDay, size);
    }

    // Fallback très simple si getWeatherIcon n'est pas dispo
    const emoji = (() => {
        if (c === 0) return isDay ? '☀️' : '🌙';
        if (c === 1 || c === 2) return '⛅';
        if (c === 3) return '☁️';
        if (c === 45 || c === 48) return '🌫';
        if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return '🌧';
        if (c >= 71 && c <= 77) return '🌨';
        if (c >= 95 && c <= 99) return '⛈';
        return '🌤';
    })();

    return `<div class="weather-icon-container" style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.8)}px">${emoji}</div>`;
}
