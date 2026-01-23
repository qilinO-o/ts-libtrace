import fs from "fs-extra";
import superjson from "superjson";
import { Class } from "superjson/dist/types.js";
import { TraceEvent } from "../runtime/types.js";
import { CallTriple } from "./types.js";

const registeredClasses = new Map<string, Class>();

const createNamedClass = (name: string): Class => {
  const holder: Record<string, Class> = {
    [name]: class {}
  };
  return holder[name];
};

const collectClassNames = (value: unknown, names: Set<string>): void => {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (Array.isArray(entry) && entry[0] === "class" && typeof entry[1] === "string") {
        names.add(entry[1]);
        return;
      }
      collectClassNames(entry, names);
    });
    return;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((entry) => collectClassNames(entry, names));
  }
};

const ensureClassRegistered = (name: string): Class => {
  const cached = registeredClasses.get(name);
  if (cached) return cached;

  const cls = createNamedClass(name);
  superjson.registerClass(cls, { identifier: name });

  registeredClasses.set(name, cls);
  return cls;
};

export const parseTraceLine = (line: string): TraceEvent => {
  try {
    return superjson.parse(line) as TraceEvent;
  } catch (error) {
    let parsed: { json: unknown; meta?: { values?: unknown } };
    try {
      parsed = JSON.parse(line) as { json: unknown; meta?: { values?: unknown } };
    } catch {
      throw error;
    }

    const classNames = new Set<string>();
    collectClassNames(parsed.meta?.values, classNames);
    if (classNames.size === 0) {
      throw error;
    }
    classNames.forEach((name) => ensureClassRegistered(name));
    return superjson.deserialize(parsed as any) as TraceEvent;
  }
};

export const toJsonString = (value: unknown, typeName?: string): string => {
  const toJsonText = (v: unknown): string => {
    const { json } = superjson.serialize(v);
    return json === undefined ? "null" : JSON.stringify(json);
  };
  let target: unknown = value;
  if (typeName && value && typeof value === "object") {
    const cls = registeredClasses.get(typeName);
    if (cls && !(value instanceof cls)) {
      const inst = new cls();
      Object.assign(inst as any, value);
      target = inst;
    }
  }
  return toJsonText(target);
};

export function readTraceFile(traceFile: string): TraceEvent[] {
  const content = fs.readFileSync(traceFile, "utf8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  return lines.map((line) => parseTraceLine(line));
}

export function groupEventsToCallTriples(events: TraceEvent[]): CallTriple[] {
  const byCallId = new Map<string, CallTriple>();

  events.forEach((event) => {
    const bucket = byCallId.get(event.callId) ?? { enter: undefined, call: undefined, exit: undefined };

    if (event.type === "enter") {
      bucket.enter = event;
    } else if (event.type === "call") {
      bucket.call = event;
    } else if (event.type === "exit") {
      bucket.exit = event;
    }

    byCallId.set(event.callId, bucket);
  });

  return Array.from(byCallId.values());
}

