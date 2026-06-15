import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

export type ToolKind = "mcp" | "cli" | "browser" | "package-manager" | "runtime" | "service" | "other";
export type ResolutionDecision = "select" | "compose" | "ask" | "none";

export interface RecommendedTool {
  id: string;
  kind: ToolKind;
  purpose: string;
  when?: string;
  optional?: boolean;
}

export interface PromptSignals {
  phrases: string[];
  allOf: string[][];
  anyOf: string[];
  noneOf: string[];
}

export interface DisciplineActivation {
  pathPatterns: string[];
  commandPatterns: string[];
  promptSignals: PromptSignals;
  minScore: number;
}

export interface Discipline {
  id: string;
  name: string;
  version: string;
  description: string;
  includeSkills: string[];
  softExcludeSkills: string[];
  recommendedTools: RecommendedTool[];
  activation: DisciplineActivation;
  aliases?: string[];
  notes?: string;
  confidenceThreshold?: number;
  packageId: string;
  filePath: string;
  body: string;
}

export interface ResolverInput {
  task?: string;
  repoSignals?: {
    files?: string[];
  };
  commands?: string[];
}

export interface ActivationMatches {
  pathPatterns: string[];
  commandPatterns: string[];
  promptSignals: string[];
}

export interface DisciplineScore {
  disciplineId: string;
  minScore: number;
  score: number;
  matches: ActivationMatches;
}

export interface DisciplineResolution {
  decision: ResolutionDecision;
  primaryDiscipline: string | null;
  secondaryDiscipline: string | null;
  scored: DisciplineScore[];
}

export interface ResolverBundle {
  decision: ResolutionDecision;
  task?: string;
  question?: string;
  choices?: string[];
  reason?: string;
  selectedDisciplines: Array<{
    id: string;
    role: "primary" | "secondary";
    score: number | string;
    minScore: number | string;
    reason: string;
    filePath: string;
  }>;
  activationMatches: Array<ActivationMatches & { disciplineId: string }>;
  includeSkills: string[];
  recommendedTools: RecommendedTool[];
  softExcludeSkills: string[];
  prompts?: Array<{
    disciplineId: string;
    body: string;
  }>;
  notes?: string[];
  scores: DisciplineScore[];
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const portableIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const semverPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

const recommendedToolSchema = z.object({
  id: z.string().regex(portableIdPattern),
  kind: z.enum(["mcp", "cli", "browser", "package-manager", "runtime", "service", "other"]),
  purpose: z.string().min(1),
  when: z.string().min(1).optional(),
  optional: z.boolean().optional(),
}).strict();

const promptSignalsSchema = z.object({
  phrases: z.array(z.string().min(1)),
  allOf: z.array(z.array(z.string().min(1)).min(1)),
  anyOf: z.array(z.string().min(1)),
  noneOf: z.array(z.string().min(1)),
}).strict();

const disciplineFrontmatterSchema = z.object({
  id: z.string().regex(idPattern),
  name: z.string().min(1),
  version: z.string().regex(semverPattern),
  description: z.string().min(1),
  aliases: z.array(z.string().min(1)).optional(),
  includeSkills: z.array(z.string().regex(portableIdPattern)).min(1),
  recommendedTools: z.array(recommendedToolSchema),
  softExcludeSkills: z.array(z.string().regex(portableIdPattern)),
  activation: z.object({
    pathPatterns: z.array(z.string().min(1)),
    commandPatterns: z.array(z.string().min(1)),
    promptSignals: promptSignalsSchema,
    minScore: z.number().min(0),
  }).strict(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  notes: z.string().min(1).optional(),
}).strict();

export function stripJsonComments(source: string): string {
  return source.replace(/^\s*\/\/.*$/gm, "");
}

export function splitDisciplineFile(source: string, filePath: string): { frontmatter: string; body: string } {
  if (!source.startsWith("---\n")) {
    throw new Error(`${filePath}: missing opening frontmatter delimiter`);
  }

  const end = source.indexOf("\n---", 4);
  if (end === -1) {
    throw new Error(`${filePath}: missing closing frontmatter delimiter`);
  }

  return {
    frontmatter: source.slice(4, end).trim(),
    body: source.slice(end + 4).trim(),
  };
}

function formatZodPath(pathParts: PropertyKey[]): string {
  return pathParts.length > 0 ? pathParts.join(".") : "frontmatter";
}

function parseDisciplineFrontmatter(frontmatter: string, filePath: string): Omit<Discipline, "packageId" | "filePath" | "body"> {
  const yaml = YAML.parse(frontmatter);
  const parsed = disciplineFrontmatterSchema.safeParse(yaml);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`${filePath}: invalid frontmatter at ${formatZodPath(issue.path)}: ${issue.message}`);
  }

  return parsed.data;
}

