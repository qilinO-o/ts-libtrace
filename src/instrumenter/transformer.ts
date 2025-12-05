import ts from "typescript";
import { InstrumenterOptions } from "../config/types.js";
import { isTopLevelTraceTarget, SelectorContext } from "./functionSelector.js";
import { buildFunctionIdStruct } from "./functionId.js";
import { ensureTraceImport, instrumentFunctionBody } from "./injection.js";

const shouldProcessFile = (fileName: string, options: InstrumenterOptions): boolean => {
  if (options.include && options.include.length > 0) {
    const isIncluded = options.include.some((pattern) => fileName.includes(pattern));
    if (!isIncluded) return false;
  }

  if (options.exclude && options.exclude.length > 0) {
    const isExcluded = options.exclude.some((pattern) => fileName.includes(pattern));
    if (isExcluded) return false;
  }

  return true;
};

export function transformSourceFile(
  context: ts.TransformationContext,
  sourceFile: ts.SourceFile,
  options: InstrumenterOptions
): ts.SourceFile {
  if (!shouldProcessFile(sourceFile.fileName, options)) {
    return sourceFile;
  }

  const factory = context.factory;
  const selectorCtx: SelectorContext = { sourceFile };

  const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      if (isTopLevelTraceTarget(node, selectorCtx)) {
        const fnId = buildFunctionIdStruct(node, sourceFile, options.projectRoot);
        return instrumentFunctionBody(node, factory, fnId);
      }
      return ts.visitEachChild(node, visitor, context);
    }

    return ts.visitEachChild(node, visitor, context);
  };

  const updated = ts.visitNode(sourceFile, visitor) as ts.SourceFile;
  return ensureTraceImport(updated, factory, options.runtimeModuleSpecifier ?? "libtrace/runtime");
}
