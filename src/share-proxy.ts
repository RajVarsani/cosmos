// One public origin for a shared instance: `/` is the FE, /__cosmos/<port>/... any browser-facing port of the instance.
// Responses get the instance's localhost URLs (vite inlines VITE_* into every module) rewritten to that origin,
// so the running containers never change. Runs detached, one per share: bun src/share-proxy.ts <config.json>
// The same process serves the preview build at `/`, supervises the zrok child and writes <name>.status.json.
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { existsSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync, type Stats } from "fs";
import { dirname, extname, join, posix, sep } from "path";
import type { ServerWebSocket } from "bun";
import { currentRelease, previousReleases, startPreview, type Preview } from "./share-preview";
import { reapOrphan, superviseZrok, type Zrok } from "./share-zrok";

export type ProxyConfig = {
  name: string;
  port: number;
  fePort: number;
  // every port the share may reach under /__cosmos/<port>
  allowed: number[];
  auth: { user: string; password: string } | null;
  secret: string;
  block: { port: number; prefixes: string[] }[];
  notice: { html: string } | null;
  preview: { fe: string; container: string; srcDir: string; ignore: string[]; dir: string; needMiB: number } | null;
  zrok: { argv: string[] } | null;
  statusFile: string;
};

export type ShareStatus = {
  pid: number;
  at: string;
  zrok: {
    state: "starting" | "live" | "restarting" | "limited" | "failed" | "off";
    pid: number | null;
    cmd: string | null;
    url: string | null;
    restarts: number;
    lastError: string | null;
    since: string;
    nextRetryAt: string | null;
  } | null;
  preview: {
    state: "idle" | "building" | "ready" | "failed" | "waiting-memory";
    builds: number;
    lastMs: number | null;
    builtAt: string | null;
    lastError: string | null;
    pending: boolean;
  } | null;
};

export const PREFIX = "/__cosmos/";
export const COOKIE = "cosmos_share";
export const HEALTH = "/__cosmos/health";
export const NOTICE_COOKIE = "cosmos_notice";
export const NOTICE_CONTINUE = "/__cosmos/notice/continue";

const LOCAL_URL = /\b(https?|wss?):\/\/(?:localhost|127\.0\.0\.1|[a-z0-9-]+\.localhost):(\d{2,5})(?!\d)/g;
// exact media types only (parsed, before `;`); everything else, vnd.* included, passes through byte-identical
const REWRITE = new Set(["text/html", "text/css", "text/javascript", "application/javascript", "application/json", "application/manifest+json", "image/svg+xml", "text/plain", "application/xml", "text/xml"]);
const UTF8 = new Set(["utf-8", "utf8", "us-ascii", "ascii"]);
const DROP_UP = ["x-forwarded-for", "x-forwarded-host", "x-forwarded-port", "x-forwarded-proto", "x-real-ip", "forwarded", "x-proxy", "x-amzn-trace-id", "zrok-auth-provider", "zrok-auth-user", "connection", "keep-alive", "upgrade", "te", "trailer", "transfer-encoding", "proxy-authorization"];
const DROP_DOWN = ["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"];

type Pub = { secure: boolean; host: string };

// the declared charset must be utf-8 (or absent) for a body to be rewritten
export function rewritable(contentType: string): boolean {
  const [type, ...params] = contentType.split(";");
  if (!REWRITE.has(type.trim().toLowerCase())) return false;
  const cs = params.map((p) => p.trim().match(/^charset\s*=\s*"?([^";\s]+)"?$/i)?.[1]).find(Boolean);
  return !cs || UTF8.has(cs.toLowerCase());
}

