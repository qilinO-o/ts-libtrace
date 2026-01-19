import { CallTriple } from "./types.js";
import { EnterEvent, ExitEvent } from "../runtime/types.js";

type NumberKind = "i32" | "i64" | "f32" | "f64";

type TypeNode =
  | { kind: "plain"; text: string }
  | { kind: "array"; element: TypeNode }
  | { kind: "tuple"; elements: TypeNode[] }
  | { kind: "generic"; name: string; args: TypeNode[] }
  | { kind: "object"; properties: ObjectProperty[] };

type ObjectProperty = {
  name: string;
  optional: boolean;
  readonly: boolean;
  type: TypeNode;
};

const I32_MIN = -2147483648;
const I32_MAX = 2147483647;

const NUMBER_TOKEN = /\bnumber\b/;
const NUMBER_TOKEN_GLOBAL = /\bnumber\b/g;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidIdentifier = (name: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

const splitTopLevel = (text: string, separators: string[]): string[] => {
  const parts: string[] = [];
  let depthAngle = 0;
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let inString: "'" | "\"" | null = null;
  let escape = false;
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === "'" || ch === "\"") {
      inString = ch as "'" | "\"";
      continue;
    }

    if (ch === "<") depthAngle += 1;
    else if (ch === ">") depthAngle = Math.max(0, depthAngle - 1);
    else if (ch === "(") depthParen += 1;
    else if (ch === ")") depthParen = Math.max(0, depthParen - 1);
    else if (ch === "[") depthBracket += 1;
    else if (ch === "]") depthBracket = Math.max(0, depthBracket - 1);
    else if (ch === "{") depthBrace += 1;
    else if (ch === "}") depthBrace = Math.max(0, depthBrace - 1);

    if (
      separators.includes(ch) &&
      depthAngle === 0 &&
      depthParen === 0 &&
      depthBracket === 0 &&
      depthBrace === 0
    ) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(text.slice(start).trim());
  return parts.filter((part) => part.length > 0);
};

const parseTypeArguments = (text: string): string[] => splitTopLevel(text, [","]);

const parsePropertyName = (raw: string): { name: string; quoted: boolean } | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return { name: trimmed.slice(1, -1), quoted: true };
  }
  if (isValidIdentifier(trimmed)) {
    return { name: trimmed, quoted: false };
  }
  if (/^\d+$/.test(trimmed)) {
    return { name: trimmed, quoted: true };
  }
  return null;
};

const parseObjectType = (text: string): TypeNode | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) {
    return { kind: "object", properties: [] };
  }

  const members = splitTopLevel(inner, [";", ","]);
  const properties: ObjectProperty[] = [];

  for (const member of members) {
    const match = member.match(/^(readonly\s+)?(.+?)(\?)?\s*:\s*(.+)$/);
    if (!match) {
      return null;
    }
    const readonly = Boolean(match[1]);
    const nameResult = parsePropertyName(match[2]);
    if (!nameResult) {
      return null;
    }
    const optional = Boolean(match[3]);
    const typeText = match[4].trim();
    properties.push({
      name: nameResult.name,
      optional,
      readonly,
      type: parseTypeNode(typeText)
    });
  }

  return { kind: "object", properties };
};

const parseTupleType = (text: string): TypeNode | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }
  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) {
    return { kind: "tuple", elements: [] };
  }
  const parts = splitTopLevel(inner, [","]);
  const elements = parts.map((part) => parseTypeNode(part));
  return { kind: "tuple", elements };
};

const parseGenericType = (text: string): TypeNode | null => {
  const trimmed = text.trim();
  const start = trimmed.indexOf("<");
  if (start <= 0) return null;

  let depth = 0;
  let end = -1;
  for (let index = start; index < trimmed.length; index += 1) {
    const ch = trimmed[index];
    if (ch === "<") depth += 1;
    else if (ch === ">") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }

  if (end === -1 || trimmed.slice(end + 1).trim().length > 0) {
    return null;
  }

  const name = trimmed.slice(0, start).trim();
  const argsText = trimmed.slice(start + 1, end);
  const args = parseTypeArguments(argsText).map((arg) => parseTypeNode(arg));
  return { kind: "generic", name, args };
};

