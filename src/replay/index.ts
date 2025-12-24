import path from "node:path";
import { ensureReplayIndex } from "./indexStore.js";
import { groupEventsToCallTriples, readTraceFile } from "./traceReader.js";

export function runReplay(traceFile: string, outDir: string): void {
  const traceDir = path.dirname(traceFile);
  const index = ensureReplayIndex(traceDir);

  const events = readTraceFile(traceFile);
  const triples = groupEventsToCallTriples(events);

  console.log(
    `Replayed trace file ${traceFile} -> ${triples.length} call triples (outDir=${outDir})`
  );
  console.log(`Replay index contains ${Object.keys(index.calls).length} calls`);
}