export function rewriteText(text: string, pub: Pub, c: Pick<ProxyConfig, "fePort" | "allowed">): string {
  return text.replace(LOCAL_URL, (m, scheme: string, port: string) => {
    const p = Number(port);
    const ws = scheme.toLowerCase().startsWith("ws");
    const s = ws ? (pub.secure ? "wss" : "ws") : pub.secure ? "https" : "http";
    if (p === c.fePort) return `${s}://${pub.host}`;
    return c.allowed.includes(p) ? `${s}://${pub.host}${PREFIX}${p}` : m;
  });
}

// /__cosmos/<port>/rest -> that port and /rest; anything else goes to the FE as is
export function route(path: string, c: Pick<ProxyConfig, "fePort" | "allowed">): { port: number; path: string } | null {
  if (!path.startsWith(PREFIX)) return { port: c.fePort, path };
  const m = path.slice(PREFIX.length).match(/^(\d{2,5})(\/.*)?$/);
  if (!m || !c.allowed.includes(Number(m[1]))) return null;
  return { port: Number(m[1]), path: m[2] ?? "/" };
}

export const cookieValue = (c: Pick<ProxyConfig, "secret" | "auth">) => createHmac("sha256", c.secret).update(c.auth?.password ?? "").digest("hex");

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const cookies = (h: string | null) => (h ?? "").split(/;\s*/).filter(Boolean);

// ok when no auth, a valid cookie, or our own Basic credentials (then the cookie is set, so the app's Bearer calls pass)
export function authorize(req: Request, c: ProxyConfig): { ok: boolean; basic: boolean } {
  if (!c.auth) return { ok: true, basic: false };
  const want = cookieValue(c);
  if (cookies(req.headers.get("cookie")).some((k) => k.startsWith(`${COOKIE}=`) && same(k.slice(COOKIE.length + 1), want))) return { ok: true, basic: isOurBasic(req, c) };
  return isOurBasic(req, c) ? { ok: true, basic: true } : { ok: false, basic: false };
}

function isOurBasic(req: Request, c: ProxyConfig): boolean {
  const a = req.headers.get("authorization");
  if (!c.auth || !a?.toLowerCase().startsWith("basic ")) return false;
  const raw = Buffer.from(a.slice(6).trim(), "base64").toString();
  const i = raw.indexOf(":");
  return i > 0 && same(raw.slice(0, i), c.auth.user) && same(raw.slice(i + 1), c.auth.password);
}

const pubOf = (req: Request): Pub => {
  const host = req.headers.get("host") ?? "localhost";
  return { host, secure: (req.headers.get("x-forwarded-proto") ?? "").toLowerCase() === "https" };
};

// The upstream sees what a local browser on the instance's FE would send: localhost Host, the FE's Origin, no proxy headers.
function upstreamHeaders(req: Request, c: ProxyConfig, port: number, basic: boolean): Headers {
  const h = new Headers(req.headers);
  for (const k of DROP_UP) h.delete(k);
  h.set("host", `localhost:${port}`);
  h.set("accept-encoding", "identity");
  const local = `http://localhost:${c.fePort}`;
  const pub = pubOf(req);
  const pubOrigin = `${pub.secure ? "https" : "http"}://${pub.host}`;
  if (h.has("origin")) h.set("origin", local);
  const ref = h.get("referer");
  if (ref?.startsWith(pubOrigin)) h.set("referer", local + ref.slice(pubOrigin.length));
  if (basic) h.delete("authorization");
  const rest = cookies(h.get("cookie")).filter((k) => !k.startsWith(`${COOKIE}=`) && !k.startsWith(`${NOTICE_COOKIE}=`));
  if (rest.length) h.set("cookie", rest.join("; "));
  else h.delete("cookie");
  return h;
}

function downstreamHeaders(res: Response, pub: Pub, c: ProxyConfig, setCookie: boolean): Headers {
  const h = new Headers();
  res.headers.forEach((v, k) => {
    if (DROP_DOWN.includes(k) || k === "set-cookie") return;
    h.append(k, k === "location" ? rewriteText(v, pub, c) : v);
  });
  // a cookie scoped to localhost or the backend's domain would never come back through the share
  for (const sc of res.headers.getSetCookie()) h.append("set-cookie", sc.replace(/;\s*domain=[^;]*/i, ""));
  if (setCookie) h.append("set-cookie", authCookie(c, pub));
  return h;
}

