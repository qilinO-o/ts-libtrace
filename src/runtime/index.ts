import superjson from "superjson";
import { Class } from "superjson/dist/types.js";
import { writeEvent, flush, flushSync } from "./traceWriter.js";
import { CallEvent, EnterEvent, ExitEvent, Invocation } from "./types.js";

let hasRegistered = false;

/**
 * helper functions that get type name during runtime
 * not precise compare to compile-time one
 * not used now
 *  */ 
// const getTypeName = (value: unknown): string => {
//   if (value === null) return "null";
//   if (value === undefined) return "undefined";

//   const valueType = typeof value;
//   if (valueType === "object" || valueType === "function") {
//     const ctor = (value as { constructor?: { name?: string } }).constructor;
//     if (ctor && typeof ctor.name === "string" && ctor.name.length > 0) {
//       return ctor.name;
//     }
//     return valueType === "function" ? "Function" : "Object";
//   }

//   return valueType;
// };

// const getArgTypeNames = (args: unknown): string[] => {
//   if (Array.isArray(args)) {
//     return args.map(getTypeName);
//   }

//   if (args && typeof args === "object") {
//     const maybeArrayLike = args as { length?: number };
//     if (typeof maybeArrayLike.length === "number") {
//       try {
//         return Array.from(args as ArrayLike<unknown>).map(getTypeName);
//       } catch {
//         return [getTypeName(args)];
//       }
//     }
//   }

//   return [getTypeName(args)];
// };

// const getEnvTypeNames = (env: unknown): string[] => {
//   if (env === null || env === undefined) {
//     return [];
//   }
//   if (typeof env !== "object") {
//     return [getTypeName(env)];
//   }

//   return Object.keys(env as Record<string, unknown>).map((key) =>
//     getTypeName((env as Record<string, unknown>)[key])
//   );
// };

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
const constructorMap: WeakMap<object, Invocation> = new WeakMap();

const genCallId = (): string => String(nextCallId++);

const pushCall = (invocation: Invocation, funcKind: number, thisArg: any): void => {
  callStack.push(invocation);
  if (funcKind === 3) constructorMap.set(thisArg, invocation);
  if (!childCallMap.has(invocation.callId)) {
    const invoc = funcKind === 2 ? constructorMap.get(thisArg) : undefined;
    childCallMap.set(invocation.callId, invoc !== undefined ? [invoc] : []);
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
  enter(
    fnId: string,
    thisArg: any,
    args: any,
    env: any,
    thisArgType: string,
    argsTypes: string[],
    envTypes: string[],
    funcKind: number,
  ): string {
    const callId = genCallId();
    pushCall({fnId, callId}, funcKind, thisArg);
    const event: EnterEvent = {
      type: "enter",
      fnId,
      callId,
      thisArg,
      thisArgType,
      args,
      argsTypes,
      env,
      envTypes
    };

    writeEvent(event);
    return callId;
  },
  exit(
    fnId: string,
    callId: string,
    outcome: { kind: "return" | "throw"; value?: any; error?: any },
    env: any,
    outcomeTypes: string[],
    envTypes: string[]
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
      outcomeTypes,
      env: envValue,
      envTypes
    };

    writeEvent(callEvent);
    writeEvent(event);
  },
  registerClass(cls: Class): void {
    superjson.registerClass(cls);
  }
};

registerFlushHooks();
