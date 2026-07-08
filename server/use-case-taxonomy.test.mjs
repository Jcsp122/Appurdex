import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAgent } from "../src/lib/agentModel.js";
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
  assert.ok(!coding.includes("legal"));
  assert.ok(general.includes("legal"));
  assert.ok(general.includes("research"));
  assert.equal(useCasesForGroup("all").length, USE_CASE_SLUGS.length);
  assert.throws(() => useCasesForGroup("unknown"), /Invalid use case group/);
});

test("product normalization keeps stored use_cases and defaults missing tags to empty", () => {
  const tagged = normalizeAgent({ id: "tagged-agent", name: "Tagged Agent", category: "CLI-native", ecosystem: "Agents", use_cases: ["development", "testing_qa"] });
  assert.deepEqual(tagged.use_cases, ["development", "testing_qa"]);

  const untagged = normalizeAgent({ id: "unlisted-agent", name: "Unlisted Agent", category: "Cloud agent", ecosystem: "Agents" });
  assert.deepEqual(untagged.use_cases, []);
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