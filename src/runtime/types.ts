export interface EnterEvent {
  type: "enter";
  fnId: string;
  callId: string;
  thisArg: any;
  args: any;
  env: any;
}

export interface ExitEvent {
  type: "exit";
  fnId: string;
  callId: string;
  outcome: {
    kind: "return" | "throw";
    value?: any;
    error?: any;
  };
}

export type TraceEvent = EnterEvent | ExitEvent;
