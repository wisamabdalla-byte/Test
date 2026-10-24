const test = require('node:test');
const assert = require('node:assert');
const { calculateFare, estimateTrip, quote, roundToHalf } = require('../src/pricing');
const { cityForPoint } = require('../src/cities');
const { normalizeLibyanMobile } = require('../src/phone');

test('fares apply the per-type minimum', () => {
  assert.strictEqual(calculateFare('economy', 0.5, 2), 10);
  assert.strictEqual(calculateFare('family', 0.5, 2), 20);
});

test('fares round to the nearest half dinar for cash', () => {
  // 5 + 1.5*10 + 0.25*20 = 25
  assert.strictEqual(calculateFare('economy', 10, 20), 25);
  assert.strictEqual(roundToHalf(12.26), 12.5);
  assert.strictEqual(roundToHalf(12.2), 12);
});

test('surge multiplies the fare', () => {
  assert.strictEqual(calculateFare('economy', 10, 20, 1.2), 30);
});

test('unknown ride type throws', () => {
  assert.throws(() => calculateFare('helicopter', 1, 1));
});

test('trip estimate across Tripoli is plausible', () => {
  // Martyrs' Square -> Tripoli International Airport area
  const trip = estimateTrip({ lat: 32.8955, lng: 13.1802 }, { lat: 32.6635, lng: 13.159 });
  assert.ok(trip.distanceKm > 25 && trip.distanceKm < 40, `distance ${trip.distanceKm}`);
  assert.ok(trip.durationMin > 40);
});

test('quote returns LYD fares for every ride type', () => {
  const q = quote({ lat: 32.8955, lng: 13.1802 }, { lat: 32.87, lng: 13.2 });
  assert.strictEqual(q.currency, 'LYD');
  assert.deepStrictEqual(Object.keys(q.fares).sort(), ['comfort', 'economy', 'family', 'ladies']);
});

test('cityForPoint detects Libyan service areas', () => {
  assert.strictEqual(cityForPoint({ lat: 32.89, lng: 13.19 }), 'tripoli');
  assert.strictEqual(cityForPoint({ lat: 32.11, lng: 20.08 }), 'benghazi');
  assert.strictEqual(cityForPoint({ lat: 30.0, lng: 18.0 }), null); // middle of the desert
});

test('normalizes Libyan mobile numbers', () => {
  assert.deepStrictEqual(normalizeLibyanMobile('091 234 5678'), { e164: '+218912345678', operator: 'Al-Madar' });
  assert.deepStrictEqual(normalizeLibyanMobile('+218-92-1234567'), { e164: '+218921234567', operator: 'Libyana' });
  assert.deepStrictEqual(normalizeLibyanMobile('00218941234567'), { e164: '+218941234567', operator: 'Libyana' });
  assert.strictEqual(normalizeLibyanMobile('0612345678'), null); // landline
  assert.strictEqual(normalizeLibyanMobile('09123'), null);
  assert.strictEqual(normalizeLibyanMobile(undefined), null);
});
