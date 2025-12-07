import { InstrumenterOptions } from "./types.js";

export const DEFAULT_RUNTIME_MODULE = "libtrace/runtime";

// default process all ts files under projectRoot/src if include is empty
// default exclude all test files under any dir like "__test__" if exclude is empty
export const getDefaultInstrumenterOptions = (projectRoot: string): InstrumenterOptions => ({
  projectRoot,
  srcDir: "src",
  outDir: ".instrumented",
  include: ["src/**/!(*.d).ts"],
  exclude: ["**/__test__/**", "**/__tests__/**"],
  runtimeModuleSpecifier: DEFAULT_RUNTIME_MODULE
});
