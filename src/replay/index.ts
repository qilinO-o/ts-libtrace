import fs from "fs-extra";
import path from "node:path";
import { ensureReplayIndex } from "./indexStore.js";
import { generateReplaySource } from "./codegen.js";
import { groupEventsToCallTriples, readTraceFile } from "./traceReader.js";
import { inferCallTripleTypes } from "./typeInfer.js"
import { safeSegment } from "../common/common.js"

export function runReplay(traceFile: string, outDir: string, useTypeNames = false): void {
  const traceDir = path.dirname(traceFile);
  const index = ensureReplayIndex(traceDir);

  const events = readTraceFile(traceFile);
  const triples = groupEventsToCallTriples(events);
  const inferTypedTriple = useTypeNames ? inferCallTripleTypes(triples) : undefined;

  console.log(
    `Replaying trace file ${traceFile}\n\t-> ${triples.length} invocations\n\tTo outDir=${outDir})`
  );

  fs.ensureDirSync(outDir);

  const generatedFiles: string[] = [];

  triples.forEach((triple) => {
    const fnId = triple.enter?.fnId;
    const callId = triple.enter?.callId;
    if (fnId === undefined || callId === undefined) {
      return;
    }

    const fnSafe = safeSegment(fnId);
    const callSafe = safeSegment(callId);
    const fileName = `replay_${fnSafe}_${callSafe}.generated.ts`;
    const filePath = path.join(outDir, fileName);

    try {
      const source = generateReplaySource(triple, index, useTypeNames, inferTypedTriple);
      fs.writeFileSync(filePath, source, "utf8");
      generatedFiles.push(filePath);
    } catch (err) {
      console.error(`Failed to generate replay for ${fnId} of call ${callId} with error: ${err}`);
    }
  });

  if (generatedFiles.length > 0) {
    console.log(`Generated replay files:\n\t${generatedFiles.join("\n\t")}`);
  }
}
