import { writeEvent } from "./traceWriter.js";
import { EnterEvent, ExitEvent } from "./types.js";

let nextCallId = 1;

const genCallId = (): string => String(nextCallId++);

export const __trace = {
  enter(fnId: string, data: { thisArg: any; args: any; env: any }): string {
    const callId = genCallId();
    const event: EnterEvent = {
      type: "enter",
      fnId,
      callId,
      time: Date.now(),
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
    outcome: { kind: "return" | "throw"; value?: any; error?: any }
  ): void {
    const event: ExitEvent = {
      type: "exit",
      fnId,
      callId,
      time: Date.now(),
      outcome: {
        kind: outcome.kind,
        value: outcome.value,
        error: outcome.error
      }
    };

    writeEvent(event);
  }
};