const parseTypeNode = (typeName: string): TypeNode => {
  const trimmed = typeName.trim();
  if (trimmed.endsWith("[]")) {
    return { kind: "array", element: parseTypeNode(trimmed.slice(0, -2)) };
  }

  const tupleNode = parseTupleType(trimmed);
  if (tupleNode) return tupleNode;

  const objectNode = parseObjectType(trimmed);
  if (objectNode) return objectNode;

  const genericNode = parseGenericType(trimmed);
  if (genericNode) return genericNode;

  return { kind: "plain", text: trimmed };
};

const formatTypeNode = (node: TypeNode): string => {
  switch (node.kind) {
    case "plain":
      return node.text;
    case "array":
      return `${formatTypeNode(node.element)}[]`;
    case "tuple":
      return `[${node.elements.map((element) => formatTypeNode(element)).join(", ")}]`;
    case "generic":
      return `${node.name}<${node.args.map((arg) => formatTypeNode(arg)).join(", ")}>`;
    case "object": {
      if (node.properties.length === 0) {
        return "{ }";
      }
      const props = node.properties.map((prop) => {
        const prefix = prop.readonly ? "readonly " : "";
        const name = isValidIdentifier(prop.name) ? prop.name : JSON.stringify(prop.name);
        const optional = prop.optional ? "?" : "";
        return `${prefix}${name}${optional}: ${formatTypeNode(prop.type)}`;
      });
      return `{ ${props.join("; ")}; }`;
    }
    default:
      return "unknown";
  }
};

const collectNumbers = (value: unknown, output: number[], seen: WeakSet<object>): void => {
  if (typeof value === "number") {
    output.push(value);
    return;
  }
  if (value === null || value === undefined) return;
  if (typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => collectNumbers(item, output, seen));
    return;
  }

  if (value instanceof Set) {
    value.forEach((item) => collectNumbers(item, output, seen));
    return;
  }

  if (value instanceof Map) {
    value.forEach((mapValue, mapKey) => {
      collectNumbers(mapKey, output, seen);
      collectNumbers(mapValue, output, seen);
    });
    return;
  }

  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      view.forEach((item) => collectNumbers(item, output, seen));
    } else {
      const arrayLike = value as unknown as ArrayLike<number>;
      for (let index = 0; index < arrayLike.length; index += 1) {
        collectNumbers(arrayLike[index], output, seen);
      }
    }
    return;
  }

  if (value instanceof ArrayBuffer) {
    const view = new Uint8Array(value);
    view.forEach((item) => collectNumbers(item, output, seen));
    return;
  }

  if (isPlainObject(value)) {
    Object.values(value).forEach((item) => collectNumbers(item, output, seen));
  }
};

const inferNumberKind = (samples: number[]): NumberKind => {
  if (samples.length === 0) {
    return "i32";
  }

  let hasFloat = false;
  let needsF64 = false;
  let needsI64 = false;

  for (const value of samples) {
    if (!Number.isFinite(value)) {
      needsF64 = true;
      continue;
    }

    if (!Number.isInteger(value)) {
      hasFloat = true;
      if (Math.fround(value) !== value) {
        needsF64 = true;
      }
      continue;
    }

    if (value < I32_MIN || value > I32_MAX) {
      needsI64 = true;
    }
  }

  if (hasFloat) {
    return needsF64 ? "f64" : "f32";
  }
  return needsI64 ? "i64" : "i32";
};

const extractNumberSamples = (values: unknown[]): number[] => {
  const output: number[] = [];
  const seen = new WeakSet<object>();
  values.forEach((value) => collectNumbers(value, output, seen));
  return output;
};

const inferPlainTypeName = (typeName: string, samples: unknown[]): string => {
  if (!NUMBER_TOKEN.test(typeName)) {
    return typeName;
  }
  const numbers = extractNumberSamples(samples);
  const kind = inferNumberKind(numbers);
  return typeName.replace(NUMBER_TOKEN_GLOBAL, kind);
};

const collectArrayElementSamples = (values: unknown[]): unknown[] => {
  const output: unknown[] = [];
  values.forEach((value) => {
    if (Array.isArray(value)) {
      output.push(...value);
      return;
    }
    if (ArrayBuffer.isView(value)) {
      if (value instanceof DataView) {
        const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        view.forEach((item) => output.push(item));
      } else {
        const arrayLike = value as unknown as ArrayLike<number>;
        for (let index = 0; index < arrayLike.length; index += 1) {
          output.push(arrayLike[index]);
        }
      }
      return;
    }
    if (value instanceof ArrayBuffer) {
      const view = new Uint8Array(value);
      view.forEach((item) => output.push(item));
    }
  });
  return output;
};