export async function loadDisciplines(root: string): Promise<Discipline[]> {
  if (existsSync(path.join(root, "DISCIPLINE.md"))) {
    const packageName = path.basename(root);
    const relativePath = path.join(packageName, "DISCIPLINE.md");
    const source = await readFile(path.join(root, "DISCIPLINE.md"), "utf8");
    const { frontmatter, body } = splitDisciplineFile(source, relativePath);
    return [{
      ...parseDisciplineFrontmatter(frontmatter, relativePath),
      packageId: packageName,
      filePath: relativePath,
      body,
    }];
  }

  const disciplinesDir = path.join(root, "disciplines");
  const entries = await readdir(disciplinesDir, { withFileTypes: true });
  const packages = entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort();
  const disciplines: Discipline[] = [];

  for (const packageName of packages) {
    const relativePath = path.join("disciplines", packageName, "DISCIPLINE.md");
    const absolutePath = path.join(disciplinesDir, packageName, "DISCIPLINE.md");
    const source = await readFile(absolutePath, "utf8");
    const { frontmatter, body } = splitDisciplineFile(source, relativePath);
    disciplines.push({
      ...parseDisciplineFrontmatter(frontmatter, relativePath),
      packageId: packageName,
      filePath: relativePath,
      body,
    });
  }

  return disciplines;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(pattern: string): RegExp {
  let source = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else {
      source += escapeRegExp(char);
    }
  }

  return new RegExp(`^${source}$`, "i");
}

