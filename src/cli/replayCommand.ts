import path from "node:path";
import { Command } from "commander";
import { runReplay } from "../replay/index.js";

export const registerReplayCommand = (program: Command): Command => {
  return program
    .command("replay")
    .description("Replay a trace file and build call triples.")
    .argument("<traceFile>", "Path to a jsonl trace file")
    .option("--outDir <dir>", "Output directory for replay sources", "")
    .option("--as", "Use recorded type names in codegen", false)
    .action((traceFile: string, options: { outDir?: string; as?: boolean }) => {
      const absTraceFile = path.resolve(traceFile);
      const outDir = options.outDir ? path.resolve(options.outDir) : path.dirname(absTraceFile);

      runReplay(absTraceFile, outDir, Boolean(options.as));
    });
};
