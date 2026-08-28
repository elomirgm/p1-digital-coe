const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { buildMockFirebase } = require('./mock-firebase');

// P1 DIGITAL COE carrega o SDK do Firebase DINAMICAMENTE via
// document.createElement('script')+s.src=... (não uma <script src> estática
// no HTML, diferente do spaei-digital) — interceptamos criando um
// document.createElement customizado que, quando vê um <script> com src
// contendo "firebasejs", NUNCA deixa o jsdom tentar buscar de verdade
// (window.firebase já é o mock, definido antes do boot) e dispara onload
// na hora, como se tivesse carregado.
async function bootApp(opts) {
  opts = opts || {};
  const latencyMs = opts.latencyMs === undefined ? 5 : opts.latencyMs;
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
  const { fb, store } = buildMockFirebase(latencyMs);

  const errosJs = [];
  const dom = new JSDOM(html, {
    url: 'https://spaei-coe.github.io/p1-digital-coe/',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.firebase = fb;
      window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {} }; };
      if (!window.crypto || !window.crypto.subtle) {
        const nodeCrypto = require('crypto');
        window.crypto = window.crypto || {};
        window.crypto.subtle = { digest: async (algo, data) => nodeCrypto.createHash('sha256').update(Buffer.from(data)).digest().buffer };
      }
      window.onerror = (msg, src, line) => { errosJs.push(`${msg} @linha ${line}`); };
      // jsdom não implementa URL.createObjectURL (usado em exports de
      // PDF/CSV/backup) — polyfill de teste, nunca "correção" do app.
      if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:mock-url';
      if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};

      const origCreateElement = window.document.createElement.bind(window.document);
      window.document.createElement = function (tagName) {
        const el = origCreateElement(tagName);
        if (String(tagName).toLowerCase() === 'script') {
          let realSrc = '';
          Object.defineProperty(el, 'src', {
            get() { return realSrc; },
            set(v) {
              realSrc = v;
              if (String(v).includes('firebasejs')) {
                // SDK já é o mock (window.firebase) — só simula "carregou"
                setTimeout(() => { if (el.onload) el.onload(); }, 0);
              } else {
                el.setAttribute('src', v);
              }
            }
          });
        }
        return el;
      };
    }
  });

  await new Promise(r => setTimeout(r, 400));
  return { window: dom.window, store, errosJs };
}

module.exports = { bootApp };
