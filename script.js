// PATCH GEOLOCALISATION AUTOMATIQUE
// Remplace l'ancien appel ponctuel par une surveillance continue.
// À intégrer dans le script principal : cette fonction doit être appelée au lancement.

const GEO_WATCH_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 60000,
  timeout: 15000
};

let geoWatchId = null;
let lastGeo = null;
let lastGeoUpdateMs = 0;

function startAutomaticGeolocation() {
  if (!navigator.geolocation) return;
  if (geoWatchId !== null) return;

  geoWatchId = navigator.geolocation.watchPosition(
    async (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      const now = Date.now();

      // Évite de relancer inutilement la météo pour de minuscules déplacements.
      if (lastGeo && now - lastGeoUpdateMs < 60000) {
        const dLat = latitude - lastGeo.latitude;
        const dLon = longitude - lastGeo.longitude;
        const movedApproxMeters = Math.sqrt(dLat * dLat + dLon * dLon) * 111320;
        if (movedApproxMeters < 500) return;
      }

      lastGeo = { latitude, longitude, accuracy };
      lastGeoUpdateMs = now;

      try {
        // Reverse geocoding pour obtenir automatiquement la ville actuelle.
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=10&addressdetails=1`;
        const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
        if (!response.ok) return;
        const data = await response.json();
        const address = data.address || {};
        const city = address.city || address.town || address.village || address.municipality || address.county;
        if (!city) return;

        // Ne change la ville que si elle a réellement changé.
        if (state.city !== city) {
          // Utilise la fonction météo existante si elle est disponible.
          if (typeof loadWeatherForCoordinates === "function") {
            await loadWeatherForCoordinates(latitude, longitude, city);
          } else if (typeof loadWeather === "function") {
            await loadWeather(city);
          }
        }
      } catch (err) {
        console.warn("Géolocalisation automatique :", err);
      }
    },
    (error) => {
      console.warn("Géolocalisation indisponible :", error.message);
      // Ne redemande pas en boucle : le navigateur gère lui-même la permission.
    },
    GEO_WATCH_OPTIONS
  );
}

// Lancement automatique dès que la page est prête.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startAutomaticGeolocation, { once: true });
} else {
  startAutomaticGeolocation();
}
