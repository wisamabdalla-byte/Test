const { haversineKm } = require('./cities');

// Fares in Libyan Dinar (LYD). Most rides are paid in cash, so totals round to the nearest 0.5 LYD.
const RIDE_TYPES = {
  economy: { name: { en: 'Economy', ar: 'اقتصادي' }, base: 5, perKm: 1.5, perMin: 0.25, minimum: 10, seats: 4 },
  comfort: { name: { en: 'Comfort', ar: 'مريح' }, base: 8, perKm: 2.25, perMin: 0.35, minimum: 15, seats: 4 },
  family: { name: { en: 'Family Van', ar: 'عائلي' }, base: 10, perKm: 2.75, perMin: 0.4, minimum: 20, seats: 7 },
  ladies: {
    name: { en: 'Ladies', ar: 'سيدات' },
    base: 6,
    perKm: 1.75,
    perMin: 0.3,
    minimum: 12,
    seats: 4,
    femaleDriverOnly: true,
  },
};

// Straight-line distance understates real driving distance through city streets.
const ROAD_FACTOR = 1.3;
const AVG_CITY_SPEED_KMH = 30;

function roundToHalf(n) {
  return Math.round(n * 2) / 2;
}

function estimateTrip(pickup, dropoff) {
  const distanceKm = haversineKm(pickup, dropoff) * ROAD_FACTOR;
  const durationMin = (distanceKm / AVG_CITY_SPEED_KMH) * 60;
  return { distanceKm: Math.round(distanceKm * 10) / 10, durationMin: Math.max(1, Math.round(durationMin)) };
}

function calculateFare(rideType, distanceKm, durationMin, surge = 1) {
  const t = RIDE_TYPES[rideType];
  if (!t) throw new Error(`Unknown ride type: ${rideType}`);
  const raw = (t.base + t.perKm * distanceKm + t.perMin * durationMin) * surge;
  return roundToHalf(Math.max(t.minimum, raw));
}

function quote(pickup, dropoff, surge = 1) {
  const trip = estimateTrip(pickup, dropoff);
  const fares = {};
  for (const id of Object.keys(RIDE_TYPES)) {
    fares[id] = calculateFare(id, trip.distanceKm, trip.durationMin, surge);
  }
  return { ...trip, currency: 'LYD', surge, fares };
}

module.exports = { RIDE_TYPES, estimateTrip, calculateFare, quote, roundToHalf };
