#!/usr/bin/env node

import process from "node:process";
import {
  createResolverBundle,
  formatPromptBundle,
  loadDegrees,
} from "./lib/degree-resolver.mjs";

function printUsage() {
  console.log(`Usage:
  npm run resolve -- --task "Fix keyboard navigation" [--file src/App.tsx] [--command "bun run test"]
  npm run resolve -- --format json --task "Analyze exports/activation.csv" --file exports/activation.csv

Options:
  --task <text>       Task text to resolve. Required.
  --file <path>       Repo signal path. Repeatable.
  --command <cmd>     Command signal. Repeatable.
  --format <format>   prompt or json. Default: prompt.
  --help              Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    files: [],
    commands: [],
    format: "prompt",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg === "--task") {
      if (!next || next.startsWith("--")) throw new Error("--task requires a value");
      args.task = next;
      index += 1;
      continue;
    }

    if (arg === "--file") {
      if (!next || next.startsWith("--")) throw new Error("--file requires a value");
      args.files.push(next);
      index += 1;
      continue;
    }

    if (arg === "--command") {
      if (!next || next.startsWith("--")) throw new Error("--command requires a value");
      args.commands.push(next);
      index += 1;
      continue;
    }

    if (arg === "--format") {
      if (!next || next.startsWith("--")) throw new Error("--format requires a value");
      args.format = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function validateArgs(args) {
  if (args.help) return;
  if (!args.task || args.task.trim() === "") {
    throw new Error("--task is required");
  }
  if (!["prompt", "json"].includes(args.format)) {
    throw new Error("--format must be prompt or json");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);

  if (args.help) {
    printUsage();
    return;
  }

  const input = {
    task: args.task,
    repoSignals: {
      files: args.files.filter(Boolean),
    },
    commands: args.commands.filter(Boolean),
  };
  const degrees = await loadDegrees(process.cwd());
  const bundle = createResolverBundle(input, degrees);

  if (args.format === "json") {
    console.log(JSON.stringify(bundle, null, 2));
    return;
  }

  console.log(formatPromptBundle(bundle));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
