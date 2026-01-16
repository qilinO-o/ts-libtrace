import { CallTriple } from "./types.js";
import { EnterEvent, ExitEvent } from "../runtime/types.js";

type NumberKind = "i32" | "i64" | "f32" | "f64";

const I32_MIN = -2147483648;
const I32_MAX = 2147483647;

const NUMBER_TOKEN = /\bnumber\b/;
const NUMBER_TOKEN_GLOBAL = /\bnumber\b/g;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

const inferTypeName = (typeName: string, samples: unknown[]): string => {
  if (!NUMBER_TOKEN.test(typeName)) {
    return typeName;
  }
  const numbers = extractNumberSamples(samples);
  const kind = inferNumberKind(numbers);
  return typeName.replace(NUMBER_TOKEN_GLOBAL, kind);
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
