import path from "node:path";
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

const safeSegment = (segment: string): string => segment.replace(/[^a-zA-Z0-9._-]/g, "_");

export function functionIdToTraceFileName(id: FunctionIdStruct): string {
  const safeRelPath = safeSegment(id.relFilePath.replace(/[\\/]/g, "__"));
  const parts = [safeRelPath, id.className ?? "-", id.name, `L${id.line}C${id.character}`].map(
    (segment) => safeSegment(segment)
  );
  return `${parts.join("__")}.jsonl`;
}
