import { writeEvent, flush, flushSync } from "./traceWriter.js";
import { CallEvent, EnterEvent, ExitEvent, Invocation } from "./types.js";

let hasRegistered = false;

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
    const event: EnterEvent = {
      type: "enter",
      fnId,
      callId,
      thisArg: data.thisArg,
      args: data.args,
      env: data.env
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
      env
    };

    writeEvent(callEvent);
    writeEvent(event);
  }
};

registerFlushHooks();
