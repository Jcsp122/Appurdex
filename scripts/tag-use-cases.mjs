import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trackedTools } from "../src/data/trackedTools.js";
import { USE_CASE_SLUGS, normalizeUseCases, unknownUseCases } from "../src/data/useCaseTaxonomy.js";
import { productUseCaseTags as existingProductUseCaseTags } from "../src/data/useCaseProductTags.js";
import { slugify } from "../src/lib/agentModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const tagPath = path.join(rootDir, "src", "data", "useCaseProductTags.js");
const reportPath = path.join(rootDir, "docs", "use-case-tagging-report.json");

const rules = [
  ["development", /\b(autonomous coding agent|software engineering agent|writes? code|edits? code|generat(?:e|es|ing) code|implement(?:s|ing)? (?:features?|issues?|tasks?|code)|builds? (?:apps?|software)|ships? code|coding assistant|code generation)\b/i],
  ["code_review", /\b(code review|pull request review|review pull requests?|diff review|review agent|merge gate|static analysis)\b/i],
  ["debugging", /\b(debug|debugging|bug fix|fix bugs?|diagnos(?:e|is|ing)|runtime failure|error analysis)\b/i],
  ["refactoring", /\b(refactor|refactoring|code cleanup|modernize code|maintainability)\b/i],
  ["testing_qa", /\b(test generation|generate tests?|testing|quality assurance|qa automation|verification|test cases?|end-to-end tests?|unit tests?)\b/i],
  ["devops_infra", /\b(devops|deployment|deploy code|ci\/cd|infrastructure as code|kubernetes|terraform|cloud operations?|release automation)\b/i],
  ["documentation", /\b(documentation|technical docs?|readme|api reference|code documentation|docstrings?)\b/i],
  ["migration", /\b(migration|migrate|framework upgrade|dependency upgrade|porting|modernize codebase|convert codebase)\b/i],
  ["onboarding", /\b(onboarding|learn (?:the )?codebase|understand (?:the )?codebase|codebase exploration|codebase context)\b/i],
  ["agent_infrastructure", /\b(agent sdk|agents sdk|agent framework|agent runtime|agent platform|agent orchestrat|multi-agent orchestrat|agent memory|agent harness)\b/i],
  ["mcp_integrations", /\b(mcp server|mcp client|mcp integration|model context protocol)\b/i],
  ["scientific_computing_research", /\b(scientific computing|computational research|simulation|bioinformatics|cheminformatics|research software|jupyter)\b/i],
  ["fintech_development", /\b(fintech|trading system|payment integration|banking software|financial application|quantitative finance)\b/i],
  ["game_development", /\b(game development|game engine|unity|unreal engine|godot|gameplay|gamedev)\b/i],
  ["mobile_development", /\b(mobile development|mobile app|android|ios app|swiftui|react native|flutter)\b/i],
  ["web_development", /\b(web development|web app|website builder|frontend|front-end|full-stack|full stack|react|next\.js|vue|svelte)\b/i],
  ["data_engineering", /\b(data engineering|data pipeline|etl|elt|data warehouse|data transformation|apache spark|airflow)\b/i],
  ["database_query_tools", /\b(database query|sql query|query builder|database schema|postgres|mysql|sqlite|mongodb)\b/i],
  ["api_development", /\b(api development|build apis?|api design|rest api|graphql|openapi|api testing)\b/i],
  ["performance_optimization", /\b(performance optimization|profiling|optimize performance|latency|memory optimization|speed up code)\b/i],
  ["accessibility_auditing", /\b(accessibility audit|accessibility testing|wcag|a11y)\b/i],
  ["localization_i18n", /\b(localization|internationalization|i18n|l10n|locale-aware)\b/i],
  ["package_dependency_management", /\b(dependency management|package management|dependency update|dependency health|lockfile|npm package|pip package|software bill of materials|sbom)\b/i],
  ["prompt_engineering_llm_tooling", /\b(prompt engineering|prompt management|llm tooling|llm evaluation|language model tooling|prompt testing)\b/i],
  ["embedded_iot_development", /\b(embedded development|embedded systems?|firmware|internet of things|iot|microcontroller|arduino|robotics software)\b/i],
  ["blockchain_smart_contracts", /\b(blockchain development|smart contracts?|solidity|web3|ethereum|crypto protocol)\b/i],
  ["productivity", /\b(productivity|task management|note taking|organize work|workflow assistant)\b/i],
  ["creativity", /\b(creative ideation|creativity|brainstorm|creative assistant)\b/i],
  ["research", /\b(research assistant|web research|literature review|citation|cited sources?|knowledge retrieval)\b/i],
  ["automation", /\b(workflow automation|browser automation|task automation|automate repetitive|robotic process automation|rpa)\b/i],
  ["security", /\b(security audit|vulnerability|penetration test|compliance|privacy|threat model|security scanning|sast|dast)\b/i],
  ["data_analytics", /\b(data analysis|data analytics|business intelligence|visualization|dashboard|analytics report)\b/i],
  ["communication", /\b(email assistant|team communication|slack bot|meeting notes|message drafting)\b/i],
  ["marketing_sales", /\b(marketing|sales|campaign|outreach|crm|lead generation|go-to-market)\b/i],
  ["customer_support", /\b(customer support|support ticket|helpdesk|service desk|customer success)\b/i],
  ["entertainment", /\b(entertainment|interactive story|storytelling|music generation|game recommendation)\b/i],
  ["education_learning", /\b(education|learning platform|teaching assistant|tutor|courseware|study assistant)\b/i],
  ["finance", /\b(financial analysis|accounting|bookkeeping|budgeting|invoice processing|personal finance)\b/i],
  ["health_wellness", /\b(healthcare|health information|wellness|medical assistant|fitness|care navigation)\b/i],
  ["legal", /\b(legal research|legal document|contract review|litigation|case law|law firm)\b/i],
  ["hr_recruiting", /\b(human resources|recruiting|recruitment|candidate screening|talent acquisition|employee onboarding)\b/i],
  ["real_estate", /\b(real estate|property listing|property management|realty|mortgage)\b/i],
  ["ecommerce", /\b(ecommerce|e-commerce|online store|shopping cart|product catalog|shopify|merchandising)\b/i],
  ["journalism_media", /\b(journalism|newsroom|news article|media production|fact checking|editorial workflow)\b/i],
  ["translation_language", /\b(translation|language learning|multilingual|translator|linguistic)\b/i],
  ["personal_assistant", /\b(personal assistant|daily assistant|personal tasks?|life admin)\b/i],
  ["scheduling_calendar", /\b(scheduling|calendar assistant|meeting scheduler|appointment booking|availability)\b/i],
  ["travel_planning", /\b(travel planning|trip planner|itinerary|flight booking|hotel booking|destination research)\b/i],
  ["writing_content_generation", /\b(content generation|content writing|writing assistant|copywriting|blog post|article writing)\b/i],
  ["video_audio_editing", /\b(video editing|audio editing|podcast editing|transcription editor|multimedia editing)\b/i],
  ["image_generation_design", /\b(image generation|graphic design|visual design|image editing|text-to-image|design assistant)\b/i],
  ["presentation_building", /\b(presentation builder|presentation generation|slide deck|slides? generation|powerpoint)\b/i],
  ["spreadsheet_data_entry", /\b(spreadsheet|data entry|excel automation|google sheets|csv cleanup)\b/i],
];

