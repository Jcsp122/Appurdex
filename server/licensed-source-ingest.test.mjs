import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("licensed source ingest creates review candidates without publishing agents", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "appurdex-licensed-"));
  process.env.APPURDEX_CATALOG_DB_PATH = path.join(dir, "appurdex-db.json");
  process.env.APPURDEX_DATA_DIR = dir;

  const { ingestLicensedSource } = await import(`./licensed-source-ingest.mjs?test=${Date.now()}`);
  const input = {
    source: {
      name: "Licensed Vendor Feed",
      licenseName: "Commercial catalog license",
      sourceUrl: "https://provider.example/catalog",
      resaleAllowed: true,
      attributionRequired: true,
      notes: "Internal licensed source for review candidates.",
    },
    records: [
      {
        name: "Example Licensed Agent",
        website: "https://example.com/agent",
        sourceUrl: "https://provider.example/catalog/example-agent",
        category: "Coding agent",
        ecosystem: "Agents",
        use_cases: ["development"],
        sourceRecordId: "licensed-1",
      },
    ],
  };

  const dryRun = await ingestLicensedSource(input, { dryRun: true });
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.candidates, 1);

  const applied = await ingestLicensedSource(input, { dryRun: false });
  assert.equal(applied.applied, true);
  assert.equal(applied.candidates, 1);

  const db = JSON.parse(await fs.readFile(process.env.APPURDEX_CATALOG_DB_PATH, "utf8"));
  assert.equal(db.licensedSourceCandidates.length, 1);
  assert.equal(db.licensedSourceCandidates[0].provenance.resaleAllowed, true);
  assert.equal(db.licensedSourceCandidates[0].status, "pending_review");
  assert.equal(db.licensedSourceCandidates[0].lifecycle_status, "active");
  assert.deepEqual(db.licensedSourceCandidates[0].use_cases, ["development"]);
  assert.equal(db.reviewQueue[0].type, "tool_added");
  assert.equal(db.reviewQueue[0].metadata.sourceLicense.licenseName, "Commercial catalog license");
  assert.equal(db.agents.some((agent) => agent.slug === "example-licensed-agent"), false);
});

test("licensed source ingest rejects invalid use_cases", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "appurdex-licensed-invalid-"));
  process.env.APPURDEX_CATALOG_DB_PATH = path.join(dir, "appurdex-db.json");
  process.env.APPURDEX_DATA_DIR = dir;

  const { ingestLicensedSource } = await import(`./licensed-source-ingest.mjs?test=invalid-${Date.now()}`);
  const result = await ingestLicensedSource({
    source: {
      name: "Licensed Vendor Feed",
      licenseName: "Commercial catalog license",
      sourceUrl: "https://provider.example/catalog",
      resaleAllowed: true,
    },
    records: [{ name: "Invalid Use Case Agent", use_cases: ["not_a_real_case"] }],
  }, { dryRun: true });

  assert.equal(result.candidates, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].error, /Unknown use_cases: not_a_real_case/);
});

test("licensed source ingest rejects invalid lifecycle_status", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "appurdex-licensed-lifecycle-"));
  process.env.APPURDEX_CATALOG_DB_PATH = path.join(dir, "appurdex-db.json");
  process.env.APPURDEX_DATA_DIR = dir;

  const { ingestLicensedSource } = await import(`./licensed-source-ingest.mjs?test=lifecycle-${Date.now()}`);
  const result = await ingestLicensedSource({
    source: {
      name: "Licensed Vendor Feed",
      licenseName: "Commercial catalog license",
      sourceUrl: "https://provider.example/catalog",
      resaleAllowed: true,
    },
    records: [{ name: "Invalid Lifecycle Agent", lifecycle_status: "scheduled" }],
  }, { dryRun: true });

  assert.equal(result.candidates, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].error, /Invalid lifecycle_status/);
});
