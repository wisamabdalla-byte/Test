const { EventEmitter } = require('events');
const crypto = require('crypto');
const { RIDE_TYPES, quote } = require('./pricing');
const { cityForPoint, haversineKm } = require('./cities');
const { normalizeLibyanMobile } = require('./phone');

const PAYMENT_METHODS = ['cash', 'card', 'wallet'];

// Allowed ride status transitions.
const TRANSITIONS = {
  requested: ['accepted', 'cancelled'],
  accepted: ['arrived', 'cancelled'],
  arrived: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function isPoint(p) {
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

class Store extends EventEmitter {
  constructor() {
    super();
    this.riders = new Map();
    this.drivers = new Map();
    this.rides = new Map();
  }

  registerRider({ name, phone }) {
    const normalized = normalizeLibyanMobile(phone);
    if (!name || !String(name).trim()) throw new HttpError(400, 'Name is required');
    if (!normalized) throw new HttpError(400, 'Enter a valid Libyan mobile number (e.g. 091 234 5678)');
    const existing = [...this.riders.values()].find((r) => r.phone === normalized.e164);
    if (existing) return existing;
    const rider = { id: id('rdr'), name: String(name).trim(), phone: normalized.e164, operator: normalized.operator };
    this.riders.set(rider.id, rider);
    return rider;
  }

  registerDriver({ name, phone, gender, car, plate, rideTypes }) {
    const normalized = normalizeLibyanMobile(phone);
    if (!name || !String(name).trim()) throw new HttpError(400, 'Name is required');
    if (!normalized) throw new HttpError(400, 'Enter a valid Libyan mobile number (e.g. 091 234 5678)');
    if (!['male', 'female'].includes(gender)) throw new HttpError(400, 'Gender must be male or female');
    const types = (Array.isArray(rideTypes) && rideTypes.length ? rideTypes : ['economy']).filter((t) => RIDE_TYPES[t]);
    if (types.includes('ladies') && gender !== 'female') throw new HttpError(400, 'Only female drivers can accept Ladies rides');
    const driver = {
      id: id('drv'),
      name: String(name).trim(),
      phone: normalized.e164,
      gender,
      car: car || '',
      plate: plate || '',
      rideTypes: types,
      online: false,
      location: null,
      rating: 5,
      ratingCount: 0,
      earnings: 0,
    };
    this.drivers.set(driver.id, driver);
    return driver;
  }

  getDriver(driverId) {
    const d = this.drivers.get(driverId);
    if (!d) throw new HttpError(404, 'Driver not found');
    return d;
  }

  getRide(rideId) {
    const r = this.rides.get(rideId);
    if (!r) throw new HttpError(404, 'Ride not found');
    return r;
  }

  setDriverStatus(driverId, { online, location }) {
    const d = this.getDriver(driverId);
    if (location !== undefined) {
      if (!isPoint(location)) throw new HttpError(400, 'Invalid location');
      d.location = { lat: location.lat, lng: location.lng };
    }
    if (online !== undefined) {
      if (online && !d.location) throw new HttpError(400, 'Set your location before going online');
      d.online = Boolean(online);
    }
    this.emit('event', { type: 'driver.updated', driver: this.publicDriver(d) });
    return d;
  }

  quote(pickup, dropoff) {
    if (!isPoint(pickup) || !isPoint(dropoff)) throw new HttpError(400, 'Pickup and dropoff are required');
    const city = cityForPoint(pickup);
    if (!city) throw new HttpError(422, 'Pickup is outside our service area');
    return { city, ...quote(pickup, dropoff, this.surgeFor(city)) };
  }

  // Simple demand-based surge: more open requests than online drivers in a city raises prices, capped at 1.5x.
  surgeFor(city) {
    const open = [...this.rides.values()].filter((r) => r.city === city && r.status === 'requested').length;
    const drivers = [...this.drivers.values()].filter((d) => d.online && d.location && cityForPoint(d.location) === city).length;
    if (open <= drivers) return 1;
    return Math.min(1.5, 1 + 0.1 * (open - drivers));
  }

  requestRide({ riderId, pickup, dropoff, pickupLabel, dropoffLabel, rideType, payment }) {
    const rider = this.riders.get(riderId);
    if (!rider) throw new HttpError(404, 'Rider not found');
    if (!RIDE_TYPES[rideType]) throw new HttpError(400, 'Unknown ride type');
    if (!PAYMENT_METHODS.includes(payment)) throw new HttpError(400, 'Unknown payment method');
    const active = [...this.rides.values()].find(
      (r) => r.riderId === riderId && !['completed', 'cancelled'].includes(r.status)
    );
    if (active) throw new HttpError(409, 'You already have an active ride');
    const q = this.quote(pickup, dropoff);
    const ride = {
      id: id('ride'),
      riderId,
      rider: { name: rider.name, phone: rider.phone },
      driverId: null,
      driver: null,
      city: q.city,
      pickup,
      dropoff,
      pickupLabel: pickupLabel || '',
      dropoffLabel: dropoffLabel || '',
      rideType,
      payment,
      distanceKm: q.distanceKm,
      durationMin: q.durationMin,
      fare: q.fares[rideType],
      currency: 'LYD',
      surge: q.surge,
      status: 'requested',
      // Short code the rider tells the driver to confirm they got in the right car.
      pin: String(crypto.randomInt(1000, 10000)),
      createdAt: Date.now(),
      history: [{ status: 'requested', at: Date.now() }],
      riderRating: null,
    };
    this.rides.set(ride.id, ride);
    this.emitRide(ride);
    return ride;
  }

  // Open requests a driver can accept: same city, a ride type they offer, within 10 km.
  openRidesFor(driverId) {
    const d = this.getDriver(driverId);
    if (!d.online || !d.location) return [];
    return [...this.rides.values()]
      .filter((r) => r.status === 'requested' && d.rideTypes.includes(r.rideType))
      .filter((r) => !RIDE_TYPES[r.rideType].femaleDriverOnly || d.gender === 'female')
      .map((r) => ({ ride: r, distanceKm: haversineKm(d.location, r.pickup) }))
      .filter((x) => x.distanceKm <= 10)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .map((x) => ({ ...this.publicRide(x.ride), distanceToPickupKm: Math.round(x.distanceKm * 10) / 10 }));
  }

  transition(ride, status) {
    if (!TRANSITIONS[ride.status].includes(status)) {
      throw new HttpError(409, `Cannot change ride from ${ride.status} to ${status}`);
    }
    ride.status = status;
    ride.history.push({ status, at: Date.now() });
  }

  acceptRide(rideId, driverId) {
    const ride = this.getRide(rideId);
    const d = this.getDriver(driverId);
    if (!d.online) throw new HttpError(409, 'Go online to accept rides');
    if (!d.rideTypes.includes(ride.rideType)) throw new HttpError(403, 'You do not offer this ride type');
    if (RIDE_TYPES[ride.rideType].femaleDriverOnly && d.gender !== 'female') {
      throw new HttpError(403, 'Ladies rides require a female driver');
    }
    const busy = [...this.rides.values()].find(
      (r) => r.driverId === driverId && ['accepted', 'arrived', 'in_progress'].includes(r.status)
    );
    if (busy) throw new HttpError(409, 'Finish your current ride first');
    this.transition(ride, 'accepted');
    ride.driverId = driverId;
    ride.driver = this.publicDriver(d);
    this.emitRide(ride);
    return ride;
  }

  // Driver-side actions: arrived, start (requires rider PIN), complete.
  driverAction(rideId, driverId, action, { pin } = {}) {
    const ride = this.getRide(rideId);
    if (ride.driverId !== driverId) throw new HttpError(403, 'This is not your ride');
    if (action === 'arrived') this.transition(ride, 'arrived');
    else if (action === 'start') {
      if (String(pin) !== ride.pin) throw new HttpError(400, 'Incorrect PIN. Ask the rider for their 4-digit code');
      this.transition(ride, 'in_progress');
    } else if (action === 'complete') {
      this.transition(ride, 'completed');
      this.getDriver(driverId).earnings += ride.fare;
    } else throw new HttpError(400, 'Unknown action');
    this.emitRide(ride);
    return ride;
  }

  cancelRide(rideId, { riderId, driverId }) {
    const ride = this.getRide(rideId);
    if (riderId ? ride.riderId !== riderId : ride.driverId !== driverId) throw new HttpError(403, 'Not allowed');
    if (driverId) {
      // A driver backing out puts the request back in the queue instead of cancelling it for the rider.
      if (!['accepted', 'arrived'].includes(ride.status)) throw new HttpError(409, 'Cannot release this ride');
      ride.status = 'requested';
      ride.driverId = null;
      ride.driver = null;
      ride.history.push({ status: 'requested', at: Date.now(), note: 'driver_released' });
    } else {
      this.transition(ride, 'cancelled');
    }
    this.emitRide(ride);
    return ride;
  }

  rateDriver(rideId, riderId, stars) {
    const ride = this.getRide(rideId);
    if (ride.riderId !== riderId) throw new HttpError(403, 'Not allowed');
    if (ride.status !== 'completed') throw new HttpError(409, 'You can rate only completed rides');
    if (ride.riderRating !== null) throw new HttpError(409, 'Already rated');
    const n = Number(stars);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new HttpError(400, 'Rating must be 1-5');
    ride.riderRating = n;
    const d = this.getDriver(ride.driverId);
    d.rating = (d.rating * (d.ratingCount + 1) + n) / (d.ratingCount + 2); // prior of one 5-star rating
    d.ratingCount += 1;
    return ride;
  }

  publicDriver(d) {
    return {
      id: d.id,
      name: d.name,
      phone: d.phone,
      gender: d.gender,
      car: d.car,
      plate: d.plate,
      online: d.online,
      location: d.location,
      rating: Math.round(d.rating * 10) / 10,
    };
  }

  activeRideForDriver(driverId) {
    const r = [...this.rides.values()].find(
      (x) => x.driverId === driverId && ['accepted', 'arrived', 'in_progress'].includes(x.status)
    );
    return r ? this.publicRide(r) : null;
  }

  // The PIN is only ever shown to the rider who booked the ride; drivers must hear it in person.
  publicRide(r, { includePin = false } = {}) {
    const { history, pin, ...rest } = r;
    return {
      ...rest,
      ...(includePin ? { pin } : {}),
      driver: r.driverId ? this.publicDriver(this.getDriver(r.driverId)) : null,
    };
  }

  emitRide(ride) {
    this.emit('event', { type: 'ride.updated', ride: this.publicRide(ride) });
  }
}

module.exports = { Store, HttpError, PAYMENT_METHODS };
