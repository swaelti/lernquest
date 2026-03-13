import type { ChallengeData } from "./content-loader.js";

export interface ValidationResult {
  passed: boolean;
  score: number;
  maxScore: number;
  checks: CheckResult[];
}

export interface CheckResult {
  id: string;
  passed: boolean;
  points: number;
  hint?: string;
}

/**
 * Validate a student's submission against challenge checks.
 */
export function validateSubmission(
  challenge: ChallengeData,
  answer: unknown
): ValidationResult {
  switch (challenge.type) {
    case "multiple-choice":
      return validateMultipleChoice(challenge, answer);
    case "fix-the-code":
    case "free-code":
      return validateCode(challenge, answer as string);
    case "drag-drop":
      return validateDragDrop(challenge, answer);
    case "peer-review":
      return validatePeerReview(challenge, answer);
    case "scenario":
      return validateScenario(challenge, answer);
    default:
      return { passed: false, score: 0, maxScore: 100, checks: [] };
  }
}

function validateMultipleChoice(
  challenge: ChallengeData,
  answer: unknown
): ValidationResult {
  const config = challenge.config as any;
  const selected = Array.isArray(answer) ? answer : [answer];
  const options = config.options || [];

  const correctIds = options
    .filter((o: any) => o.correct)
    .map((o: any) => o.id);
  const isCorrect =
    selected.length === correctIds.length &&
    selected.every((id: string) => correctIds.includes(id));

  // Feedback for each option
  const checks = options.map((o: any) => ({
    id: o.id,
    passed: o.correct ? selected.includes(o.id) : !selected.includes(o.id),
    points: o.correct ? Math.floor(100 / correctIds.length) : 0,
    hint: selected.includes(o.id) || o.correct ? o.feedback : undefined,
  }));

  return {
    passed: isCorrect,
    score: isCorrect ? 100 : 0,
    maxScore: 100,
    checks,
  };
}

function validateCode(
  challenge: ChallengeData,
  answer: string
): ValidationResult {
  const config = challenge.config as any;
  const checks: CheckResult[] = [];
  let totalPoints = 0;
  let earnedPoints = 0;

  for (const check of config.checks || []) {
    const points = check.points || 10;
    totalPoints += points;
    let passed = false;

    switch (check.type) {
      case "regex": {
        const flags = check.flags || "";
        const regex = new RegExp(check.pattern, flags);
        passed = regex.test(answer);
        break;
      }
      case "content-match":
        passed = answer.includes(check.pattern);
        break;
      case "not-contains":
        passed = !answer.includes(check.pattern);
        break;
      case "yaml-path-exists": {
        // Simple check: does the YAML string contain the path keys
        const parts = check.path.split(".");
        passed = parts.every((p: string) => answer.includes(p));
        break;
      }
      case "line-count": {
        const lines = answer.split("\n").filter((l: string) => l.trim()).length;
        passed =
          (!check.min || lines >= check.min) &&
          (!check.max || lines <= check.max);
        break;
      }
      default:
        passed = false;
    }

    if (passed) earnedPoints += points;

    checks.push({
      id: check.id,
      passed,
      points: passed ? points : 0,
      hint: passed ? undefined : check.hint,
    });
  }

  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

  return {
    passed: checks.every((c) => c.passed),
    score,
    maxScore: 100,
    checks,
  };
}

function validateDragDrop(
  challenge: ChallengeData,
  answer: unknown
): ValidationResult {
  const config = challenge.config as any;
  const checks: CheckResult[] = [];
  const items = config.items || [];
  const userAnswer = answer as Record<string, number | string>;

  if (config.mode === "sort") {
    // Answer is an ordered array of item IDs
    const ordered = answer as string[];
    let correct = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const passed = ordered[i] === item.id;
      if (passed) correct++;
      checks.push({
        id: item.id,
        passed,
        points: passed ? Math.floor(100 / items.length) : 0,
      });
    }
    const score = Math.round((correct / items.length) * 100);
    return { passed: correct === items.length, score, maxScore: 100, checks };
  }

  if (config.mode === "categorize" || config.mode === "match") {
    // Answer is { itemId: categoryId }
    let correct = 0;
    for (const item of items) {
      const passed = userAnswer[item.id] === item.correct_category;
      if (passed) correct++;
      checks.push({
        id: item.id,
        passed,
        points: passed ? Math.floor(100 / items.length) : 0,
      });
    }
    const score = Math.round((correct / items.length) * 100);
    return { passed: correct === items.length, score, maxScore: 100, checks };
  }

  return { passed: false, score: 0, maxScore: 100, checks };
}

function validatePeerReview(
  challenge: ChallengeData,
  answer: unknown
): ValidationResult {
  const config = challenge.config as any;
  const checklist = config.checklist || [];
  const responses = answer as Record<string, boolean>;
  const checks: CheckResult[] = [];
  let correct = 0;

  for (const item of checklist) {
    const passed = responses[item.id] === item.expected;
    if (passed) correct++;
    checks.push({
      id: item.id,
      passed,
      points: passed ? Math.floor(100 / checklist.length) : 0,
      hint: passed ? undefined : item.explanation,
    });
  }

  const score = Math.round((correct / checklist.length) * 100);
  return { passed: score >= 80, score, maxScore: 100, checks };
}

function validateScenario(
  challenge: ChallengeData,
  answer: unknown
): ValidationResult {
  // Scenarios track total points across steps
  const choices = answer as Array<{ stepId: string; optionId: string }>;
  const config = challenge.config as any;
  const steps = config.steps || [];
  let totalPoints = 0;
  let maxPoints = 0;
  const checks: CheckResult[] = [];

  for (const choice of choices) {
    const step = steps.find((s: any) => s.id === choice.stepId);
    if (!step) continue;

    const option = step.options.find((o: any) => o.id === choice.optionId);
    if (!option) continue;

    const bestPoints = Math.max(...step.options.map((o: any) => o.points || 0));
    maxPoints += bestPoints;
    totalPoints += option.points || 0;

    checks.push({
      id: choice.stepId,
      passed: option.points >= bestPoints * 0.7,
      points: option.points || 0,
      hint: option.feedback,
    });
  }

  const score = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
  return { passed: score >= 60, score, maxScore: 100, checks };
}
