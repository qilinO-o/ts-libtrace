import { InstrumenterOptions } from "./types.js";

export const DEFAULT_RUNTIME_MODULE = "libtrace/runtime";

export const getDefaultInstrumenterOptions = (projectRoot: string): InstrumenterOptions => ({
  projectRoot,
  srcDir: "src",
  outDir: ".instrumented",
  runtimeModuleSpecifier: DEFAULT_RUNTIME_MODULE
});
