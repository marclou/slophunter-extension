// Opens Chromium with a dev build of the extension, for trying it by hand.
//   node dev/browser.mjs [--site URL] [--profile DIR] [--port 9333]
// Branded Chrome ignores --load-extension, so this uses Playwright's Chromium.
// The profile persists, so you sign in to X once.
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { buildDev } from "../scripts/build.mjs";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
};
const site = arg("site", "http://127.0.0.1:8787");
const profile = arg("profile", join(tmpdir(), "slophunter-dev-profile"));
const port = arg("port", "9333");
const ext = join(tmpdir(), "slophunter-dev-extension");

const { id } = buildDev(site, ext);
const browser = spawn(chromium.executablePath(), [
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  `--disable-extensions-except=${ext}`,
  `--load-extension=${ext}`,
  "--no-first-run",
  "--no-default-browser-check",
  "https://x.com",
], { stdio: "ignore", detached: true });
browser.unref();
console.log(`Chromium with SlopHunter (dev, ${id}) for ${site}\nprofile ${profile}\nDevTools http://127.0.0.1:${port}`);
