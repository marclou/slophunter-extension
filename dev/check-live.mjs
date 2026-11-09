// Checks a browser started with `npm run browser -- --site <site>` against the
// real API, after you've connected the extension there.
//   POST=https://x.com/<handle>/status/<id> [FLAG=1] [SHOTS=dir] node dev/check-live.mjs [--port 9333]
// FLAG=1 really flags the first reply by someone else: it spends a bullet.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const DEV_ID = "kkhehjjmafpclphfoifofbjnmiabmgif";
const portIndex = process.argv.indexOf("--port");
const port = portIndex > 0 ? process.argv[portIndex + 1] : "9333";
const { POST, FLAG, SHOTS } = process.env;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const context = browser.contexts()[0];
const worker = context.serviceWorkers().find((w) => w.url().includes(DEV_ID)) ?? (await context.waitForEvent("serviceworker", { predicate: (w) => w.url().includes(DEV_ID) }));
const step = (label, value = "") => console.log(`✓ ${label}${value && `: ${value}`}`);

const site = await worker.evaluate(() => chrome.runtime.getManifest().homepage_url);
const { token, me } = await worker.evaluate(() => chrome.storage.local.get(["token", "me"]));
assert.ok(token, "Not connected: open the connect page and click Connect first");
step("connected", `@${me.user.username} on ${site}`);

// The real /me, through the extension's own code path, then its shape.
await worker.evaluate(() => chrome.storage.local.set({ checkedAt: 0 }));
const popup = await context.newPage();
await popup.goto(`chrome-extension://${DEV_ID}/popup.html`);
await popup.waitForTimeout(2500);
const fresh = (await worker.evaluate(() => chrome.storage.local.get("me"))).me;
for (const key of ["id", "username", "avatarUrl", "eligible"]) assert.ok(key in fresh.user, `user.${key}`);
for (const key of ["remaining", "max", "reloadsAt"]) assert.ok(key in fresh.bullets, `bullets.${key}`);
for (const key of ["points", "rank", "estimatedEarningsCents", "confirmedReports"]) assert.ok(key in fresh.week, `week.${key}`);
assert.ok(Array.isArray(fresh.reports), "reports");
step("/me matches the contract", `${fresh.bullets.remaining}/${fresh.bullets.max} bullets, ${fresh.week.points} pts, ${fresh.reports.length} recent flags, eligible ${fresh.user.eligible}`);
step("popup", (await popup.textContent("#hunter")).replace(/\s+/g, " ").trim());
if (SHOTS) await popup.screenshot({ path: join(SHOTS, "live-popup.png") });
await popup.close();

if (POST) {
  const x = await context.newPage();
  await x.goto(POST, { waitUntil: "domcontentloaded" });
  await x.locator("span.slophunter").first().waitFor({ timeout: 30_000 });
  await x.waitForTimeout(2000);
  const focalId = new URL(POST).pathname.split("/")[3];
  const posts = await x.evaluate(() =>
    [...document.querySelectorAll("article")]
      .filter((a) => !a.parentElement.closest("article"))
      .map((a) => ({ href: a.closest("[data-href]")?.dataset.href ?? a.querySelector('a[href*="/status/"]')?.getAttribute("href"), hasButton: Boolean(a.querySelector("span.slophunter")) })),
  );
  const focal = posts.find((p) => p.href?.split("/")[3] === focalId);
  assert.ok(!focal?.hasButton, "the post itself must not get a 💩");
  const withButton = posts.filter((p) => p.hasButton);
  step("x.com", `${posts.length} posts on screen, 💩 on ${withButton.length} replies, none on the post`);

  if (FLAG) {
    const target = withButton.find((p) => p.href.split("/")[1].toLowerCase() !== fresh.user.username.toLowerCase());
    assert.ok(target, "no reply by someone else on screen");
    const before = fresh.bullets.remaining;
    await x.locator(`[data-href="${target.href}"] span.slophunter`).first().click();
    const postId = target.href.split("/")[3];
    let after;
    for (let i = 0; i < 50 && !after?.reports?.some((r) => r.postId === postId); i++) {
      await x.waitForTimeout(200);
      after = (await worker.evaluate(() => chrome.storage.local.get("me"))).me;
    }
    const report = after.reports.find((r) => r.postId === postId);
    assert.ok(report, "the API didn't record the flag");
    step("flagged", `${target.href} → ${report.status}, bullets ${before} → ${after.bullets.remaining}`);
    assert.equal(x.url(), POST, "the click must not open the reply");
    if (SHOTS) await x.screenshot({ path: join(SHOTS, "live-x-flagged.png") });
  }
  await x.close();
}

await browser.close();
