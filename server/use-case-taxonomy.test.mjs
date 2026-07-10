import assert from "node:assert/strict";
import test from "node:test";
import { assertValidAgentLifecycleStatus, assertValidAgentType, normalizeAgent } from "../src/lib/agentModel.js";
import { trackedTools } from "../src/data/trackedTools.js";
import {
  USE_CASE_SLUGS,
  assertValidUseCases,
  populatedUseCases,
  productsForUseCase,
  useCasesForGroup,
} from "../src/data/useCaseTaxonomy.js";

test("taxonomy validation accepts only the fixed use-case values", () => {
  assert.deepEqual(assertValidUseCases(USE_CASE_SLUGS), USE_CASE_SLUGS);
  assert.throws(() => assertValidUseCases(["development", "made_up_case"]), /Unknown use_cases: made_up_case/);
});

test("taxonomy group filters return the expected subsets", () => {
  const coding = useCasesForGroup("coding_specific").map((item) => item.slug);
  const general = useCasesForGroup("general_purpose").map((item) => item.slug);
  assert.ok(coding.includes("development"));
  assert.ok(coding.includes("mcp_integrations"));
  assert.ok(coding.includes("blockchain_smart_contracts"));
  assert.ok(!coding.includes("legal"));
  assert.ok(general.includes("legal"));
  assert.ok(general.includes("research"));
  assert.ok(general.includes("spreadsheet_data_entry"));
  assert.equal(coding.length, 26);
  assert.equal(general.length, 27);
  assert.equal(USE_CASE_SLUGS.length, 53);
  assert.equal(useCasesForGroup("all").length, USE_CASE_SLUGS.length);
  assert.throws(() => useCasesForGroup("unknown"), /Invalid use case group/);
});

test("product normalization keeps stored use_cases and defaults missing tags to empty", () => {
  const tagged = normalizeAgent({ id: "tagged-agent", name: "Tagged Agent", category: "CLI-native", ecosystem: "Agents", use_cases: ["development", "testing_qa"] });
  assert.deepEqual(tagged.use_cases, ["development", "testing_qa"]);

  const untagged = normalizeAgent({ id: "unlisted-agent", name: "Unlisted Agent", category: "Cloud agent", ecosystem: "Agents" });
  assert.deepEqual(untagged.use_cases, []);
});

test("agent type normalization defaults existing products to build and preserves review agents", () => {
  const existing = normalizeAgent({ id: "existing-agent", name: "Existing Agent", category: "CLI-native", ecosystem: "Agents" });
  const reviewer = normalizeAgent({ id: "review-agent", name: "Review Agent", category: "IDE-attached", ecosystem: "Agents", agent_type: "review" });
  assert.equal(existing.agent_type, "build");
  assert.equal(reviewer.agent_type, "review");
  assert.equal(assertValidAgentType("build"), "build");
  assert.throws(() => assertValidAgentType("assistant"), /Invalid agent_type/);

  const codeRabbit = normalizeAgent(trackedTools.find((tool) => tool.id === "coderabbit"));
  const tabnine = normalizeAgent(trackedTools.find((tool) => tool.id === "tabnine"));
  assert.equal(codeRabbit.agent_type, "review");
  assert.equal(tabnine.agent_type, "build");
});

test("agent lifecycle normalization defaults existing products to active and validates all four stages", () => {
  const existing = normalizeAgent({ id: "existing-agent", name: "Existing Agent", category: "CLI-native", ecosystem: "Agents", status: "deprecated" });
  assert.equal(existing.lifecycle_status, "active");
  assert.equal(assertValidAgentLifecycleStatus("active"), "active");
  assert.equal(assertValidAgentLifecycleStatus("legacy"), "legacy");
  assert.equal(assertValidAgentLifecycleStatus("deprecated"), "deprecated");
  assert.equal(assertValidAgentLifecycleStatus("retired"), "retired");
  assert.throws(() => assertValidAgentLifecycleStatus("scheduled"), /Invalid lifecycle_status/);

  const retired = normalizeAgent({ id: "retired-agent", name: "Retired Agent", category: "Cloud agent", ecosystem: "Agents", lifecycle_status: "retired" });
  assert.equal(retired.lifecycle_status, "retired");
});

test("populated use cases enforce group and minimum product thresholds", () => {
  const products = [
    { use_cases: ["development", "testing_qa"] },
    { use_cases: ["development"] },
    { use_cases: ["development"] },
    { use_cases: ["legal"] },
    { use_cases: ["legal"] },
  ];

  const coding = populatedUseCases(products, "coding_specific", 3);
  assert.deepEqual(coding.map((item) => item.slug), ["development"]);

  const all = populatedUseCases(products, "all", 2).map((item) => item.slug);
  assert.ok(all.includes("development"));
  assert.ok(all.includes("legal"));

  const detail = productsForUseCase(products, "development", "coding_specific", 3);
  assert.equal(detail.useCase.slug, "development");
  assert.equal(detail.products.length, 3);

  const hidden = productsForUseCase(products, "testing_qa", "coding_specific", 3);
  assert.equal(hidden.useCase, null);
  assert.equal(hidden.products.length, 0);
});