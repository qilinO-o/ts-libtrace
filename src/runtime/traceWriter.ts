import fs from "fs-extra";
import path from "node:path";
import superjson from "superjson";
import { TraceEvent } from "./types.js";
import { getRuntimeConfig } from "./env.js";

const buffer: Map<string, TraceEvent[]> = new Map();

const deriveTraceFilePath = (fnId: string, traceDir: string): string => {
  const safeFnId = fnId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(traceDir, `${safeFnId}.jsonl`);
};

export const writeEvent = (event: TraceEvent): void => {
  const { traceDir, groupByFunction } = getRuntimeConfig();
  const targetPath = groupByFunction
    ? deriveTraceFilePath(event.fnId, traceDir)
    : path.join(traceDir, "trace.jsonl");

  const existing = buffer.get(targetPath);
  if (existing !== undefined) {
    existing.push(event);
  } else {
    buffer.set(targetPath, [event]);
  }
};

export const flush = async (): Promise<void> => {
  const entries = Array.from(buffer.entries());
  buffer.clear();

  await Promise.all(
    entries.map(async ([filePath, events]) => {
      const lines = events.map((event) => `${superjson.stringify(event)}\n`);
      await fs.ensureDir(path.dirname(filePath));
      await fs.appendFile(filePath, lines.join(""));
    })
  );
};
