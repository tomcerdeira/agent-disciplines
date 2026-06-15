#!/usr/bin/env node

import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  loadDisciplines,
  resolveDisciplines,
  stripJsonComments,
} from "./lib/discipline-resolver.js";

const root = process.cwd();
const resolverCasesPath = path.join(root, "fixtures", "resolver-cases.jsonc");

async function loadCases() {
  const source = await readFile(resolverCasesPath, "utf8");
  return JSON.parse(stripJsonComments(source));
}

function expectedDisciplinesMatch(actual, expected) {
  return (
    actual.decision === expected.decision &&
    actual.primaryDiscipline === expected.primaryDiscipline &&
    actual.secondaryDiscipline === expected.secondaryDiscipline
  );
}

function formatTopScores(scored) {
  return scored
    .slice(0, 3)
    .map((result) => `${result.disciplineId}:${result.score}`)
    .join(", ");
}

async function assertInvalidFrontmatterFails() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "disciplines-invalid-"));
  const packageDir = path.join(tempRoot, "disciplines", "broken");
  await mkdir(packageDir, { recursive: true });
  await writeFile(path.join(packageDir, "DISCIPLINE.md"), `---
id: broken
name: Broken
version: 0.1.0
description: Missing required resolver fields.
---

This should fail before scoring.
`);

  try {
    await loadDisciplines(tempRoot);
  } catch (error) {
    if (String(error.message).includes("invalid frontmatter")) return;
    throw new Error(`invalid frontmatter fixture failed with unexpected error: ${error.message}`);
  }

  throw new Error("invalid frontmatter fixture did not fail");
}

async function main() {
  const disciplines = await loadDisciplines(root);
  const cases = await loadCases();
  const failures = [];

  for (const testCase of cases) {
    const actual = resolveDisciplines(testCase, disciplines);
    const pass = expectedDisciplinesMatch(actual, testCase.expected);

    if (pass) {
      console.log(`PASS ${testCase.name} -> ${actual.decision}`);
      continue;
    }

    failures.push({
      name: testCase.name,
      expected: testCase.expected,
      actual,
    });

    console.error(`FAIL ${testCase.name}`);
    console.error(`  expected: ${testCase.expected.decision} ${testCase.expected.primaryDiscipline ?? "-"} ${testCase.expected.secondaryDiscipline ?? "-"}`);
    console.error(`  actual:   ${actual.decision} ${actual.primaryDiscipline ?? "-"} ${actual.secondaryDiscipline ?? "-"}`);
    console.error(`  scores:   ${formatTopScores(actual.scored)}`);
  }

  if (failures.length > 0) {
    console.error(`\nResolver fixture check failed (${failures.length}/${cases.length}).`);
    process.exit(1);
  }

  console.log(`Resolver fixture check passed (${cases.length} cases).`);
  await assertInvalidFrontmatterFails();
  console.log("Resolver invalid frontmatter check passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
