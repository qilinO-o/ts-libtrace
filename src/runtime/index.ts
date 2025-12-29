import { writeEvent, flush, flushSync } from "./traceWriter.js";
import { CallEvent, EnterEvent, ExitEvent, Invocation } from "./types.js";

let hasRegistered = false;

const getTypeName = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  const valueType = typeof value;
  if (valueType === "object" || valueType === "function") {
    const ctor = (value as { constructor?: { name?: string } }).constructor;
    if (ctor && typeof ctor.name === "string" && ctor.name.length > 0) {
      return ctor.name;
    }
    return valueType === "function" ? "Function" : "Object";
  }

  return valueType;
};

const getArgTypeNames = (args: unknown): string[] => {
  if (Array.isArray(args)) {
    return args.map(getTypeName);
  }

  if (args && typeof args === "object") {
    const maybeArrayLike = args as { length?: number };
    if (typeof maybeArrayLike.length === "number") {
      try {
        return Array.from(args as ArrayLike<unknown>).map(getTypeName);
      } catch {
        return [getTypeName(args)];
      }
    }
  }

  return [getTypeName(args)];
};

const getEnvTypeNames = (env: unknown): string[] => {
  if (env === null || env === undefined) {
    return [];
  }
  if (typeof env !== "object") {
    return [getTypeName(env)];
  }

  return Object.keys(env as Record<string, unknown>).map((key) =>
    getTypeName((env as Record<string, unknown>)[key])
  );
};

function registerFlushHooks() {
  if (hasRegistered) return;
  hasRegistered = true;

  process.on("beforeExit", () => {
    flush().catch((err) => {
      console.error("[libtrace] async flush failed in beforeExit:", err);
    });
  });

  process.on("exit", () => {
    try {
      flushSync();
    } catch (err) {
      console.error("[libtrace] sync flush failed in exit:", err);
    }
  });
}

export { flush as __trace_flush, flushSync as __trace_flushSync } from "./traceWriter.js"

let nextCallId = 1;
const callStack: Invocation[] = [];
const childCallMap: Map<string, Invocation[]> = new Map();

const genCallId = (): string => String(nextCallId++);

const pushCall = (invocation: Invocation): void => {
  callStack.push(invocation);
  if (!childCallMap.has(invocation.callId)) {
    childCallMap.set(invocation.callId, []);
  }
};

const popCall = (): Invocation[] => {
  const callInvoc = callStack.pop();
  if (!callInvoc) {
    return [];
  }

  const childInvocations = childCallMap.get(callInvoc.callId) ?? [];
  childCallMap.delete(callInvoc.callId);

  const parentId = callStack[callStack.length - 1];
  if (parentId) {
    const siblings = childCallMap.get(parentId.callId) ?? [];
    siblings.push(callInvoc);
    childCallMap.set(parentId.callId, siblings);
  }

  return childInvocations;
};

export const __trace = {
  enter(fnId: string, data: { thisArg: any; args: any; env: any }): string {
    const callId = genCallId();
    pushCall({fnId, callId});
    const env = data.env;
    const args = data.args;
    const thisArg = data.thisArg;
    const event: EnterEvent = {
      type: "enter",
      fnId,
      callId,
      thisArg,
      thisArgTypes: [getTypeName(thisArg)],
      args,
      argsTypes: getArgTypeNames(args),
      env,
      envTypes: getEnvTypeNames(env)
    };

    writeEvent(event);
    return callId;
  },
  exit(
    fnId: string,
    callId: string,
    outcome: { kind: "return" | "throw"; value?: any; error?: any },
    env: any
  ): void {
    const childInvocations = popCall();
    const envValue = env;

    const callEvent: CallEvent = {
      type: "call",
      fnId,
      callId,
      childInvocations
    };

    const event: ExitEvent = {
      type: "exit",
      fnId,
      callId,
      outcome: {
        kind: outcome.kind,
        value: outcome.value,
        error: outcome.error
      },
      outcomeTypes: [getTypeName(outcome.value), getTypeName(outcome.error)],
      env: envValue,
      envTypes: getEnvTypeNames(envValue)
    };

    writeEvent(callEvent);
    writeEvent(event);
  }
};

registerFlushHooks();
