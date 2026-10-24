# Mishwar · مشوار

A ride-hailing app (like Uber) built for Libya. It's a working prototype: one Node.js server
(no dependencies) plus a bilingual web app with a **rider** mode and a **driver** mode.

## Built for Libya

- **Arabic first, with English.** The UI defaults to Arabic with a right-to-left layout and switches to English in one tap.
- **Libyan Dinar (LYD) pricing.** Fares round to the nearest 0.5 LYD because most rides are paid in cash.
- **Cash by default.** Card and wallet are also options. The driver screen shows exactly how much cash to collect.
- **Libyan mobile numbers.** Accepts `091…`, `+218 9…` and `00218…` formats, and detects the operator (Libyana: 92/94; Al-Madar: 91/93/95).
- **Service areas.** Tripoli, Benghazi, Misrata, Zawiya, Sabha and Al Bayda. Pickups outside these areas are rejected.
- **Ladies rides (سيدات).** Female riders can book a ride type that only female drivers can see and accept.
- **Family Van.** A 7-seat option for families.
- **Ride PIN.** The rider gets a 4-digit code and tells it to the driver, who must enter it to start the trip. This confirms the rider got into the right car. Drivers never see the PIN through the app.

## Features

| Rider | Driver |
| --- | --- |
| Sign up with name + Libyan mobile | Sign up with car, plate, gender and the ride types you offer |
| Tap the map (or use GPS) to set pickup and destination | Set your location and go online |
| See fares for Economy / Comfort / Family / Ladies | See nearby requests (within 10 km), closest first |
| Choose cash / card / wallet and request | Accept → I've arrived → enter PIN to start → complete |
| Live updates: driver name, car, plate, rating, call button | Release a ride, which puts it back in the queue for other drivers |
| Watch the driver's car move on the map | Earnings tracker |
| Rate the driver 1–5 stars | "Simulate driving" so you can demo live tracking without GPS |

Prices go up automatically (up to 1.5×) when there are more open requests than online drivers in a city.

## Run it

```bash
npm start          # http://localhost:3000  (set PORT to change)
npm test           # unit + HTTP API tests
```

Requires Node.js 18 or later. There's nothing to install.

**To try a full ride on one computer:** open the app in a normal window and in a private window (or a second browser).
In the first, book a ride as a rider. In the second, switch to **Drive (سوق)**, register, tap the map near the pickup point,
and go online. The request appears, and both screens update live.

## How it's built

```
server.js          HTTP server: JSON API, live updates via Server-Sent Events, static files
src/store.js       Riders, drivers, rides, ride status rules, matching, surge, ratings
src/pricing.js     LYD fare model per ride type
src/cities.js      Libyan service areas + distance math
src/phone.js       Libyan mobile number validation
public/            Web app (vanilla JS + Leaflet/OpenStreetMap), Arabic/English
test/              node:test suites
```

A ride moves through these statuses: `requested → accepted → arrived → in_progress → completed`.
It can be `cancelled` before the trip starts. If a driver releases a ride, it goes back to `requested`.

### Fare table (LYD)

| Type | Base | Per km | Per min | Minimum |
| --- | --- | --- | --- | --- |
| Economy | 5 | 1.50 | 0.25 | 10 |
| Comfort | 8 | 2.25 | 0.35 | 15 |
| Family Van | 10 | 2.75 | 0.40 | 20 |
| Ladies | 6 | 1.75 | 0.30 | 12 |

Edit `src/pricing.js` to change these numbers. Distance is a straight-line estimate multiplied by 1.3 to account for city streets.

## Before going to production

This is a prototype. A real launch would still need:

- **Database.** Data is kept in memory and lost on restart. Use PostgreSQL + PostGIS for geo queries.
- **Authentication.** Verify phone numbers with an SMS OTP and use session tokens. Right now, IDs act as credentials, and live events are broadcast to every connected client.
- **Real routing and ETAs.** Use OSRM or Valhalla on OpenStreetMap data, which covers Libya well.
- **Payments.** Integrate local payment providers for card and wallet. Cash settlement needs driver commission tracking.
- **Native apps.** Build these with React Native or Flutter, including background GPS for drivers and push notifications.
- **Driver onboarding.** Check licence, vehicle registration and identity documents, and add an admin panel.
- **Safety.** Add an SOS button, trip sharing with family, and support for Libyan emergency numbers.
