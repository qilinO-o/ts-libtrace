import ts from "typescript";
import { InstrumenterOptions } from "../config/types.js";
import { isTopLevelTraceTarget, SelectorContext } from "./functionSelector.js";
import { buildFunctionIdStruct } from "./functionId.js";
import { ensureTraceImport, instrumentFunctionBody } from "./injection.js";
import { updateClassMembers } from "./jsonRegisterInjection.js"

export function transformSourceFile(
  context: ts.TransformationContext,
  sourceFile: ts.SourceFile,
  options: InstrumenterOptions,
  typeChecker: ts.TypeChecker
): ts.SourceFile {
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
        return instrumentFunctionBody(node, factory, fnId, typeChecker);
      }
      return ts.visitEachChild(node, visitor, context);
    }

    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const updated = updateClassMembers(node, factory);
      return ts.visitEachChild(updated, visitor, context);
    }

    return ts.visitEachChild(node, visitor, context);
  };

  const updated = ts.visitNode(sourceFile, visitor) as ts.SourceFile;
  return ensureTraceImport(updated, factory, options.runtimeModuleSpecifier ?? "libtrace/runtime");
}
