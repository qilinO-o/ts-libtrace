import { CallTriple } from "./types.js";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidIdentifier = (name: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

export function emitValueAsTsExpression(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => emitValueAsTsExpression(item)).join(", ")}]`;
  }
  if (value instanceof Date) {
    return `new Date(${JSON.stringify(value.toISOString())})`;
  }
  if (value instanceof Map) {
    return emitValueAsTsExpression(Array.from(value.entries()));
  }
  if (value instanceof Set) {
    return emitValueAsTsExpression(Array.from(value.values()));
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).map(([key, val]) => {
      const keyExpr = isValidIdentifier(key) ? key : JSON.stringify(key);
      return `${keyExpr}: ${emitValueAsTsExpression(val)}`;
    });
    return `{ ${entries.join(", ")} }`;
  }
  return JSON.stringify(String(value));
}

const extractFnInfo = (fnId: string): { className?: string; fnName?: string } => {
  const parts = fnId.split("#");
  return {
    className: parts[1] ?? undefined,
    fnName: parts[2] ?? undefined
  };
};

export function generateReplaySource(
  triple: CallTriple,
  options: { fnIdSafe: string; callIdSafe: string }
): string {
  const enter = triple.enter;
  const exit = triple.exit;
  const fnId = enter?.fnId;
  if (fnId === undefined) {
    throw Error("Error: replay with bad CallTriple");
  }
  
  const { className, fnName } = extractFnInfo(fnId);
  if (className === undefined || fnName === undefined) {
    throw Error("Error: replay with bad fnId");
  }

  const args = Array.isArray(enter?.args) ? enter?.args : enter?.args ? [enter.args] : [];
  const env = isPlainObject(enter?.env) ? (enter?.env as Record<string, unknown>) : {};
  const thisArg = enter?.thisArg ?? null;

  const lines: string[] = [];
  lines.push(`// fnId: ${fnId} callId: ${options.callIdSafe}`);
  lines.push(`export function replay_wrapper(): boolean {`);
  lines.push(`  // args`);
  args.forEach((arg, idx) => {
    lines.push(`  const arg${idx} = ${emitValueAsTsExpression(arg)};`);
  });
  lines.push(`  const args = [${args.map((_, idx) => `arg${idx}`).join(", ")}];`);

  const envKeys = Object.keys(env);
  if (envKeys.length > 0)  {
    lines.push(`  // env`);
    let envObjectNeeded = false;
    envKeys.forEach((key) => {
      if (isValidIdentifier(key)) {
        lines.push(`  let ${key} = ${emitValueAsTsExpression(env[key])};`);
      } else {
        envObjectNeeded = true;
      }
    });
    if (envObjectNeeded) {
      lines.push(`  const env = ${emitValueAsTsExpression(env)};`);
    }
  }

  lines.push(`  const thisArg = ${emitValueAsTsExpression(thisArg)};`);
  lines.push(`  const fnName = ${JSON.stringify(fnName)};`);
  lines.push(`  const target = thisArg ?? (globalThis as any);`);

  const callExpr = `target && typeof (target as any)[fnName] === "function" ? (target as any)[fnName](...args) : undefined`;

  const outcome = exit?.outcome;
  if (outcome?.kind === "throw") {
    lines.push(`  let threw = false;`);
    lines.push(`  try {`);
    lines.push(`    ${callExpr};`);
    lines.push(`  } catch (_e) {`);
    lines.push(`    threw = true;`);
    lines.push(`  }`);
    lines.push(`  if (!threw) return false;`);
  } else if (outcome?.kind === "return") {
    lines.push(`  const ret = ${callExpr};`);
    lines.push(`  const expected = ${emitValueAsTsExpression(outcome.value)};`);
    lines.push(`  if (JSON.stringify(ret) !== JSON.stringify(expected)) return false;`);
  } else {
    lines.push(`  ${callExpr};`);
  }

  lines.push(`  // TODO: compare env mutations if needed`);
  lines.push(`  return true;`);
  lines.push(`}`);

  return lines.join("\n");
}
