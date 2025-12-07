import ts from "typescript";
import path from "node:path";
import { globSync } from "glob";
import { InstrumenterOptions } from "../config/types.js";
import { transformSourceFile } from "./transformer.js";

const collectMatches = (
  patterns: string[] | undefined,
  projectRoot: string
): string[] | undefined => {
  if (patterns === undefined) return undefined;

  const result = new Set<string>();
  for (const pattern of patterns) {
    const matches = globSync(pattern, {
      cwd: projectRoot,
      absolute: true,
      nodir: true
    });

    for (const match of matches) {
      result.add(path.resolve(match));
    }
  }

  return Array.from(result);
};

const shouldProcessFile = (fileName: string, allIncludes?: string[], allExcludes?: string[]): boolean => {
  const absFile = path.resolve(fileName);
  if (allIncludes && !allIncludes.some((inc) => path.resolve(inc) === absFile)) {
    return false;
  }
  if (allExcludes && allExcludes.some((exc) => path.resolve(exc) === absFile)) {
    return false;
  }
  return true;
}

export function createInstrumenter(options: InstrumenterOptions): ts.TransformerFactory<ts.SourceFile> {
  const includePatterns = options.include && options.include.length > 0 ? options.include : undefined;
  const excludePatterns = options.exclude && options.exclude.length > 0 ? options.exclude : undefined;
  const allIncludes = collectMatches(includePatterns, options.projectRoot);
  const allExcludes = collectMatches(excludePatterns, options.projectRoot);
  return (context) => {
    return (sourceFile) => {
      if (shouldProcessFile(sourceFile.fileName, allIncludes, allExcludes)) {
        return transformSourceFile(context, sourceFile, options);
      } else {
        return sourceFile;
      }
    }
  };
}
