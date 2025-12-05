import ts from "typescript";
import { InstrumenterOptions } from "../config/types.js";
import { transformSourceFile } from "./transformer.js";

export function createInstrumenter(options: InstrumenterOptions): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    return (sourceFile) => transformSourceFile(context, sourceFile, options);
  };
}
