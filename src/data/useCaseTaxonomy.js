export const USE_CASE_GROUPS = ["coding_specific", "general_purpose"];

export const USE_CASE_TAXONOMY = [
  { slug: "development", label: "Development", group: "coding_specific", description: "Autonomously create, edit, and ship application or system code." },
  { slug: "code_review", label: "Code Review", group: "coding_specific", description: "Review pull requests, diffs, code quality, and merge readiness." },
  { slug: "debugging", label: "Debugging", group: "coding_specific", description: "Diagnose and fix bugs, failures, errors, and unexpected behavior." },
  { slug: "refactoring", label: "Refactoring", group: "coding_specific", description: "Restructure code for clarity, maintainability, or modernization." },
  { slug: "testing_qa", label: "Testing / QA", group: "coding_specific", description: "Create, run, or evaluate tests and software quality checks." },
  { slug: "devops_infra", label: "DevOps / Infrastructure", group: "coding_specific", description: "Manage deployment, CI/CD, cloud infrastructure, and operations." },
  { slug: "documentation", label: "Documentation", group: "coding_specific", description: "Create and maintain technical documentation and API references." },
  { slug: "migration", label: "Migration", group: "coding_specific", description: "Upgrade or move codebases, frameworks, dependencies, and platforms." },
  { slug: "onboarding", label: "Onboarding", group: "coding_specific", description: "Help developers understand and begin working in unfamiliar codebases." },
  { slug: "agent_infrastructure", label: "Agent Infrastructure", group: "coding_specific", description: "Build and operate agent runtimes, orchestration, memory, and tooling." },
  { slug: "mcp_integrations", label: "MCP Integrations", group: "coding_specific", description: "Build or connect Model Context Protocol servers, clients, and tools." },
  { slug: "scientific_computing_research", label: "Scientific Computing / Research", group: "coding_specific", description: "Develop computational research, simulation, and scientific analysis software." },
  { slug: "fintech_development", label: "Fintech Development", group: "coding_specific", description: "Build financial software, trading systems, and payment integrations." },
  { slug: "game_development", label: "Game Development", group: "coding_specific", description: "Create games, game engines, gameplay systems, and related tools." },
  { slug: "mobile_development", label: "Mobile Development", group: "coding_specific", description: "Build and maintain native or cross-platform mobile applications." },
  { slug: "web_development", label: "Web Development", group: "coding_specific", description: "Build websites, web applications, frontends, and web backends." },
  { slug: "data_engineering", label: "Data Engineering", group: "coding_specific", description: "Build data pipelines, transformations, warehouses, and processing systems." },
  { slug: "database_query_tools", label: "Database Query Tools", group: "coding_specific", description: "Create, explain, optimize, or execute database queries and schemas." },
  { slug: "api_development", label: "API Development", group: "coding_specific", description: "Design, implement, test, and document software APIs." },
  { slug: "performance_optimization", label: "Performance Optimization", group: "coding_specific", description: "Profile and improve software speed, efficiency, and resource usage." },
  { slug: "accessibility_auditing", label: "Accessibility Auditing", group: "coding_specific", description: "Audit and improve digital accessibility and standards compliance." },
  { slug: "localization_i18n", label: "Localization / i18n", group: "coding_specific", description: "Internationalize software and manage locale-aware content and behavior." },
  { slug: "package_dependency_management", label: "Package / Dependency Management", group: "coding_specific", description: "Manage packages, versions, updates, licenses, and dependency health." },
  { slug: "prompt_engineering_llm_tooling", label: "Prompt Engineering / LLM Tooling", group: "coding_specific", description: "Build prompts, evaluations, tooling, and workflows for language models." },
  { slug: "embedded_iot_development", label: "Embedded / IoT Development", group: "coding_specific", description: "Develop firmware, embedded systems, robotics, and connected devices." },
  { slug: "blockchain_smart_contracts", label: "Blockchain / Smart Contracts", group: "coding_specific", description: "Build blockchain applications, protocols, and smart contracts." },
  { slug: "productivity", label: "Productivity", group: "general_purpose", description: "Plan, summarize, organize, and complete everyday work efficiently." },
  { slug: "creativity", label: "Creativity", group: "general_purpose", description: "Generate and develop creative ideas, concepts, and artifacts." },
  { slug: "research", label: "Research", group: "general_purpose", description: "Find, compare, cite, and synthesize information from reliable sources." },
  { slug: "automation", label: "Automation", group: "general_purpose", description: "Automate repetitive tasks and multi-step operational workflows." },
  { slug: "security", label: "Security", group: "general_purpose", description: "Assess and improve security, privacy, compliance, and risk controls." },
  { slug: "data_analytics", label: "Data Analytics", group: "general_purpose", description: "Analyze, visualize, and explain data, metrics, and reports." },
  { slug: "communication", label: "Communication", group: "general_purpose", description: "Draft, summarize, and improve messages and team communication." },
  { slug: "marketing_sales", label: "Marketing / Sales", group: "general_purpose", description: "Create marketing campaigns, sales content, outreach, and positioning." },
  { slug: "customer_support", label: "Customer Support", group: "general_purpose", description: "Answer customer questions and support service workflows." },
  { slug: "entertainment", label: "Entertainment", group: "general_purpose", description: "Create or support games, media, stories, and leisure experiences." },
  { slug: "education_learning", label: "Education / Learning", group: "general_purpose", description: "Teach concepts, tutor learners, and create educational materials." },
  { slug: "finance", label: "Finance", group: "general_purpose", description: "Support financial analysis, accounting, planning, and reporting." },
  { slug: "health_wellness", label: "Health / Wellness", group: "general_purpose", description: "Support health information, care navigation, and wellbeing workflows." },
  { slug: "legal", label: "Legal", group: "general_purpose", description: "Research, draft, review, and organize legal information and documents." },
  { slug: "hr_recruiting", label: "HR / Recruiting", group: "general_purpose", description: "Support hiring, recruiting, employee operations, and talent workflows." },
  { slug: "real_estate", label: "Real Estate", group: "general_purpose", description: "Support property research, listings, transactions, and real-estate operations." },
  { slug: "ecommerce", label: "Ecommerce", group: "general_purpose", description: "Support online stores, catalogs, merchandising, and commerce operations." },
  { slug: "journalism_media", label: "Journalism / Media", group: "general_purpose", description: "Research, produce, edit, and distribute news and media content." },
  { slug: "translation_language", label: "Translation / Language", group: "general_purpose", description: "Translate, localize, and work across languages." },
  { slug: "personal_assistant", label: "Personal Assistant", group: "general_purpose", description: "Manage personal tasks, information, reminders, and daily workflows." },
  { slug: "scheduling_calendar", label: "Scheduling / Calendar", group: "general_purpose", description: "Coordinate meetings, calendars, availability, and reminders." },
  { slug: "travel_planning", label: "Travel Planning", group: "general_purpose", description: "Research and organize destinations, itineraries, bookings, and trips." },
  { slug: "writing_content_generation", label: "Writing / Content Generation", group: "general_purpose", description: "Draft, revise, and generate written content." },
  { slug: "video_audio_editing", label: "Video / Audio Editing", group: "general_purpose", description: "Create, edit, and transform video, audio, and multimedia." },
  { slug: "image_generation_design", label: "Image Generation / Design", group: "general_purpose", description: "Generate and edit images, graphics, layouts, and visual designs." },
  { slug: "presentation_building", label: "Presentation Building", group: "general_purpose", description: "Create and refine slide decks and visual presentations." },
  { slug: "spreadsheet_data_entry", label: "Spreadsheet / Data Entry", group: "general_purpose", description: "Create, populate, clean, and maintain spreadsheets and structured records." },
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