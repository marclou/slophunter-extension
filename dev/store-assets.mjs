// Chrome Web Store images, from the real extension running on real x.com.
//   STORE_POST=https://x.com/<handle>/status/<id> node dev/store-assets.mjs
// STORE_POST should be a post with replies by its own author: only that
// account's posts end up in the screenshot. POPUP_OUT=<file.png> also saves
// the popup on its own.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildDev } from "../scripts/build.mjs";
import { startMock } from "./mock-server.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "store");
const POST = process.env.STORE_POST ?? "https://x.com/marclou/status/2119757141787787609";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
const font = (file) => `data:font/woff2;base64,${readFileSync(join(ROOT, "src/fonts", file)).toString("base64")}`;
const icon = `data:image/svg+xml;base64,${readFileSync(join(ROOT, "src/mark.svg")).toString("base64")}`;
const author = new URL(POST).pathname.split("/")[1];

mkdirSync(join(OUT, "screenshots"), { recursive: true });
const mock = await startMock({ port: 0, username: "hunter" });
const dir = mkdtempSync(join(tmpdir(), "slophunter-store-"));
buildDev(mock.url, join(dir, "ext"));
const context = await chromium.launchPersistentContext(join(dir, "profile"), {
  channel: "chromium",
  headless: true,
  userAgent: UA,
  deviceScaleFactor: 2,
  viewport: { width: 1280, height: 1400 },
  args: [`--disable-extensions-except=${join(dir, "ext")}`, `--load-extension=${join(dir, "ext")}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
const extensionId = new URL(worker.url()).host;

const isConnect = (p) => p.url().includes("/extension/connect");
const connect = context.pages().find(isConnect) ?? (await context.waitForEvent("page", { predicate: isConnect }));
await connect.click("#connect");
await connect.getByText("Connected as").waitFor();
await connect.close();
await fetch(`${mock.url}/dev/state`, {
  method: "POST",
  body: JSON.stringify({ remaining: 7, spacingMs: 1_020_000, week: { points: 42, rank: 12, estimatedEarningsCents: 1240, confirmedReports: 9, bountyCents: 500_000, endsAt: "2026-11-16T00:00:00.000Z" } }),
});
await worker.evaluate(() => chrome.storage.local.set({ checkedAt: 0 }));

// 1. The 💩 on a real reply, flagged, with the bullets bubble.
const x = await context.newPage();
await x.goto(POST, { waitUntil: "domcontentloaded" });
const reply = x.locator(`[data-href^="/${author}/status/"] span.slophunter`).first();
await reply.waitFor({ timeout: 30_000 });
await x.waitForTimeout(1500);
await reply.scrollIntoViewIfNeeded();
await x.evaluate(() => scrollBy(0, -260));
await x.waitForTimeout(800);
await reply.click();
await x.waitForTimeout(900);
// A second click on a flagged reply only shows the bullets again. A raw
// mouse click, so nothing scrolls (a scroll hides the bubble).
const target = await reply.boundingBox();
await x.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
await x.waitForTimeout(250);
const clip = await x.evaluate((author) => {
  const host = [...document.querySelectorAll("span.slophunter")].find((h) => h.closest(`[data-href^="/${author}/status/"]`));
  const answer = host.closest("[data-href]").getBoundingClientRect();
  const post = document.querySelector("article").getBoundingClientRect();
  const bar = document.querySelector('article [role="group"]').getBoundingClientRect();
  const top = Math.max(Math.min(bar.top, answer.top) - 150, 0);
  return { x: post.left - 16, y: top, width: post.width + 32, height: answer.bottom - top };
}, author);
const replyShot = await x.screenshot({ clip });

// 2. The popup.
const popup = await context.newPage();
await popup.setViewportSize({ width: 300, height: 600 });
await popup.goto(`chrome-extension://${extensionId}/popup.html`);
await popup.waitForTimeout(1400);
const popupHeight = await popup.evaluate(() => document.body.getBoundingClientRect().height);
const popupShot = await popup.screenshot({ clip: { x: 0, y: 0, width: 300, height: Math.ceil(popupHeight) } });
if (process.env.POPUP_OUT) writeFileSync(process.env.POPUP_OUT, popupShot);

// The site's look: near-black, a red lamp overhead, film grain. Space and tone,
// no borders, nothing behind the headline.
const data = (png) => `data:image/png;base64,${png.toString("base64")}`;
const grain = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
const css = `
  @font-face { font-family: Anton; src: url(${font("anton-latin.woff2")}); }
  * { margin: 0; box-sizing: border-box; }
  html { background-color: #0b0b0a; background-image: radial-gradient(70% 45% at 50% -8%, rgb(234 61 36 / .12), transparent 70%), radial-gradient(120% 90% at 50% 120%, rgb(0 0 0 / .6), transparent 60%), ${grain}; }
  body { width: var(--w); height: var(--h); overflow: hidden; display: grid; place-items: center; color: #efeae1; font-family: system-ui, sans-serif; }
  h1 { font: 400 64px/1 Anton, Impact, sans-serif; letter-spacing: .01em; text-align: center; text-transform: uppercase; }
  .shot { box-shadow: 0 30px 70px -20px rgb(0 0 0 / .95); }
  .wordmark { font: 400 var(--size)/0.9 Anton, Impact, sans-serif; letter-spacing: .01em; }
`;
const renderer = await chromium.launch({ channel: "chromium" });
const canvas = await renderer.newContext({ deviceScaleFactor: 1 });
const render = async (name, width, height, body) => {
  const page = await canvas.newPage();
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><style>${css} :root{--w:${width}px;--h:${height}px}</style>${body}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, name) });
  await page.close();
};

await render("screenshots/1-flag.png", 1280, 800, `
  <div style="display:grid;gap:40px;justify-items:center">
    <h1>One click. One bullet.</h1>
    <img class="shot" src="${data(replyShot)}" style="width:860px">
  </div>`);

await render("screenshots/2-popup.png", 1280, 800, `
  <div style="display:grid;gap:44px;justify-items:center">
    <h1>Your bounty, live</h1>
    <img class="shot" src="${data(popupShot)}" style="width:390px">
  </div>`);

// Same file as the extension's 128px icon: the tile at 96px in a transparent 16px margin.
copyFileSync(join(ROOT, "src/icons/128.png"), join(OUT, "icon-128.png"));

await render("promo-440x280.png", 440, 280, `
  <div style="display:grid;gap:20px;justify-items:center">
    <img src="${icon}" width="112" height="112">
    <span class="wordmark" style="--size:50px">SLOPHUNTER</span>
  </div>`);

await render("promo-1400x560.png", 1400, 560, `
  <div style="display:flex;gap:72px;align-items:center">
    <img src="${icon}" width="260" height="260">
    <span class="wordmark" style="--size:172px">SLOPHUNTER</span>
  </div>`);

await renderer.close();
await context.close();
await mock.close();
console.log(`Store images written to ${OUT}`);