const collectSetElementSamples = (values: unknown[]): unknown[] => {
  const output: unknown[] = [];
  values.forEach((value) => {
    if (value instanceof Set) {
      value.forEach((item) => output.push(item));
    }
  });
  return output;
};

const collectMapKeySamples = (values: unknown[]): unknown[] => {
  const output: unknown[] = [];
  values.forEach((value) => {
    if (value instanceof Map) {
      value.forEach((_mapValue, mapKey) => output.push(mapKey));
    }
  });
  return output;
};

const collectMapValueSamples = (values: unknown[]): unknown[] => {
  const output: unknown[] = [];
  values.forEach((value) => {
    if (value instanceof Map) {
      value.forEach((mapValue) => output.push(mapValue));
    }
  });
  return output;
};

const collectTupleSamples = (values: unknown[], count: number): unknown[][] => {
  const buckets = Array.from({ length: count }, () => [] as unknown[]);
  values.forEach((value) => {
    if (!Array.isArray(value)) return;
    for (let index = 0; index < count; index += 1) {
      buckets[index].push(value[index]);
    }
  });
  return buckets;
};

const collectObjectSamples = (values: unknown[], keys: string[]): unknown[][] => {
  const buckets = Array.from({ length: keys.length }, () => [] as unknown[]);
  values.forEach((value) => {
    if (!isPlainObject(value)) return;
    keys.forEach((key, index) => {
      buckets[index].push(value[key]);
    });
  });
  return buckets;
};

const inferTypeNode = (node: TypeNode, samples: unknown[]): TypeNode => {
  switch (node.kind) {
    case "plain":
      return { kind: "plain", text: inferPlainTypeName(node.text, samples) };
    case "array": {
      const elementSamples = collectArrayElementSamples(samples);
      return { kind: "array", element: inferTypeNode(node.element, elementSamples) };
    }
    case "tuple": {
      const buckets = collectTupleSamples(samples, node.elements.length);
      const elements = node.elements.map((element, index) =>
        inferTypeNode(element, buckets[index] ?? [])
      );
      return { kind: "tuple", elements };
    }
    case "generic": {
      const name = node.name;
      if (name === "Array" || name === "ReadonlyArray") {
        const elementSamples = collectArrayElementSamples(samples);
        const args = node.args.map((arg, index) =>
          index === 0 ? inferTypeNode(arg, elementSamples) : inferTypeNode(arg, samples)
        );
        return { kind: "generic", name, args };
      }
      if (name === "Set" || name === "ReadonlySet") {
        const elementSamples = collectSetElementSamples(samples);
        const args = node.args.map((arg, index) =>
          index === 0 ? inferTypeNode(arg, elementSamples) : inferTypeNode(arg, samples)
        );
        return { kind: "generic", name, args };
      }
      if (name === "Map" || name === "ReadonlyMap") {
        const keySamples = collectMapKeySamples(samples);
        const valueSamples = collectMapValueSamples(samples);
        const args = node.args.map((arg, index) => {
          if (index === 0) return inferTypeNode(arg, keySamples);
          if (index === 1) return inferTypeNode(arg, valueSamples);
          return inferTypeNode(arg, samples);
        });
        return { kind: "generic", name, args };
      }
      return {
        kind: "generic",
        name,
        args: node.args.map((arg) => inferTypeNode(arg, samples))
      };
    }
    case "object": {
      const keys = node.properties.map((prop) => prop.name);
      const buckets = collectObjectSamples(samples, keys);
      const properties = node.properties.map((prop, index) => ({
        ...prop,
        type: inferTypeNode(prop.type, buckets[index] ?? [])
      }));
      return { kind: "object", properties };
    }
    default:
      return { kind: "plain", text: inferPlainTypeName(formatTypeNode(node), samples) };
  }
};

const inferTypeName = (typeName: string, samples: unknown[]): string => {
  if (!NUMBER_TOKEN.test(typeName)) {
    return typeName;
  }
  const node = parseTypeNode(typeName);
  const inferred = inferTypeNode(node, samples);
  return formatTypeNode(inferred);
};

