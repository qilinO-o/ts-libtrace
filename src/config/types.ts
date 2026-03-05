export interface InstrumenterOptions {
  projectRoot: string;
  srcDir: string;
  outDir: string;
  include?: string[];
  exclude?: string[];
  runtimeModuleSpecifier?: string;
  noEnv?: boolean;
}

export interface CliOptions {
  project?: string;
  srcDir?: string;
  outDir?: string;
  include?: string[];
  exclude?: string[];
  noEnv?: boolean;
}

export interface ToolConfig extends InstrumenterOptions {
  tsconfigPath: string;
}
