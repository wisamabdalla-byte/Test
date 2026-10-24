// Supported service areas. Coordinates are city centres; radiusKm bounds where pickups are accepted.
const CITIES = {
  tripoli: { name: { en: 'Tripoli', ar: 'طرابلس' }, lat: 32.8872, lng: 13.1913, radiusKm: 35 },
  benghazi: { name: { en: 'Benghazi', ar: 'بنغازي' }, lat: 32.1167, lng: 20.0667, radiusKm: 30 },
  misrata: { name: { en: 'Misrata', ar: 'مصراتة' }, lat: 32.3754, lng: 15.0925, radiusKm: 25 },
  zawiya: { name: { en: 'Zawiya', ar: 'الزاوية' }, lat: 32.7522, lng: 12.7278, radiusKm: 20 },
  sabha: { name: { en: 'Sabha', ar: 'سبها' }, lat: 27.0377, lng: 14.4283, radiusKm: 20 },
  bayda: { name: { en: 'Al Bayda', ar: 'البيضاء' }, lat: 32.7627, lng: 21.7551, radiusKm: 15 },
};

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Great-circle distance in km.
function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Returns the city id whose service area contains the point, or null.
function cityForPoint(point) {
  let best = null;
  let bestDist = Infinity;
  for (const [id, city] of Object.entries(CITIES)) {
    const d = haversineKm(point, city);
    if (d <= city.radiusKm && d < bestDist) {
      best = id;
      bestDist = d;
    }
  }
  return best;
}

module.exports = { CITIES, haversineKm, cityForPoint };
