import * as path from "node:path";

export interface RuntimeConfig {
  traceDir: string;
  groupByFunction: boolean;
}

export const getRuntimeConfig = (): RuntimeConfig => {
  const traceDir = process.env.LIBTRACE_DIR ?? path.resolve(process.cwd(), ".libtrace");
  const groupByEnv = process.env.LIBTRACE_GROUP_BY_FUNC;
  const normalizedGroupBy = groupByEnv?.toLowerCase();
  const groupByFunction =
    normalizedGroupBy === undefined ? true : !["false", "0"].includes(normalizedGroupBy);

  return { traceDir, groupByFunction };
};
