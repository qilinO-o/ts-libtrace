import path from "node:path";
import { getDefaultInstrumenterOptions } from "./defaults.js";
import { CliOptions, ToolConfig } from "./types.js";

export function buildToolConfig(cwd: string, cliOptions: CliOptions): ToolConfig {
  const tsconfigPath = path.resolve(cwd, cliOptions.project ?? "tsconfig.json");
  const projectRoot = path.dirname(tsconfigPath);
  const defaults = getDefaultInstrumenterOptions(projectRoot);

  return {
    ...defaults,
    tsconfigPath,
    srcDir: cliOptions.srcDir ?? defaults.srcDir,
    outDir: cliOptions.outDir ?? defaults.outDir,
    include: cliOptions.include ?? defaults.include,
    exclude: cliOptions.exclude ?? defaults.exclude,
    runtimeModuleSpecifier: defaults.runtimeModuleSpecifier
  };
}
