import { writeEvent } from "./traceWriter.js";
import { CallEvent, EnterEvent, ExitEvent } from "./types.js";

let nextCallId = 1;
const callStack: string[] = [];
const childCallMap: Map<string, string[]> = new Map();

const genCallId = (): string => String(nextCallId++);

const pushCall = (callId: string): void => {
  callStack.push(callId);
  if (!childCallMap.has(callId)) {
    childCallMap.set(callId, []);
  }
};

const popCall = (): { callId?: string; childCallIds: string[] } => {
  const callId = callStack.pop();
  if (!callId) {
    return { callId: undefined, childCallIds: [] };
  }

  const childCallIds = childCallMap.get(callId) ?? [];
  childCallMap.delete(callId);

  const parentId = callStack[callStack.length - 1];
  if (parentId) {
    const siblings = childCallMap.get(parentId) ?? [];
    siblings.push(callId);
    childCallMap.set(parentId, siblings);
  }

  return { callId, childCallIds };
};

export const __trace = {
  enter(fnId: string, data: { thisArg: any; args: any; env: any }): string {
    const callId = genCallId();
    pushCall(callId);
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
    const { childCallIds } = popCall();

    const callEvent: CallEvent = {
      type: "call",
      fnId,
      callId,
      childCallIds
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
