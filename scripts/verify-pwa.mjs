/**
 * End-to-end PWA verification against a running production build.
 *
 *   npm run build && npm start          # in one terminal
 *   npm run verify:pwa                  # in another
 *
 * Drives headless Chrome over the DevTools Protocol at an iPhone viewport and
 * checks the things a unit test cannot: that the service worker installs and
 * takes control, that the app shell is precached, that the shelf survives a
 * reload without being re-seeded, and that every screen still renders with the
 * network cut.
 *
 * Set CHROME_PATH to point at a specific browser. Override the target with
 *   npm run verify:pwa -- http://localhost:3000
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PORT = 9222 + Math.floor(Math.random() * 500);
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error("No Chrome found. Set CHROME_PATH to your browser binary.");
  process.exit(2);
}

/**
 * Chrome's CacheStorage fails outright under an 8.3 short path such as
 * C:\Users\SOMEON~1 — the service worker installs, then goes redundant with
 * "Unexpected internal error". realpath resolves to the long form.
 */
const profile = mkdtempSync(join(realpathSync.native(tmpdir()), "reading-log-pwa-"));

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  " + JSON.stringify(detail ?? "")}`);
  if (!ok) failures++;
};

const chrome = spawn(chromePath, [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "about:blank",
]);
chrome.stderr.on("data", () => {});

function shutdown(code) {
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // A locked profile directory is not worth failing the run over.
  }
  process.exit(code);
}

const bail = setTimeout(() => {
  console.error("\nTimed out.");
  shutdown(2);
}, 180_000);

async function devtoolsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Chrome never exposed a DevTools endpoint");
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const listeners = new Set();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      } else {
        listeners.forEach((fn) => fn(msg));
      }
    };
    ws.onerror = reject;
    ws.onopen = () =>
      resolve({
        send: (method, params = {}, sessionId) =>
          new Promise((res, rej) => {
            const msgId = ++id;
            pending.set(msgId, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
          }),
        listen: (fn) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        close: () => ws.close(),
      });
  });
}

try {
  const res = await fetch(BASE, { redirect: "manual" });
  if (!res.ok && res.status < 300) throw new Error(String(res.status));
} catch {
  console.error(`Nothing serving ${BASE}. Run: npm run build && npm start`);
  shutdown(2);
}

const browser = await connect(await devtoolsUrl());
const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await browser.send("Target.attachToTarget", {
  targetId,
  flatten: true,
});
const send = (method, params) => browser.send(method, params, sessionId);

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", VIEWPORT);

async function go(url) {
  const loaded = new Promise((resolve) => {
    const off = browser.listen((m) => {
      if (m.method === "Page.loadEventFired") {
        off();
        resolve();
      }
    });
    setTimeout(() => {
      off();
      resolve();
    }, 15_000);
  });
  await send("Page.navigate", { url });
  await loaded;
}

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  }
  return r.result.value;
}

/**
 * Polls a client-side expression until it reports `done`, then returns it.
 * Bounded: an unresolved promise inside Runtime.evaluate hangs the call.
 */
const poll = (expr, tries = 40) =>
  evaluate(`
    (async () => {
      let last;
      for (let i = 0; i < ${tries}; i++) {
        last = (() => { try { return (${expr}); } catch (e) { return { error: String(e) }; } })();
        if (last && last.done) return last;
        await new Promise(r => setTimeout(r, 250));
      }
      return last;
    })()
  `);

console.log(`\nVerifying ${BASE}\n`);

console.log("service worker");
await go(BASE + "/");
const sw = await poll(`(() => {
  const c = navigator.serviceWorker.controller;
  return { done: !!c, controlled: !!c, script: c && c.scriptURL };
})()`);
check("installs and takes control of the page", sw.controlled, sw);

const shell = await evaluate(`
  (async () => {
    const keys = await caches.keys();
    const name = keys.find(k => k.startsWith('reading-log-shell'));
    const cached = name
      ? (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname).sort()
      : [];
    return { keys, cached };
  })()
`);
check("creates the shell cache", shell.keys.some((k) => k.startsWith("reading-log-shell")), shell.keys);
for (const url of ["/", "/search", "/insights", "/settings", "/manifest.json"]) {
  check(`precaches ${url}`, shell.cached.includes(url), shell.cached);
}

