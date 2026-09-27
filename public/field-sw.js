/*
 * RPCMS Field Operations Portal — offline service worker (scope /field).
 *
 * What it does:
 * - On install (and when the page asks, e.g. after a language change) it
 *   downloads every Field Operations screen and the scripts, styles and fonts
 *   those screens use, so the app opens without a connection.
 * - Screens: network first (with a short timeout for poor connections), then
 *   the cached copy. Record ids travel in the query string, so one cached page
 *   serves every record.
 * - Build assets (/_next/static): cache first; their names change with every
 *   build, so a cached copy is never stale.
 *
 * What it does not do: it never caches data. Records, drafts and the upload
 * queue live in the device store (localStorage / IndexedDB) managed by the app,
 * and map tiles are not cached. Registered only in production builds.
 */
const VERSION = "rpcms-field-v1";
const PAGE_CACHE = `${VERSION}-pages`;
const ASSET_CACHE = `${VERSION}-assets`;
const PAGES = [
  "/field",
  "/field/interventions",
  "/field/intervention",
  "/field/task",
  "/field/reports",
  "/field/report",
  "/field/surveys",
  "/field/survey",
  "/field/verify",
  "/field/assistance",
  "/field/assistance/record",
  "/field/map",
  "/field/issues",
  "/field/issue",
  "/field/sync",
  "/field/notifications",
  "/field/account",
  "/field/team",
];
const EXTRA = ["/field.webmanifest", "/field-icons/icon-192.png", "/field-icons/icon-512.png", "/field-icons/maskable-512.png"];
const NETWORK_TIMEOUT_MS = 6000;

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · RPCMS</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#f8faf9;color:#142b3b}main{max-width:520px;margin:auto}a{color:#087f78}</style></head>
<body><main><h1>You are offline</h1><p>This screen has not been saved on this device yet. Your drafts and queued records are safe on the device.</p><p><a href="/field">Open My work</a> · <a href="/field/sync">Open the sync centre</a></p></main></body></html>`;

async function cacheAsset(cache, url) {
  if (await cache.match(url)) return;
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return;
    await cache.put(url, res.clone());
    // Fonts and images referenced from stylesheets.
    if (url.endsWith(".css")) {
      const css = await res.text();
      const nested = [...css.matchAll(/url\((\/_next\/static\/[^)'"]+)\)/g)].map((m) => m[1]);
      await Promise.all(nested.map((u) => cacheAsset(cache, u)));
    }
  } catch {
    // Offline or blocked: the asset is fetched at runtime instead.
  }
}

async function precache() {
  const pages = await caches.open(PAGE_CACHE);
  const assets = await caches.open(ASSET_CACHE);
  for (const path of PAGES) {
    try {
      const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) continue;
      const html = await res.clone().text();
      await pages.put(path, res);
      const urls = new Set([...html.matchAll(/\/_next\/static\/[^"'\\\s)<>]+/g)].map((m) => m[0]));
      await Promise.all([...urls].map((u) => cacheAsset(assets, u)));
    } catch {
      // Keep going: whatever was cached still works offline.
    }
  }
  await Promise.all(EXTRA.map((u) => cacheAsset(assets, u)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rpcms-field-") && !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "precache") event.waitUntil(precache());
});

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (err) => (clearTimeout(timer), reject(err)),
    );
  });
}

async function page(request, url) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) cache.put(url.pathname, res.clone());
    return res;
  } catch {
    const cached = (await cache.match(url.pathname)) || (await cache.match("/field"));
    return cached || new Response(OFFLINE_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || EXTRA.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Full page loads of Field Operations screens. (A failed in-app navigation
  // falls back to a full page load, which then lands here.)
  if (request.mode === "navigate" && (url.pathname === "/field" || url.pathname.startsWith("/field/"))) {
    event.respondWith(page(request, url));
  }
});
