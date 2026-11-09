import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildPackage, checkPackage, extensionId, readSource } from "../scripts/build.mjs";
import { readZip, writeZip } from "../scripts/zip.mjs";

test("the package is reproducible: same source, same bytes", () => {
  assert.equal(buildPackage().sha256, buildPackage().sha256);
});

test("the package is exactly src/", () => {
  const { zip, files } = buildPackage();
  const unpacked = readZip(zip);
  assert.deepEqual([...unpacked.keys()], [...files.keys()]);
  for (const [name, data] of files) assert.ok(unpacked.get(name).equals(data), name);
});

test("zip order and content don't depend on input order", () => {
  const a = writeZip(new Map([["b.txt", Buffer.from("b")], ["a.txt", Buffer.from("a")]]));
  const b = writeZip(new Map([["a.txt", Buffer.from("a")], ["b.txt", Buffer.from("b")]]));
  assert.ok(a.equals(b));
});

test("permissions stay minimal", () => {
  const manifest = checkPackage(readSource());
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.content_scripts.map((s) => s.matches), [["https://x.com/*"]]);
  assert.deepEqual(manifest.externally_connectable.matches, ["https://slophunter.vercel.app/*"]);
});

test("the guardrails reject a broader package", () => {
  const withManifest = (patch) => {
    const files = readSource();
    files.set("manifest.json", Buffer.from(JSON.stringify({ ...JSON.parse(files.get("manifest.json")), ...patch })));
    return () => checkPackage(files);
  };
  assert.throws(withManifest({ permissions: ["storage", "tabs"] }), /permissions/);
  assert.throws(withManifest({ host_permissions: ["https://x.com/*"] }), /host_permissions/);
  assert.throws(withManifest({ content_scripts: [{ matches: ["<all_urls>"], js: ["content.js"] }] }), /content script/);
  assert.throws(withManifest({ externally_connectable: { matches: ["https://*.vercel.app/*"] } }), /externally_connectable/);
  assert.throws(withManifest({ key: "abc" }), /key/);

  const files = readSource();
  files.set("content.js", Buffer.from("eval('1')"));
  assert.throws(() => checkPackage(files), /eval/);
});

test("only the service worker talks to the network", () => {
  const network = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/;
  for (const file of ["content.js", "popup.js", "shared.js"]) {
    assert.ok(!network.test(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")), `${file} must not use the network`);
  }
});

test("package.json and manifest versions match", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  const manifest = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url)));
  assert.equal(pkg.version, manifest.version);
});

test("the dev key gives the allowlisted dev ID", () => {
  const key = readFileSync(new URL("../dev/dev-key.pub", import.meta.url), "utf8").trim();
  assert.equal(extensionId(key), "kkhehjjmafpclphfoifofbjnmiabmgif");
});
