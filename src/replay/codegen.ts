import { findCallTripleById, findAllTriplesById } from "./indexStore.js";
import { inferCallTripleTypes } from "./typeInfer.js";
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
  return emitBinding(indent, name, rhs, mutable, typeName);
};

const emitAnnotation = (indent: number, annotation: string): string => {
  const indentText = " ".repeat(Math.max(0, indent));
  return `${indentText}// ${annotation}`;
}

const emitCompareAndError = (indent: number, lhs: string, rhs: string, errorMsg: string): string => {
  const indentText = " ".repeat(Math.max(0, indent));
  return `${indentText}if (JSON.stringify(${lhs}) !== JSON.stringify(${rhs})) { throw new Error("${errorMsg}"); }`
}

function emitValueAsTsExpression(value: unknown): string {
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

const parseBareObjectKeys = (typeName: string): string[] => {
  return typeName
    .replace(/^\{|\}$/g, '')
    .trim()
    .replace(/:[^;]+;/g, ' ')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(key => key.length > 0)
    .map(key => key.charAt(0).toUpperCase() + key.slice(1));
};

export function extractBareClass(triple: CallTriple): Map<string, string> {
  const bareClasses = new Map<string, string>();

  const resolveTypeName = (typeName: string | undefined): string | undefined => {
    if (!typeName) return typeName;
    if (!typeName.startsWith("{")) {
      return typeName;
    }
    const existing = bareClasses.get(typeName);
    if (existing) {
      return existing;
    }
    const keys = parseBareObjectKeys(typeName);
    if (keys.length === 0) {
      return typeName;
    }
    const suffix = keys.join("");
    const className = `bareClass${suffix}`;
    bareClasses.set(typeName, className);
    return className;
  };

  if (triple.enter) {
    triple.enter.thisArgType = resolveTypeName(triple.enter.thisArgType) ?? triple.enter.thisArgType;
    triple.enter.argsTypes = triple.enter.argsTypes.map(
      (typeName) => resolveTypeName(typeName) ?? typeName
    );
    triple.enter.envTypes = triple.enter.envTypes.map(
      (typeName) => resolveTypeName(typeName) ?? typeName
    );
  }

  if (triple.exit) {
    triple.exit.outcomeTypes = triple.exit.outcomeTypes.map(
      (typeName) => resolveTypeName(typeName) ?? typeName
    );
    triple.exit.envTypes = triple.exit.envTypes.map(
      (typeName) => resolveTypeName(typeName) ?? typeName
    );
  }

  return bareClasses;
}

function generateMockSource(triple: CallTriple, useTypeNames = false, inferTypedTriple: CallTriple): string {
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
  const argTypes = useTypeNames ? inferTypedTriple.enter?.argsTypes : undefined;
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
    const errorMsg = `arg${idx} mismatch for child call ${className === "-" ? "" : `${className}.`}${fnName}()`;
    lines.push(emitCompareAndError(2 + classIndent.length, `arg${idx}`, `expected${idx}`, errorMsg));
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

function generateMockConstructor(triple: CallTriple, useTypeNames = false, inferTypedTriple: CallTriple): [string, string] {
  const enter = triple.enter;
  const argTypes = useTypeNames ? inferTypedTriple.enter?.argsTypes : undefined;

  const lines: string[] = [];
  lines.push(emitAnnotation(2, "constructor's args"));
  const args = Array.isArray(enter?.args) ? enter?.args : enter?.args ? [enter.args] : [];

  args.forEach((arg, idx) => {
    const argType = useTypeNames ? getIndexedTypeName(argTypes, idx) ?? "unknown" : undefined;
    lines.push(emitParsedBinding(2, `carg${idx}`, arg, false, argType));
  });

  const argList = args.map((_, idx) => `carg${idx}`).join(", ");

  return [lines.join("\n"), argList];
}

export function generateReplaySource(
  triple: CallTriple,
  index: ReplayIndex,
  useTypeNames = false,
  inferTypedTriple: CallTriple | undefined,
  traceDir?: string
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

  // 1 for functions, 2 for methods, 3 for constructors
  const funcKind = (className === "-") ? 1 : (fnName === "constructor" ? 3 : 2);

  if (inferTypedTriple === undefined) inferTypedTriple = triple;

  const lines: string[] = [];
  lines.push(emitAnnotation(0, `fnId: ${fnId} callId: ${callId}`));
  if (useTypeNames) {
    // import section
    lines.push("import { JSON } from \"json-as\";");
    lines.push("");

    // bare class declaration section
    const bareClasses = extractBareClass(inferTypedTriple);
    bareClasses.forEach((value: string, key: string) => {
      lines.push(`class ${value} ${key};`);
    })
  }

  const args = Array.isArray(enter?.args) ? enter?.args : enter?.args ? [enter.args] : [];
  const enterEnv = isPlainObject(enter?.env) ? (enter?.env as Record<string, unknown>) : {};
  const exitEnv = isPlainObject(exit?.env) ? (exit?.env as Record<string, unknown>) : {};
  const thisArg = enter?.thisArg ?? null;
  const argTypes = useTypeNames ? inferTypedTriple.enter?.argsTypes : undefined;
  const enterEnvTypes = useTypeNames ? inferTypedTriple.enter?.envTypes : undefined;
  const exitEnvTypes = useTypeNames ? inferTypedTriple.exit?.envTypes : undefined;
  const enterEnvTypeMap = useTypeNames ? buildTypeMap(Object.keys(enterEnv), enterEnvTypes) : undefined;
  const exitEnvTypeMap = useTypeNames ? buildTypeMap(Object.keys(exitEnv), exitEnvTypes) : undefined;
  const thisArgTypeName = useTypeNames ? normalizeTypeName(inferTypedTriple.enter?.thisArgType) : undefined;
  const outcomeTypes = useTypeNames ? inferTypedTriple.exit?.outcomeTypes : undefined;
  const returnTypeName = useTypeNames ? normalizeTypeName(outcomeTypes?.[0]) : undefined;

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

  childInvocations.forEach((child, idx) => {
    // skip first invocation mock(constructor) for methods
    if (funcKind === 2 && idx === 0) return;
    const childTriple = findCallTripleById(child.callId, index);
    if (childTriple) {
      // typed infer of this child
      const relatedTriples = findAllTriplesById(child.callId, index);
      const inferRelatedTriple = useTypeNames
        ? inferCallTripleTypes(relatedTriples, traceDir)
        : childTriple;
      const mockSource = generateMockSource(childTriple, useTypeNames, inferRelatedTriple);
      if (mockSource.length > 0) {
        lines.push(mockSource);
        lines.push("");
      }
    }
  });

  // replay core section
  lines.push(emitAnnotation(0, "main replay logic"));
  lines.push(`export function replay_wrapper(): void {`);
  lines.push(emitAnnotation(2, "args"));
  args.forEach((arg, idx) => {
    const argType = useTypeNames ? getIndexedTypeName(argTypes, idx) ?? "unknown" : undefined;
    lines.push(emitParsedBinding(2, `arg${idx}`, arg, false, argType));
  });

  const argList = args.map((_, idx) => `arg${idx}`).join(", ");

  let callExpr = `${fnName}(${argList})`;
  if (funcKind === 2) {
    const constructorInvoc = childInvocations[0];
    const constructorTriple = findCallTripleById(constructorInvoc.callId, index);
    let constructorArgList = "";
    let constructorArgDecl = "";
    if (constructorTriple) {
      const relatedTriples = constructorTriple.enter ? findAllTriplesById(constructorTriple.enter.callId, index) : [];
      const inferRelatedTriple = useTypeNames
        ? inferCallTripleTypes(relatedTriples, traceDir)
        : constructorTriple;

      [constructorArgDecl, constructorArgList] = generateMockConstructor(constructorTriple, useTypeNames, inferRelatedTriple);
      if (constructorArgDecl.length > 0) {
        lines.push(constructorArgDecl);
      }
    }
    
    if (useTypeNames) {
      const fallback = normalizeTypeName(className) ?? "unknown";
      const typeName = thisArgTypeName ?? fallback;
      lines.push(emitBinding(2, "thisObj", `new ${className}(${constructorArgList})`, false, typeName));
    } else {
      lines.push(emitBinding(2, "thisObj", `new ${className}(${constructorArgList})`, false, undefined));
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

  if (funcKind === 3) {
    callExpr = `new ${className}(${argList})`;
  }

  // return section
  const outcome = exit?.outcome;
  if (outcome?.kind === "throw") {
    if (useTypeNames) {
      lines.push(emitBinding(2, "threw", "false", true, "boolean"));
    } else {
      lines.push(emitBinding(2, "threw", "false", true, undefined));
    }
    lines.push(`  try {`);
    lines.push(`    ${callExpr};`);
    lines.push(`  } catch (_e) {`);
    lines.push(`    threw = true;`);
    lines.push(`  }`);
    lines.push(`  if (!threw) throw new Error("Should throw an Error, but not");`);
  } else if (outcome?.kind === "return" && outcomeTypes?.at(0) !== "void") {
    if (useTypeNames) {
      const typeName = returnTypeName ?? "unknown";
      lines.push(emitBinding(2, "ret", callExpr, false, typeName));
      lines.push(emitParsedBinding(2, "expected", outcome.value, false, typeName));
    } else {
      lines.push(emitBinding(2, "ret", callExpr, false, undefined));
      lines.push(emitParsedBinding(2, "expected", outcome.value, false));
    }
    lines.push(emitCompareAndError(2, "ret", "expected", "return value mismatch"));
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
      lines.push(emitCompareAndError(2, "actualEnv", "expectedEnv", "env mutation mismatch"));
    } else {
      enterEnvKeys.forEach((key) => {
        lines.push(emitCompareAndError(2, `${key}`, `expected_${key}`, `env: ${key} mutation mismatch`));
      });
    }
  }

  // end of replay section
  lines.push(`}`);

  return lines.join("\n");
}
