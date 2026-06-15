#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();

const checks = [
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "validate"]],
  ["npm", ["run", "check:fixtures"]],
  ["npm", ["run", "check:cli"]],
  ["npm", ["run", "check:package"]],
  ["npm", ["publish", "--dry-run", "--access", "public"]],
];

async function run(label, command, args) {
  console.log(`\n> ${label}`);
  const child = execFileAsync(command, args, {
    cwd: root,
    maxBuffer: 1024 * 1024 * 20,
  });
  const { stdout, stderr } = await child;
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}

async function main() {
  for (const [command, args] of checks) {
    await run([command, ...args].join(" "), command, args);
  }

  console.log("\nRelease check passed.");
}

main().catch((error) => {
  if (error.stdout?.trim()) console.log(error.stdout.trim());
  if (error.stderr?.trim()) console.error(error.stderr.trim());
  console.error(error.message);
  process.exit(1);
});