const authCookie = (c: ProxyConfig, pub: Pub) => `${COOKIE}=${cookieValue(c)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${pub.secure ? "; Secure" : ""}`;

// Path as an upstream might read it: decoded until stable (null past the cap), `;` params dropped, `\\` and `//` folded, dot segments resolved, lowercased.
export function normalizePath(pathname: string): string | null {
  let p = pathname;
  for (let k = 0; ; k++) {
    let d: string;
    try {
      d = decodeURIComponent(p);
    } catch {
      return null;
    }
    if (d === p) break;
    if (k === 8) return null;
    p = d;
  }
  return posix.normalize(p.replace(/\\/g, "/").replace(/;[^/]*/g, "")).toLowerCase();
}

// /__cosmos/<port><prefix> for a configured prefix, matched on normalizePath
export function blocked(pathname: string, c: Pick<ProxyConfig, "block">): boolean | null {
  if (!c.block?.length) return false;
  const p = normalizePath(pathname);
  if (p === null) return null;
  const m = p.match(/^\/__cosmos\/(\d{2,5})(.*)$/i);
  if (!m) return false;
  const port = Number(m[1]);
  const rest = m[2];
  return c.block.some((b) => b.port === port && b.prefixes.some((x) => {
    const pre = x.toLowerCase().replace(/\/+$/, "");
    if (!rest.startsWith(pre)) return false;
    const after = rest.slice(pre.length);
    return after === "" || after.startsWith("/") || after.startsWith("?");
  }));
}

const etagOf = (b: Uint8Array) => `"${createHash("sha1").update(b).digest("hex")}"`;

