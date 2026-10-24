// Builds demo/mishwar-demo.html: the whole app (UI + ride logic) in one self-contained page that
// runs in a phone browser with no server. Usage: node scripts/build-demo.js [leaflet.css path]
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Leaflet's stylesheet has to be inlined (the demo host only allows scripts from CDNs).
const leafletCssPath = process.argv[2] || path.join(root, 'node_modules/leaflet/dist/leaflet.css');
if (!fs.existsSync(leafletCssPath)) {
  console.error(`Leaflet CSS not found at ${leafletCssPath}. Run "npm pack leaflet@1.9.4" and pass the path to dist/leaflet.css.`);
  process.exit(1);
}

const shims = {
  events: `class EventEmitter {
    constructor() { this._l = {}; }
    on(e, f) { (this._l[e] = this._l[e] || []).push(f); return this; }
    emit(e, ...a) { (this._l[e] || []).slice().forEach((f) => f(...a)); return true; }
  }
  module.exports = { EventEmitter };`,
  crypto: `const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
  module.exports = {
    randomBytes: (n) => ({ toString: () => Array.from(rand(n), (b) => b.toString(16).padStart(2, '0')).join('') }),
    randomInt: (min, max) => min + (new Uint32Array(rand(4).buffer)[0] % (max - min)),
  };`,
};
const modules = { ...shims };
for (const name of ['cities', 'pricing', 'phone', 'store', 'routes']) modules[`./${name}`] = read(`src/${name}.js`);

const bundle = `const __require = (() => {
  const defs = {
${Object.entries(modules)
  .map(([name, src]) => `    ${JSON.stringify(name)}: function (module, exports, require) {\n${src}\n    },`)
  .join('\n')}
  };
  const cache = {};
  return function require(name) {
    if (!cache[name]) {
      const module = { exports: {} };
      cache[name] = module;
      defs[name](module, module.exports, require);
    }
    return cache[name].exports;
  };
})();`;

const html = read('public/index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script')).trim();
const demoCss = `
.demo-map { background: var(--sea); }
.land { fill: var(--land-muted); stroke: var(--border); fill-opacity: 1; }
.land.libya { fill: var(--land); }
.service-area { fill: var(--green); fill-opacity: .06; stroke: var(--green); stroke-opacity: .5; stroke-dasharray: 4 6; }
.city-label { color: var(--muted); font-size: 12px; font-weight: 600; text-align: center; white-space: nowrap; }
#locateRider, #locateDriver { display: none; }
.demo-note { font-size: .8rem; color: var(--muted); background: var(--soft); border-radius: 10px; padding: 8px 10px; margin: 0; }
`;

const out = `<title>Mishwar</title>
<style>
${fs.readFileSync(leafletCssPath, 'utf8')}
${read('public/styles.css')}
${demoCss}
</style>
${body.replace('<div id="riderBook" class="card hidden">', '<div id="riderBook" class="card hidden">\n        <p class="demo-note" data-i18n="demoNote"></p>')}
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
<script>
window.__libyaBasemap = ${read('demo/libya-basemap.json')};
${read('public/i18n.js')}
${bundle}
${read('demo/runtime.js')}
</script>
<script>
${read('public/app.js')}
</script>
`;

fs.writeFileSync(path.join(root, 'demo/mishwar-demo.html'), out);
console.log(`Wrote demo/mishwar-demo.html (${Math.round(out.length / 1024)} KB)`);
