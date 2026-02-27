import fs from "fs-extra";
import path from "node:path";
import { ensureReplayIndex, findAllTriplesById } from "./indexStore.js";
import { generateReplaySource, generateUnitTestSource, combineUnitTests } from "./codegen.js";
import { groupEventsToCallTriples, readTraceFile } from "./traceReader.js";
import { inferCallTripleTypes } from "./typeInfer.js"
import { safeSegment } from "../common/common.js"

export function runReplay(traceFile: string, outDir: string, useTypeNames = false, ut = false): void {
  const traceDir = path.dirname(traceFile);
  const index = ensureReplayIndex(traceDir);

  const events = readTraceFile(traceFile);
  const triples = groupEventsToCallTriples(events);
  const inferTypedTriple = useTypeNames ? inferCallTripleTypes(triples, traceDir) : undefined;

  console.log(
    `Replaying trace file ${traceFile}\n\t-> ${triples.length} invocations\n\tTo outDir=${outDir})`
  );

  fs.ensureDirSync(outDir);

  const generatedFiles: string[] = [];

  if (ut) {
    const describes: {id: number, des: string}[] = [];
    const fnIdRec = triples.find(t => t.enter?.fnId !== undefined)?.enter?.fnId;
    if (fnIdRec === undefined) return;
    triples.forEach((triple) => {
      const fnId = triple.enter?.fnId;
      const callId = triple.enter?.callId;
      if (fnId === undefined || callId === undefined) {
        return;
      }

      try {
        const des = generateUnitTestSource(triple, index, useTypeNames, inferTypedTriple, traceDir);
        const id = Number(callId);
        describes.push({id, des});
      } catch (err) {
        console.error(`Failed to generate replay for ${fnId} of call ${callId} with error: ${err}`);
      }
    });
    const source = combineUnitTests(describes, fnIdRec, useTypeNames);
    const fnSafe = safeSegment(fnIdRec);
    const fileName = `replay_${fnSafe}.generated.ts`;
    const filePath = path.join(outDir, fileName);
    fs.writeFileSync(filePath, source, "utf8");
    generatedFiles.push(filePath);
  } else {
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
        const source = generateReplaySource(triple, index, useTypeNames, inferTypedTriple, traceDir);
        fs.writeFileSync(filePath, source, "utf8");
        generatedFiles.push(filePath);
      } catch (err) {
        console.error(`Failed to generate replay for ${fnId} of call ${callId} with error: ${err}`);
      }
    });
  }

  if (generatedFiles.length > 0) {
    console.log(`Generated replay files:\n\t${generatedFiles.join("\n\t")}`);
  }
}
