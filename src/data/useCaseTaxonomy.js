export const USE_CASE_GROUPS = ["coding_specific", "general_purpose"];

export const USE_CASE_TAXONOMY = [
  { slug: "development", label: "Development", group: "coding_specific", description: "Build, edit, and ship software across codebases, IDEs, CLIs, and app-building workflows." },
  { slug: "code_review", label: "Code Review", group: "coding_specific", description: "Review pull requests, diffs, code quality, and repository changes before merge." },
  { slug: "debugging", label: "Debugging", group: "coding_specific", description: "Diagnose bugs, runtime failures, broken tests, and unexpected software behavior." },
  { slug: "refactoring", label: "Refactoring", group: "coding_specific", description: "Improve code structure, maintainability, and organization without changing intended behavior." },
  { slug: "testing_qa", label: "Testing / QA", group: "coding_specific", description: "Create, run, evaluate, or improve tests, QA checks, and software verification workflows." },
  { slug: "devops_infra", label: "DevOps / Infrastructure", group: "coding_specific", description: "Support deployment, CI/CD, infrastructure, environments, and operational engineering tasks." },
  { slug: "documentation", label: "Documentation", group: "coding_specific", description: "Write or maintain docs, READMEs, guides, API references, and technical explanations." },
  { slug: "migration", label: "Migration", group: "coding_specific", description: "Move, upgrade, modernize, or convert codebases, frameworks, dependencies, and platforms." },
  { slug: "onboarding", label: "Onboarding", group: "coding_specific", description: "Help developers understand a codebase, project workflow, setup process, or engineering context." },
  { slug: "agent_infrastructure", label: "Agent Infrastructure", group: "coding_specific", description: "Build, host, orchestrate, or extend agents, tools, SDKs, runtimes, and agent platforms." },
  { slug: "mcp_integrations", label: "MCP Integrations", group: "coding_specific", description: "Connect AI tools through Model Context Protocol servers, clients, and integration surfaces." },
  { slug: "productivity", label: "Productivity", group: "general_purpose", description: "Plan, summarize, organize, and complete everyday work more efficiently." },
  { slug: "creativity", label: "Creativity", group: "general_purpose", description: "Generate, design, remix, or prototype creative ideas, visuals, writing, and interactive work." },
  { slug: "research", label: "Research", group: "general_purpose", description: "Find, retrieve, compare, cite, and synthesize information from trusted sources." },
  { slug: "automation", label: "Automation", group: "general_purpose", description: "Automate repetitive tasks, workflows, browser actions, and multi-step operational processes." },
  { slug: "security", label: "Security", group: "general_purpose", description: "Identify, assess, or improve security, privacy, compliance, and risk controls." },
  { slug: "data_analytics", label: "Data Analytics", group: "general_purpose", description: "Analyze, query, visualize, and explain data, metrics, reports, and business intelligence." },
  { slug: "communication", label: "Communication", group: "general_purpose", description: "Draft, summarize, translate, and improve messages, email, chat, and team communication." },
  { slug: "marketing_sales", label: "Marketing / Sales", group: "general_purpose", description: "Create campaigns, sales content, positioning, outreach, and go-to-market workflows." },
  { slug: "customer_support", label: "Customer Support", group: "general_purpose", description: "Resolve tickets, answer customer questions, and support service or success workflows." },
  { slug: "entertainment", label: "Entertainment", group: "general_purpose", description: "Create, recommend, or interact with games, media, stories, and leisure experiences." },
  { slug: "education_learning", label: "Education / Learning", group: "general_purpose", description: "Teach concepts, tutor learners, create study material, and support skill development." },
  { slug: "finance", label: "Finance", group: "general_purpose", description: "Analyze, explain, or assist with financial workflows, planning, accounting, and reporting." },
  { slug: "health_wellness", label: "Health / Wellness", group: "general_purpose", description: "Support health information, wellness routines, care navigation, and personal wellbeing workflows." },
  { slug: "legal", label: "Legal", group: "general_purpose", description: "Draft, review, research, or organize legal information and document workflows." },
];

export const USE_CASE_SLUGS = USE_CASE_TAXONOMY.map((item) => item.slug);
export const USE_CASE_BY_SLUG = Object.fromEntries(USE_CASE_TAXONOMY.map((item) => [item.slug, item]));
const USE_CASE_SLUG_SET = new Set(USE_CASE_SLUGS);
const LABEL_TO_SLUG = new Map(USE_CASE_TAXONOMY.map((item) => [item.label.toLowerCase(), item.slug]));

export function useCaseForSlug(slug) {
  return USE_CASE_BY_SLUG[String(slug || "").trim()] || null;
}

export function useCaseLabel(slug) {
  return useCaseForSlug(slug)?.label || String(slug || "");
}

export function useCaseSlugForLabel(value) {
  const text = String(value || "").trim();
  if (!text || text === "All") return "";
  if (USE_CASE_SLUG_SET.has(text)) return text;
  return LABEL_TO_SLUG.get(text.toLowerCase()) || "";
}

export function normalizeUseCases(value) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(raw.map((item) => String(item || "").trim()).filter((item) => USE_CASE_SLUG_SET.has(item)))];
}

export function unknownUseCases(value) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(raw.map((item) => String(item || "").trim()).filter((item) => item && !USE_CASE_SLUG_SET.has(item)))];
}

export function assertValidUseCases(value) {
  const unknown = unknownUseCases(value);
  if (unknown.length) throw new Error("Unknown use_cases: " + unknown.join(", "));
  return normalizeUseCases(value);
}

export function useCasesForGroup(group = "all") {
  if (group === "all") return USE_CASE_TAXONOMY;
  if (!USE_CASE_GROUPS.includes(group)) throw new Error("Invalid use case group: " + group);
  return USE_CASE_TAXONOMY.filter((item) => item.group === group);
}

export function populatedUseCases(products, group = "all", minCount = 3) {
  const allowed = new Set(useCasesForGroup(group).map((item) => item.slug));
  const counts = new Map();
  for (const product of products || []) {
    for (const slug of normalizeUseCases(product?.use_cases)) {
      if (!allowed.has(slug)) continue;
      counts.set(slug, (counts.get(slug) || 0) + 1);
    }
  }
  return useCasesForGroup(group)
    .map((item) => ({ ...item, count: counts.get(item.slug) || 0 }))
    .filter((item) => item.count >= minCount);
}

export function productsForUseCase(products, slug, group = "all", minCount = 3) {
  const useCase = populatedUseCases(products, group, minCount).find((item) => item.slug === slug);
  if (!useCase) return { useCase: null, products: [] };
  return {
    useCase,
    products: (products || []).filter((product) => normalizeUseCases(product?.use_cases).includes(slug)),
  };
}

export function useCaseSearchText(useCase) {
  return [useCase?.slug, useCase?.label, useCase?.description, useCase?.group].filter(Boolean).join(" ").toLowerCase();
}