const getFirstEnter = (triples: CallTriple[]): EnterEvent | undefined =>
  triples.find((triple) => triple.enter)?.enter;

const getFirstExit = (triples: CallTriple[]): ExitEvent | undefined =>
  triples.find((triple) => triple.exit)?.exit;

const collectArgsSamples = (triples: CallTriple[], count: number): unknown[][] => {
  const buckets = Array.from({ length: count }, () => [] as unknown[]);
  triples.forEach((triple) => {
    const args = triple.enter?.args;
    if (Array.isArray(args)) {
      args.forEach((value, index) => {
        if (index < count) {
          buckets[index].push(value);
        }
      });
    } else if (args !== undefined && count > 0) {
      buckets[0].push(args);
    }
  });
  return buckets;
};

const collectEnvSamples = (triples: CallTriple[], keys: string[], source: "enter" | "exit"): unknown[][] => {
  const buckets = Array.from({ length: keys.length }, () => [] as unknown[]);
  triples.forEach((triple) => {
    const env = source === "enter" ? triple.enter?.env : triple.exit?.env;
    if (!isPlainObject(env)) {
      return;
    }
    keys.forEach((key, index) => {
      buckets[index].push(env[key]);
    });
  });
  return buckets;
};

const collectThisSamples = (triples: CallTriple[]): unknown[] =>
  triples.map((triple) => triple.enter?.thisArg).filter((value) => value !== undefined);

const collectOutcomeSamples = (triples: CallTriple[], field: "value" | "error"): unknown[] => {
  const output: unknown[] = [];
  triples.forEach((triple) => {
    const outcome = triple.exit?.outcome;
    if (!outcome) return;
    if (field === "value" && outcome.kind === "return") {
      output.push(outcome.value);
      return;
    }
    if (field === "error" && outcome.kind === "throw") {
      output.push(outcome.error);
    }
  });
  return output;
};

export function inferCallTripleTypes(triples: CallTriple[]): CallTriple {
  if (triples.length === 0) {
    return { enter: undefined, call: undefined, exit: undefined };
  }

  const baseEnter = getFirstEnter(triples);
  const baseExit = getFirstExit(triples);

  let inferredEnter: EnterEvent | undefined = undefined;
  if (baseEnter) {
    const thisArgSamples = collectThisSamples(triples);
    const argsSamples = collectArgsSamples(triples, baseEnter.argsTypes.length);
    const envKeys = isPlainObject(baseEnter.env) ? Object.keys(baseEnter.env) : [];
    const envSamples = collectEnvSamples(triples, envKeys, "enter");

    const thisArgType = inferTypeName(baseEnter.thisArgType, thisArgSamples);
    const argsTypes = baseEnter.argsTypes.map((typeName, index) =>
      inferTypeName(typeName, argsSamples[index] ?? [])
    );
    const envTypes = baseEnter.envTypes.map((typeName, index) =>
      inferTypeName(typeName, envSamples[index] ?? [])
    );

    inferredEnter = {
      type: "enter",
      fnId: baseEnter.fnId,
      callId: baseEnter.callId,
      thisArg: undefined,
      thisArgType,
      args: [],
      argsTypes,
      env: {},
      envTypes
    };
  }

  let inferredExit: ExitEvent | undefined = undefined;
  if (baseExit) {
    const envKeys = isPlainObject(baseExit.env) ? Object.keys(baseExit.env) : [];
    const envSamples = collectEnvSamples(triples, envKeys, "exit");
    const returnSamples = collectOutcomeSamples(triples, "value");
    const errorSamples = collectOutcomeSamples(triples, "error");

    const outcomeTypes = baseExit.outcomeTypes.map((typeName, index) => {
      const samples = index === 0 ? returnSamples : errorSamples;
      return inferTypeName(typeName, samples);
    });
    const envTypes = baseExit.envTypes.map((typeName, index) =>
      inferTypeName(typeName, envSamples[index] ?? [])
    );

    inferredExit = {
      type: "exit",
      fnId: baseExit.fnId,
      callId: baseExit.callId,
      outcome: {
        kind: baseExit.outcome.kind
      },
      outcomeTypes,
      env: {},
      envTypes
    };
  }

  return {
    enter: inferredEnter,
    call: undefined,
    exit: inferredExit
  };
}