console.log("\npersistence");
// A new reader starts with an empty shelf: the sample library is opt-in from
// Settings, never seeded on their behalf.
const fresh = await poll(`(() => {
  const heading = document.querySelector('main h1');
  const s = JSON.parse(localStorage.getItem('reading-log/library') || 'null');
  return {
    done: !!heading,
    entries: s ? s.entries.length : 0,
    books: document.querySelectorAll('main h3').length,
    invites: !!document.body.textContent.match(/Start a streak|Nothing open right now/)
  };
})()`);
check("a first run starts with an empty shelf", fresh.entries === 0, fresh);
check("the empty shelf invites a first book", fresh.invites, fresh);

// Write a shelf of our own, then confirm a reload restores exactly it.
await evaluate(`
  (() => {
    const now = new Date().toISOString();
    localStorage.setItem('reading-log/library', JSON.stringify({
      version: 1,
      entries: [{
        id: 'e1',
        book: { id: 'b1', title: 'A Tracked Book', author: 'A N Author',
                pageCount: 300, genre: 'Fiction' },
        status: 'reading', currentPage: 123, addedAt: now, startedAt: now
      }],
      logs: [],
      settings: {}
    }));
    return true;
  })()
`);
await go(BASE + "/");
const survived = await poll(`(() => {
  const s = JSON.parse(localStorage.getItem('reading-log/library') || 'null');
  const titles = [...document.querySelectorAll('main h3')].map(h => h.textContent);
  return {
    done: !!s && titles.length > 0,
    count: s && s.entries.length,
    page: s && s.entries[0].currentPage,
    titles
  };
})()`);
check("keeps a saved shelf across a reload", survived.count === 1, survived);
check("keeps the reading position", survived.page === 123, survived);
check("renders the stored book, never a sample over it", survived.titles.includes("A Tracked Book"), survived.titles);

console.log("\noffline");
const OFFLINE = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
await send("Network.emulateNetworkConditions", OFFLINE);

// A controlled page's requests are served by the worker, which has its own
// network stack — cutting only the page's would leave the worker online and
// the whole check meaningless.
const swSessions = new Set();
browser.listen((m) => {
  if (m.method === "Target.attachedToTarget" && m.params.targetInfo.type === "service_worker") {
    swSessions.add(m.params.sessionId);
  }
});
await browser.send("Target.setAutoAttach", {
  autoAttach: true,
  waitForDebuggerOnStart: false,
  flatten: true,
});
await new Promise((r) => setTimeout(r, 1500));
for (const sid of swSessions) {
  await browser.send("Network.enable", {}, sid);
  await browser.send("Network.emulateNetworkConditions", OFFLINE, sid);
}
check("service worker taken offline too", swSessions.size > 0, [...swSessions]);

await go(BASE + "/insights");
const reachable = await evaluate(`
  fetch('/__never_cached_' + Date.now(), { cache: 'no-store' })
    .then(r => 'reachable:' + r.status)
    .catch(e => 'failed:' + e.name)
`);
check("network is genuinely unreachable", reachable.startsWith("failed"), reachable);

const offline = await poll(`(() => {
  const h1 = document.querySelector('main h1');
  const charts = document.querySelectorAll('svg.recharts-surface').length;
  return {
    done: !!h1 && charts >= 1,
    title: h1 && h1.textContent,
    tabs: document.querySelectorAll('nav a').length,
    tiles: document.querySelectorAll('main .grid > div').length,
    charts
  };
})()`);
check("still renders a full screen", offline.title === "Insights", offline);
check("tab bar survives", offline.tabs === 3, offline);
check("stat tiles render", offline.tiles === 5, offline);
check("the pages chart renders", offline.charts >= 1, offline);

console.log("\nlayout");
await send("Network.emulateNetworkConditions", {
  offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
});
for (const [name, path] of [["shelf", "/"], ["search", "/search"], ["insights", "/insights"], ["settings", "/settings"]]) {
  await go(BASE + path);
  await poll(`({ done: !!document.querySelector('main h1') })`);
  const m = await evaluate(`({
    inner: window.innerWidth,
    scroll: document.documentElement.scrollWidth
  })`);
  check(`${name} fits ${VIEWPORT.width}px without sideways scroll`, m.scroll <= m.inner, m);
}

console.log(
  failures === 0 ? "\nAll PWA checks passed.\n" : `\n${failures} check(s) failed.\n`
);
clearTimeout(bail);
browser.close();
shutdown(failures === 0 ? 0 : 1);