function includesPhrase(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

export function scoreDiscipline(input: ResolverInput, discipline: Discipline): DisciplineScore {
  const taskText = input.task ?? "";
  const files = input.repoSignals?.files ?? [];
  const commands = input.commands ?? [];
  const activation = discipline.activation;
  const promptSignals = activation.promptSignals;
  const matches: ActivationMatches = {
    pathPatterns: [],
    commandPatterns: [],
    promptSignals: [],
  };
  let score = 0;

  for (const pattern of activation.pathPatterns) {
    const regex = globToRegExp(pattern);
    if (files.some((file) => regex.test(file))) {
      matches.pathPatterns.push(pattern);
      score += 3;
    }
  }

  for (const pattern of activation.commandPatterns) {
    const regex = new RegExp(pattern, "i");
    if (commands.some((command) => regex.test(command))) {
      matches.commandPatterns.push(pattern);
      score += 2;
    }
  }

  for (const phrase of promptSignals.phrases) {
    if (includesPhrase(taskText, phrase)) {
      matches.promptSignals.push(phrase);
      score += 2;
    }
  }

  for (const phrase of promptSignals.anyOf) {
    if (includesPhrase(taskText, phrase)) {
      matches.promptSignals.push(phrase);
      score += 1;
    }
  }

  for (const group of promptSignals.allOf) {
    if (group.every((phrase) => includesPhrase(taskText, phrase))) {
      matches.promptSignals.push(group.join(" + "));
      score += group.length + 1;
    }
  }

  for (const phrase of promptSignals.noneOf) {
    if (includesPhrase(taskText, phrase)) {
      score -= 3;
    }
  }

  return {
    disciplineId: discipline.id,
    minScore: activation.minScore,
    score,
    matches,
  };
}

export function resolveDisciplines(input: ResolverInput, disciplines: Discipline[]): DisciplineResolution {
  const scored = disciplines
    .map((discipline) => scoreDiscipline(input, discipline))
    .sort((a, b) => b.score - a.score || a.disciplineId.localeCompare(b.disciplineId));

  const eligible = scored.filter((result) => result.score >= result.minScore);
  if (eligible.length === 0) {
    const hasWeakSignal = scored.some((result) => result.score > 0);
    return {
      decision: hasWeakSignal ? "ask" : "none",
      primaryDiscipline: null,
      secondaryDiscipline: null,
      scored,
    };
  }

  const primary = eligible[0];
  const secondary = eligible[1];

  if (secondary && secondary.score >= secondary.minScore && secondary.score >= primary.score * 0.6) {
    return {
      decision: "compose",
      primaryDiscipline: primary.disciplineId,
      secondaryDiscipline: secondary.disciplineId,
      scored,
    };
  }

  return {
    decision: "select",
    primaryDiscipline: primary.disciplineId,
    secondaryDiscipline: null,
    scored,
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function selectedDisciplineEntries(resolution: DisciplineResolution, disciplines: Discipline[]): Discipline[] {
  const byId = new Map(disciplines.map((discipline) => [discipline.id, discipline]));
  return [resolution.primaryDiscipline, resolution.secondaryDiscipline]
    .filter(Boolean)
    .map((disciplineId) => byId.get(disciplineId))
    .filter(Boolean);
}

function disciplineReason(score: DisciplineScore): string {
  const parts: string[] = [];
  if (score.matches.pathPatterns.length > 0) parts.push(`paths: ${score.matches.pathPatterns.join(", ")}`);
  if (score.matches.commandPatterns.length > 0) parts.push(`commands: ${score.matches.commandPatterns.join(", ")}`);
  if (score.matches.promptSignals.length > 0) parts.push(`prompt: ${score.matches.promptSignals.join(", ")}`);
  return parts.length > 0 ? parts.join("; ") : "No strong activation signals matched.";
}

export function createResolverBundle(input: ResolverInput, disciplines: Discipline[]): ResolverBundle {
  const resolution = resolveDisciplines(input, disciplines);
  const selectedDisciplines = selectedDisciplineEntries(resolution, disciplines);
  const scoreByDiscipline = new Map<string, DisciplineScore>(resolution.scored.map((score) => [score.disciplineId, score]));
  const includeSkills = unique(selectedDisciplines.flatMap((discipline) => discipline.includeSkills));
  const includeSkillSet = new Set(includeSkills);
  const softExcludeSkills = unique(selectedDisciplines.flatMap((discipline) => discipline.softExcludeSkills))
    .filter((skillId) => !includeSkillSet.has(skillId));

  if (resolution.decision === "none") {
    return {
      decision: "none",
      task: input.task,
      selectedDisciplines: [],
      activationMatches: [],
      includeSkills: [],
      recommendedTools: [],
      softExcludeSkills: [],
      reason: "No available discipline reached the activation threshold.",
      scores: resolution.scored,
    };
  }

  if (resolution.decision === "ask") {
    return {
      decision: "ask",
      task: input.task,
      question: "Which discipline should guide this task?",
      choices: resolution.scored.slice(0, 3).filter((score) => score.score > 0).map((score) => score.disciplineId),
      reason: "Some activation signals matched, but no discipline reached its activation threshold.",
      selectedDisciplines: [],
      activationMatches: resolution.scored.slice(0, 3).map((score) => ({
        disciplineId: score.disciplineId,
        ...score.matches,
      })),
      includeSkills: [],
      recommendedTools: [],
      softExcludeSkills: [],
      scores: resolution.scored,
    };
  }

  return {
    decision: resolution.decision,
    task: input.task,
    selectedDisciplines: selectedDisciplines.map((discipline, index) => {
      const score = scoreByDiscipline.get(discipline.id);
      return {
        id: discipline.id,
        role: index === 0 ? "primary" : "secondary",
        score: score?.score ?? 0,
        minScore: score?.minScore ?? discipline.activation.minScore,
        reason: score ? disciplineReason(score) : "Selected by resolver.",
        filePath: discipline.filePath,
      };
    }),
    activationMatches: selectedDisciplines.map((discipline) => ({
      disciplineId: discipline.id,
      ...(scoreByDiscipline.get(discipline.id)?.matches ?? {
        pathPatterns: [],
        commandPatterns: [],
        promptSignals: [],
      }),
    })),
    includeSkills,
    recommendedTools: selectedDisciplines.flatMap((discipline) => discipline.recommendedTools),
    softExcludeSkills,
    prompts: selectedDisciplines.map((discipline) => ({
      disciplineId: discipline.id,
      body: discipline.body,
    })),
    notes: [
      "Disciplines are advisory. Soft exclusions may be overridden by explicit user request or concrete evidence.",
      "Recommended tools are evidence sources, not automatic installation or execution instructions.",
    ],
    scores: resolution.scored,
  };
}

function formatList(values?: string[]): string {
  if (!values || values.length === 0) return "- none";
  return values.map((value) => `- ${value}`).join("\n");
}

function formatTools(tools?: RecommendedTool[]): string {
  if (!tools || tools.length === 0) return "- none";
  return tools
    .map((tool) => {
      const when = tool.when ? ` When: ${tool.when}` : "";
      return `- ${tool.id} (${tool.kind}): ${tool.purpose}${when}`;
    })
    .join("\n");
}

export function formatPromptBundle(bundle: ResolverBundle): string {
  if (bundle.decision === "none") {
    return [
      "# Agent Discipline Resolution",
      "",
      `Decision: none`,
      `Task: ${bundle.task}`,
      "",
      "No available discipline matched strongly enough. Proceed without a discipline or ask whether a new discipline should be created.",
    ].join("\n");
  }

  if (bundle.decision === "ask") {
    return [
      "# Agent Discipline Resolution",
      "",
      "Decision: ask",
      `Task: ${bundle.task}`,
      "",
      bundle.question,
      "",
      "Likely choices:",
      formatList(bundle.choices),
      "",
      bundle.reason,
    ].join("\n");
  }

  const selected = bundle.selectedDisciplines
    .map((discipline) => `- ${discipline.id} (${discipline.role}, score ${discipline.score}/${discipline.minScore}): ${discipline.reason}`)
    .join("\n");
  const prompts = bundle.prompts
    .map((prompt) => [`## ${prompt.disciplineId} Focus Prompt`, "", prompt.body].join("\n"))
    .join("\n\n");

  return [
    "# Agent Discipline Resolution",
    "",
    `Decision: ${bundle.decision}`,
    `Task: ${bundle.task}`,
    "",
    "Selected disciplines:",
    selected,
    "",
    "Included skill ids:",
    formatList(bundle.includeSkills),
    "",
    "Recommended tools:",
    formatTools(bundle.recommendedTools),
    "",
    "Soft-excluded skill ids:",
    formatList(bundle.softExcludeSkills),
    "",
    prompts,
    "",
    "## Operating Notes",
    formatList(bundle.notes),
  ].join("\n");
}
