import fs from "fs-extra";
import path from "node:path";
import superjson from "superjson";
import { TraceEvent } from "./types.js";
import { getRuntimeConfig } from "./env.js";

const EVENT_BUFFER_THRESHOLD = 30;

class EventBuffer {
  buffer = new Map<string, TraceEvent[]>();
  eventCount = 0;
  traceDir: string;
  groupByFunction: boolean;

  constructor() {
    const { traceDir, groupByFunction } = getRuntimeConfig();
    this.traceDir = traceDir;
    this.groupByFunction = groupByFunction;
  }
}

// singleton
const eventBuffer = new EventBuffer();

const deriveTraceFilePath = (fnId: string, traceDir: string): string => {
  const safeFnId = fnId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(traceDir, `${safeFnId}.jsonl`);
};

export const writeEvent = (event: TraceEvent): void => {
  const targetPath = eventBuffer.groupByFunction
    ? deriveTraceFilePath(event.fnId, eventBuffer.traceDir)
    : path.join(eventBuffer.traceDir, "trace.jsonl");

  const existing = eventBuffer.buffer.get(targetPath);
  if (existing !== undefined) {
    existing.push(event);
  } else {
    eventBuffer.buffer.set(targetPath, [event]);
  }

  eventBuffer.eventCount++;
  if (eventBuffer.eventCount >= EVENT_BUFFER_THRESHOLD) {
    flushSync();
  }
};

export const flush = async (): Promise<void> => {
  const entries = Array.from(eventBuffer.buffer.entries());
  eventBuffer.buffer.clear();

  await Promise.all(
    entries.map(async ([filePath, events]) => {
      const lines = events.map((event) => `${superjson.stringify(event)}\n`);
      await fs.ensureDir(path.dirname(filePath));
      await fs.appendFile(filePath, lines.join(""));
    })
  );
};

export const flushSync = (): void => {
  const entries = Array.from(eventBuffer.buffer.entries());
  eventBuffer.buffer.clear();
  entries.map(([filePath, events]) => {
    const lines = events.map((event) => `${superjson.stringify(event)}\n`);
    fs.ensureDirSync(path.dirname(filePath));
    fs.appendFileSync(filePath, lines.join(""));
  });
}
