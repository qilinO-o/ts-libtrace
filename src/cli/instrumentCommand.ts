import { Command } from "commander";
import { buildToolConfig } from "../config/loadConfig.js";
import { CliOptions } from "../config/types.js";

export const registerInstrumentCommand = (program: Command): Command => {
  return program
    .command("instrument")
    .description("Instrument a TypeScript project.")
    .option("--project <path>", "Path to tsconfig.json", "tsconfig.json")
    .option("--srcDir <dir>", "Source directory to instrument", "src")
    .option("--outDir <dir>", "Output directory for instrumented code", ".instrumented")
    .option("--include <pattern...>", "Glob patterns to include", [])
    .option("--exclude <pattern...>", "Glob patterns to exclude", [])
    .action((options: CliOptions) => {
      const toolConfig = buildToolConfig(process.cwd(), options);
      console.log("instrument tool config:", JSON.stringify(toolConfig, null, 2));
    });
};
