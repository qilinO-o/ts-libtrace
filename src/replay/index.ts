import { groupEventsToCallTriples, readTraceFile } from "./traceReader.js";

export function runReplay(traceFile: string, outDir: string): void {
  const events = readTraceFile(traceFile);
  const triples = groupEventsToCallTriples(events);

  console.log(
    `Replayed trace file ${traceFile} -> ${triples.length} call triples (outDir=${outDir})`
  );
}