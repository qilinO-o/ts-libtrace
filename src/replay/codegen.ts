import { findCallTripleById } from "./indexStore.js";
import { CallTriple, ReplayIndex } from "./types.js";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidIdentifier = (name: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

const toJsonString = (value: unknown): string => {
  try {
    const jsonString = JSON.stringify(value);
    return jsonString ?? "null";
  } catch {
    return JSON.stringify(String(value)) ?? "null";
  }
};

const emitParsedBinding = (indent: number, name: string, value: unknown, mutable: boolean): string => {
  const indentText = " ".repeat(Math.max(0, indent));
  let rhs = undefined;
  if (value === null) rhs = "null";
  else if (value === undefined) rhs = "undefined";
  else if (typeof value === "boolean") rhs = value ? "true" : "false";
  else if (typeof value === "number") rhs = Number.isFinite(value) ? String(value) : "null";
  else if (typeof value === "string") rhs = JSON.stringify(value);
  if (rhs === undefined) {
    const jsonString = toJsonString(value);
    rhs = JSON.stringify(jsonString);
    rhs = `JSON.parse(${rhs})`
  }
  const keyword = mutable ? "let" : "const";
  return `${indentText}${keyword} ${name} = ${rhs};`;
};

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

export function generateMockSource(triple: CallTriple): string {
  const enter = triple.enter;
  const exit = triple.exit;
  const fnId = enter?.fnId;
  if (fnId === undefined) {
    throw Error("Error: replay mock with bad CallTriple");
  }
  const { className, fnName } = extractFnInfo(fnId);
  if (className === undefined || fnName === undefined) {
    throw Error("Error: replay mock with bad fnId");
  }

  const args = Array.isArray(enter?.args) ? enter?.args : enter?.args ? [enter.args] : [];
  const outcome = exit?.outcome;
  const params = args.map((_, idx) => `arg${idx}`).join(", ");

  const lines: string[] = [];
  let classIndent = "";
  if (className !== "-") {
    lines.push(`class ${className} {`);
    classIndent = "  ";
  }
  let fnHead = "function ";
  if (fnName === "constructor") fnHead = "";
  lines.push(`${classIndent}${fnHead}${fnName}(${params}) {`);
  args.forEach((arg, idx) => {
    lines.push(emitParsedBinding(2 + classIndent.length, `expected${idx}`, arg, false));
    lines.push(
      `${classIndent}  if (JSON.stringify(arg${idx}) !== JSON.stringify(expected${idx})) { throw new Error("arg mismatch"); }`
    );
  });

  if (outcome?.kind === "throw") {
    lines.push(`${classIndent}  throw ${emitValueAsTsExpression(outcome.error)};`);
  } else if (outcome?.kind === "return") {
    lines.push(`${classIndent}  return ${emitValueAsTsExpression(outcome.value)};`);
  } else {
    lines.push(`${classIndent}  return undefined;`);
  }
  lines.push(`${classIndent}}`);
  if (className !== "-") {
    lines.push(`}`);
  }
  return lines.join("\n");
}

export function generateReplaySource(triple: CallTriple, index: ReplayIndex): string {
  const enter = triple.enter;
  const exit = triple.exit;
  const fnId = enter?.fnId;
  const callId = enter?.callId;
  if (fnId === undefined || callId === undefined) {
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
  lines.push(`// fnId: ${fnId} callId: ${callId}`);

  const envKeys = Object.keys(env);
  if (envKeys.length > 0)  {
    lines.push(`// env`);
    let envObjectNeeded = false;
    envKeys.forEach((key) => {
      if (isValidIdentifier(key)) {
        lines.push(emitParsedBinding(0, key, env[key], true));
      } else {
        envObjectNeeded = true;
      }
    });
    if (envObjectNeeded) {
      lines.push(emitParsedBinding(0, "env", env, false));
    }
  }

  const childInvocations = triple.call?.childInvocations ?? [];
  childInvocations.forEach((child) => {
    const childTriple = findCallTripleById(child.callId, index);
    if (childTriple) {
      const mockSource = generateMockSource(childTriple);
      if (mockSource.length > 0) {
        lines.push(mockSource);
        lines.push("");
      }
    }
  });

  lines.push(`export function replay_wrapper(): boolean {`);
  lines.push(`  // args`);
  args.forEach((arg, idx) => {
    lines.push(emitParsedBinding(2, `arg${idx}`, arg, false));
  });

  const argList = args.map((_, idx) => `arg${idx}`).join(", ");

  let callExpr = `${fnName}(${argList})`;
  if (className && className !== "-") {
    lines.push(`  const thisObj = new ${className}();`);
    if (thisArg && typeof thisArg === "object") {
      Object.keys(thisArg as Record<string, unknown>).forEach((key) => {
        const safeKey = isValidIdentifier(key) ? key : JSON.stringify(key);
        const keyAccess = isValidIdentifier(key) ? `.${safeKey}` : `[${safeKey}]`;
        lines.push(`  thisObj${keyAccess} = ${emitValueAsTsExpression((thisArg as Record<string, unknown>)[key])};`);
      });
    }
    callExpr = `thisObj.${fnName}(${argList})`;
  }

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
    lines.push(emitParsedBinding(2, "expected", outcome.value, false));
    lines.push(`  if (JSON.stringify(ret) !== JSON.stringify(expected)) return false;`);
  } else {
    lines.push(`  ${callExpr};`);
  }

  lines.push(`  // TODO: compare env mutations if needed`);
  lines.push(`  return true;`);
  lines.push(`}`);

  return lines.join("\n");
}
