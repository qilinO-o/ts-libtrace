import { Command } from "commander";

export interface InstrumentCommandOptions {
  project: string;
  srcDir: string;
  outDir: string;
  include: string[];
  exclude: string[];
}

export const registerInstrumentCommand = (program: Command): Command => {
  return program
    .command("instrument")
    .description("Instrument a TypeScript project.")
    .option("--project <path>", "Path to tsconfig.json", "tsconfig.json")
    .option("--srcDir <dir>", "Source directory to instrument", "src")
    .option("--outDir <dir>", "Output directory for instrumented code", ".instrumented")
    .option("--include <pattern...>", "Glob patterns to include", [])
    .option("--exclude <pattern...>", "Glob patterns to exclude", [])
    .action((options: InstrumentCommandOptions) => {
      const { project, srcDir, outDir, include, exclude } = options;
      console.log(
        "instrument options:",
        JSON.stringify({ project, srcDir, outDir, include, exclude }, null, 2)
      );
    });
};
