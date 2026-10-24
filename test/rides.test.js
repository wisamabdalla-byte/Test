const test = require('node:test');
const assert = require('node:assert');
const { Store } = require('../src/store');

const PICKUP = { lat: 32.8955, lng: 13.1802 }; // Tripoli
const DROPOFF = { lat: 32.87, lng: 13.21 };

function setup() {
  const s = new Store();
  const rider = s.registerRider({ name: 'Amal', phone: '0921234567' });
  const driver = s.registerDriver({ name: 'Salem', phone: '0911234567', gender: 'male', car: 'Kia Rio', plate: '5-1234' });
  s.setDriverStatus(driver.id, { location: { lat: 32.89, lng: 13.18 }, online: true });
  return { s, rider, driver };
}

test('full ride lifecycle', () => {
  const { s, rider, driver } = setup();
  const ride = s.requestRide({ riderId: rider.id, pickup: PICKUP, dropoff: DROPOFF, rideType: 'economy', payment: 'cash' });
  assert.strictEqual(ride.status, 'requested');
  assert.strictEqual(ride.city, 'tripoli');
  assert.strictEqual(s.openRidesFor(driver.id).length, 1);
  assert.strictEqual(s.openRidesFor(driver.id)[0].pin, undefined, 'drivers must not see the PIN');

  s.acceptRide(ride.id, driver.id);
  assert.strictEqual(s.openRidesFor(driver.id).length, 0);
  s.driverAction(ride.id, driver.id, 'arrived');
  assert.throws(() => s.driverAction(ride.id, driver.id, 'start', { pin: '0000' }), /PIN/);
  s.driverAction(ride.id, driver.id, 'start', { pin: ride.pin });
  s.driverAction(ride.id, driver.id, 'complete');
  assert.strictEqual(ride.status, 'completed');
  assert.strictEqual(s.getDriver(driver.id).earnings, ride.fare);

  s.rateDriver(ride.id, rider.id, 4);
  assert.strictEqual(s.getDriver(driver.id).rating, 4.5);
  assert.throws(() => s.rateDriver(ride.id, rider.id, 5), /Already rated/);
});

test('ladies rides are only offered to and accepted by female drivers', () => {
  const { s, rider, driver } = setup();
  assert.throws(
    () => s.registerDriver({ name: 'X', phone: '0951234567', gender: 'male', rideTypes: ['ladies'] }),
    /female/
  );
  const female = s.registerDriver({ name: 'Huda', phone: '0941234567', gender: 'female', rideTypes: ['economy', 'ladies'] });
  s.setDriverStatus(female.id, { location: { lat: 32.89, lng: 13.18 }, online: true });
  const ride = s.requestRide({ riderId: rider.id, pickup: PICKUP, dropoff: DROPOFF, rideType: 'ladies', payment: 'cash' });
  assert.strictEqual(s.openRidesFor(driver.id).length, 0);
  assert.strictEqual(s.openRidesFor(female.id).length, 1);
  assert.throws(() => s.acceptRide(ride.id, driver.id));
  s.acceptRide(ride.id, female.id);
  assert.strictEqual(ride.driverId, female.id);
});

test('rejects pickups outside the service area and invalid phones', () => {
  const { s, rider } = setup();
  assert.throws(
    () => s.requestRide({ riderId: rider.id, pickup: { lat: 30, lng: 18 }, dropoff: DROPOFF, rideType: 'economy', payment: 'cash' }),
    /service area/
  );
  assert.throws(() => s.registerRider({ name: 'A', phone: '12345' }), /Libyan mobile/);
});

test('one active ride per rider and per driver', () => {
  const { s, rider, driver } = setup();
  const ride = s.requestRide({ riderId: rider.id, pickup: PICKUP, dropoff: DROPOFF, rideType: 'economy', payment: 'cash' });
  assert.throws(() => s.requestRide({ riderId: rider.id, pickup: PICKUP, dropoff: DROPOFF, rideType: 'economy', payment: 'cash' }), /active ride/);
  const other = s.registerRider({ name: 'Omar', phone: '0931234567' });
  const ride2 = s.requestRide({ riderId: other.id, pickup: PICKUP, dropoff: DROPOFF, rideType: 'economy', payment: 'card' });
  s.acceptRide(ride.id, driver.id);
  assert.throws(() => s.acceptRide(ride2.id, driver.id), /current ride/);
});

test('driver releasing a ride puts it back in the queue; rider cancel ends it', () => {
  const { s, rider, driver } = setup();
  const ride = s.requestRide({ riderId: rider.id, pickup: PICKUP, dropoff: DROPOFF, rideType: 'economy', payment: 'cash' });
  s.acceptRide(ride.id, driver.id);
  s.cancelRide(ride.id, { driverId: driver.id });
  assert.strictEqual(ride.status, 'requested');
  assert.strictEqual(ride.driverId, null);
  s.cancelRide(ride.id, { riderId: rider.id });
  assert.strictEqual(ride.status, 'cancelled');
  assert.throws(() => s.acceptRide(ride.id, driver.id), /Cannot change/);
});

test('surge rises when requests outnumber drivers', () => {
  const { s } = setup();
  assert.strictEqual(s.surgeFor('tripoli'), 1);
  for (const phone of ['0921111111', '0922222222', '0923333333']) {
    const r = s.registerRider({ name: 'R', phone });
    s.requestRide({ riderId: r.id, pickup: PICKUP, dropoff: DROPOFF, rideType: 'economy', payment: 'cash' });
  }
  assert.ok(Math.abs(s.surgeFor('tripoli') - 1.2) < 1e-9);
});
