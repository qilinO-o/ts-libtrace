import { defaultConfig } from "./defaults.js";
import { LibtraceConfig } from "./types.js";

export const loadConfig = (overrides: Partial<LibtraceConfig> = {}): LibtraceConfig => ({
  ...defaultConfig,
  ...overrides
});

