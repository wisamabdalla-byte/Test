(() => {
  const $ = (sel) => document.querySelector(sel);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(`mishwar.${k}`)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(`mishwar.${k}`, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(`mishwar.${k}`); } catch {} },
  };

  const state = {
    lang: store.get('lang') || 'ar',
    role: store.get('role') || 'rider',
    config: null,
    rider: store.get('rider'),
    driver: store.get('driver'),
    pickup: null,
    dropoff: null,
    quote: null,
    rideType: 'economy',
    payment: 'cash',
    ride: null,
    driverRide: null,
    requests: [],
  };

  const t = (key) => (I18N[state.lang] && I18N[state.lang][key]) || key;
  const label = (obj) => (obj && (obj[state.lang] || obj.en)) || '';
  const money = (n) => `${n.toFixed(n % 1 ? 1 : 0)} ${t('lyd')}`;

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
    return data;
  }

  // ---------- Map ----------
  const map = L.map('map', { zoomControl: false }).setView([32.8872, 13.1913], 13);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  // The standalone demo can't load map tiles, so it draws its own basemap instead.
  if (window.MishwarDemo) window.MishwarDemo.basemap(map);
  else {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
  }
  const pin = (cls, text) => L.divIcon({ className: `mk ${cls}`, html: text || '', iconSize: [28, 28], iconAnchor: [14, 14] });
  const markers = {};
  function setMarker(name, point, cls, text) {
    if (!point) {
      if (markers[name]) { map.removeLayer(markers[name]); delete markers[name]; }
      return;
    }
    if (markers[name]) markers[name].setLatLng([point.lat, point.lng]);
    else markers[name] = L.marker([point.lat, point.lng], { icon: pin(cls, text) }).addTo(map);
  }
  let routeLine = null;
  function drawRoute(a, b) {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (a && b) {
      routeLine = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: '#0a7d4f', weight: 4, dashArray: '6 8' }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [60, 60] });
    }
  }
  function locate(cb) {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => cb({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // ---------- Rendering ----------
  const show = (el, on) => el.classList.toggle('hidden', !on);

  function applyI18n() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
    $('#lang').textContent = state.lang === 'ar' ? 'English' : 'العربية';
  }

  function render() {
    applyI18n();
    document.querySelectorAll('.role').forEach((b) => b.classList.toggle('active', b.dataset.role === state.role));
    const isRider = state.role === 'rider';
    const me = isRider ? state.rider : state.driver;
    document.body.classList.toggle('is-driver', !isRider);
    show($('#register'), !me);
    show($('#logout'), Boolean(me));
    show($('#riderBook'), isRider && me && !state.ride);
    show($('#riderRide'), isRider && me && Boolean(state.ride));
    show($('#driverDash'), !isRider && Boolean(me));
    if (!state.config) return;
    renderCities();
    renderDriverTypeChips();
    if (isRider && me) state.ride ? renderRiderRide() : renderBooking();
    if (!isRider && me) { renderDriverDash(); renderRequests(); }
    renderMapForRole();
  }

  function renderCities() {
    const sel = $('#city');
    const current = sel.value || 'tripoli';
    sel.innerHTML = Object.entries(state.config.cities)
      .map(([id, c]) => `<option value="${id}">${label(c.name)}</option>`)
      .join('');
    sel.value = current;
  }

  function renderDriverTypeChips() {
    const box = $('#driverTypes');
    const checked = new Set([...box.querySelectorAll('input:checked')].map((i) => i.value));
    if (!box.children.length) checked.add('economy');
    box.innerHTML = Object.entries(state.config.rideTypes)
      .map(([id, rt]) => `<label class="chip"><input type="checkbox" value="${id}" ${checked.has(id) ? 'checked' : ''}/> ${label(rt.name)}</label>`)
      .join('');
  }

  function renderBooking() {
    $('#pickHint').textContent = !state.pickup ? t('tapPickup') : !state.dropoff ? t('tapDropoff') : '';
    show($('#quote'), Boolean(state.quote));
    if (!state.quote) return;
    const q = state.quote;
    $('#tripMeta').textContent = `${q.distanceKm} ${t('km')} · ~${q.durationMin} ${t('min')}${q.surge > 1 ? ` · ${t('surge')} ×${q.surge.toFixed(1)}` : ''}`;
    $('#rideTypes').innerHTML = Object.entries(state.config.rideTypes)
      .map(([id, rt]) => `
        <button type="button" class="option ${state.rideType === id ? 'selected' : ''}" data-type="${id}">
          <span class="opt-name">${label(rt.name)}</span>
          <span class="opt-meta">${rt.seats} ${t('seats')}${rt.femaleDriverOnly ? ` · ${t('ladiesNote')}` : ''}</span>
          <span class="opt-price">${money(q.fares[id])}</span>
        </button>`)
      .join('');
    $('#payments').innerHTML = state.config.payments
      .map((p) => `<button type="button" class="chip ${state.payment === p ? 'selected' : ''}" data-pay="${p}">${t(p)}</button>`)
      .join('');
  }

  function renderRiderRide() {
    const r = state.ride;
    $('#rideStatus').textContent = t(r.status);
    show($('#driverInfo'), Boolean(r.driver));
    if (r.driver) {
      $('#driverAvatar').textContent = r.driver.name.charAt(0);
      $('#driverName').textContent = r.driver.name;
      $('#driverRating').textContent = r.driver.rating.toFixed(1);
      $('#driverCar').textContent = [r.driver.car, r.driver.plate].filter(Boolean).join(' · ');
      $('#callDriver').href = `tel:${r.driver.phone}`;
    }
    $('#ridePin').textContent = r.pin;
    show($('.pin'), ['requested', 'accepted', 'arrived'].includes(r.status));
    $('#rideFare').textContent = `${t('fare')}: ${money(r.fare)} · ${t(r.payment)}`;
    const finished = ['completed', 'cancelled'].includes(r.status);
    show($('#cancelRide'), ['requested', 'accepted', 'arrived'].includes(r.status));
    show($('#newRide'), finished);
    show($('#rateBox'), r.status === 'completed' && r.riderRating === null);
    $('#stars').innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}">★</button>`).join('');
  }

  function renderDriverDash() {
    const d = state.driver;
    $('#driverSelfName').textContent = d.name;
    $('#driverEarnings').textContent = `${t('earnings')}: ${money(d.earnings || 0)}`;
    $('#onlineToggle').checked = Boolean(d.online);
    const r = state.driverRide;
    show($('#driverRide'), Boolean(r));
    show($('#requests'), !r);
    if (!r) return;
    $('#driverRideStatus').textContent = { accepted: t('toPickup'), arrived: t('waiting'), in_progress: t('withRider') }[r.status] || t(r.status);
    $('#driverRideInfo').textContent = `${r.rider.name} · ${label(state.config.rideTypes[r.rideType].name)} · ${t('collect')} ${money(r.fare)} (${t(r.payment)})`;
    $('#callRider').href = `tel:${r.rider.phone}`;
    show($('#pinBox'), r.status === 'arrived');
    $('#driverNext').textContent = { accepted: t('markArrived'), arrived: t('startTrip'), in_progress: t('completeTrip') }[r.status];
    show($('#driverRelease'), ['accepted', 'arrived'].includes(r.status));
  }

  function renderRequests() {
    const list = state.requests;
    $('#requests').innerHTML = list.length
      ? list.map((r) => `
          <div class="request">
            <div>
              <strong>${money(r.fare)}</strong> · ${label(state.config.rideTypes[r.rideType].name)} · ${t(r.payment)}
              <div class="meta">${r.distanceToPickupKm} ${t('km')} ${t('away')} · ${r.distanceKm} ${t('km')} ${t('trip')}</div>
            </div>
            <button class="primary small" data-accept="${r.id}">${t('accept')}</button>
          </div>`).join('')
      : `<p class="hint">${t('noRequests')}</p>`;
  }

  function renderMapForRole() {
    if (state.role === 'rider') {
      const r = state.ride;
      setMarker('pickup', r ? r.pickup : state.pickup, 'green');
      setMarker('dropoff', r ? r.dropoff : state.dropoff, 'red');
      setMarker('car', r && r.driver && r.driver.location && !['completed', 'cancelled'].includes(r.status) ? r.driver.location : null, 'car', '🚗');
      setMarker('me', null);
    } else {
      const r = state.driverRide;
      setMarker('pickup', r ? r.pickup : null, 'green');
      setMarker('dropoff', r ? r.dropoff : null, 'red');
      setMarker('car', null);
      setMarker('me', state.driver && state.driver.location, 'car', '🚗');
    }
  }

  // ---------- Rider actions ----------
  async function updateQuote() {
    state.quote = null;
    $('#bookError').textContent = '';
    if (state.pickup && state.dropoff) {
      try {
        state.quote = await api('POST', '/api/quote', { pickup: state.pickup, dropoff: state.dropoff });
      } catch (e) {
        state.pickup = state.dropoff = null;
        render();
        $('#pickHint').textContent = e.message; // e.g. outside service area
        return;
      }
    }
    drawRoute(state.pickup, state.dropoff);
    render();
  }

  function setRiderPoint(point) {
    if (state.ride) return;
    if (!state.pickup) state.pickup = point;
    else if (!state.dropoff) state.dropoff = point;
    else return;
    updateQuote();
  }

  async function requestRide() {
    try {
      state.ride = await api('POST', '/api/rides', {
        riderId: state.rider.id,
        pickup: state.pickup,
        dropoff: state.dropoff,
        pickupLabel: $('#pickupLabel').value,
        dropoffLabel: $('#dropoffLabel').value,
        rideType: state.rideType,
        payment: state.payment,
      });
      store.set('rideId', state.ride.id);
      render();
    } catch (e) {
      if (e.status === 404) return logout(); // server restarted; in-memory account is gone
      $('#bookError').textContent = e.message;
    }
  }

  function resetBooking() {
    state.pickup = state.dropoff = state.quote = state.ride = null;
    store.del('rideId');
    drawRoute(null, null);
    render();
  }

  // ---------- Driver actions ----------
  async function refreshDriver() {
    if (!state.driver) return;
    try {
      const { activeRide, ...d } = await api('GET', `/api/drivers/${state.driver.id}`);
      state.driver = d;
      state.driverRide = activeRide;
      store.set('driver', d);
      state.requests = state.driverRide ? [] : await api('GET', `/api/drivers/${d.id}/requests`);
    } catch (e) {
      if (e.status === 404) logout(); // server restarted; in-memory data is gone
    }
    render();
  }

  async function setDriverStatus(patch) {
    $('#driverError').textContent = '';
    try {
      state.driver = await api('POST', `/api/drivers/${state.driver.id}/status`, patch);
      store.set('driver', state.driver);
    } catch (e) {
      $('#driverError').textContent = e.message;
    }
    refreshDriver();
  }

  async function driverNext() {
    const r = state.driverRide;
    const action = { accepted: 'arrived', arrived: 'start', in_progress: 'complete' }[r.status];
    $('#driverError').textContent = '';
    try {
      const updated = await api('POST', `/api/rides/${r.id}/${action}`, { driverId: state.driver.id, pin: $('#pinInput').value });
      state.driverRide = updated.status === 'completed' ? null : updated;
      if (!state.driverRide) drawRoute(null, null);
      $('#pinInput').value = '';
      refreshDriver();
    } catch (e) {
      $('#driverError').textContent = e.message;
    }
  }

  // Moves the driver toward the current target to demo live tracking without a real GPS feed.
  function simulateTick() {
    const r = state.driverRide;
    const d = state.driver;
    if (!r || !d || !d.location || !$('#simulate').checked) return;
    const target = r.status === 'accepted' ? r.pickup : r.status === 'in_progress' ? r.dropoff : null;
    if (!target) return;
    const step = 0.0015; // ~150 m
    const dLat = target.lat - d.location.lat;
    const dLng = target.lng - d.location.lng;
    const dist = Math.hypot(dLat, dLng);
    if (dist < 0.0002) return;
    const k = Math.min(1, step / dist);
    setDriverStatus({ location: { lat: d.location.lat + dLat * k, lng: d.location.lng + dLng * k } });
  }

  // ---------- Events ----------
  function connectEvents() {
    const es = new EventSource('/api/events');
    es.onmessage = (msg) => {
      const evt = JSON.parse(msg.data);
      if (evt.type === 'ride.updated') {
        const r = evt.ride;
        if (state.ride && r.id === state.ride.id) state.ride = { ...r, pin: state.ride.pin };
        if (state.driver) {
          if (r.driverId === state.driver.id && !['completed', 'cancelled'].includes(r.status)) state.driverRide = r;
          else if (state.driverRide && state.driverRide.id === r.id) {
            state.driverRide = null; // cancelled by rider
            if (state.role === 'driver') drawRoute(null, null);
          }
          if (state.role === 'driver') refreshDriver();
        }
        render();
      } else if (evt.type === 'driver.updated' && state.ride && state.ride.driver && state.ride.driver.id === evt.driver.id) {
        state.ride.driver = evt.driver;
        renderMapForRole();
      }
    };
  }

  function logout() {
    if (state.role === 'rider') { state.rider = null; store.del('rider'); resetBooking(); }
    else { state.driver = null; state.driverRide = null; store.del('driver'); }
    render();
  }

  function bind() {
    $('#lang').onclick = () => { state.lang = state.lang === 'ar' ? 'en' : 'ar'; store.set('lang', state.lang); render(); };
    document.querySelectorAll('.role').forEach((b) => (b.onclick = () => {
      state.role = b.dataset.role;
      store.set('role', state.role);
      drawRoute(null, null);
      if (state.role === 'driver') refreshDriver();
      else drawRoute(state.ride ? state.ride.pickup : state.pickup, state.ride ? state.ride.dropoff : state.dropoff);
      render();
    }));

    $('#register').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      $('#registerError').textContent = '';
      try {
        if (state.role === 'rider') {
          state.rider = await api('POST', '/api/riders', { name: f.get('name'), phone: f.get('phone') });
          store.set('rider', state.rider);
        } else {
          const rideTypes = [...document.querySelectorAll('#driverTypes input:checked')].map((i) => i.value);
          state.driver = await api('POST', '/api/drivers', {
            name: f.get('name'), phone: f.get('phone'), gender: f.get('gender'), car: f.get('car'), plate: f.get('plate'), rideTypes,
          });
          store.set('driver', state.driver);
          refreshDriver();
        }
        render();
      } catch (err) {
        $('#registerError').textContent = err.message;
      }
    };

    map.on('click', (e) => {
      const point = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (state.role === 'rider' && state.rider) setRiderPoint(point);
      if (state.role === 'driver' && state.driver && !state.driverRide) setDriverStatus({ location: point });
    });

    $('#city').onchange = (e) => {
      const c = state.config.cities[e.target.value];
      map.setView([c.lat, c.lng], 13);
    };
    $('#locateRider').onclick = () => locate((p) => { map.setView([p.lat, p.lng], 15); state.pickup = null; setRiderPoint(p); });
    $('#locateDriver').onclick = () => locate((p) => { map.setView([p.lat, p.lng], 15); setDriverStatus({ location: p }); });
    $('#resetStops').onclick = resetBooking;
    $('#rideTypes').onclick = (e) => { const b = e.target.closest('[data-type]'); if (b) { state.rideType = b.dataset.type; render(); } };
    $('#payments').onclick = (e) => { const b = e.target.closest('[data-pay]'); if (b) { state.payment = b.dataset.pay; render(); } };
    $('#requestRide').onclick = requestRide;
    $('#cancelRide').onclick = async () => {
      state.ride = await api('POST', `/api/rides/${state.ride.id}/cancel`, { riderId: state.rider.id });
      render();
    };
    $('#newRide').onclick = resetBooking;
    $('#stars').onclick = async (e) => {
      const b = e.target.closest('[data-star]');
      if (!b) return;
      state.ride = { ...(await api('POST', `/api/rides/${state.ride.id}/rate`, { riderId: state.rider.id, stars: Number(b.dataset.star) })), pin: state.ride.pin };
      render();
    };

    $('#onlineToggle').onchange = (e) => setDriverStatus({ online: e.target.checked });
    $('#requests').onclick = async (e) => {
      const b = e.target.closest('[data-accept]');
      if (!b) return;
      try {
        state.driverRide = await api('POST', `/api/rides/${b.dataset.accept}/accept`, { driverId: state.driver.id });
        drawRoute(state.driverRide.pickup, state.driverRide.dropoff);
      } catch (err) {
        $('#driverError').textContent = err.message;
      }
      refreshDriver();
    };
    $('#driverNext').onclick = driverNext;
    $('#driverRelease').onclick = async () => {
      await api('POST', `/api/rides/${state.driverRide.id}/cancel`, { driverId: state.driver.id });
      state.driverRide = null;
      drawRoute(null, null);
      refreshDriver();
    };
    $('#logout').onclick = logout;
  }

  async function init() {
    bind();
    applyI18n();
    state.config = await api('GET', '/api/config');
    // Restore an in-flight ride after a page reload.
    const rideId = store.get('rideId');
    if (rideId && state.rider) {
      try {
        state.ride = await api('GET', `/api/rides/${rideId}?riderId=${state.rider.id}`);
        drawRoute(state.ride.pickup, state.ride.dropoff);
      } catch { store.del('rideId'); }
    }
    if (state.driver) await refreshDriver();
    if (state.role === 'driver' && state.driverRide) drawRoute(state.driverRide.pickup, state.driverRide.dropoff);
    render();
    connectEvents();
    setInterval(simulateTick, 1000);
    setInterval(() => { if (state.role === 'driver' && state.driver && !state.driverRide) refreshDriver(); }, 5000);
  }

  init();
})();
