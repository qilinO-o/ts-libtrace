import path from "node:path";

export interface RuntimeConfig {
  traceDir: string;
  groupByFunction: boolean;
  eventFlushThreshold: number;
}

export const getRuntimeConfig = (): RuntimeConfig => {
  const traceDir = process.env.LIBTRACE_DIR ?? path.resolve(process.cwd(), ".libtrace");
  const groupByEnv = process.env.LIBTRACE_GROUP_BY_FUNC;
  const normalizedGroupBy = groupByEnv?.toLowerCase();
  const groupByFunction =
    normalizedGroupBy === undefined ? true : !["false", "0"].includes(normalizedGroupBy);

  const flushThresholdEnv = process.env.LIBTRACE_FLUSH_THRESHOLD ?? "30";
  let eventFlushThreshold = Number(flushThresholdEnv);
  if (!Number.isSafeInteger(eventFlushThreshold)) {
    eventFlushThreshold = 30;
  }
  return { traceDir, groupByFunction, eventFlushThreshold };
};
