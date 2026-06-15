#!/usr/bin/env node

import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const cli = path.join(root, "dist", "disciplines.js");

async function run(args, options: any = {}) {
  return execFileAsync("node", [cli, ...args], {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
  });
}

async function runFailure(args, options: any = {}) {
  try {
    await run(args, options);
  } catch (error) {
    return error;
  }
  throw new Error(`Expected command to fail: ${args.join(" ")}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), "disciplines-project-"));

  await run(["add", root, "--discipline", "frontend-engineer", "--project", "--yes"], { cwd: projectDir });
  assert(!existsSync(path.join(projectDir, "AGENTS.md")), "add wrote Codex glue without --agent");
  assert(!existsSync(path.join(projectDir, "CLAUDE.md")), "add wrote Claude glue without --agent");

  await run(["add", root, "--discipline", "frontend-engineer", "--project", "--agent", "codex", "--yes"], { cwd: projectDir });
  assert(existsSync(path.join(projectDir, "AGENTS.md")), "add --agent codex did not write Codex glue");

  const projectList = await run(["list", "--project"], { cwd: projectDir });
  assert(projectList.stdout.includes("project\tfrontend-engineer"), "project list did not include frontend-engineer");

  const projectFind = await run(["find", "react", "--project"], { cwd: projectDir });
  assert(projectFind.stdout.includes("frontend-engineer"), "project find did not include frontend-engineer");

  const projectUse = await run(["use", "installed", "--task", "Fix keyboard navigation", "--file", "src/components/SearchResults.tsx"], { cwd: projectDir });
  assert(projectUse.stdout.includes("Selected disciplines:"), "use installed did not print resolver bundle");
  assert(projectUse.stdout.includes("frontend-engineer"), "use installed did not select frontend-engineer");

  const projectDoctor = await run(["doctor", "--project"], { cwd: projectDir });
  assert(projectDoctor.stdout.includes("OK\tdoctor"), "project doctor did not pass");

  const projectCheck = await run(["check", "--project"], { cwd: projectDir });
  assert(projectCheck.stdout.includes("project\tfrontend-engineer"), "project check did not include frontend-engineer");
  assert(projectCheck.stdout.includes("check\t"), "project check did not print summary");

  await mkdir(path.join(projectDir, ".claude", "commands"), { recursive: true });
  await mkdir(path.join(projectDir, ".cursor", "rules"), { recursive: true });
  await writeFile(path.join(projectDir, ".claude", "commands", "degree.md"), "old");
  await writeFile(path.join(projectDir, ".cursor", "rules", "agent-degrees.mdc"), "old");
  const projectCleanup = await run(["cleanup", "--project", "--yes"], { cwd: projectDir });
  assert(projectCleanup.stdout.includes("remove\told project /degree"), "cleanup did not remove old project /degree");
  assert(!existsSync(path.join(projectDir, ".claude", "commands", "degree.md")), "old project /degree still exists");

  await run(["remove", "frontend-engineer", "--project", "--yes"], { cwd: projectDir });
  const projectListAfterRemove = await run(["list", "--project"], { cwd: projectDir });
  assert(!projectListAfterRemove.stdout.includes("frontend-engineer"), "remove did not delete frontend-engineer");

  await writeFile(path.join(projectDir, ".agents", ".disciplines-manifest.json"), JSON.stringify({
    version: 1,
    disciplines: {
      ghost: {
        id: "ghost",
        source: root,
        sourceRoot: root,
        sourcePath: "disciplines/frontend-engineer",
        mode: "copy",
      },
    },
  }, null, 2));
  const staleManifestDoctor = await run(["doctor", "--project"], { cwd: projectDir });
  assert(staleManifestDoctor.stdout.includes("WARN\tproject:ghost\tmanifest entry has no installed package"), "doctor did not warn about stale manifest entry");

  await writeFile(path.join(projectDir, ".agents", ".disciplines-manifest.json"), JSON.stringify({
    version: 1,
    disciplines: {
      ghost: {
        id: 123,
      },
    },
  }, null, 2));
  const invalidManifestDoctor: any = await runFailure(["doctor", "--project"], { cwd: projectDir });
  assert(invalidManifestDoctor.stdout.includes("FAIL\tproject manifest"), "doctor did not fail invalid manifest");

  const installDir = await mkdtemp(path.join(os.tmpdir(), "disciplines-install-"));
  await writeFile(path.join(installDir, "disciplines.json"), JSON.stringify({
    version: 1,
    disciplines: [
      {
        source: root,
        discipline: "frontend-engineer",
      },
    ],
  }, null, 2));
  await run(["install", "--project", "--yes"], { cwd: installDir });
  const installedFromConfig = await run(["list", "--project"], { cwd: installDir });
  assert(installedFromConfig.stdout.includes("project\tfrontend-engineer"), "install did not restore discipline from config");

  const globalHome = await mkdtemp(path.join(os.tmpdir(), "disciplines-home-"));
  await run(["add", root, "--discipline", "backend-engineer", "--global", "--copy", "--yes"], {
    env: { HOME: globalHome },
  });
  const globalList = await run(["list", "--global"], { env: { HOME: globalHome } });
  assert(globalList.stdout.includes("global\tbackend-engineer"), "global list did not include backend-engineer");
  const globalUpdate = await run(["update", "backend-engineer", "--global"], { env: { HOME: globalHome } });
  assert(globalUpdate.stdout.includes("update global\tbackend-engineer"), "global update did not update backend-engineer");
  const globalDoctor = await run(["doctor", "--global"], { env: { HOME: globalHome } });
  assert(globalDoctor.stdout.includes("OK\tdoctor"), "global doctor did not pass");

  const globalCheck = await run(["check", "--global"], { env: { HOME: globalHome } });
  assert(globalCheck.stdout.includes("global\tbackend-engineer"), "global check did not include backend-engineer");
  assert(globalCheck.stdout.includes("check\t"), "global check did not print summary");

  await mkdir(path.join(globalHome, ".claude", "commands"), { recursive: true });
  await writeFile(path.join(globalHome, ".claude", "commands", "degree.md"), "old");
  const globalCleanup = await run(["cleanup", "--global", "--disciplines", "--yes"], { env: { HOME: globalHome } });
  assert(globalCleanup.stdout.includes("remove\told Claude /degree"), "cleanup did not remove old global /degree");
  assert(globalCleanup.stdout.includes("remove\tglobal discipline store"), "cleanup did not remove global discipline store");
  assert(!existsSync(path.join(globalHome, ".agent-disciplines", "disciplines")), "global discipline store still exists");

  const initDir = await mkdtemp(path.join(os.tmpdir(), "disciplines-init-"));
  await run(["init", "software-engineer"], { cwd: initDir });
  const initialized = path.join(initDir, "software-engineer", "DISCIPLINE.md");
  assert(existsSync(initialized), "init did not create DISCIPLINE.md");
  assert((await readFile(initialized, "utf8")).includes("id: software-engineer"), "init did not set id");

  const spacedInitDir = await mkdtemp(path.join(os.tmpdir(), "disciplines-init-spaced-"));
  await run(["init", "Software Engineer"], { cwd: spacedInitDir });
  const spacedInitialized = path.join(spacedInitDir, "software-engineer", "DISCIPLINE.md");
  assert(existsSync(spacedInitialized), "init did not slugify spaced name");
  assert((await readFile(spacedInitialized, "utf8")).includes("id: software-engineer"), "init did not slugify id");

  const explicitUse = await run(["use", `${root}@frontend-engineer`]);
  assert(explicitUse.stdout.includes("Selected explicitly."), "source@discipline did not select explicitly");

  console.log("CLI workflow check passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
