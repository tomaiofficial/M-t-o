// Icônes météo (wrapper)
// - apple-weather-icons.js expose getWeatherIcon(code, isDay, size) en SVG style Apple
// - createWeatherIconSVG est utilisé partout dans script.js

function createWeatherIconSVG(code, isDay = true, size = 32) {
    // Priorité: SVG Apple (apple-weather-icons.js)
    if (typeof getWeatherIcon === 'function') {
        return getWeatherIcon(code, isDay, size);
    }

    // Fallback émoji si apple-weather-icons.js n'est pas chargé
    const c = Number(code || 0);
    const emojiMap = {
        0: isDay ? '☀️' : '🌙',
        1: '⛅', 2: '⛅',
        3: '☁️',
        45: '🌫', 48: '🌫',
        51: '🌦', 53: '🌦', 55: '🌦',
        56: '🌧', 57: '🌧',
        61: '🌧', 63: '🌧', 65: '🌧',
        66: '🌧', 67: '🌧',
        71: '🌨', 73: '🌨', 75: '🌨', 77: '🌨',
        80: '🌦', 81: '🌦', 82: '🌦',
        85: '🌨', 86: '🌨',
        95: '⛈', 96: '⛈', 99: '⛈'
    };
    const emoji = emojiMap[c] || (isDay ? '☀️' : '🌙');

    return `<div class="weather-icon-container" style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.8)}px">${emoji}</div>`;
}
