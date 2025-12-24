import path from "node:path";
import { Command } from "commander";
import { runReplay } from "../replay/index.js";

export const registerReplayCommand = (program: Command): Command => {
  return program
    .command("replay")
    .description("Replay a trace file and build call triples.")
    .argument("<traceFile>", "Path to a jsonl trace file")
    .option("--outDir <dir>", "Output directory for replay sources", "")
    .action((traceFile: string, options: { outDir?: string }) => {
      const absTraceFile = path.resolve(traceFile);
      const outDir = options.outDir ? path.resolve(options.outDir) : path.dirname(absTraceFile);

      runReplay(absTraceFile, outDir);
    });
};