export function etagMatches(req: Request, etag: string): boolean {
  const h = req.headers.get("if-none-match");
  if (!h) return false;
  return h.split(",").map((t) => t.trim().replace(/^W\//, "")).some((t) => t === etag || t === "*");
}

const wantsGzip = (req: Request) => /\bgzip\b/i.test(req.headers.get("accept-encoding") ?? "");
const GZIP_MIN = 1024;

const addVary = (h: Headers) => {
  const v = h.get("vary");
  if (!v) h.set("vary", "Accept-Encoding");
  else if (!/accept-encoding|\*/i.test(v)) h.set("vary", `${v}, Accept-Encoding`);
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".map": "application/json; charset=utf-8", ".svg": "image/svg+xml; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".wasm": "application/wasm",
};
const COMPRESS_BINARY = new Set([".wasm", ".ttf", ".ico"]);
const HASHED = /^\/assets\/(?:.*\/)?[^/]*-[A-Za-z0-9_-]{8,}\.[^/]+$/;

type Entry = { key: string; file: string; body: Uint8Array<ArrayBuffer>; gz: Uint8Array<ArrayBuffer> | null; etag: string; type: string; size: number };

// rewritten (+gzipped) static bodies, keyed by realpath+mtime+size+public origin; evicts least recently used past the cap
export class StaticCache {
  private map = new Map<string, Entry>();
  private bytes = 0;
  constructor(private cap = 200 * 1024 * 1024) {}
  get(key: string): Entry | undefined {
    const e = this.map.get(key);
    if (e) {
      this.map.delete(key);
      this.map.set(key, e);
    }
    return e;
  }
  set(e: Entry) {
    this.drop((x) => x.key === e.key);
    if (e.size > this.cap) return;
    this.map.set(e.key, e);
    this.bytes += e.size;
    for (const [k, x] of this.map) {
      if (this.bytes <= this.cap) break;
      this.map.delete(k);
      this.bytes -= x.size;
    }
  }
  drop(pred: (e: Entry) => boolean) {
    for (const [k, x] of this.map) if (pred(x)) {
      this.map.delete(k);
      this.bytes -= x.size;
    }
  }
}

function loadEntry(file: string, st: { mtimeMs: number; size: number }, pub: Pub, c: ProxyConfig, cache: StaticCache): Entry {
  const key = `${file}\0${st.mtimeMs}\0${st.size}\0${pub.secure ? "s" : ""}${pub.host}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ext = extname(file).toLowerCase();
  const type = TYPES[ext] ?? "application/octet-stream";
  let body: Uint8Array<ArrayBuffer> = new Uint8Array(readFileSync(file));
  let text = false;
  if (rewritable(type)) {
    try {
      body = new TextEncoder().encode(rewriteText(new TextDecoder("utf-8", { fatal: true }).decode(body), pub, c));
      text = true;
    } catch {}
  }
  const gz = (text || COMPRESS_BINARY.has(ext)) && body.byteLength > GZIP_MIN ? Bun.gzipSync(body) : null;
  const e: Entry = { key, file, body, gz, etag: etagOf(body), type, size: body.byteLength + (gz?.byteLength ?? 0) };
  cache.set(e);
  return e;
}

const within = (root: string, p: string) => p === root || p.startsWith(root + sep);

function findFile(root: string, rel: string): { file: string; st: Stats } | null {
  const full = join(root, rel);
  if (!within(root, full)) return null;
  try {
    const real = realpathSync(full);
    const st = statSync(real);
    return st.isFile() && within(root, real) ? { file: real, st } : null;
  } catch {
    return null;
  }
}

const BUILDING = (state: string, err: string | null) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="5"><title>cosmos share</title>
<body style="font:15px/1.5 system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#0b0d12;color:#d7dbe4">
<div style="max-width:42rem;padding:16px"><p>The preview build is running; this page refreshes itself.</p><p style="opacity:.7">state: ${escapeHtml(state)}</p>${err ? `<pre style="white-space:pre-wrap;opacity:.7">${escapeHtml(err)}</pre>` : ""}</div></body>`;

function serveStatic(req: Request, u: URL, pub: Pub, c: ProxyConfig, preview: Preview | null, cache: StaticCache, setCookie: boolean): Response {
  const p = c.preview!;
  const cur = currentRelease(p);
  if (!cur) {
    const s = preview?.status();
    const h = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "5" };
    return new Response(BUILDING(s?.state ?? "idle", s?.state === "failed" ? s.lastError : null), { status: 503, headers: h });
  }
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  let rel: string;
  try {
    rel = posix.normalize(decodeURIComponent(u.pathname));
  } catch {
    return new Response("bad path", { status: 400 });
  }
  let hit = rel.endsWith("/") ? null : findFile(cur, rel);
  if (!hit && rel.startsWith("/assets/")) {
    for (const prev of previousReleases(p, cur)) if ((hit = findFile(prev, rel))) break;
  }
  if (!hit) {
    const nav = (req.headers.get("accept") ?? "").includes("text/html");
    if (extname(rel) && !nav) return new Response("not found", { status: 404, headers: { "cache-control": "no-cache" } });
    hit = findFile(cur, "index.html");
    if (!hit) return new Response("not found", { status: 404 });
  }
  const e = loadEntry(hit.file, hit.st, pub, c, cache);
  const h = new Headers({ "content-type": e.type, etag: e.etag, "cache-control": HASHED.test(rel) && hit.file !== join(cur, "index.html") ? "public, max-age=31536000, immutable" : "no-cache" });
  if (setCookie) h.append("set-cookie", authCookie(c, pub));
  if (e.gz) addVary(h);
  if (etagMatches(req, e.etag)) return new Response(null, { status: 304, headers: h });
  let body = e.body;
  if (e.gz && wantsGzip(req)) {
    h.set("content-encoding", "gzip");
    body = e.gz;
  }
  h.set("content-length", String(body.byteLength));
  return new Response(req.method === "HEAD" ? null : body, { status: 200, headers: h });
}

const noticeSeen = (req: Request) => cookies(req.headers.get("cookie")).includes(`${NOTICE_COOKIE}=1`);

const DENIED = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>cosmos share</title>
<body style="font:15px/1.5 system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#0b0d12;color:#d7dbe4">
<p>This cosmos share needs its password. Reload and sign in with the user and password from <code>cosmos share</code>.</p></body>`;

type WsData = { target: string; headers: Record<string, string>; protocols: string[]; up?: WebSocket; queue: (string | Buffer)[] };

const frame = (m: string | Buffer) => (typeof m === "string" ? m : new Uint8Array(m));

const closeCode = (code: number) => (code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000);

export function startProxy(c: ProxyConfig, preview: () => Preview | null = () => null, cache = new StaticCache()) {
  return Bun.serve<WsData>({
    hostname: "127.0.0.1",
    port: c.port,
    idleTimeout: 255,
    maxRequestBodySize: 512 * 1024 * 1024,
    async fetch(req, server) {
      const u = new URL(req.url);
      if (u.pathname === HEALTH) return Response.json({ ok: true });
      const auth = authorize(req, c);
      if (!auth.ok) {
        return new Response(DENIED, { status: 401, headers: { "www-authenticate": `Basic realm="cosmos ${c.name}", charset="UTF-8"`, "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      }
      const pub = pubOf(req);
      if (u.pathname === NOTICE_CONTINUE) {
        const h = new Headers({ location: "/", "cache-control": "no-store" });
        h.append("set-cookie", `${NOTICE_COOKIE}=1; Path=/; Max-Age=86400; SameSite=Lax${pub.secure ? "; Secure" : ""}`);
        if (auth.basic) h.append("set-cookie", authCookie(c, pub));
        return new Response(null, { status: 302, headers: h });
      }
      if (c.notice && req.method === "GET" && !u.pathname.startsWith(PREFIX) && (req.headers.get("accept") ?? "").includes("text/html") && !noticeSeen(req)) {
        const h = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        if (auth.basic) h.append("set-cookie", authCookie(c, pub));
        return new Response(c.notice.html, { status: 200, headers: h });
      }
      const b = blocked(u.pathname, c);
      if (b === null) return new Response("bad path", { status: 400 });
      if (b) return new Response(`blocked on cosmos shares; cosmos share ${c.name} --expose-admin opens it\n`, { status: 403, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
      const r = route(u.pathname, c);
      if (!r) return new Response("not a port of this instance", { status: 404 });
      const isWs = req.headers.get("upgrade")?.toLowerCase() === "websocket";
      if (c.preview && r.port === c.fePort && !u.pathname.startsWith(PREFIX)) {
        if (isWs) return new Response("no dev server behind a preview share", { status: 404 });
        return serveStatic(req, u, pub, c, preview(), cache, auth.basic);
      }
      const headers = upstreamHeaders(req, c, r.port, auth.basic);

      if (isWs) {
        const protocols = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        const fwd: Record<string, string> = {};
        for (const k of ["origin", "cookie", "authorization", "user-agent"]) {
          const v = headers.get(k);
          if (v) fwd[k] = v;
        }
        const data: WsData = { target: `ws://127.0.0.1:${r.port}${r.path}${u.search}`, headers: fwd, protocols, queue: [] };
        const ok = server.upgrade(req, { data, headers: protocols[0] ? { "sec-websocket-protocol": protocols[0] } : undefined });
        return ok ? undefined : new Response("websocket upgrade failed", { status: 400 });
      }

      let res: Response;
      try {
        res = await fetch(`http://127.0.0.1:${r.port}${r.path}${u.search}`, {
          method: req.method,
          headers,
          body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
          redirect: "manual",
        } as RequestInit);
      } catch (e) {
        return new Response(`upstream :${r.port} unreachable: ${(e as Error).message}`, { status: 502 });
      }
      const out = downstreamHeaders(res, pub, c, auth.basic);
      const type = res.headers.get("content-type") ?? "";
      if (req.method !== "HEAD" && rewritable(type) && res.status !== 204 && res.status !== 304) {
        const buf = await res.arrayBuffer();
        let text: string | null = null;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
        } catch {}
        if (text !== null) {
          const body = new TextEncoder().encode(rewriteText(text, pub, c));
          const etag = etagOf(body);
          out.set("etag", etag);
          if (res.status === 200 && etagMatches(req, etag)) return new Response(null, { status: 304, headers: out });
          if (body.byteLength > GZIP_MIN) {
            addVary(out);
            if (wantsGzip(req)) {
              out.set("content-encoding", "gzip");
              return new Response(Bun.gzipSync(body), { status: res.status, statusText: res.statusText, headers: out });
            }
          }
          return new Response(body, { status: res.status, statusText: res.statusText, headers: out });
        }
        return new Response(buf, { status: res.status, statusText: res.statusText, headers: out });
      }
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
    },
    websocket: {
      open(ws: ServerWebSocket<WsData>) {
        const d = ws.data;
        const up = new WebSocket(d.target, { headers: d.headers, protocols: d.protocols } as any);
        up.binaryType = "arraybuffer";
        d.up = up;
        up.onopen = () => {
          for (const m of d.queue) up.send(frame(m));
          d.queue = [];
        };
        up.onmessage = (e) => ws.send(typeof e.data === "string" ? e.data : new Uint8Array(e.data as ArrayBuffer));
        up.onclose = (e) => ws.close(closeCode(e.code), e.reason);
        up.onerror = () => ws.close(1011, "upstream error");
      },
      message(ws: ServerWebSocket<WsData>, m) {
        const up = ws.data.up;
        if (up?.readyState === WebSocket.OPEN) up.send(frame(m));
        else ws.data.queue.push(m);
      },
      close(ws: ServerWebSocket<WsData>, code, reason) {
        const up = ws.data.up;
        if (up && up.readyState <= WebSocket.OPEN) up.close(closeCode(code), reason);
      },
    },
  });
}

