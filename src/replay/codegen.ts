import { findCallTripleById } from "./indexStore.js";
import { CallTriple, ReplayIndex } from "./types.js";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidIdentifier = (name: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

const normalizeTypeName = (typeName: string | undefined): string | undefined => {
  if (!typeName) return undefined;
  const trimmed = typeName.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getIndexedTypeName = (typeNames: string[] | undefined, index: number): string | undefined =>
  normalizeTypeName(typeNames?.[index]);

const buildTypeMap = (
  keys: string[],
  typeNames: string[] | undefined
): Map<string, string | undefined> => {
  const typeMap = new Map<string, string | undefined>();
  keys.forEach((key, index) => {
    typeMap.set(key, normalizeTypeName(typeNames?.[index]));
  });
  return typeMap;
};

const buildObjectTypeName = (
  keys: string[],
  typeMap: Map<string, string | undefined> | undefined
): string | undefined => {
  if (!typeMap || keys.length === 0) return undefined;
  const props = keys.map((key) => {
    const propType = typeMap.get(key) ?? "unknown";
    const propName = isValidIdentifier(key) ? key : JSON.stringify(key);
    return `${propName}: ${propType}`;
  });
  return `{ ${props.join("; ")} }`;
};

const getTypeFromMap = (
  typeMap: Map<string, string | undefined> | undefined,
  key: string
): string | undefined => {
  if (!typeMap) return undefined;
  return typeMap.get(key) ?? undefined;
};

const emitBinding = (
  indent: number,
  name: string,
  valueExpression: string,
  mutable: boolean,
  typeName?: string
): string => {
  const indentText = " ".repeat(Math.max(0, indent));
  const keyword = mutable ? "let" : "const";
  const typeAnnotation = typeName ? `: ${typeName}` : "";
  return `${indentText}${keyword} ${name}${typeAnnotation} = ${valueExpression};`;
};

const toJsonString = (value: unknown): string => {
  try {
    const jsonString = JSON.stringify(value);
    return jsonString ?? "null";
  } catch {
    return JSON.stringify(String(value)) ?? "null";
  }
};

const emitParsedBinding = (
  indent: number,
  name: string,
  value: unknown,
  mutable: boolean,
  typeName?: string
): string => {
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
    rhs = typeName ? `JSON.parse<${typeName}>(${rhs})` : `JSON.parse(${rhs})`;
  }
  const keyword = mutable ? "let" : "const";
  return `${indentText}${keyword} ${name}${typeName ? `: ${typeName}` : ""} = ${rhs};`;
};

const emitAnnotation = (indent: number, annotation: string): string => {
  const indentText = " ".repeat(Math.max(0, indent));
  return `${indentText}// ${annotation}`;
}

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

export function generateMockSource(triple: CallTriple, useTypeNames = false): string {
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
  const argTypes = useTypeNames ? enter?.argsTypes : undefined;
  const params = args
    .map((_, idx) => `arg${idx}${useTypeNames ? `: ${getIndexedTypeName(argTypes, idx) ?? "unknown"}` : ""}`)
    .join(", ");

  const lines: string[] = [];
  let classIndent = "";
  if (className !== "-") {
    if (useTypeNames) lines.push("@json");
    lines.push(`class ${className} {`);
    classIndent = "  ";
  }
  let fnHead = "function ";
  if (fnName === "constructor") fnHead = "";
  lines.push(`${classIndent}${fnHead}${fnName}(${params}) {`);
  args.forEach((arg, idx) => {
    const argType = useTypeNames ? getIndexedTypeName(argTypes, idx) ?? "unknown" : undefined;
    lines.push(emitParsedBinding(2 + classIndent.length, `expected${idx}`, arg, false, argType));
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

export function generateReplaySource(
  triple: CallTriple,
  index: ReplayIndex,
  useTypeNames = false
): string {
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
  const enterEnv = isPlainObject(enter?.env) ? (enter?.env as Record<string, unknown>) : {};
  const exitEnv = isPlainObject(exit?.env) ? (exit?.env as Record<string, unknown>) : {};
  const thisArg = enter?.thisArg ?? null;
  const argTypes = useTypeNames ? enter?.argsTypes : undefined;
  const enterEnvTypes = useTypeNames ? enter?.envTypes : undefined;
  const exitEnvTypes = useTypeNames ? exit?.envTypes : undefined;
  const enterEnvTypeMap = useTypeNames ? buildTypeMap(Object.keys(enterEnv), enterEnvTypes) : undefined;
  const exitEnvTypeMap = useTypeNames ? buildTypeMap(Object.keys(exitEnv), exitEnvTypes) : undefined;
  const thisArgTypeName = useTypeNames ? normalizeTypeName(enter?.thisArgType) : undefined;
  const outcomeTypes = useTypeNames ? exit?.outcomeTypes : undefined;
  const returnTypeName = useTypeNames ? normalizeTypeName(outcomeTypes?.[0]) : undefined;

  // import section
  const lines: string[] = [];
  lines.push(emitAnnotation(0, `fnId: ${fnId} callId: ${callId}`));
  if (useTypeNames) {
    lines.push("import { JSON } from \"json-as\";");
    lines.push("");
  }

  // env section
  const enterEnvKeys = Object.keys(enterEnv);
  const exitEnvKeys = Object.keys(exitEnv);
  const enterEnvObjectNeeded = enterEnvKeys.some((key) => !isValidIdentifier(key));
  const exitEnvObjectNeeded = exitEnvKeys.some((key) => !isValidIdentifier(key));
  const envObjectNeeded = enterEnvObjectNeeded || exitEnvObjectNeeded;
  if (enterEnvKeys.length > 0)  {
    lines.push(emitAnnotation(0, "env"));
    if (envObjectNeeded) {
      const envTypeName = useTypeNames ? buildObjectTypeName(enterEnvKeys, enterEnvTypeMap) : undefined;
      lines.push(emitParsedBinding(0, "env", enterEnv, false, envTypeName));
    } else {
      enterEnvKeys.forEach((key) => {
        const envType = useTypeNames ? getTypeFromMap(enterEnvTypeMap, key) ?? "unknown" : undefined;
        lines.push(emitParsedBinding(0, key, enterEnv[key], true, envType));
      });
    }
  }

  if (exitEnvKeys.length > 0)  {
    lines.push(emitAnnotation(0, "env after mutation"));
    if (envObjectNeeded) {
      const envTypeName = useTypeNames ? buildObjectTypeName(exitEnvKeys, exitEnvTypeMap) : undefined;
      lines.push(emitParsedBinding(0, "expectedEnv", exitEnv, false, envTypeName));
    } else {
      exitEnvKeys.forEach((key) => {
        const envType = useTypeNames ? getTypeFromMap(exitEnvTypeMap, key) ?? "unknown" : undefined;
        lines.push(emitParsedBinding(0, `expected_${key}`, exitEnv[key], false, envType));
      });
    }
  }

  // mock section
  const childInvocations = triple.call?.childInvocations ?? [];
  if (childInvocations.length !== 0) {
    lines.push(emitAnnotation(0, "mock child invocations"));
  }
  childInvocations.forEach((child) => {
    const childTriple = findCallTripleById(child.callId, index);
    if (childTriple) {
      const mockSource = generateMockSource(childTriple, useTypeNames);
      if (mockSource.length > 0) {
        lines.push(mockSource);
        lines.push("");
      }
    }
  });

  // replay core section
  lines.push(emitAnnotation(0, "main replay logic"));
  lines.push(`export function replay_wrapper(): boolean {`);
  lines.push(emitAnnotation(2, "args"));
  args.forEach((arg, idx) => {
    const argType = useTypeNames ? getIndexedTypeName(argTypes, idx) ?? "unknown" : undefined;
    lines.push(emitParsedBinding(2, `arg${idx}`, arg, false, argType));
  });

  const argList = args.map((_, idx) => `arg${idx}`).join(", ");

  let callExpr = `${fnName}(${argList})`;
  if (className && className !== "-") {
    if (useTypeNames) {
      const fallback = normalizeTypeName(className) ?? "unknown";
      const typeName = thisArgTypeName ?? fallback;
      lines.push(emitBinding(2, "thisObj", `new ${className}()`, false, typeName));
    } else {
      lines.push(`  const thisObj = new ${className}();`);
    }
    if (thisArg && typeof thisArg === "object") {
      Object.keys(thisArg as Record<string, unknown>).forEach((key) => {
        const safeKey = isValidIdentifier(key) ? key : JSON.stringify(key);
        const keyAccess = isValidIdentifier(key) ? `.${safeKey}` : `[${safeKey}]`;
        lines.push(`  thisObj${keyAccess} = ${emitValueAsTsExpression((thisArg as Record<string, unknown>)[key])};`);
      });
    }
    callExpr = `thisObj.${fnName}(${argList})`;
  }

  // return section
  const outcome = exit?.outcome;
  if (outcome?.kind === "throw") {
    if (useTypeNames) {
      lines.push(emitBinding(2, "threw", "false", true, "boolean"));
    } else {
      lines.push(`  let threw = false;`);
    }
    lines.push(`  try {`);
    lines.push(`    ${callExpr};`);
    lines.push(`  } catch (_e) {`);
    lines.push(`    threw = true;`);
    lines.push(`  }`);
    lines.push(`  if (!threw) return false;`);
  } else if (outcome?.kind === "return") {
    if (useTypeNames) {
      const typeName = returnTypeName ?? "unknown";
      lines.push(emitBinding(2, "ret", callExpr, false, typeName));
      lines.push(emitParsedBinding(2, "expected", outcome.value, false, typeName));
    } else {
      lines.push(`  const ret = ${callExpr};`);
      lines.push(emitParsedBinding(2, "expected", outcome.value, false));
    }
    lines.push(`  if (JSON.stringify(ret) !== JSON.stringify(expected)) return false;`);
  } else {
    lines.push(`  ${callExpr};`);
  }

  // env compare section
  if (enterEnvKeys.length !== exitEnvKeys.length) {
    throw Error("Error: replay with enter and exit env of different length");
  }
  if (enterEnvKeys.length > 0) {
    lines.push(emitAnnotation(2, "env mutation comparison"));
    if (envObjectNeeded) {
      const actualEntries = enterEnvKeys.map((key) => {
        if (isValidIdentifier(key)) return key;
        const literal = JSON.stringify(key);
        return `${literal}: env[${literal}]`;
      });
      const actualEnvExpr = `{ ${actualEntries.join(", ")} }`;
      const actualEnvTypeName = useTypeNames ? buildObjectTypeName(enterEnvKeys, enterEnvTypeMap) : undefined;
      lines.push(emitBinding(2, "actualEnv", actualEnvExpr, false, actualEnvTypeName));
      lines.push(`  if (JSON.stringify(actualEnv) !== JSON.stringify(expectedEnv)) return false;`);
    } else {
      enterEnvKeys.forEach((key) => {
        lines.push(`  if (JSON.stringify(${key}) !== JSON.stringify(expected_${key})) return false;`);
      });
    }
  }

  // end of replay section
  lines.push(`  return true;`);
  lines.push(`}`);

  return lines.join("\n");
}
