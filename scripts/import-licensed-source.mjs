import fs from "node:fs/promises";
import { ingestLicensedSource } from "../server/licensed-source-ingest.mjs";

const args = new Set(process.argv.slice(2));
const inputPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

if (!inputPath) {
  console.error("Usage: node scripts/import-licensed-source.mjs <licensed-source.json> [--apply]");
  process.exit(1);
}

const raw = await fs.readFile(inputPath, "utf8");
const input = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
const result = await ingestLicensedSource(input, { dryRun: !args.has("--apply") });
console.log(JSON.stringify(result, null, 2));
