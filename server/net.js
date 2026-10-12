// fetch "prudente" per leggere pagine pubbliche dal server.
//
// Protezioni:
//  - solo http/https, porte standard;
//  - niente indirizzi privati/locali (anti-SSRF): l'host viene risolto e ogni
//    IP controllato, anche a ogni redirect (seguiti a mano, massimo 5);
//  - timeout e tetto ai byte letti;
//  - User-Agent onesto: non ci spacciamo per un browser né per un crawler
//    di altri e non mandiamo cookie, quindi niente login/paywall aggirati.
//
// Limite noto: tra il controllo DNS e la connessione l'host potrebbe
// risolversi in un altro IP (DNS rebinding). Per un'app personale dietro login
// è un rischio accettabile; è documentato nel README.

import dns from "node:dns/promises";
import net from "node:net";

export const USER_AGENT = "SecondBrain/0.1 (archivio personale; lettura di metadati pubblici)";

function ipv4ToInt(ip) {
  return ip.split(".").reduce((acc, p) => (acc << 8) + Number(p), 0) >>> 0;
}

const V4_BLOCKED = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].map(([base, bits]) => [ipv4ToInt(base), bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0]);

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKED.some(([base, mask]) => (n & mask) >>> 0 === base);
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    if (/^f[cd]/.test(v)) return true; // fc00::/7 unique local
    if (/^fe[89ab]/.test(v)) return true; // fe80::/10 link-local
    if (/^ff/.test(v)) return true; // multicast
    if (v.startsWith("64:ff9b:") || v.startsWith("2001:db8:")) return true;
    return false;
  }
  return true; // formato sconosciuto: per sicurezza lo blocchiamo
}

export class FetchError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function assertPublicHost(u, { allowPrivate }) {
  if (!/^https?:$/.test(u.protocol)) throw new FetchError("bad_url", "Sono ammessi solo link http e https.");
  if (u.username || u.password) throw new FetchError("bad_url", "Link con credenziali non ammessi.");
  if (u.port && !["80", "443"].includes(u.port) && !allowPrivate) {
    throw new FetchError("bad_url", "Porta non ammessa.");
  }
  if (allowPrivate) return;
  const hostname = u.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal")) {
    throw new FetchError("blocked", "Indirizzo locale non ammesso.");
  }
  let addrs;
  if (net.isIP(hostname)) addrs = [{ address: hostname }];
  else {
    try {
      addrs = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new FetchError("dns", "Il sito non esiste o non è raggiungibile.");
    }
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new FetchError("blocked", "Indirizzo di rete privato non ammesso.");
  }
}

async function readLimited(res, maxBytes) {
  if (!res.body) return { buf: new Uint8Array(0), truncated: false };
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size >= maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
  }
  const buf = new Uint8Array(Math.min(size, maxBytes));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.length - off);
    buf.set(c.subarray(0, take), off);
    off += take;
    if (off >= buf.length) break;
  }
  return { buf, truncated };
}

function decode(buf, contentType) {
  const m = /charset=([^;]+)/i.exec(contentType || "");
  let charset = m ? m[1].trim().replace(/["']/g, "").toLowerCase() : "utf-8";
  if (!m) {
    // Prova a leggere <meta charset> nei primi byte.
    const head = new TextDecoder("latin1").decode(buf.subarray(0, 2048));
    const mm = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
    if (mm) charset = mm[1].toLowerCase();
  }
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

// Ritorna { finalUrl, status, contentType, text?, truncated, redirects }.
// Il corpo viene letto e decodificato solo per contenuti testuali.
export async function safeFetch(rawUrl, opts = {}) {
  const {
    timeoutMs = 8000,
    maxBytes = 2 * 1024 * 1024,
    maxRedirects = 5,
    allowPrivate = false,
    accept = "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5",
  } = opts;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FetchError("bad_url", "Link non valido.");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const redirects = [];
  try {
    for (let i = 0; ; i++) {
      await assertPublicHost(url, { allowPrivate });
      let res;
      try {
        res = await fetch(url, {
          redirect: "manual",
          signal: ctrl.signal,
          headers: { "user-agent": USER_AGENT, accept, "accept-language": "it-IT,it;q=0.9,en;q=0.6" },
        });
      } catch (e) {
        if (ctrl.signal.aborted) throw new FetchError("timeout", "Il sito non ha risposto in tempo.");
        throw new FetchError("network", `Impossibile raggiungere il sito (${e.cause?.code || e.message}).`);
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        if (i >= maxRedirects) throw new FetchError("redirects", "Troppi reindirizzamenti.");
        await res.body?.cancel().catch(() => {});
        url = new URL(res.headers.get("location"), url);
        redirects.push(url.toString());
        continue;
      }
      const contentType = res.headers.get("content-type") || "";
      const out = { finalUrl: url.toString(), status: res.status, contentType, redirects, truncated: false };
      if (/^(text\/|application\/(xhtml\+xml|json|ld\+json))/i.test(contentType) || !contentType) {
        const { buf, truncated } = await readLimited(res, maxBytes);
        out.text = decode(buf, contentType);
        out.truncated = truncated;
      } else {
        await res.body?.cancel().catch(() => {});
      }
      return out;
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function safeFetchJson(rawUrl, opts = {}) {
  const r = await safeFetch(rawUrl, { ...opts, accept: "application/json" });
  if (r.status !== 200 || !r.text) return null;
  try {
    return JSON.parse(r.text);
  } catch {
    return null;
  }
}