function textForTool(tool) {
  return [
    tool.name,
    tool.description,
    tool.category,
    tool.ecosystem,
    tool.githubRepo,
    tool.sourceLabel,
    tool.sourceType,
    tool.statusNote,
    tool.discovery?.sourceQuery,
    ...(Array.isArray(tool.discovery?.topics) ? tool.discovery.topics : []),
    ...(Array.isArray(tool.searchKeywords) ? tool.searchKeywords : []),
    ...(Array.isArray(tool.integrations) ? tool.integrations : []),
    ...(Array.isArray(tool.modelSupport?.providers) ? tool.modelSupport.providers : []),
  ].filter(Boolean).join(" ");
}

function inferredTags(tool) {
  const explicit = tool.use_cases || tool.useCases || [];
  const unknown = unknownUseCases(explicit);
  if (unknown.length) throw new Error(`${tool.id || tool.name} has unknown use_cases: ${unknown.join(", ")}`);
  const tags = new Set(normalizeUseCases(explicit));
  const text = textForTool(tool);
  for (const [slug, pattern] of rules) {
    if (slug === "development" && tool.agent_type === "review") continue;
    if (pattern.test(text)) tags.add(slug);
  }
  const curatedBuildCategories = new Set(["CLI-native", "Cloud agent", "IDE-attached", "App builder"]);
  if (tool.lastCuratedAt && !tool.discovery && tool.agent_type !== "review" && curatedBuildCategories.has(tool.category)) tags.add("development");
  return [...tags];
}

const entries = [];
const untagged = [];
for (const tool of trackedTools) {
  const slug = tool.slug || slugify(tool.id || tool.name);
  const useCases = inferredTags(tool);
  if (useCases.length) entries.push([slug, useCases]);
  else untagged.push({ slug, name: tool.name, category: tool.category || null, sourceUrl: tool.sourceUrl || tool.website || (tool.githubRepo ? `https://github.com/${tool.githubRepo}` : null) });
}
entries.sort(([a], [b]) => a.localeCompare(b));
untagged.sort((a, b) => a.slug.localeCompare(b.slug));

function countsFor(tagMap) {
  const counts = Object.fromEntries(USE_CASE_SLUGS.map((slug) => [slug, 0]));
  for (const tags of Object.values(tagMap || {})) {
    for (const slug of normalizeUseCases(tags)) counts[slug] += 1;
  }
  return counts;
}

const generatedProductUseCaseTags = Object.fromEntries(entries);
let previousReport = null;
try {
  previousReport = JSON.parse(await fs.readFile(reportPath, "utf8"));
} catch {
  previousReport = null;
}
const baselineCounts = previousReport?.useCaseCounts?.length
  ? Object.fromEntries(previousReport.useCaseCounts.map((item) => [item.slug, item.before]))
  : null;
const beforeCounts = baselineCounts ? { ...countsFor({}), ...baselineCounts } : countsFor(existingProductUseCaseTags);
const afterCounts = countsFor(generatedProductUseCaseTags);
const useCaseCounts = USE_CASE_SLUGS.map((slug) => ({
  slug,
  before: beforeCounts[slug],
  after: afterCounts[slug],
  delta: afterCounts[slug] - beforeCounts[slug],
}));

const tagModule = "// Generated by scripts/tag-use-cases.mjs. Review docs/use-case-tagging-report.json for untagged products.\nexport const productUseCaseTags = " + JSON.stringify(generatedProductUseCaseTags, null, 2) + ";\n";
const report = {
  generatedAt: new Date().toISOString(),
  totalProducts: trackedTools.length,
  taggedProducts: entries.length,
  untaggedProducts: untagged.length,
  useCaseCounts,
  untagged,
};
await fs.writeFile(tagPath, tagModule, "utf8");
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ totalProducts: trackedTools.length, taggedProducts: entries.length, untaggedProducts: untagged.length, tagPath, reportPath }, null, 2));