function writeStatus(file: string, s: ShareStatus) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, file);
}

function readStatus(file: string): ShareStatus | null {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const file = Bun.argv[2];
  if (!file) throw new Error("usage: bun share-proxy.ts <config.json>");
  const c: ProxyConfig = JSON.parse(readFileSync(file, "utf8"));
  const sharesDir = dirname(c.statusFile);
  const prev = readStatus(c.statusFile);
  let zrok: Zrok | null = null;
  let preview: Preview | null = null;
  const status = () => writeStatus(c.statusFile, { pid: process.pid, at: new Date().toISOString(), zrok: zrok?.status() ?? null, preview: preview?.status() ?? null });
  const cache = new StaticCache();
  const server = startProxy(c, () => preview, cache);
  console.error(`[cosmos share] ${c.name} proxy on 127.0.0.1:${c.port} -> fe :${c.fePort}${c.preview ? " (preview build)" : ""}, ports ${c.allowed.join(" ")}${c.zrok ? ", zrok supervised" : ""}`);
  status();
  if (c.preview) {
    preview = startPreview(c.preview, join(sharesDir, `${c.name}.preview.log`), status, (dirs) => cache.drop((e) => dirs.some((d) => within(d, e.file))));
  }
  if (c.zrok) {
    await reapOrphan(prev?.zrok);
    zrok = superviseZrok(c.zrok.argv, join(sharesDir, `${c.name}.zrok.log`), status);
  }
  status();
  const tick = setInterval(status, 10_000);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(tick);
    await Promise.all([zrok?.stop(), preview?.stop()]);
    status();
    server.stop(true);
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
