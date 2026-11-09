// Compares a published SlopHunter package with this checkout's src/.
//
//   node scripts/verify.mjs dist/slophunter-extension-v1.0.0.zip   a release zip
//   node scripts/verify.mjs ~/Downloads/slophunter.crx              any .crx
//   node scripts/verify.mjs --store <extension id>                  the Chrome Web Store copy
//
// The Chrome Web Store adds `_metadata/` (its signatures) and may add
// `update_url` and `key` to the manifest; those are ignored. Every other byte
// must match.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readSource } from "./build.mjs";
import { readZip } from "./zip.mjs";

const args = process.argv.slice(2);
if (!args.length) {
  console.error("Usage: node scripts/verify.mjs <file.zip|file.crx> | --store <extension id>");
  process.exit(2);
}

const bytes = args[0] === "--store" ? await download(args[1]) : readFileSync(args[0]);
console.log(`sha256 ${createHash("sha256").update(bytes).digest("hex")}`);

const published = readZip(bytes);
const source = readSource();
const problems = [];

for (const [name, data] of published) {
  if (name.startsWith("_metadata/")) continue;
  const expected = source.get(name);
  if (!expected) problems.push(`extra file: ${name}`);
  else if (name === "manifest.json" ? !sameManifest(data, expected) : !data.equals(expected)) problems.push(`differs: ${name}`);
}
for (const name of source.keys()) if (!published.has(name)) problems.push(`missing file: ${name}`);

if (problems.length) {
  console.error(`✗ Does not match src/:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`✓ ${source.size} files match src/`);

function sameManifest(publishedBytes, sourceBytes) {
  const { update_url, key, ...rest } = JSON.parse(publishedBytes);
  return JSON.stringify(sortKeys(rest)) === JSON.stringify(sortKeys(JSON.parse(sourceBytes)));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  return value;
}

async function download(id) {
  if (!/^[a-p]{32}$/.test(id ?? "")) throw new Error("Expected a 32-letter extension ID");
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=150.0&acceptformat=crx3&x=id%3D${id}%26uc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Chrome Web Store download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
