import path from "node:path";
import ts from "typescript";

export const getFunctionName = (node: ts.FunctionLikeDeclarationBase): string | undefined => {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    if (node.name && ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    if (node.modifiers && node.modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) {
      return "default";
    }
  }

  if ((ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && node.parent) {
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
      return node.parent.name.text;
    }
    if (ts.isExportAssignment(node.parent)) {
      return "default";
    }
  }

  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }

  return undefined;
};

export const getEnclosingClassName = (node: ts.Node): string | undefined => {
  let current: ts.Node | undefined = node.parent;

  while (current && !ts.isSourceFile(current)) {
    if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
      if (current.name && ts.isIdentifier(current.name)) {
        return current.name.text;
      }
    }

    current = current.parent;
  }

  return undefined;
};

export const getRelativeFilePath = (sourceFile: ts.SourceFile, projectRoot: string): string => {
  const relativePath = path.relative(projectRoot, sourceFile.fileName);
  return relativePath.split(path.sep).join(path.posix.sep);
};

export const getLineAndCharacter = (
  sourceFile: ts.SourceFile,
  node: ts.Node
): { line: number; character: number } => {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, character: character + 1 };
};
