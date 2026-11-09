// End-to-end: the dev build in Chromium, the mock API, and synthetic x.com pages.
// HEADED=1 npm run test:e2e to watch it.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { startMock } from "../../dev/mock-server.mjs";
import { buildDev } from "../../scripts/build.mjs";
import { homePage, replyStatusPage, scrolledStatusPage, statusPage } from "../fixtures/x.mjs";

const SHOTS = process.env.SHOTS_DIR;
let mock, context, worker, extensionId, x;

before(async () => {
  mock = await startMock({ port: 0 });
  const dir = mkdtempSync(join(tmpdir(), "slophunter-e2e-"));
  const ext = join(dir, "ext");
  extensionId = buildDev(mock.url, ext).id;
  context = await chromium.launchPersistentContext(join(dir, "profile"), {
    channel: "chromium",
    headless: !process.env.HEADED,
    viewport: { width: 1000, height: 1000 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  await context.route("https://x.com/**", (route) => {
    const { pathname, search } = new URL(route.request().url());
    const pages = {
      "/alice/status/1000000000000000001": search === "?scrolled" ? scrolledStatusPage : statusPage,
      "/bob/status/1000000000000000002": replyStatusPage,
      "/home": homePage,
    };
    const body = pages[pathname]?.();
    return route.fulfill(body ? { contentType: "text/html", body } : { status: 404, body: "" });
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
});

after(async () => {
  await context?.close();
  await mock?.close();
});

test("install opens the connect page, and one click hands the token over", async () => {
  const isConnect = (p) => p.url().includes("/extension/connect");
  const page = context.pages().find(isConnect) ?? (await context.waitForEvent("page", { predicate: isConnect }));
  await page.waitForLoadState();
  assert.equal(new URL(page.url()).searchParams.get("ext"), extensionId);
  await page.click("#connect");
  await page.getByText("Connected as @hunter").waitFor();
  const { token, me } = await storage();
  assert.match(token, /^sh_/);
  assert.equal(me.user.username, "hunter");
  await page.close();
});

test("a 💩 appears on replies only", async () => {
  x = await context.newPage();
  await x.goto("https://x.com/alice/status/1000000000000000001");
  await x.locator("span.slophunter").first().waitFor();
  await x.waitForTimeout(300);
  assert.deepEqual(await flaggable(x), ["/bob/status/1000000000000000002", "/carol/status/1000000000000000003", "/dave/status/1000000000000000007"]);
});

test("one click flags a reply and sends only its post ID and handle", async () => {
  await host(x, "bob").click();
  const call = await waitFor(() => mock.log.find((e) => e.method === "POST"));
  assert.deepEqual(JSON.parse(call.body), { postId: "1000000000000000002", authorUsername: "bob" });
  assert.match(call.auth, /^Bearer sh_/);
  assert.equal(call.hasCookie, false);
  assert.equal(call.origin, `chrome-extension://${extensionId}`);
  assert.deepEqual(await x.evaluate(() => window.__navigations), [], "the click must not open the post");
  await waitFor(async () => (await states(x)).bob === "Flagged");
  const { me } = await storage();
  assert.equal(me.bullets.remaining, 9);
  if (SHOTS) await x.screenshot({ path: join(SHOTS, "x-flagged.png") });
});

test("flagging an already confirmed reply shows it as confirmed", async () => {
  await host(x, "dave").click();
  await waitFor(async () => (await states(x)).dave === "Confirmed by hunters");
  if (SHOTS) await x.screenshot({ path: join(SHOTS, "x-confirmed.png") });
});

test("flags survive a reload", async () => {
  await x.reload();
  await x.locator("span.slophunter").first().waitFor();
  await waitFor(async () => {
    const s = await states(x);
    return s.bob === "Flagged" && s.dave === "Confirmed by hunters" && s.carol === "Flag as AI slop";
  });
});

test("far down a thread, with the post itself unmounted, every reply keeps its 💩", async () => {
  const page = await context.newPage();
  await page.goto("https://x.com/alice/status/1000000000000000001?scrolled");
  await page.locator("span.slophunter").first().waitFor();
  await page.waitForTimeout(300);
  assert.deepEqual(await flaggable(page), ["/carol/status/1000000000000000003", "/dave/status/1000000000000000007"]);
  await page.close();
});

test("a reply's own page: the reply and its replies, not the post above", async () => {
  const page = await context.newPage();
  await page.goto("https://x.com/bob/status/1000000000000000002");
  await page.locator("span.slophunter").first().waitFor();
  await page.waitForTimeout(300);
  assert.deepEqual(await flaggable(page), ["/bob/status/1000000000000000002", "/ivan/status/1000000000000000005"]);
  await page.close();
});

test("timelines: a 💩 only on posts that reply to someone", async () => {
  const page = await context.newPage();
  await page.goto("https://x.com/home");
  await page.locator("span.slophunter").first().waitFor();
  await page.waitForTimeout(300);
  assert.deepEqual(await flaggable(page), ["/gina/status/2000000000000000002"]);
  await page.close();
});

test("out of bullets: nothing is sent", async () => {
  await fetch(`${mock.url}/dev/state`, { method: "POST", body: JSON.stringify({ remaining: 0 }) });
  await worker.evaluate(() => chrome.storage.local.set({ checkedAt: 0 }));
  const popup = await openPopup();
  await waitFor(async () => (await storage()).me.bullets.remaining === 0);
  await popup.close();
  const posts = mock.log.filter((e) => e.method === "POST").length;
  await host(x, "carol").click();
  await x.waitForTimeout(500);
  assert.equal(mock.log.filter((e) => e.method === "POST").length, posts);
  assert.equal((await states(x)).carol, "Flag as AI slop");
  if (SHOTS) await x.screenshot({ path: join(SHOTS, "x-empty.png") });
  await fetch(`${mock.url}/dev/state`, { method: "POST", body: JSON.stringify({ remaining: 8 }) });
});

test("server errors: the flag is rolled back and the bubble says to try again", async () => {
  await worker.evaluate(() => chrome.storage.local.set({ checkedAt: 0 }));
  const popup = await openPopup();
  await waitFor(async () => (await storage()).me.bullets.remaining === 8);
  await popup.close();
  await fetch(`${mock.url}/dev/state`, { method: "POST", body: JSON.stringify({ isDown: true }) });
  await host(x, "carol").click();
  await waitFor(async () => (await texts(x)).includes("Try again"));
  assert.equal((await states(x)).carol, "Flag as AI slop");
  assert.ok(!(await storage()).me.reports.some((r) => r.postId === "1000000000000000003"));
  await fetch(`${mock.url}/dev/state`, { method: "POST", body: JSON.stringify({ isDown: false }) });
});

test("popup: earnings, points, rank, confirmed, bullets", async () => {
  await worker.evaluate(() => chrome.storage.local.set({ checkedAt: 0 }));
  const popup = await openPopup();
  await waitFor(async () => (await storage()).me.bullets.remaining === 8);
  await popup.waitForTimeout(900);
  assert.equal(await popup.textContent("#handle"), "@hunter");
  assert.equal(await popup.textContent("#earnings"), "$0.62");
  assert.equal(await popup.textContent("#points"), "2");
  assert.equal(await popup.textContent("#rank"), "#12");
  assert.equal(await popup.textContent("#confirmed"), "1");
  assert.equal(await popup.locator(".pip:not(.spent)").count(), 8);
  assert.match(await popup.textContent("#reload"), /^↻ \d+m$/);
  assert.equal(await popup.getAttribute('[data-link="privacy"]', "href"), `${mock.url}/privacy`);
  if (SHOTS) await popup.screenshot({ path: join(SHOTS, "popup.png") });
  await popup.close();
});

test("every API call came from the extension, never from x.com", () => {
  assert.ok(mock.log.length > 0);
  for (const entry of mock.log) {
    if (entry.method === "OPTIONS") continue;
    assert.equal(entry.origin, `chrome-extension://${extensionId}`);
    assert.equal(entry.hasCookie, false);
  }
});

test("disconnect revokes the token and wipes local data", async () => {
  const popup = await openPopup();
  await popup.click("#disconnect");
  await popup.locator("#welcome").waitFor();
  await waitFor(() => mock.log.some((e) => e.method === "DELETE" && e.path === "/api/extension/token"));
  assert.deepEqual(await storage(), {});
  await popup.getByText("Connect X").waitFor();
  await popup.waitForTimeout(700);
  if (SHOTS) await popup.screenshot({ path: join(SHOTS, "popup-welcome.png") });
  await popup.close();
});

function storage() {
  return worker.evaluate(() => chrome.storage.local.get(null));
}

async function openPopup() {
  const page = await context.newPage();
  await page.setViewportSize({ width: 300, height: 420 });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  return page;
}

function host(page, author) {
  return page.locator(`[data-href^="/${author}/status/"] span.slophunter`);
}

function flaggable(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("span.slophunter")].map((h) => h.closest("[data-href]")?.dataset.href ?? h.closest("article").querySelector('a[href*="/status/"]').getAttribute("href")),
  );
}

// Button labels from Chrome's accessibility tree: the closed shadow root hides
// them from page scripts, including X's.
async function states(page) {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  await cdp.detach();
  const labels = new Set(["Flag as AI slop", "Flagged", "Confirmed by hunters", "Flag closed"]);
  const names = nodes.filter((n) => n.role?.value === "button" && labels.has(n.name?.value)).map((n) => n.name.value);
  const authors = await page.evaluate(() => [...document.querySelectorAll("span.slophunter")].map((h) => h.closest("[data-href]").dataset.href.split("/")[1]));
  return Object.fromEntries(authors.map((a, i) => [a, names[i]]));
}

async function texts(page) {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  await cdp.detach();
  return nodes.map((n) => n.name?.value).filter(Boolean);
}

async function waitFor(check, timeout = 5000) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 100));
  }
}
