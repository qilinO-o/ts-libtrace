import ts from "typescript";
import {
  getEnclosingClassName,
  getFunctionName,
  getLineAndCharacter,
  getRelativeFilePath
} from "./astUtils.js";

export interface FunctionIdStruct {
  relFilePath: string;
  line: number;
  character: number;
  name: string;
  className?: string;
}

export function buildFunctionIdStruct(
  node: ts.FunctionLikeDeclarationBase,
  sourceFile: ts.SourceFile,
  projectRoot: string
): FunctionIdStruct {
  const relFilePath = getRelativeFilePath(sourceFile, projectRoot);
  const { line, character } = getLineAndCharacter(sourceFile, node);
  const name = getFunctionName(node) ?? "<anonymous>";
  const className = getEnclosingClassName(node);

  return { relFilePath, line, character, name, className };
}

export function functionIdToString(id: FunctionIdStruct): string {
  return `${id.relFilePath}#${id.className ?? "-"}#${id.name}#L${id.line}C${id.character}`;
}
