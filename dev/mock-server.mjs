// Local stand-in for the SlopHunter website, following internal/api-contract.md.
//
//   node dev/mock-server.mjs [--port 8787]
//   npm run dev -- --site http://127.0.0.1:8787   (dev build pointed at it)
//
// Replies whose post ID ends in 7 behave as already confirmed by other hunters.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const HOUR = 3_600_000;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function startMock({ port = 8787, host = "127.0.0.1", username = "hunter" } = {}) {
  const state = freshState(username);
  const log = [];

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const body = await readBody(req);
    if (url.pathname.startsWith("/api/extension/")) {
      log.push({ method: req.method, path: url.pathname, query: url.search, origin: req.headers.origin ?? null, hasCookie: "cookie" in req.headers, auth: req.headers.authorization ?? null, body });
    }
    try {
      route(req, url, body, res);
    } catch (error) {
      send(res, 500, { error: "server", message: error.message });
    }
  });

  function route(req, url, body, res) {
    const { method } = req;
    const path = url.pathname;
    if (path.startsWith("/api/extension/")) {
      if (method === "OPTIONS") return send(res, 204);
      if (state.isDown) return send(res, 503, { error: "unavailable", message: "Try again in a minute" });
      const token = /^Bearer (sh_[A-Za-z0-9_-]+)$/.exec(req.headers.authorization ?? "")?.[1];
      if (!token || !state.tokens.has(token)) return send(res, 401, { error: "unauthorized" });
      if (method === "GET" && path === "/api/extension/me") return send(res, 200, me());
      if (method === "POST" && path === "/api/extension/reports") return report(body, res);
      if (method === "DELETE" && path === "/api/extension/token") {
        state.tokens.delete(token);
        return send(res, 204);
      }
      return send(res, 404, { error: "not_found" });
    }

    if (method === "GET" && path === "/extension/connect") return html(res, connectPage(url.searchParams.get("ext") ?? ""));
    if (method === "GET" && ["/privacy", "/dashboard", "/terms"].includes(path)) return html(res, `<h1>${path.slice(1)}</h1>`);
    if (method === "GET" && path === "/avatar.svg") return svg(res);

    if (method === "POST" && path === "/dev/token") {
      const token = `sh_${randomBytes(32).toString("base64url")}`;
      state.tokens.add(token);
      return send(res, 200, { token });
    }
    if (method === "POST" && path === "/dev/state") {
      const patch = JSON.parse(body || "{}");
      if ("eligible" in patch) state.user.eligible = patch.eligible;
      if ("reason" in patch) state.user.reason = patch.reason;
      if ("remaining" in patch) state.spent = Array.from({ length: 10 - patch.remaining }, (_, i) => Date.now() - HOUR + (i + 1) * (patch.spacingMs ?? 60_000));
      if ("closed" in patch) state.closed = new Set(patch.closed);
      if ("revokeAll" in patch) state.tokens.clear();
      if ("isDown" in patch) state.isDown = patch.isDown;
      if ("week" in patch) state.week = patch.week;
      if ("avatarUrl" in patch) state.user.avatarUrl = patch.avatarUrl;
      if ("username" in patch) state.user.username = patch.username;
      return send(res, 200, { ok: true });
    }
    if (method === "GET" && path === "/dev/log") return send(res, 200, log);
    return send(res, 404, { error: "not_found" });
  }

  function me() {
    const now = Date.now();
    state.spent = state.spent.filter((t) => t + HOUR > now);
    const reports = [...state.reports.values()].sort((a, b) => b.createdAt - a.createdAt);
    const points = reports.reduce((sum, r) => sum + r.points, 0);
    return {
      user: state.user,
      bullets: { remaining: 10 - state.spent.length, max: 10, reloadsAt: state.spent.map((t) => new Date(t + HOUR).toISOString()).sort() },
      week: state.week ?? { points, rank: points ? 12 : null, estimatedEarningsCents: points * 31, confirmedReports: reports.filter((r) => r.status === "confirmed").length, bountyCents: 50_000, endsAt: "2026-11-16T00:00:00.000Z" },
      reports: reports.map(({ postId, status, points }) => ({ postId, status, points })),
    };
  }

  function report(body, res) {
    let input;
    try {
      input = JSON.parse(body);
    } catch {
      return send(res, 400, { error: "invalid_post", message: "Invalid JSON" });
    }
    const keys = Object.keys(input).sort().join(",");
    if (keys !== "authorUsername,postId" || !/^\d{1,20}$/.test(input.postId) || !/^[A-Za-z0-9_]{1,15}$/.test(input.authorUsername)) {
      return send(res, 422, { error: "invalid_post", message: "Invalid post" });
    }
    const existing = state.reports.get(input.postId);
    const view = (r) => ({ postId: r.postId, status: r.status, points: r.points, position: r.position });
    if (existing) return send(res, 200, { report: view(existing), bullets: me().bullets });
    if (!state.user.eligible) return send(res, 403, { error: "not_eligible", reason: state.user.reason ?? "premium", message: "X Premium only" });
    if (input.authorUsername.toLowerCase() === state.user.username.toLowerCase()) return send(res, 422, { error: "own_post", message: "That's your post" });
    if (state.closed.has(input.postId)) return send(res, 422, { error: "closed", message: "Closed" });
    if (me().bullets.remaining < 1) return send(res, 429, { error: "no_bullets", message: "Out of bullets", bullets: me().bullets });

    state.spent.push(Date.now());
    const isConfirmed = input.postId.endsWith("7");
    const created = { postId: input.postId, status: isConfirmed ? "confirmed" : "pending", points: isConfirmed ? 2 : 0, position: isConfirmed ? 4 : 1, createdAt: Date.now() };
    state.reports.set(input.postId, created);
    return send(res, 201, { report: view(created), bullets: me().bullets });
  }

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const { port: actual } = server.address();
      resolve({ url: `http://${host}:${actual}`, port: actual, state, log, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

function freshState(username) {
  return {
    user: { id: "1000", username, name: "Hunter", avatarUrl: null, eligible: true, reason: null },
    tokens: new Set(),
    spent: [],
    reports: new Map(),
    closed: new Set(),
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function send(res, status, json) {
  res.writeHead(status, { ...CORS, ...(json && { "Content-Type": "application/json" }) });
  res.end(json ? JSON.stringify(json) : undefined);
}

function html(res, body) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><title>SlopHunter (mock)</title><body style="font:16px system-ui;background:#f4ecdc;color:#2b1e14;display:grid;place-items:center;min-height:90vh">${body}</body>`);
}

function svg(res) {
  res.writeHead(200, { "Content-Type": "image/svg+xml" });
  res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#b4532a"/><circle cx="24" cy="19" r="9" fill="#f4ecdc"/><rect x="10" y="31" width="28" height="14" rx="7" fill="#f4ecdc"/></svg>');
}

function connectPage(ext) {
  return `
    <div style="display:grid;gap:14px;justify-items:center;text-align:center">
      <strong>@hunter</strong>
      <span style="font-size:13px;opacity:.7">Sends the replies you flag and your X account · <a href="/privacy">Privacy</a></span>
      <button id="connect" style="font:inherit;font-weight:700;padding:10px 18px;border:0;border-radius:10px;background:#b4532a;color:#fbf6ec;cursor:pointer">Connect</button>
      <span id="state" aria-live="polite"></span>
    </div>
    <script>
      const ext = ${JSON.stringify(ext)};
      const state = document.getElementById("state");
      document.getElementById("connect").onclick = async () => {
        const { token } = await (await fetch("/dev/token", { method: "POST" })).json();
        if (!window.chrome?.runtime?.sendMessage) return (state.textContent = "Install the extension");
        chrome.runtime.sendMessage(ext, { type: "slophunter:connect", token }, (res) => {
          if (chrome.runtime.lastError || !res) return (state.textContent = "Install the extension");
          state.textContent = res.ok ? "Connected as @" + res.username : "Try again (" + res.error + ")";
        });
      };
    </script>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const portIndex = process.argv.indexOf("--port");
  const { url } = await startMock({ port: portIndex > 0 ? Number(process.argv[portIndex + 1]) : 8787 });
  console.log(`SlopHunter mock API on ${url}`);
}
