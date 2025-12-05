import ts from "typescript";

export interface SelectorContext {
  sourceFile: ts.SourceFile;
}

export function isTopLevelTraceTarget(
  node: ts.FunctionLikeDeclarationBase,
  ctx: SelectorContext
): boolean {
  if (ts.isFunctionDeclaration(node)) {
    return node.parent === ctx.sourceFile;
  }

  if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
    return true;
  }

  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
      const varDecl = node.parent;
      const varDeclList = varDecl.parent;
      const varStatement = varDeclList?.parent;

      if (
        varDeclList &&
        ts.isVariableDeclarationList(varDeclList) &&
        varStatement &&
        ts.isVariableStatement(varStatement) &&
        varStatement.parent === ctx.sourceFile
      ) {
        return true;
      }
    }

    return false;
  }

  return false;
}
