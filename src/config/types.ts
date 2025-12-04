export interface InstrumenterOptions {
  projectRoot: string;
  srcDir: string;
  outDir: string;
  include?: string[];
  exclude?: string[];
  runtimeModuleSpecifier?: string;
}

export interface CliOptions {
  project?: string;
  srcDir?: string;
  outDir?: string;
  include?: string[];
  exclude?: string[];
}

export interface ToolConfig extends InstrumenterOptions {
  tsconfigPath: string;
}
