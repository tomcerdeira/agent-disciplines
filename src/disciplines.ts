#!/usr/bin/env node

import { cp, lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { z } from "zod";
import {
  createResolverBundle,
  formatPromptBundle,
  loadDisciplines,
} from "./lib/discipline-resolver.js";
import type { Discipline, ResolverBundle } from "./lib/discipline-resolver.js";

const execFileAsync = promisify(execFile);
const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS = ["claude-code", "codex", "cursor"];
const SOURCE_STORE_DIR = path.join(os.homedir(), ".agent-disciplines", "sources");
const GLOBAL_STORE_ROOT = path.join(os.homedir(), ".agent-disciplines");
const PROJECT_STORE_ROOT = path.join(process.cwd(), ".agents");
const MANIFEST_FILE = ".disciplines-manifest.json";
const CONFIG_FILE = "disciplines.json";

const manifestEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  source: z.string().min(1).optional(),
  sourceRoot: z.string().min(1).optional(),
  sourcePath: z.string().optional(),
  sourceRev: z.string().nullable().optional(),
  mode: z.enum(["copy", "symlink"]).optional(),
  installedAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

const manifestSchema = z.object({
  version: z.number().int().positive(),
  disciplines: z.record(z.string(), manifestEntrySchema),
}).passthrough();

const installConfigEntrySchema = z.object({
  source: z.string().min(1),
  discipline: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  disciplines: z.array(z.string().min(1)).optional(),
  all: z.boolean().optional(),
  agents: z.array(z.string().min(1)).optional(),
  copy: z.boolean().optional(),
}).strict();

const installConfigSchema = z.object({
  version: z.number().int().positive(),
  disciplines: z.array(installConfigEntrySchema).min(1),
}).strict();

function sourceSlug(source) {
  return source
    .replace(/^https?:\/\//, "")
    .replace(/^git@/, "")
    .replace(/\.git$/, "")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseSourceSpec(rawSource) {
  const source = rawSource ?? "installed";
  if (!source.startsWith("git@")) {
    const match = source.match(/^(.+)@([A-Za-z0-9_.-]+|\*)$/);
    if (match) return { source: match[1], discipline: match[2] };
  }
  return { source, discipline: null };
}

function parseRemoteSource(source) {
  const githubShorthand = source.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (githubShorthand) {
    return {
      gitUrl: `https://github.com/${githubShorthand[1]}/${githubShorthand[2]}.git`,
      subPath: "",
      slug: `${githubShorthand[1]}-${githubShorthand[2]}`,
    };
  }

  const githubTree = source.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/);
  if (githubTree) {
    return {
      gitUrl: `https://github.com/${githubTree[1]}/${githubTree[2]}.git`,
      branch: githubTree[3],
      subPath: githubTree[4],
      slug: `${githubTree[1]}-${githubTree[2]}-${githubTree[3]}`,
    };
  }

  const githubUrl = source.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (githubUrl) {
    return {
      gitUrl: `https://github.com/${githubUrl[1]}/${githubUrl[2]}.git`,
      subPath: "",
      slug: `${githubUrl[1]}-${githubUrl[2]}`,
    };
  }

  const gitlabTree = source.match(/^https:\/\/gitlab\.com\/(.+?)\/-\/tree\/([^/]+)\/(.+)$/);
  if (gitlabTree) {
    return {
      gitUrl: `https://gitlab.com/${gitlabTree[1]}.git`,
      branch: gitlabTree[2],
      subPath: gitlabTree[3],
      slug: `gitlab-${sourceSlug(gitlabTree[1])}-${gitlabTree[2]}`,
    };
  }

  const gitlabUrl = source.match(/^https:\/\/gitlab\.com\/(.+?)(?:\.git)?\/?$/);
  if (gitlabUrl && !gitlabUrl[1].includes("/-/")) {
    return {
      gitUrl: `https://gitlab.com/${gitlabUrl[1]}.git`,
      subPath: "",
      slug: `gitlab-${sourceSlug(gitlabUrl[1])}`,
    };
  }

  if (/^(git@|https?:\/\/).+\.git$/.test(source)) {
    return { gitUrl: source, subPath: "", slug: sourceSlug(source) };
  }

  return null;
}

async function ensureGitSource(source) {
  const remote = parseRemoteSource(source);
  if (!remote) return null;

  const target = path.join(SOURCE_STORE_DIR, remote.slug);
  if (!existsSync(target)) {
    await mkdir(SOURCE_STORE_DIR, { recursive: true });
    const args = ["clone", "--depth", "1"];
    if (remote.branch) args.push("--branch", remote.branch);
    args.push(remote.gitUrl, target);
    await execFileAsync("git", args);
  }

  return {
    root: path.join(target, remote.subPath ?? ""),
    sourceRoot: target,
    subPath: remote.subPath ?? "",
    gitUrl: remote.gitUrl,
    sourceRef: source,
  };
}

async function resolveSource(source) {
  if (source === "installed") {
    return { root: installedAggregateRoot(), sourceRoot: installedAggregateRoot(), sourceRef: "installed", installed: true };
  }

  const gitSource = await ensureGitSource(source);
  if (gitSource) return gitSource;

  const localPath = path.resolve(process.cwd(), source);
  if (!existsSync(localPath)) throw new Error(`Source not found: ${source}`);
  return { root: localPath, sourceRoot: localPath, subPath: "", sourceRef: source };
}

function installedAggregateRoot() {
  if (existsSync(path.join(PROJECT_STORE_ROOT, "disciplines"))) return PROJECT_STORE_ROOT;
  return GLOBAL_STORE_ROOT;
}

function normalizeAgents(values) {
  if (values.length === 0) return [];
  if (values.includes("*")) return AGENTS;
  const unknown = values.filter((agent) => !AGENTS.includes(agent));
  if (unknown.length > 0) throw new Error(`Unknown agent(s): ${unknown.join(", ")}`);
  return [...new Set(values)];
}

function selectedScopes(options, { defaultScope = "project" } = {}) {
  const scopes = [];
  if (options.global) scopes.push("global");
  if (options.project) scopes.push("project");
  if (scopes.length === 0) scopes.push(defaultScope);
  return scopes;
}

function storeRootForScope(scope) {
  return scope === "global" ? GLOBAL_STORE_ROOT : PROJECT_STORE_ROOT;
}

function disciplineDir(storeRoot) {
  return path.join(storeRoot, "disciplines");
}

function manifestPath(storeRoot) {
  return path.join(storeRoot, MANIFEST_FILE);
}

async function readManifest(storeRoot) {
  const filePath = manifestPath(storeRoot);
  try {
    const json = JSON.parse(await readFile(filePath, "utf8"));
    const parsed = manifestSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const issuePath = issue.path.length > 0 ? issue.path.join(".") : "manifest";
      throw new Error(`${filePath}: invalid manifest at ${issuePath}: ${issue.message}`);
    }
    return parsed.data;
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, disciplines: {} };
    throw error;
  }
}

