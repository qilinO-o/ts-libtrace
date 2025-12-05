import path from "node:path";
import ts from "typescript";
import { Command } from "commander";
import { buildToolConfig } from "../config/loadConfig.js";
import { CliOptions } from "../config/types.js";
import { createInstrumenter } from "../instrumenter/index.js";

const loadTsConfig = (tsconfigPath: string, projectRoot: string): ts.ParsedCommandLine => {
  const readResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (readResult.error) {
    throw new Error(ts.flattenDiagnosticMessageText(readResult.error.messageText, "\n"));
  }

  const parsed = ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    projectRoot,
    undefined,
    tsconfigPath
  );

  return parsed;
};

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

      const parsed = loadTsConfig(toolConfig.tsconfigPath, path.dirname(toolConfig.tsconfigPath));

      const instrumenterOptions = {
        projectRoot: toolConfig.projectRoot,
        srcDir: toolConfig.srcDir,
        outDir: toolConfig.outDir,
        include: toolConfig.include,
        exclude: toolConfig.exclude,
        runtimeModuleSpecifier: toolConfig.runtimeModuleSpecifier
      };

      const program = ts.createProgram({
        rootNames: parsed.fileNames,
        options: {
          ...parsed.options,
          outDir: toolConfig.outDir
        }
      });

      const emitResult = program.emit(
        undefined,
        undefined,
        undefined,
        undefined,
        {
          before: [createInstrumenter(instrumenterOptions)]
        }
      );

      const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

      if (diagnostics.length > 0) {
        const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCurrentDirectory: ts.sys.getCurrentDirectory,
          getCanonicalFileName: (fileName) => fileName,
          getNewLine: () => ts.sys.newLine
        });

        console.error(message);

        const hasError = diagnostics.some((d) => d.category === ts.DiagnosticCategory.Error);
        if (hasError) {
          process.exitCode = 1;
          return;
        }
      }

      console.log(`Instrumentation complete. Output written to ${toolConfig.outDir}`);
    });
};
