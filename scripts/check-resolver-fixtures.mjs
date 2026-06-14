#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  loadDegrees,
  resolveDegrees,
  stripJsonComments,
} from "./lib/degree-resolver.mjs";

const root = process.cwd();
const resolverCasesPath = path.join(root, "fixtures", "resolver-cases.jsonc");

async function loadCases() {
  const source = await readFile(resolverCasesPath, "utf8");
  return JSON.parse(stripJsonComments(source));
}

function expectedDegreesMatch(actual, expected) {
  return (
    actual.decision === expected.decision &&
    actual.primaryDegree === expected.primaryDegree &&
    actual.secondaryDegree === expected.secondaryDegree
  );
}

function formatTopScores(scored) {
  return scored
    .slice(0, 3)
    .map((result) => `${result.degreeId}:${result.score}`)
    .join(", ");
}

async function main() {
  const degrees = await loadDegrees(root);
  const cases = await loadCases();
  const failures = [];

  for (const testCase of cases) {
    const actual = resolveDegrees(testCase, degrees);
    const pass = expectedDegreesMatch(actual, testCase.expected);

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
    console.error(`  expected: ${testCase.expected.decision} ${testCase.expected.primaryDegree ?? "-"} ${testCase.expected.secondaryDegree ?? "-"}`);
    console.error(`  actual:   ${actual.decision} ${actual.primaryDegree ?? "-"} ${actual.secondaryDegree ?? "-"}`);
    console.error(`  scores:   ${formatTopScores(actual.scored)}`);
  }

  if (failures.length > 0) {
    console.error(`\nResolver fixture check failed (${failures.length}/${cases.length}).`);
    process.exit(1);
  }

  console.log(`Resolver fixture check passed (${cases.length} cases).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
