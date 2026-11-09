// node scripts/build.mjs                  Store package: dist/slophunter-extension-v<version>.zip + SHA256SUMS
// node scripts/build.mjs --dev [--site URL]  Unpacked dev build in dist/dev (fixed dev ID, local site)
//
// The store package is src/ as is: no bundling, no minifying, no generated code.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { writeZip } from "./zip.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");

export function listFiles(dir = SRC) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .filter((name) => !name.split("/").some((part) => part.startsWith(".")))
    .sort();
}

export function readSource() {
  return new Map(listFiles().map((name) => [name, readFileSync(join(SRC, name))]));
}

// Guardrails: the build fails if the package asks for more than it should.
export function checkPackage(files) {
  const manifest = JSON.parse(files.get("manifest.json"));
  const origin = new URL(manifest.homepage_url).origin;
  const problems = [];
  const expect = (isOk, message) => isOk || problems.push(message);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  expect(manifest.manifest_version === 3, "manifest_version must be 3");
  expect(same(manifest.permissions, ["storage"]), 'permissions must be exactly ["storage"]');
  for (const key of ["host_permissions", "optional_permissions", "optional_host_permissions", "web_accessible_resources", "key", "update_url", "content_security_policy"]) {
    expect(!(key in manifest), `manifest must not have "${key}"`);
  }
  expect(origin.startsWith("https://"), "homepage_url must be https");
  expect(manifest.content_scripts?.length === 1 && same(manifest.content_scripts[0].matches, ["https://x.com/*"]), 'the only content script must match "https://x.com/*"');
  expect(same(manifest.externally_connectable?.matches, [`${origin}/*`]), `externally_connectable must be exactly ["${origin}/*"] (homepage_url origin)`);

  const referenced = [manifest.background.service_worker, manifest.action.default_popup, ...manifest.content_scripts.flatMap((s) => [...(s.js ?? []), ...(s.css ?? [])]), ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
  for (const file of referenced) expect(files.has(file), `missing ${file}`);

  for (const [name, data] of files) {
    if (!name.endsWith(".js") && !name.endsWith(".html")) continue;
    const text = data.toString("utf8");
    for (const [pattern, label] of [
      [/\beval\s*\(/, "eval()"],
      [/new\s+Function\s*\(/, "new Function()"],
      [/importScripts\s*\(/, "importScripts()"],
      [/import\s*\(\s*["'`]https?:/, "remote import()"],
      [/<script[^>]+src=["']https?:/i, "remote <script>"],
      [/\bsetTimeout\s*\(\s*["'`]/, "setTimeout(string)"],
    ]) {
      expect(!pattern.test(text), `${name} uses ${label}`);
    }
  }

  if (problems.length) throw new Error(`Package check failed:\n- ${problems.join("\n- ")}`);
  return manifest;
}

export function buildPackage() {
  const files = readSource();
  const manifest = checkPackage(files);
  const zip = writeZip(files);
  const name = `slophunter-extension-v${manifest.version}.zip`;
  const sha256 = createHash("sha256").update(zip).digest("hex");
  return { files, manifest, zip, name, sha256 };
}

export function buildDev(site, out = join(DIST, "dev")) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const name of listFiles()) {
    mkdirSync(dirname(join(out, name)), { recursive: true });
    cpSync(join(SRC, name), join(out, name));
  }
  const manifest = JSON.parse(readFileSync(join(SRC, "manifest.json"), "utf8"));
  const origin = new URL(site).origin;
  manifest.name = "SlopHunter (dev)";
  manifest.homepage_url = origin;
  manifest.externally_connectable = { matches: [`${origin}/*`] };
  manifest.key = readFileSync(join(ROOT, "dev", "dev-key.pub"), "utf8").trim();
  writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { out, id: extensionId(manifest.key) };
}

// Chrome derives an extension's ID from its public key.
export function extensionId(publicKeyBase64) {
  const hash = createHash("sha256").update(Buffer.from(publicKeyBase64, "base64")).digest("hex").slice(0, 32);
  return [...hash].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--dev")) {
    const siteIndex = args.indexOf("--site");
    const site = siteIndex >= 0 ? args[siteIndex + 1] : "http://127.0.0.1:8787";
    const { out, id } = buildDev(site);
    console.log(`Dev build: ${relative(ROOT, out)} (extension ID ${id}, site ${site})`);
  } else {
    const { zip, name, sha256, files } = buildPackage();
    mkdirSync(DIST, { recursive: true });
    writeFileSync(join(DIST, name), zip);
    writeFileSync(join(DIST, "SHA256SUMS"), `${sha256}  ${name}\n`);
    console.log(`${name}  ${files.size} files  ${zip.length} bytes\nsha256 ${sha256}`);
  }
}
