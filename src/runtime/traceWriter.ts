import fs from "fs-extra";
import path from "node:path";
import { TraceEvent } from "./types.js";
import { getRuntimeConfig } from "./env.js";

const buffer: Map<string, string[]> = new Map();

const deriveTraceFilePath = (fnId: string, traceDir: string): string => {
  const safeFnId = fnId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(traceDir, `${safeFnId}.jsonl`);
};

export const writeEvent = (event: TraceEvent): void => {
  const { traceDir, groupByFunction } = getRuntimeConfig();
  const targetPath = groupByFunction
    ? deriveTraceFilePath(event.fnId, traceDir)
    : path.join(traceDir, "trace.jsonl");

  const line = `${JSON.stringify(event)}\n`;
  const existing = buffer.get(targetPath) ?? [];
  existing.push(line);
  buffer.set(targetPath, existing);
};

export const flush = async (): Promise<void> => {
  const entries = Array.from(buffer.entries());
  buffer.clear();

  await Promise.all(
    entries.map(async ([filePath, lines]) => {
      await fs.ensureDir(path.dirname(filePath));
      await fs.appendFile(filePath, lines.join(""));
    })
  );
};
