// Standalone demo runtime: runs the real ride logic (src/*.js) inside the browser, so the app
// works from a single HTML file with no server. Bundled by scripts/build-demo.js.
(function () {
  const { Store } = __require('./store');
  const { buildRoutes } = __require('./routes');
  const { CITIES, haversineKm } = __require('./cities');
  const store = new Store();
  const routes = buildRoutes(store);

  // Each page load starts with a fresh in-memory store, so forget saved accounts (keep the language).
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('mishwar.') && k !== 'mishwar.lang')
      .forEach((k) => localStorage.removeItem(k));
  } catch {}

  // ---------- Fake network: /api/* goes to the in-browser routes ----------
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts = {}) => {
    const u = new URL(url, 'http://demo.local');
    if (!u.pathname.startsWith('/api/')) return realFetch(url, opts);
    const method = opts.method || 'GET';
    let status = 404;
    let data = { error: 'Not found' };
    for (const [m, pattern, handler] of routes) {
      const match = u.pathname.match(pattern);
      if (!match || m !== method) continue;
      try {
        data = handler(match.slice(1), opts.body ? JSON.parse(opts.body) : {}, u.searchParams);
        status = 200;
      } catch (e) {
        status = e.status || 500;
        data = { error: e.message };
      }
      break;
    }
    await new Promise((r) => setTimeout(r, 80));
    const json = JSON.parse(JSON.stringify(data));
    return { ok: status < 300, status, json: async () => json };
  };

  window.EventSource = class {
    constructor() {
      store.on('event', (evt) => setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify(evt) })));
    }
    close() {}
  };

  // ---------- Demo drivers: pick up rides when no real driver is online ----------
  const bots = [
    store.registerDriver({ name: 'سالم', phone: '0910000001', gender: 'male', car: 'Hyundai Elantra 2019', plate: '5-204118', rideTypes: ['economy', 'comfort', 'family'] }),
    store.registerDriver({ name: 'هدى', phone: '0920000002', gender: 'female', car: 'Kia Picanto 2021', plate: '5-318840', rideTypes: ['economy', 'ladies'] }),
  ];
  const botIds = new Set(bots.map((b) => b.id));
  const humanDriverOnline = () => [...store.drivers.values()].some((d) => d.online && !botIds.has(d.id));
  const handled = new Set();

  function drive(bot, ride) {
    let waitTicks = 0;
    const timer = setInterval(() => {
      if (['completed', 'cancelled'].includes(ride.status) || ride.driverId !== bot.id) return clearInterval(timer);
      if (ride.status === 'arrived') {
        if (++waitTicks === 4) store.driverAction(ride.id, bot.id, 'start', { pin: ride.pin });
        return;
      }
      const target = ride.status === 'accepted' ? ride.pickup : ride.dropoff;
      const remaining = haversineKm(bot.location, target);
      if (remaining < 0.05) {
        store.driverAction(ride.id, bot.id, ride.status === 'accepted' ? 'arrived' : 'complete');
        if (ride.status === 'completed') clearInterval(timer);
        return;
      }
      // ~8 ticks to reach the pickup, ~18 ticks for the trip itself.
      const stepKm = ride.status === 'accepted' ? 0.2 : Math.max(0.25, ride.distanceKm / 18);
      const k = Math.min(1, stepKm / remaining);
      store.setDriverStatus(bot.id, {
        location: {
          lat: bot.location.lat + (target.lat - bot.location.lat) * k,
          lng: bot.location.lng + (target.lng - bot.location.lng) * k,
        },
      });
    }, 800);
  }

  store.on('event', (evt) => {
    if (evt.type !== 'ride.updated' || evt.ride.status !== 'requested' || handled.has(evt.ride.id)) return;
    handled.add(evt.ride.id);
    setTimeout(() => {
      const ride = store.rides.get(evt.ride.id);
      if (!ride || ride.status !== 'requested' || humanDriverOnline()) return handled.delete(evt.ride.id);
      const bot = bots.find(
        (b) => b.rideTypes.includes(ride.rideType) && !store.activeRideForDriver(b.id)
      );
      if (!bot) return;
      // Start the demo driver about 1.5 km from the pickup.
      store.setDriverStatus(bot.id, { location: { lat: ride.pickup.lat + 0.009, lng: ride.pickup.lng - 0.011 }, online: true });
      store.acceptRide(ride.id, bot.id);
      drive(bot, ride);
    }, 4000);
  });

  // ---------- Basemap (Natural Earth country outlines; tiles can't load in the demo) ----------
  function basemap(map) {
    map.getContainer().classList.add('demo-map');
    L.geoJSON(window.__libyaBasemap, {
      interactive: false,
      style: (f) => ({ className: f.properties.name === 'Libya' ? 'land libya' : 'land', weight: 1 }),
    }).addTo(map);
    for (const c of Object.values(CITIES)) {
      L.circle([c.lat, c.lng], { radius: c.radiusKm * 1000, className: 'service-area', interactive: false }).addTo(map);
      L.marker([c.lat, c.lng], {
        interactive: false,
        icon: L.divIcon({ className: 'city-label', html: `${c.name.ar} · ${c.name.en}`, iconSize: [160, 20], iconAnchor: [80, -14] }),
      }).addTo(map);
    }
    map.attributionControl.addAttribution('Demo map: Natural Earth');
    // The simplified coastline reads best a little zoomed out, with the city on land.
    map.setView([32.84, 13.18], 11);
  }

  Object.assign(I18N.en, { demoNote: 'Demo on your phone: tap the map for pickup, then for destination.' });
  Object.assign(I18N.ar, { demoNote: 'نسخة تجريبية: اضغط على الخريطة لنقطة الانطلاق، ثم للوجهة.' });

  window.MishwarDemo = { store, basemap };
})();
