const { PAYMENT_METHODS } = require('./store');
const { CITIES } = require('./cities');
const { RIDE_TYPES } = require('./pricing');

// API routes as [method, pattern, handler(params, body, query)]. Shared by server.js and the
// in-browser demo build, so both run exactly the same ride logic.
function buildRoutes(store) {
  return [
    ['GET', /^\/api\/config$/, () => ({ cities: CITIES, rideTypes: RIDE_TYPES, payments: PAYMENT_METHODS })],
    ['POST', /^\/api\/riders$/, (p, body) => store.registerRider(body)],
    ['POST', /^\/api\/drivers$/, (p, body) => store.registerDriver(body)],
    ['GET', /^\/api\/drivers\/([\w]+)$/, ([id]) => ({ ...store.getDriver(id), activeRide: store.activeRideForDriver(id) })],
    ['POST', /^\/api\/drivers\/([\w]+)\/status$/, ([id], body) => store.setDriverStatus(id, body)],
    ['GET', /^\/api\/drivers\/([\w]+)\/requests$/, ([id]) => store.openRidesFor(id)],
    ['POST', /^\/api\/quote$/, (p, body) => store.quote(body.pickup, body.dropoff)],
    ['POST', /^\/api\/rides$/, (p, body) => store.publicRide(store.requestRide(body), { includePin: true })],
    [
      'GET',
      /^\/api\/rides\/([\w]+)$/,
      ([id], body, query) => {
        const ride = store.getRide(id);
        return store.publicRide(ride, { includePin: query.get('riderId') === ride.riderId });
      },
    ],
    ['POST', /^\/api\/rides\/([\w]+)\/accept$/, ([id], body) => store.publicRide(store.acceptRide(id, body.driverId))],
    [
      'POST',
      /^\/api\/rides\/([\w]+)\/(arrived|start|complete)$/,
      ([id, action], body) => store.publicRide(store.driverAction(id, body.driverId, action, body)),
    ],
    ['POST', /^\/api\/rides\/([\w]+)\/cancel$/, ([id], body) => store.publicRide(store.cancelRide(id, body))],
    ['POST', /^\/api\/rides\/([\w]+)\/rate$/, ([id], body) => store.publicRide(store.rateDriver(id, body.riderId, body.stars))],
  ];
}

module.exports = { buildRoutes };
