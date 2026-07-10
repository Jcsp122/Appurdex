import crypto from "node:crypto";
import { readDb, writeDb, makeReviewItem } from "./store.mjs";
import { assertValidAgentLifecycleStatus, assertValidAgentType, slugify } from "../src/lib/agentModel.js";
import { assertValidUseCases } from "../src/data/useCaseTaxonomy.js";

function now() {
  return new Date().toISOString();
}

function compactString(value) {
  const text = String(value || "").trim();
  return text || null;
}

function sourceRecords(input) {
  if (Array.isArray(input)) return { source: {}, records: input };
  return {
    source: input?.source || {},
    records: Array.isArray(input?.records) ? input.records : [],
  };
}

function validateLicensedSource(source, records) {
  const missing = [];
  if (!compactString(source.name)) missing.push("source.name");
  if (!compactString(source.licenseName)) missing.push("source.licenseName");
  if (source.resaleAllowed !== true) missing.push("source.resaleAllowed=true");
  if (!records.length) missing.push("records[]");
  if (missing.length) {
    throw new Error(`Licensed source import is missing required fields: ${missing.join(", ")}.`);
  }
}

function sourceLicense(source) {
  return {
    name: compactString(source.name),
    licenseName: compactString(source.licenseName),
    licenseUrl: compactString(source.licenseUrl),
    termsUrl: compactString(source.termsUrl),
    sourceUrl: compactString(source.sourceUrl),
    resaleAllowed: source.resaleAllowed === true,
    attributionRequired: Boolean(source.attributionRequired),
    acquiredAt: compactString(source.acquiredAt),
    notes: compactString(source.notes),
  };
}

function candidateFromRecord(record, source) {
  const name = compactString(record.name || record.productName || record.toolName);
  if (!name) return { error: "Record is missing name." };

  const slug = slugify(record.slug || record.id || name);
  let useCases;
  let agentType;
  let lifecycleStatus;
  try {
    useCases = assertValidUseCases(record.use_cases || record.useCases || []);
    agentType = assertValidAgentType(record.agent_type || record.agentType || "build");
    lifecycleStatus = assertValidAgentLifecycleStatus(record.lifecycle_status || record.lifecycleStatus || "active");
  } catch (error) {
    return { error: error.message };
  }
  const sourceUrl = compactString(record.sourceUrl || record.website || record.url || source.sourceUrl);
  const candidate = {
    id: crypto.randomUUID(),
    slug,
    status: "pending_review",
    name,
    description: compactString(record.description),
    category: compactString(record.category),
    agent_type: agentType,
    lifecycle_status: lifecycleStatus,
    use_cases: useCases,
    ecosystem: compactString(record.ecosystem),
    website: compactString(record.website),
    sourceUrl,
    githubRepo: compactString(record.githubRepo),
    vendorName: compactString(record.vendorName || record.companyName || record.company),
    vendorWebsite: compactString(record.vendorWebsite),
    sourceRecordId: compactString(record.sourceRecordId || record.id),
    sourceName: compactString(source.name),
    importedAt: now(),
    sourceLicense: sourceLicense(source),
    provenance: {
      fieldSource: `Licensed source: ${compactString(source.name)}`,
      resaleAllowed: source.resaleAllowed === true,
      attributionRequired: Boolean(source.attributionRequired),
      licenseNotes: compactString(source.notes) || "Licensed source candidate. Review before publishing verified Appurdex fields.",
    },
  };

  return { candidate };
}

function hasPendingReview(db, candidate) {
  return (db.reviewQueue || []).some((item) => item.status === "pending" && item.type === "tool_added" && (item.agentSlug === candidate.slug || item.metadata?.candidateId === candidate.id));
}

function hasCandidate(db, candidate) {
  return (db.licensedSourceCandidates || []).some((item) => {
    if (item.slug === candidate.slug && item.sourceName === candidate.sourceName) return true;
    return item.sourceRecordId && item.sourceRecordId === candidate.sourceRecordId && item.sourceName === candidate.sourceName;
  });
}

function reviewItemForCandidate(candidate) {
  return makeReviewItem(
    "tool_added",
    candidate.slug,
    `Licensed source candidate: ${candidate.name}`,
    `Candidate from ${candidate.sourceName}; review license, source, and fields before adding a verified Appurdex listing.`,
    candidate.sourceUrl || candidate.sourceLicense.sourceUrl || `appurdex://licensed-source/${candidate.slug}`,
    "pending",
    {
      field: "licensed_source_candidate",
      newValue: candidate.name,
      candidateId: candidate.id,
      candidate,
      sourceLicense: candidate.sourceLicense,
      provenance: candidate.provenance,
      changeType: "tool_added",
    },
  );
}

export async function ingestLicensedSource(input, options = {}) {
  const { source, records } = sourceRecords(input);
  validateLicensedSource(source, records);

  const db = await readDb();
  const existingAgentSlugs = new Set((db.agents || []).map((agent) => agent.slug || slugify(agent.id || agent.name)));
  const candidates = [];
  const skipped = [];
  const errors = [];

  for (const record of records) {
    const result = candidateFromRecord(record, source);
    if (result.error) {
      errors.push({ record, error: result.error });
      continue;
    }
    const candidate = result.candidate;
    if (existingAgentSlugs.has(candidate.slug)) {
      skipped.push({ slug: candidate.slug, reason: "existing_agent" });
      continue;
    }
    if (hasCandidate(db, candidate) || hasPendingReview(db, candidate)) {
      skipped.push({ slug: candidate.slug, reason: "existing_candidate" });
      continue;
    }
    candidates.push(candidate);
  }

  const summary = {
    source: source.name,
    dryRun: options.dryRun !== false,
    checked: records.length,
    candidates: candidates.length,
    skipped,
    errors,
  };

  if (summary.dryRun) return { ...summary, applied: false };

  db.licensedSourceCandidates = [...candidates, ...(db.licensedSourceCandidates || [])];
  db.reviewQueue = [...candidates.map(reviewItemForCandidate), ...(db.reviewQueue || [])];
  await writeDb(db);

  return { ...summary, applied: true };
}
