import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export function stripJsonComments(source) {
  return source.replace(/^\s*\/\/.*$/gm, "");
}

export function splitDegreeFile(source, filePath) {
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

export async function loadDegrees(root) {
  const degreesDir = path.join(root, "degrees");
  const entries = await readdir(degreesDir, { withFileTypes: true });
  const packages = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const degrees = [];

  for (const packageName of packages) {
    const relativePath = path.join("degrees", packageName, "DEGREE.md");
    const absolutePath = path.join(degreesDir, packageName, "DEGREE.md");
    const source = await readFile(absolutePath, "utf8");
    const { frontmatter, body } = splitDegreeFile(source, relativePath);
    degrees.push({
      ...YAML.parse(frontmatter),
      packageId: packageName,
      filePath: relativePath,
      body,
    });
  }

  return degrees;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(pattern) {
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

function includesPhrase(text, phrase) {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

export function scoreDegree(input, degree) {
  const taskText = input.task ?? "";
  const files = input.repoSignals?.files ?? [];
  const commands = input.commands ?? [];
  const activation = degree.activation;
  const promptSignals = activation.promptSignals;
  const matches = {
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
    degreeId: degree.id,
    minScore: activation.minScore,
    score,
    matches,
  };
}

export function resolveDegrees(input, degrees) {
  const scored = degrees
    .map((degree) => scoreDegree(input, degree))
    .sort((a, b) => b.score - a.score || a.degreeId.localeCompare(b.degreeId));

  const eligible = scored.filter((result) => result.score >= result.minScore);
  if (eligible.length === 0) {
    const hasWeakSignal = scored.some((result) => result.score > 0);
    return {
      decision: hasWeakSignal ? "ask" : "none",
      primaryDegree: null,
      secondaryDegree: null,
      scored,
    };
  }

  const primary = eligible[0];
  const secondary = eligible[1];

  if (secondary && secondary.score >= secondary.minScore && secondary.score >= primary.score * 0.6) {
    return {
      decision: "compose",
      primaryDegree: primary.degreeId,
      secondaryDegree: secondary.degreeId,
      scored,
    };
  }

  return {
    decision: "select",
    primaryDegree: primary.degreeId,
    secondaryDegree: null,
    scored,
  };
}

function unique(values) {
  return [...new Set(values)];
}

function selectedDegreeEntries(resolution, degrees) {
  const byId = new Map(degrees.map((degree) => [degree.id, degree]));
  return [resolution.primaryDegree, resolution.secondaryDegree]
    .filter(Boolean)
    .map((degreeId) => byId.get(degreeId))
    .filter(Boolean);
}

function degreeReason(score) {
  const parts = [];
  if (score.matches.pathPatterns.length > 0) parts.push(`paths: ${score.matches.pathPatterns.join(", ")}`);
  if (score.matches.commandPatterns.length > 0) parts.push(`commands: ${score.matches.commandPatterns.join(", ")}`);
  if (score.matches.promptSignals.length > 0) parts.push(`prompt: ${score.matches.promptSignals.join(", ")}`);
  return parts.length > 0 ? parts.join("; ") : "No strong activation signals matched.";
}

export function createResolverBundle(input, degrees) {
  const resolution = resolveDegrees(input, degrees);
  const selectedDegrees = selectedDegreeEntries(resolution, degrees);
  const scoreByDegree = new Map(resolution.scored.map((score) => [score.degreeId, score]));
  const includeSkills = unique(selectedDegrees.flatMap((degree) => degree.includeSkills));
  const includeSkillSet = new Set(includeSkills);
  const softExcludeSkills = unique(selectedDegrees.flatMap((degree) => degree.softExcludeSkills))
    .filter((skillId) => !includeSkillSet.has(skillId));

  if (resolution.decision === "none") {
    return {
      decision: "none",
      task: input.task,
      selectedDegrees: [],
      activationMatches: [],
      includeSkills: [],
      recommendedTools: [],
      softExcludeSkills: [],
      reason: "No available degree reached the activation threshold.",
      scores: resolution.scored,
    };
  }

  if (resolution.decision === "ask") {
    return {
      decision: "ask",
      task: input.task,
      question: "Which degree should guide this task?",
      choices: resolution.scored.slice(0, 3).filter((score) => score.score > 0).map((score) => score.degreeId),
      reason: "Some activation signals matched, but no degree reached its activation threshold.",
      selectedDegrees: [],
      activationMatches: resolution.scored.slice(0, 3).map((score) => ({
        degreeId: score.degreeId,
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
    selectedDegrees: selectedDegrees.map((degree, index) => {
      const score = scoreByDegree.get(degree.id);
      return {
        id: degree.id,
        role: index === 0 ? "primary" : "secondary",
        score: score?.score ?? 0,
        minScore: score?.minScore ?? degree.activation.minScore,
        reason: score ? degreeReason(score) : "Selected by resolver.",
        filePath: degree.filePath,
      };
    }),
    activationMatches: selectedDegrees.map((degree) => ({
      degreeId: degree.id,
      ...(scoreByDegree.get(degree.id)?.matches ?? {
        pathPatterns: [],
        commandPatterns: [],
        promptSignals: [],
      }),
    })),
    includeSkills,
    recommendedTools: selectedDegrees.flatMap((degree) => degree.recommendedTools),
    softExcludeSkills,
    prompts: selectedDegrees.map((degree) => ({
      degreeId: degree.id,
      body: degree.body,
    })),
    notes: [
      "Degrees are advisory. Soft exclusions may be overridden by explicit user request or concrete evidence.",
      "Recommended tools are evidence sources, not automatic installation or execution instructions.",
    ],
    scores: resolution.scored,
  };
}

function formatList(values) {
  if (!values || values.length === 0) return "- none";
  return values.map((value) => `- ${value}`).join("\n");
}

function formatTools(tools) {
  if (!tools || tools.length === 0) return "- none";
  return tools
    .map((tool) => {
      const when = tool.when ? ` When: ${tool.when}` : "";
      return `- ${tool.id} (${tool.kind}): ${tool.purpose}${when}`;
    })
    .join("\n");
}

export function formatPromptBundle(bundle) {
  if (bundle.decision === "none") {
    return [
      "# Agent Degree Resolution",
      "",
      `Decision: none`,
      `Task: ${bundle.task}`,
      "",
      "No available degree matched strongly enough. Proceed without a degree or ask whether a new degree should be created.",
    ].join("\n");
  }

  if (bundle.decision === "ask") {
    return [
      "# Agent Degree Resolution",
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

  const selected = bundle.selectedDegrees
    .map((degree) => `- ${degree.id} (${degree.role}, score ${degree.score}/${degree.minScore}): ${degree.reason}`)
    .join("\n");
  const prompts = bundle.prompts
    .map((prompt) => [`## ${prompt.degreeId} Focus Prompt`, "", prompt.body].join("\n"))
    .join("\n\n");

  return [
    "# Agent Degree Resolution",
    "",
    `Decision: ${bundle.decision}`,
    `Task: ${bundle.task}`,
    "",
    "Selected degrees:",
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
