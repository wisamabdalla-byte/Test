const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../server');

test('HTTP API: book a ride end to end', async (t) => {
  const server = createApp().listen(0);
  t.after(() => server.close());
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  const page = await fetch(base + '/');
  assert.strictEqual(page.status, 200);

  const rider = (await call('POST', '/api/riders', { name: 'Amal', phone: '0921234567' })).body;
  const driver = (await call('POST', '/api/drivers', { name: 'Salem', phone: '0911234567', gender: 'male' })).body;
  await call('POST', `/api/drivers/${driver.id}/status`, { location: { lat: 32.89, lng: 13.18 }, online: true });

  const pickup = { lat: 32.8955, lng: 13.1802 };
  const dropoff = { lat: 32.87, lng: 13.21 };
  const q = await call('POST', '/api/quote', { pickup, dropoff });
  assert.strictEqual(q.status, 200);
  assert.strictEqual(q.body.city, 'tripoli');

  const ride = (await call('POST', '/api/rides', { riderId: rider.id, pickup, dropoff, rideType: 'economy', payment: 'cash' })).body;
  assert.match(ride.pin, /^\d{4}$/);
  assert.strictEqual((await call('GET', `/api/rides/${ride.id}`)).body.pin, undefined);
  assert.strictEqual((await call('GET', `/api/rides/${ride.id}?riderId=${rider.id}`)).body.pin, ride.pin);

  assert.strictEqual((await call('POST', `/api/rides/${ride.id}/accept`, { driverId: driver.id })).body.status, 'accepted');
  assert.strictEqual((await call('GET', `/api/drivers/${driver.id}`)).body.activeRide.id, ride.id);
  await call('POST', `/api/rides/${ride.id}/arrived`, { driverId: driver.id });
  const bad = await call('POST', `/api/rides/${ride.id}/start`, { driverId: driver.id, pin: '0' });
  assert.strictEqual(bad.status, 400);
  await call('POST', `/api/rides/${ride.id}/start`, { driverId: driver.id, pin: ride.pin });
  const done = await call('POST', `/api/rides/${ride.id}/complete`, { driverId: driver.id });
  assert.strictEqual(done.body.status, 'completed');

  assert.strictEqual((await call('GET', '/api/nope')).status, 404);
  assert.strictEqual((await fetch(base + '/../server.js')).status !== 200, true);
});
