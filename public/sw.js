/* EBENE SERVICES — Service Worker
 * - Cache-first pour les assets statiques
 * - Network-first pour les appels Supabase REST
 * - Bypass complet pour Auth Supabase / OAuth Google / Drive API
 * - NE FAIT RIEN si l'app tourne dans Capacitor (window.Capacitor)
 *   NB: dans un SW, "self" est un ServiceWorkerGlobalScope et n'a pas
 *   accès à window.Capacitor. On délègue donc la décision au client :
 *   si on tourne dans Capacitor, le client ne doit JAMAIS enregistrer
 *   ce SW. En sécurité supplémentaire, on détecte le scheme `capacitor:`
 *   et on s'abstient.
 */

const CACHE_VERSION = "ebene-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Hôtes à exclure totalement du cache (auth / oauth / drive)
const BYPASS_HOSTS = [
  "accounts.google.com",
  "oauth2.googleapis.com",
  "www.googleapis.com",   // Drive API
  "googleapis.com",
];

// Patterns d'URL à exclure (Supabase Auth)
const BYPASS_PATHS = [
  "/auth/v1/",            // Supabase Auth
  "/functions/v1/",       // Edge functions (toujours fraîches)
];

self.addEventListener("install", (event) => {
  // Activation immédiate du nouveau SW
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isStaticAsset(url) {
  return /\.(?:js|mjs|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|ico)$/i.test(url.pathname);
}

function shouldBypass(url) {
  // Bypass schemes non-http (capacitor://, file://, chrome-extension://...)
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;

  if (BYPASS_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith("." + h))) {
    return true;
  }
  if (BYPASS_PATHS.some((p) => url.pathname.includes(p))) {
    return true;
  }
  return false;
}

function isSupabaseRest(url) {
  // Supabase REST: *.supabase.co/rest/v1/* ou *.supabase.co/storage/v1/*
  return (
    url.hostname.endsWith(".supabase.co") &&
    (url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/storage/v1/"))
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // On ne touche que GET
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Capacitor / scheme non-web → ne rien faire
  if (shouldBypass(url)) return;

  // Network-first pour Supabase REST/Storage
  if (isSupabaseRest(url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Cache-first pour assets statiques (même origine ou Google Fonts)
  const sameOrigin = url.origin === self.location.origin;
  const isFontHost =
    url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

  if ((sameOrigin && isStaticAsset(url)) || isFontHost) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Navigations: network-first avec fallback cache (offline shell léger)
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.status === 200) {
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}
