import fs from "fs-extra";
import path from "node:path";
import superjson from "superjson";
import { TraceEvent } from "../runtime/types.js";
import { CallTriple, ReplayIndex } from "./types.js";
import { groupEventsToCallTriples } from "./traceReader.js";

const INDEX_FILE = ".libtrace_index.json";

const readLines = (filePath: string): string[] => {
  const content = fs.readFileSync(filePath, "utf8");
  return content.split("\n").filter((line) => line.trim().length > 0);
};

function loadReplayIndex(dir: string): ReplayIndex | undefined {
  const indexPath = path.join(dir, INDEX_FILE);
  if (!fs.existsSync(indexPath)) {
    return undefined;
  }
  return fs.readJsonSync(indexPath) as ReplayIndex;
}

function buildReplayIndex(dir: string): ReplayIndex {
  const files = fs
    .readdirSync(dir)
    .filter((entry) => entry.endsWith(".jsonl"))
    .map((entry) => path.join(dir, entry));

  const index: ReplayIndex = {
    files: [],
    calls: {}
  };

  files.forEach((filePath) => {
    const stat = fs.statSync(filePath);
    index.files.push({ path: filePath, mtimeMs: stat.mtimeMs });

    const lines = readLines(filePath);
    lines.forEach((line, idx) => {
      const parsed = superjson.parse(line) as TraceEvent;
      const entry = index.calls[parsed.callId] ?? {
        callId: parsed.callId,
        fnId: parsed.fnId,
        filePath,
        lineNumbers: []
      };

      entry.fnId = parsed.fnId;
      entry.filePath = filePath;
      entry.lineNumbers.push(idx + 1);

      index.calls[parsed.callId] = entry;
    });
  });

  const indexPath = path.join(dir, INDEX_FILE);
  fs.writeJsonSync(indexPath, index, { spaces: 2 });
  return index;
}

const isIndexValid = (index: ReplayIndex, dir: string): boolean => {
  if (!index.files || index.files.length === 0) {
    return false;
  }

  const currentFiles = fs
    .readdirSync(dir)
    .filter((entry) => entry.endsWith(".jsonl"))
    .map((entry) => path.join(dir, entry));

  const indexedPaths = new Set(
    index.files.map((file) => (path.isAbsolute(file.path) ? file.path : path.join(dir, file.path)))
  );

  if (currentFiles.some((filePath) => !indexedPaths.has(filePath))) {
    return false;
  }

  return index.files.every((file) => {
    const filePath = path.isAbsolute(file.path) ? file.path : path.join(dir, file.path);
    if (!fs.existsSync(filePath)) {
      return false;
    }
    const stat = fs.statSync(filePath);
    return stat.mtimeMs === file.mtimeMs;
  });
};

export function ensureReplayIndex(dir: string): ReplayIndex {
  const loaded = loadReplayIndex(dir);
  if (!loaded || !isIndexValid(loaded, dir)) {
    return buildReplayIndex(dir);
  }
  return loaded;
}

const findTripleByCallId = (events: TraceEvent[], callId: string): CallTriple | undefined => {
  const triples = groupEventsToCallTriples(events);
  return triples.find((triple) => triple.enter?.callId === callId || triple.exit?.callId === callId);
};

export function findCallTripleById(callId: string, index: ReplayIndex): CallTriple | undefined {
  const entry = index.calls[callId];
  if (!entry) {
    return undefined;
  }

  const allLines = readLines(entry.filePath);
  if (allLines.length === 0) {
    return undefined;
  }

  const targetLines =
    entry.lineNumbers.length > 0
      ? entry.lineNumbers
          .filter((lineNumber) => lineNumber > 0 && lineNumber <= allLines.length)
          .map((lineNumber) => allLines[lineNumber - 1])
      : allLines;

  const events = targetLines.map((line) => superjson.parse(line) as TraceEvent);
  return findTripleByCallId(events, callId);
}

export function findAllTriplesById(callId: string, index: ReplayIndex): CallTriple[] {
  const entry = index.calls[callId];
  if (!entry) return [];
  const allLines = readLines(entry.filePath);
  if (allLines.length === 0) return [];
  const events = allLines.map((line) => superjson.parse(line) as TraceEvent);
  return groupEventsToCallTriples(events);
}