async function writeManifest(storeRoot, manifest) {
  await mkdir(storeRoot, { recursive: true });
  await writeFile(manifestPath(storeRoot), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function copyDirectory(source, target) {
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, {
    recursive: true,
    filter: (entry) => {
      const parts = entry.split(path.sep);
      return !parts.includes(".git") && !parts.includes("node_modules");
    },
  });
}

async function linkDirectory(source, target) {
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await symlink(source, target, "dir");
}

async function confirmOverwrite(filePath, options) {
  if (!existsSync(filePath)) return true;
  if (options.yes) return true;
  if (!process.stdin.isTTY) return false;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${filePath} exists. Overwrite? [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function writeManagedFile(filePath, content, options) {
  if (!(await confirmOverwrite(filePath, options))) {
    console.log(`skip ${filePath}`);
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
  console.log(`write ${filePath}`);
}

async function renderTemplate(sourceRoot, relativePath, replacements: Record<string, string> = {}) {
  const template = await readFile(path.join(sourceRoot, relativePath), "utf8");
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.split(key).join(value);
  }
  return output;
}

function runtimeCommand(scope) {
  return scope === "project" ? "npx disciplines use installed" : "npx disciplines use installed";
}

function renderMetaSkill(template, scope, name = "agent-disciplines") {
  let output = template;
  output = output.replace(/^name: .+$/m, `name: ${name}`);
  if (name === "discipline") {
    output = output.replace(
      /^description: .+$/m,
      "description: Resolve a task against installed agent disciplines before non-trivial work. Use when the user invokes /discipline, asks to use disciplines, asks which discipline applies, or when repo instructions say to run discipline preflight.",
    );
  }
  output = output.replace(
    "If the repo path is not known, use `$AGENT_DISCIPLINES_HOME` when set. Otherwise ask the user for the path or proceed without discipline resolution.",
    "Use `npx disciplines use installed` to resolve against installed disciplines. If no disciplines are installed, ask the user to run `npx disciplines add <source>`.",
  );
  return output;
}

function renderDisciplineCommand(scope) {
  return `---
description: Resolve a task with installed agent disciplines and return the selected discipline prelude
argument-hint: <task>
---

Resolve this task with installed agent disciplines before doing implementation work:

Task:
$ARGUMENTS

Run:

\`\`\`sh
${runtimeCommand(scope)} --task "$ARGUMENTS"
\`\`\`

If relevant files, commands, logs, or errors are already known, include them as \`--file\` and \`--command\` arguments.

Return the resolver output first, then proceed with the task under the selected discipline. If the resolver returns \`ask\`, ask the user to choose. If it returns \`none\`, proceed without a discipline and mention that no discipline matched.
`;
}

function projectRoot() {
  return process.cwd();
}

async function installClaudeCode(sourceRoot, scope, options) {
  const metaTemplate = await renderTemplate(sourceRoot, "templates/meta-skill/agent-disciplines/SKILL.md");
  const commandTemplate = renderDisciplineCommand(scope);

  if (scope === "global") {
    await writeManagedFile(
      path.join(os.homedir(), ".claude", "skills", "agent-disciplines", "SKILL.md"),
      renderMetaSkill(metaTemplate, scope, "agent-disciplines"),
      options,
    );
    await writeManagedFile(
      path.join(os.homedir(), ".claude", "skills", "discipline", "SKILL.md"),
      renderMetaSkill(metaTemplate, scope, "discipline"),
      options,
    );
    await writeManagedFile(path.join(os.homedir(), ".claude", "commands", "discipline.md"), commandTemplate, options);
    return;
  }

  await writeManagedFile(path.join(projectRoot(), "CLAUDE.md"), await renderTemplate(sourceRoot, "templates/repo-instructions/CLAUDE.md", {
    "<AGENT_DISCIPLINES_COMMAND>": runtimeCommand(scope),
  }), options);
  await writeManagedFile(path.join(projectRoot(), ".claude", "commands", "discipline.md"), commandTemplate, options);
}

async function installCodex(sourceRoot, scope, options) {
  const metaTemplate = await renderTemplate(sourceRoot, "templates/meta-skill/agent-disciplines/SKILL.md");
  const renderedSkill = renderMetaSkill(metaTemplate, scope, "agent-disciplines");

  if (scope === "global") {
    await writeManagedFile(path.join(os.homedir(), ".codex", "skills", "agent-disciplines", "SKILL.md"), renderedSkill, options);
    await writeManagedFile(path.join(os.homedir(), ".agents", "skills", "agent-disciplines", "SKILL.md"), renderedSkill, options);
    return;
  }

  await writeManagedFile(path.join(projectRoot(), "AGENTS.md"), await renderTemplate(sourceRoot, "templates/repo-instructions/AGENTS.md", {
    "<AGENT_DISCIPLINES_COMMAND>": runtimeCommand(scope),
  }), options);
}

async function installCursor(sourceRoot, scope, options) {
  const content = await renderTemplate(sourceRoot, "templates/repo-instructions/cursor-rule.md", {
    "<AGENT_DISCIPLINES_COMMAND>": runtimeCommand(scope),
  });
  const base = scope === "global" ? path.join(os.homedir(), ".cursor") : path.join(projectRoot(), ".cursor");
  await writeManagedFile(path.join(base, "rules", "agent-disciplines.mdc"), content, options);
}

async function installAgentGlue(sourceRoot, scope, options) {
  const agents = normalizeAgents(options.agents);
  for (const agent of agents) {
    if (agent === "claude-code") await installClaudeCode(sourceRoot, scope, options);
    if (agent === "codex") await installCodex(sourceRoot, scope, options);
    if (agent === "cursor") await installCursor(sourceRoot, scope, options);
  }
}

async function loadDisciplinesFromSource(sourceRoot) {
  const disciplines = await loadDisciplines(sourceRoot);
  return disciplines.map((discipline) => ({
    ...discipline,
    absoluteDir: existsSync(path.join(sourceRoot, "DISCIPLINE.md"))
      ? sourceRoot
      : path.dirname(path.join(sourceRoot, discipline.filePath)),
  }));
}

function selectedIdsFromOptions(options, specDiscipline = null) {
  const ids = [...options.disciplines];
  if (specDiscipline) ids.push(specDiscipline);
  if (options.all || ids.includes("*")) return "*";
  return [...new Set(ids)];
}

function filterDisciplines(disciplines, selection, { defaultAll = true } = {}) {
  if (selection === "*") return disciplines;
  if (selection.length === 0) return defaultAll ? disciplines : [];
  const byId = new Map(disciplines.map((discipline) => [discipline.id, discipline]));
  const missing = selection.filter((id) => !byId.has(id));
  if (missing.length > 0) throw new Error(`Unknown discipline(s): ${missing.join(", ")}`);
  return selection.map((id) => byId.get(id));
}

async function installDisciplinePackage(discipline, source, sourceInfo, scope, options) {
  const storeRoot = storeRootForScope(scope);
  const target = path.join(disciplineDir(storeRoot), discipline.id);
  const sourceRev = await gitRevision(sourceInfo.sourceRoot);

  if (existsSync(target) && !(await confirmOverwrite(target, options))) {
    console.log(`skip ${target}`);
    return;
  }

  if (options.copy) {
    await copyDirectory(discipline.absoluteDir, target);
  } else {
    await linkDirectory(discipline.absoluteDir, target);
  }

  const manifest = await readManifest(storeRoot);
  manifest.disciplines[discipline.id] = {
    id: discipline.id,
    name: discipline.name,
    description: discipline.description,
    source,
    sourceRoot: sourceInfo.sourceRoot,
    sourcePath: path.relative(sourceInfo.sourceRoot, discipline.absoluteDir),
    sourceRev,
    mode: options.copy ? "copy" : "symlink",
    installedAt: new Date().toISOString(),
  };
  await writeManifest(storeRoot, manifest);
  console.log(`${options.copy ? "copy" : "link"} ${discipline.id} -> ${target}`);
}

async function installedEntries(scopes) {
  const rows = [];
  for (const scope of scopes) {
    const storeRoot = storeRootForScope(scope);
    const root = disciplineDir(storeRoot);
    if (!existsSync(root)) continue;
    const manifest = await readManifest(storeRoot);
    const disciplines = await loadDisciplines(storeRoot);
    for (const discipline of disciplines) {
      rows.push({
        scope,
        storeRoot,
        discipline,
        manifest: manifest.disciplines[discipline.id] ?? null,
      });
    }
  }
  return rows.sort((a, b) => a.discipline.id.localeCompare(b.discipline.id) || a.scope.localeCompare(b.scope));
}

function printDisciplineRow(discipline, prefix = "") {
  console.log(`${prefix}${discipline.id}\t${discipline.name}\t${discipline.description}`);
}

async function commandList(source, options) {
  if (source) {
    const spec = parseSourceSpec(source);
    const sourceInfo = await resolveSource(spec.source);
    const disciplines = await loadDisciplinesFromSource(sourceInfo.root);
    const selected = filterDisciplines(disciplines, selectedIdsFromOptions(options, spec.discipline), { defaultAll: true });
    for (const discipline of selected) printDisciplineRow(discipline);
    return;
  }

  const scopes = selectedScopes(options, { defaultScope: existsSync(path.join(PROJECT_STORE_ROOT, "disciplines")) ? "project" : "global" });
  const rows = await installedEntries(scopes);
  for (const row of rows) printDisciplineRow(row.discipline, `${row.scope}\t`);
}

async function commandFind(query, options) {
  const scopes = selectedScopes(options, { defaultScope: existsSync(path.join(PROJECT_STORE_ROOT, "disciplines")) ? "project" : "global" });
  const rows = await installedEntries(scopes);
  const needle = (query ?? "").toLowerCase();
  for (const row of rows) {
    const text = [
      row.discipline.id,
      row.discipline.name,
      row.discipline.description,
      ...(row.discipline.aliases ?? []),
      ...(row.discipline.includeSkills ?? []),
      ...(row.discipline.recommendedTools ?? []).map((tool) => `${tool.id} ${tool.kind} ${tool.purpose}`),
    ].join(" ").toLowerCase();
    if (!needle || text.includes(needle)) printDisciplineRow(row.discipline, `${row.scope}\t`);
  }
}

function bundleForSelected(task, selected: Discipline[]): ResolverBundle {
  const includeSkills = [...new Set(selected.flatMap((discipline) => discipline.includeSkills))];
  const includeSkillSet = new Set(includeSkills);
  return {
    decision: selected.length > 1 ? "compose" : "select",
    task: task || "Selected explicitly.",
    selectedDisciplines: selected.map((discipline, index) => ({
      id: discipline.id,
      role: index === 0 ? "primary" : "secondary",
      score: "explicit",
      minScore: "explicit",
      reason: "Selected explicitly.",
      filePath: discipline.filePath,
    })),
    activationMatches: selected.map((discipline) => ({
      disciplineId: discipline.id,
      pathPatterns: [],
      commandPatterns: [],
      promptSignals: ["explicit selection"],
    })),
    includeSkills,
    recommendedTools: selected.flatMap((discipline) => discipline.recommendedTools),
    softExcludeSkills: [...new Set(selected.flatMap((discipline) => discipline.softExcludeSkills))]
      .filter((skillId) => !includeSkillSet.has(skillId)),
    prompts: selected.map((discipline) => ({ disciplineId: discipline.id, body: discipline.body })),
    notes: [
      "Disciplines are advisory. Soft exclusions may be overridden by explicit user request or concrete evidence.",
      "Recommended tools are evidence sources, not automatic installation or execution instructions.",
    ],
    scores: [],
  };
}

async function commandUse(sourceArg, options) {
  if (!["prompt", "json"].includes(options.format)) throw new Error("--format must be prompt or json");
  const spec = parseSourceSpec(sourceArg);
  const sourceInfo = await resolveSource(spec.source);
  const disciplines = await loadDisciplinesFromSource(sourceInfo.root);
  const selection = selectedIdsFromOptions(options, spec.discipline);
  const selected = filterDisciplines(disciplines, selection, { defaultAll: false });

  const input = {
    task: options.task ?? "",
    repoSignals: { files: options.files.filter(Boolean) },
    commands: options.commands.filter(Boolean),
  };
  const bundle = selected.length > 0 ? bundleForSelected(options.task, selected) : createResolverBundle(input, disciplines);

  if (options.format === "json") {
    console.log(JSON.stringify(bundle, null, 2));
    return;
  }
  console.log(formatPromptBundle(bundle));
}

async function commandAdd(sourceArg, options) {
  const spec = parseSourceSpec(sourceArg);
  const sourceInfo = await resolveSource(spec.source);
  const disciplines = await loadDisciplinesFromSource(sourceInfo.root);
  const selection = selectedIdsFromOptions(options, spec.discipline);
  const selected = filterDisciplines(disciplines, selection, { defaultAll: true });

  if (options.list) {
    for (const discipline of selected) printDisciplineRow(discipline);
    return;
  }

  const scopes = selectedScopes(options, { defaultScope: "project" });
  for (const scope of scopes) {
    for (const discipline of selected) {
      await installDisciplinePackage(discipline, spec.source, sourceInfo, scope, options);
    }
    await installAgentGlue(CLI_ROOT, scope, options);
  }
}

async function readInstallConfig(configPath) {
  const source = JSON.parse(await readFile(configPath, "utf8"));
  const parsed = installConfigSchema.safeParse(source);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const issuePath = issue.path.length > 0 ? issue.path.join(".") : "config";
    throw new Error(`${configPath}: invalid config at ${issuePath}: ${issue.message}`);
  }
  return parsed.data;
}

function entryDisciplines(entry) {
  const ids = [
    ...asArray(entry.discipline),
    ...(entry.disciplines ?? []),
  ];
  return [...new Set(ids)];
}

async function commandInstall(options) {
  const configPath = path.resolve(projectRoot(), options.config ?? CONFIG_FILE);
  const config = await readInstallConfig(configPath);

  for (const entry of config.disciplines) {
    await commandAdd(entry.source, {
      ...options,
      disciplines: entryDisciplines(entry),
      agents: entry.agents ?? options.agents,
      all: Boolean(entry.all),
      copy: entry.copy ?? options.copy,
      list: false,
    });
  }
}

async function commandRemove(args, options) {
  const ids = selectedIdsFromOptions({ ...options, disciplines: [...options.disciplines, ...args] });
  if (ids !== "*" && ids.length === 0) throw new Error("remove requires discipline ids or --all");
  const scopes = selectedScopes(options, { defaultScope: existsSync(path.join(PROJECT_STORE_ROOT, "disciplines")) ? "project" : "global" });

  for (const scope of scopes) {
    const storeRoot = storeRootForScope(scope);
    const manifest = await readManifest(storeRoot);
    const existingIds = existsSync(disciplineDir(storeRoot))
      ? (await loadDisciplines(storeRoot)).map((discipline) => discipline.id)
      : [];
    const removeIds = ids === "*" ? existingIds : ids;
    for (const id of removeIds) {
      const target = path.join(disciplineDir(storeRoot), id);
      if (!existsSync(target)) {
        console.log(`missing ${scope}\t${id}`);
        continue;
      }
      if (!(await confirmOverwrite(target, options))) {
        console.log(`skip ${target}`);
        continue;
      }
      await rm(target, { recursive: true, force: true });
      delete manifest.disciplines[id];
      console.log(`remove ${scope}\t${id}`);
    }
    await writeManifest(storeRoot, manifest);
  }
}

async function updateGitSource(sourceRoot) {
  if (!existsSync(path.join(sourceRoot, ".git"))) return;
  await execFileAsync("git", ["-C", sourceRoot, "pull", "--ff-only"]);
}

async function gitOutput(args) {
  const { stdout } = await execFileAsync("git", args);
  return stdout.trim();
}

async function gitRevision(sourceRoot, ref = "HEAD") {
  if (!existsSync(path.join(sourceRoot, ".git"))) return null;
  try {
    return await gitOutput(["-C", sourceRoot, "rev-parse", ref]);
  } catch {
    return null;
  }
}

async function fetchGitSource(sourceRoot) {
  if (!existsSync(path.join(sourceRoot, ".git"))) return false;
  try {
    await execFileAsync("git", ["-C", sourceRoot, "fetch", "--quiet"]);
    return true;
  } catch {
    return false;
  }
}

async function latestGitRevision(sourceRoot) {
  const upstream = await gitRevision(sourceRoot, "@{u}");
  return upstream ?? await gitRevision(sourceRoot);
}

function shortRevision(revision) {
  return revision ? revision.slice(0, 7) : "unknown";
}

async function commandUpdate(args, options) {
  const requested = selectedIdsFromOptions({ ...options, disciplines: [...options.disciplines, ...args] });
  const scopes = selectedScopes(options, { defaultScope: existsSync(path.join(PROJECT_STORE_ROOT, "disciplines")) ? "project" : "global" });
  const updatedSources = new Set();

  for (const scope of scopes) {
    const storeRoot = storeRootForScope(scope);
    const manifest = await readManifest(storeRoot);
    const ids = requested === "*" ? Object.keys(manifest.disciplines) : requested.length > 0 ? requested : Object.keys(manifest.disciplines);
    for (const id of ids) {
      const entry = manifest.disciplines[id];
      if (!entry) {
        console.log(`missing ${scope}\t${id}`);
        continue;
      }
      if (!updatedSources.has(entry.sourceRoot)) {
        await updateGitSource(entry.sourceRoot);
        updatedSources.add(entry.sourceRoot);
      }
      entry.sourceRev = await gitRevision(entry.sourceRoot);
      entry.updatedAt = new Date().toISOString();
      if (entry.mode === "copy") {
        await copyDirectory(path.join(entry.sourceRoot, entry.sourcePath), path.join(disciplineDir(storeRoot), id));
        console.log(`update ${scope}\t${id}`);
      } else {
        const target = path.join(disciplineDir(storeRoot), id);
        try {
          const stat = await lstat(target);
          if (stat.isSymbolicLink()) {
            const current = await readlink(target);
            if (path.resolve(path.dirname(target), current) !== path.join(entry.sourceRoot, entry.sourcePath)) {
              await linkDirectory(path.join(entry.sourceRoot, entry.sourcePath), target);
            }
          }
        } catch {
          await linkDirectory(path.join(entry.sourceRoot, entry.sourcePath), target);
        }
        console.log(`update ${scope}\t${id}`);
      }
    }
    await writeManifest(storeRoot, manifest);
  }
}

async function commandCheck(args, options) {
  const requested = selectedIdsFromOptions({ ...options, disciplines: [...options.disciplines, ...args] });
  const scopes = options.global || options.project
    ? selectedScopes(options, { defaultScope: "project" })
    : ["project", "global"];
  let checked = 0;
  let updates = 0;
  let warnings = 0;

  for (const scope of scopes) {
    const storeRoot = storeRootForScope(scope);
    const manifest = await readManifest(storeRoot);
    const manifestIds = Object.keys(manifest.disciplines);
    const ids = requested === "*" ? manifestIds : requested.length > 0 ? requested : manifestIds;

    if (ids.length === 0) {
      console.log(`WARN\t${scope}\tno installed disciplines`);
      warnings += 1;
      continue;
    }

    for (const id of ids) {
      const entry = manifest.disciplines[id];
      if (!entry) {
        console.log(`WARN\t${scope}\t${id}\tmissing manifest entry`);
        warnings += 1;
        continue;
      }

      checked += 1;

      const installedPath = path.join(disciplineDir(storeRoot), id);
      if (!existsSync(installedPath)) {
        console.log(`WARN\t${scope}\t${id}\tinstalled package missing`);
        warnings += 1;
        continue;
      }

      if (!entry.sourceRoot || !existsSync(entry.sourceRoot)) {
        console.log(`WARN\t${scope}\t${id}\tsource missing`);
        warnings += 1;
        continue;
      }

      if (!existsSync(path.join(entry.sourceRoot, ".git"))) {
        console.log(`OK\t${scope}\t${id}\tlocal source`);
        continue;
      }

      await fetchGitSource(entry.sourceRoot);
      const latestRev = await latestGitRevision(entry.sourceRoot);
      if (!latestRev) {
        console.log(`WARN\t${scope}\t${id}\tunable to read latest git revision`);
        warnings += 1;
        continue;
      }

      if (!entry.sourceRev) {
        console.log(`WARN\t${scope}\t${id}\tno recorded revision; run disciplines update ${id}`);
        warnings += 1;
        continue;
      }

      if (entry.sourceRev !== latestRev) {
        updates += 1;
        console.log(`UPDATE\t${scope}\t${id}\t${shortRevision(entry.sourceRev)} -> ${shortRevision(latestRev)}`);
        continue;
      }

      console.log(`OK\t${scope}\t${id}\tup to date`);
    }
  }

  if (updates > 0) {
    console.log(`check\t${updates} update(s) available; run disciplines update`);
    return;
  }

  console.log(`check\t${checked} discipline(s) checked${warnings ? `; ${warnings} warning(s)` : "; all up to date"}`);
}

function disciplineIdFromName(name) {
  const id = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+$/g, "");
  return id || "new-discipline";
}

async function commandInit(name) {
  const id = disciplineIdFromName(name ?? path.basename(process.cwd()));
  const targetDir = name ? path.resolve(process.cwd(), id) : process.cwd();
  const filePath = path.join(targetDir, "DISCIPLINE.md");
  if (existsSync(filePath)) throw new Error(`${filePath} already exists`);
  const template = await readFile(path.join(CLI_ROOT, "templates", "discipline", "DISCIPLINE.md"), "utf8");
  const title = id.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
  const content = template
    .replace("id: replace-me", `id: ${id}`)
    .replace("name: Replace Me", `name: ${title}`);
  await mkdir(targetDir, { recursive: true });
  await writeFile(filePath, content);
  console.log(`write ${filePath}`);
}

function doctorLine(status, label, detail = "") {
  console.log(`${status}\t${label}${detail ? `\t${detail}` : ""}`);
}

async function pathStatus(filePath) {
  try {
    const stat = await lstat(filePath);
    if (stat.isSymbolicLink()) {
      const target = await readlink(filePath);
      const absoluteTarget = path.resolve(path.dirname(filePath), target);
      return { exists: true, kind: existsSync(absoluteTarget) ? "symlink" : "broken-symlink", target };
    }
    if (stat.isDirectory()) return { exists: true, kind: "directory" };
    if (stat.isFile()) return { exists: true, kind: "file" };
    return { exists: true, kind: "other" };
  } catch {
    return { exists: false, kind: "missing" };
  }
}

async function checkStore(scope) {
  let failures = 0;
  let installedCount = 0;
  const storeRoot = storeRootForScope(scope);
  const root = disciplineDir(storeRoot);
  let manifest;

  try {
    manifest = await readManifest(storeRoot);
  } catch (error) {
    doctorLine("FAIL", `${scope} manifest`, error.message);
    return { failures: 1, installedCount };
  }

  if (!existsSync(root)) {
    doctorLine("WARN", `${scope} store`, `${root} not found`);
    return { failures, installedCount };
  }

  doctorLine("OK", `${scope} store`, root);

  let disciplines = [];
  try {
    disciplines = await loadDisciplines(storeRoot);
    installedCount = disciplines.length;
    doctorLine("OK", `${scope} disciplines`, `${installedCount} installed`);
  } catch (error) {
    failures += 1;
    doctorLine("FAIL", `${scope} disciplines`, error.message);
    return { failures, installedCount };
  }

  for (const discipline of disciplines) {
    const entry = manifest.disciplines[discipline.id];
    const target = path.join(root, discipline.id);
    const status = await pathStatus(target);
    if (!entry) {
      doctorLine("WARN", `${scope}:${discipline.id}`, "missing manifest entry");
    } else if (status.kind === "broken-symlink") {
      failures += 1;
      doctorLine("FAIL", `${scope}:${discipline.id}`, `broken symlink -> ${status.target}`);
    } else {
      doctorLine("OK", `${scope}:${discipline.id}`, `${entry.mode ?? status.kind}`);
    }
  }

  const installedIds = new Set(disciplines.map((discipline) => discipline.id));
  for (const id of Object.keys(manifest.disciplines)) {
    if (!installedIds.has(id)) {
      doctorLine("WARN", `${scope}:${id}`, "manifest entry has no installed package");
    }
  }

  try {
    const bundle = createResolverBundle({
      task: "Check installed discipline resolver health.",
      repoSignals: { files: [] },
      commands: [],
    }, disciplines);
    doctorLine("OK", `${scope} resolver`, bundle.decision);
  } catch (error) {
    failures += 1;
    doctorLine("FAIL", `${scope} resolver`, error.message);
  }

  return { failures, installedCount };
}

async function checkFile(label, filePath, { warnIfMissing = true } = {}) {
  const status = await pathStatus(filePath);
  if (status.exists) {
    doctorLine("OK", label, filePath);
    return 0;
  }
  if (warnIfMissing) doctorLine("WARN", label, `${filePath} not found`);
  return 0;
}

async function checkOldInstall(label, filePath) {
  const status = await pathStatus(filePath);
  if (status.exists) doctorLine("WARN", label, `old agent-degrees file found at ${filePath}`);
}

async function commandDoctor(options) {
  let failures = 0;
  let installedCount = 0;
  const scopes = options.global || options.project
    ? selectedScopes(options, { defaultScope: "project" })
    : ["project", "global"];

  for (const scope of scopes) {
    const result = await checkStore(scope);
    failures += result.failures;
    installedCount += result.installedCount;
  }

  await checkFile("project AGENTS.md", path.join(projectRoot(), "AGENTS.md"), { warnIfMissing: false });
  await checkFile("project CLAUDE.md", path.join(projectRoot(), "CLAUDE.md"), { warnIfMissing: false });
  await checkFile("project /discipline", path.join(projectRoot(), ".claude", "commands", "discipline.md"), { warnIfMissing: false });
  await checkFile("project Cursor rule", path.join(projectRoot(), ".cursor", "rules", "agent-disciplines.mdc"), { warnIfMissing: false });
  await checkFile("global Claude skill", path.join(os.homedir(), ".claude", "skills", "agent-disciplines", "SKILL.md"), { warnIfMissing: false });
  await checkFile("global /discipline", path.join(os.homedir(), ".claude", "commands", "discipline.md"), { warnIfMissing: false });
  await checkFile("global Codex skill", path.join(os.homedir(), ".codex", "skills", "agent-disciplines", "SKILL.md"), { warnIfMissing: false });
  await checkFile("global Cursor rule", path.join(os.homedir(), ".cursor", "rules", "agent-disciplines.mdc"), { warnIfMissing: false });

  await checkOldInstall("old Claude /degree", path.join(os.homedir(), ".claude", "commands", "degree.md"));
  await checkOldInstall("old Claude skill", path.join(os.homedir(), ".claude", "skills", "agent-degrees", "SKILL.md"));
  await checkOldInstall("old Codex skill", path.join(os.homedir(), ".codex", "skills", "agent-degrees", "SKILL.md"));
  await checkOldInstall("old agents skill", path.join(os.homedir(), ".agents", "skills", "agent-degrees", "SKILL.md"));
  await checkOldInstall("old project /degree", path.join(projectRoot(), ".claude", "commands", "degree.md"));
  await checkOldInstall("old project Cursor rule", path.join(projectRoot(), ".cursor", "rules", "agent-degrees.mdc"));

  if (installedCount === 0) {
    doctorLine("WARN", "installed disciplines", "none found; run `npx disciplines add tomcerdeira/disciplines --all`");
  }

  if (failures > 0) {
    doctorLine("FAIL", "doctor", `${failures} failure(s)`);
    process.exit(1);
  }

  doctorLine("OK", "doctor", "no blocking issues found");
}

function cleanupTargetsForScope(scope, { includeCurrent = false } = {}) {
  const targets = [];

  if (scope === "global") {
    targets.push(
      { label: "old Claude /degree", path: path.join(os.homedir(), ".claude", "commands", "degree.md") },
      { label: "old Claude skill", path: path.join(os.homedir(), ".claude", "skills", "agent-degrees") },
      { label: "old Claude alias skill", path: path.join(os.homedir(), ".claude", "skills", "degree") },
      { label: "old Codex skill", path: path.join(os.homedir(), ".codex", "skills", "agent-degrees") },
      { label: "old agents skill", path: path.join(os.homedir(), ".agents", "skills", "agent-degrees") },
      { label: "old Cursor rule", path: path.join(os.homedir(), ".cursor", "rules", "agent-degrees.mdc") },
    );

    if (includeCurrent) {
      targets.push(
        { label: "global discipline store", path: disciplineDir(GLOBAL_STORE_ROOT) },
        { label: "global discipline manifest", path: manifestPath(GLOBAL_STORE_ROOT) },
        { label: "global source cache", path: SOURCE_STORE_DIR },
        { label: "global Claude discipline skill", path: path.join(os.homedir(), ".claude", "skills", "agent-disciplines") },
        { label: "global Claude /discipline", path: path.join(os.homedir(), ".claude", "commands", "discipline.md") },
        { label: "global Codex discipline skill", path: path.join(os.homedir(), ".codex", "skills", "agent-disciplines") },
        { label: "global agents discipline skill", path: path.join(os.homedir(), ".agents", "skills", "agent-disciplines") },
        { label: "global Cursor discipline rule", path: path.join(os.homedir(), ".cursor", "rules", "agent-disciplines.mdc") },
      );
    }
  }

  if (scope === "project") {
    targets.push(
      { label: "old project /degree", path: path.join(projectRoot(), ".claude", "commands", "degree.md") },
      { label: "old project Cursor rule", path: path.join(projectRoot(), ".cursor", "rules", "agent-degrees.mdc") },
    );

    if (includeCurrent) {
      targets.push(
        { label: "project discipline store", path: disciplineDir(PROJECT_STORE_ROOT) },
        { label: "project discipline manifest", path: manifestPath(PROJECT_STORE_ROOT) },
        { label: "project /discipline", path: path.join(projectRoot(), ".claude", "commands", "discipline.md") },
        { label: "project Cursor discipline rule", path: path.join(projectRoot(), ".cursor", "rules", "agent-disciplines.mdc") },
      );
    }
  }

  return targets;
}

async function removeTarget(target, options) {
  if (!existsSync(target.path)) {
    console.log(`missing\t${target.label}\t${target.path}`);
    return false;
  }
  if (!(await confirmOverwrite(target.path, options))) {
    console.log(`skip\t${target.label}\t${target.path}`);
    return false;
  }
  await rm(target.path, { recursive: true, force: true });
  console.log(`remove\t${target.label}\t${target.path}`);
  return true;
}

async function commandCleanup(options) {
  const scopes = options.global || options.project
    ? selectedScopes(options, { defaultScope: "project" })
    : ["project", "global"];
  const targets = scopes.flatMap((scope) => cleanupTargetsForScope(scope, {
    includeCurrent: options.cleanDisciplines || options.all,
  }));
  let removed = 0;

  for (const target of targets) {
    if (await removeTarget(target, options)) removed += 1;
  }

  console.log(`cleanup\tremoved ${removed} item(s)`);
}

async function packageVersion() {
  const packageJson = JSON.parse(await readFile(path.join(CLI_ROOT, "package.json"), "utf8"));
  return packageJson.version;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.flat() : [value];
}

function normalizedOptions(raw, positional = []) {
  const options = typeof raw?.opts === "function" ? raw.opts() : raw;
  return {
    _: positional,
    files: asArray(options.file),
    commands: asArray(options.command),
    agents: asArray(options.agent),
    disciplines: asArray(options.discipline),
    format: options.format ?? "prompt",
    task: options.task,
    global: Boolean(options.global),
    project: Boolean(options.project),
    copy: Boolean(options.copy),
    yes: Boolean(options.yes),
    list: Boolean(options.list),
    all: Boolean(options.all),
    config: options.config,
    cleanDisciplines: Boolean(options.disciplines),
  };
}

function addScopeOptions(command) {
  return command
    .option("-g, --global", "Use the global discipline store")
    .option("-p, --project", "Use the current project discipline store");
}

function addSelectionOptions(command) {
  return command
    .option("-d, --discipline <ids...>", "Select discipline ids; use '*' for all")
    .option("--all", "Select every discipline");
}

async function main() {
  const program = new Command();

  program
    .name("disciplines")
    .description("Install, resolve, and manage portable agent discipline packages.")
    .version(await packageVersion(), "-v, --version")
    .showHelpAfterError()
    .addHelpText("after", `
Sources:
  tomcerdeira/disciplines
  https://github.com/tomcerdeira/disciplines
  https://github.com/tomcerdeira/disciplines/tree/main/disciplines/frontend-engineer
  https://gitlab.com/org/repo
  https://gitlab.com/org/repo/-/tree/main/disciplines/frontend-engineer
  git@github.com:tomcerdeira/disciplines.git
  ./local-disciplines

Examples:
  disciplines add tomcerdeira/disciplines --discipline frontend-engineer
  disciplines add tomcerdeira/disciplines --all --agent '*' --global --yes
  disciplines use tomcerdeira/disciplines@frontend-engineer
  disciplines use installed --task "Fix keyboard navigation" --file src/components/SearchResults.tsx
  disciplines check
  disciplines doctor
`);

  addScopeOptions(addSelectionOptions(program.command("add <source>")
    .description("Install disciplines from a source")
    .option("-a, --agent <agents...>", "Install agent glue for agents; use '*' for all")
    .option("--copy", "Copy packages instead of symlinking")
    .option("-y, --yes", "Skip confirmation prompts")
    .option("-l, --list", "List available disciplines without installing")))
    .action((source, raw) => commandAdd(source, normalizedOptions(raw)));

  addScopeOptions(program.command("install")
    .description("Install disciplines from a disciplines.json config")
    .option("-c, --config <path>", "Config file path", CONFIG_FILE)
    .option("-a, --agent <agents...>", "Override agent glue targets; use '*' for all")
    .option("--copy", "Copy packages instead of symlinking")
    .option("-y, --yes", "Skip confirmation prompts"))
    .action((raw) => commandInstall(normalizedOptions(raw)));

  addSelectionOptions(program.command("use <source>")
    .description("Resolve a task with a source or installed disciplines")
    .option("--task <text>", "Task text to resolve")
    .option("--file <paths...>", "Relevant file paths")
    .option("--command <commands...>", "Relevant verification or workflow commands")
    .option("--format <format>", "Output format: prompt or json", "prompt"))
    .action((source, raw) => commandUse(source, normalizedOptions(raw)));

  addScopeOptions(program.command("list [source]")
    .alias("ls")
    .description("List installed disciplines or inspect a source"))
    .option("-d, --discipline <ids...>", "Filter source disciplines by id")
    .action((source, raw) => commandList(source, normalizedOptions(raw)));

  addScopeOptions(program.command("find [query]")
    .description("Search installed disciplines"))
    .action((query, raw) => commandFind(query, normalizedOptions(raw)));

  addScopeOptions(addSelectionOptions(program.command("check [ids...]")
    .description("Check installed disciplines for source updates")))
    .action((ids, raw) => commandCheck(ids, normalizedOptions(raw, ids)));

  addScopeOptions(addSelectionOptions(program.command("remove [ids...]")
    .alias("rm")
    .description("Remove installed disciplines")
    .option("-y, --yes", "Skip confirmation prompts")))
    .action((ids, raw) => commandRemove(ids, normalizedOptions(raw, ids)));

  addScopeOptions(addSelectionOptions(program.command("update [ids...]")
    .description("Update installed disciplines from their sources")
    .option("-y, --yes", "Skip confirmation prompts")))
    .action((ids, raw) => commandUpdate(ids, normalizedOptions(raw, ids)));

  program.command("init [name]")
    .description("Create a new DISCIPLINE.md template")
    .action((name) => commandInit(name));

  addScopeOptions(program.command("doctor")
    .description("Inspect installed stores, resolver health, and agent glue"))
    .action((raw) => commandDoctor(normalizedOptions(raw)));

  addScopeOptions(program.command("cleanup")
    .description("Remove old agent-degrees files or current discipline installs")
    .option("--disciplines", "Also remove current discipline stores and agent glue")
    .option("--all", "Alias for --disciplines")
    .option("-y, --yes", "Skip confirmation prompts"))
    .action((raw) => commandCleanup(normalizedOptions(raw)));

  program.command("version")
    .description("Print the package version")
    .action(async () => console.log(await packageVersion()));

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
