// Opt-in check on real x.com (logged out) with the mock API:
//   LIVE_POST=https://x.com/<handle>/status/<id> npm run test:e2e
// Logged-out X shows a post and its first few replies, enough to check that
// buttons land on real replies and never on the post itself.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { startMock } from "../../dev/mock-server.mjs";
import { buildDev } from "../../scripts/build.mjs";

const POST = process.env.LIVE_POST;
const SHOT = process.env.LIVE_SHOT;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
let mock, context, worker;

before(async () => {
  if (!POST) return;
  mock = await startMock({ port: 0 });
  const dir = mkdtempSync(join(tmpdir(), "slophunter-live-"));
  const ext = join(dir, "ext");
  buildDev(mock.url, ext);
  context = await chromium.launchPersistentContext(join(dir, "profile"), {
    channel: "chromium",
    headless: !process.env.HEADED,
    userAgent: UA,
    viewport: { width: 1280, height: 1600 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const isConnect = (p) => p.url().includes("/extension/connect");
  const connect = context.pages().find(isConnect) ?? (await context.waitForEvent("page", { predicate: isConnect }));
  await connect.click("#connect");
  await connect.getByText("Connected as @hunter").waitFor();
  await connect.close();
});

after(async () => {
  await context?.close();
  await mock?.close();
});

test("real x.com: 💩 on replies, not on the post, and a click sends its ID", { skip: !POST }, async () => {
  const page = await context.newPage();
  await page.goto(POST, { waitUntil: "domcontentloaded" });
  await page.locator("span.slophunter").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);

  const focalId = new URL(POST).pathname.split("/")[3];
  const found = await page.evaluate(() =>
    [...document.querySelectorAll("article")]
      .filter((a) => !a.parentElement.closest("article"))
      .map((a) => ({ href: a.closest("[data-href]")?.dataset.href ?? null, hasButton: Boolean(a.querySelector("span.slophunter")) })),
  );
  console.log(JSON.stringify(found, null, 1));
  assert.ok(found.length >= 2, "expected the post and at least one reply");
  assert.equal(found[0].hasButton, false, "the post itself gets no button");
  assert.ok(found.slice(1).every((p) => p.hasButton), "every reply gets a button");

  const reply = found.find((p) => p.hasButton);
  const [, author, , postId] = reply.href.split("/");
  assert.notEqual(postId, focalId);
  await page.locator(`[data-href="${reply.href}"] span.slophunter`).first().click();
  const call = await waitFor(() => mock.log.find((e) => e.method === "POST"));
  assert.deepEqual(JSON.parse(call.body), { postId, authorUsername: author });
  assert.equal(page.url(), POST, "the click must not open the reply");
  if (SHOT) await page.screenshot({ path: SHOT });
});

async function waitFor(check, timeout = 5000) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 100));
  }
}
