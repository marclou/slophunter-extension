import "./shared.js";

const { SH } = globalThis;
const { version, homepage_url: homepageUrl } = chrome.runtime.getManifest();
const SITE = new URL(homepageUrl).origin;
const API = `${SITE}/api/extension`;

const AUTO_REFRESH_MS = 60_000;
const POPUP_REFRESH_MS = 10_000;
const TIMEOUT_MS = 10_000;
const TOKEN = /^sh_[A-Za-z0-9_-]{20,200}$/;
const POST_ID = /^\d{1,20}$/;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

const COLORS = { ammo: "#B4532A", empty: "#9E3B32", text: "#FBF6EC" };

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) openConnect();
  paintBadge();
});

chrome.runtime.onStartup.addListener(() => refresh());

// Only the SlopHunter site can reach this listener (manifest `externally_connectable`).
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!sender.url || new URL(sender.url).origin !== SITE) return false;
  const run = fromSite[message?.type];
  if (!run) return false;
  run(message).then(sendResponse, () => sendResponse({ ok: false }));
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const run = fromExtension[message?.type];
  if (!run) return false;
  run(message).then(sendResponse, () => sendResponse({ status: 0, error: "failed" }));
  return true;
});

const fromSite = {
  "slophunter:ping": async () => {
    const { token, me } = await load();
    return { ok: true, version, connected: Boolean(token), username: (token && me?.user?.username) || null };
  },

  "slophunter:connect": async ({ token }) => {
    if (typeof token !== "string" || !TOKEN.test(token)) return { ok: false };
    const res = await call("GET", "/me", token);
    if (res.status !== 200 || !res.data?.user) return { ok: false };
    await chrome.storage.local.set({ token, me: fresh(res.data), checkedAt: Date.now() });
    await paintBadge();
    return { ok: true, username: res.data.user.username };
  },
};

const fromExtension = {
  refresh: ({ popup }) => refresh(popup ? POPUP_REFRESH_MS : AUTO_REFRESH_MS),
  report: ({ postId, authorUsername }) => report(postId, authorUsername),
  connect: async () => {
    await openConnect();
    return { ok: true };
  },
  disconnect: () => disconnect(),
  badge: async () => {
    await paintBadge();
    return { ok: true };
  },
};

let refreshing = null;

async function refresh(maxAge = AUTO_REFRESH_MS) {
  const { token, checkedAt } = await load();
  if (!token) return { connected: false };
  if (checkedAt && Date.now() - checkedAt < maxAge) return { connected: true };

  refreshing ??= (async () => {
    await chrome.storage.local.set({ checkedAt: Date.now() });
    const res = await call("GET", "/me", token);
    if (res.status === 401) await forget();
    else if (res.status === 200 && res.data?.user) await chrome.storage.local.set({ me: fresh(res.data) });
    await paintBadge();
  })().finally(() => {
    refreshing = null;
  });

  await refreshing;
  return { connected: true };
}

async function report(postId, authorUsername) {
  if (!POST_ID.test(postId ?? "") || !HANDLE.test(authorUsername ?? "")) return { status: 422, error: "invalid_post" };

  const { token } = await load();
  if (!token) return { status: 401, error: "unauthorized" };

  const res = await call("POST", "/reports", token, { postId, authorUsername });
  if (res.status === 401) {
    await forget();
    return { status: 401, error: "unauthorized" };
  }

  const { me } = await load();
  if (me && res.data) {
    const reportFor = res.data.report ?? (res.data.error === "closed" ? { postId, status: "invalidated", points: 0 } : null);
    await chrome.storage.local.set({
      me: {
        ...me,
        bullets: res.data.bullets ?? me.bullets,
        reports: reportFor ? [reportFor, ...(me.reports ?? []).filter((r) => r.postId !== postId)] : me.reports,
      },
    });
    await paintBadge();
  }

  return { status: res.status, ...res.data };
}

async function disconnect() {
  const { token } = await load();
  if (token) await call("DELETE", "/token", token);
  await chrome.storage.local.clear();
  await paintBadge();
  return { ok: true };
}

async function forget() {
  await chrome.storage.local.remove(["token", "me", "checkedAt"]);
}

function openConnect() {
  return chrome.tabs.create({ url: `${SITE}/extension/connect?ext=${chrome.runtime.id}` });
}

async function paintBadge() {
  const { token, me } = await load();
  const isHunting = Boolean(token && me?.user?.eligible);
  const { left } = SH.bulletsNow(me?.bullets);
  await chrome.action.setBadgeText({ text: isHunting ? String(left) : "" });
  if (!isHunting) return;
  await chrome.action.setBadgeBackgroundColor({ color: left ? COLORS.ammo : COLORS.empty });
  await chrome.action.setBadgeTextColor({ color: COLORS.text });
}

function load() {
  return chrome.storage.local.get(["token", "me", "checkedAt"]);
}

function fresh(me) {
  return { ...me, fetchedAt: Date.now() };
}

// Bearer token only: `credentials: "omit"` keeps every cookie out of these requests.
async function call(method, path, token, body) {
  try {
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body && { "Content-Type": "application/json" }) },
      body: body && JSON.stringify(body),
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {}
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}
