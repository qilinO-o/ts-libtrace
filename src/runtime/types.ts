export interface EnterEvent {
  type: "enter";
  fnId: string;
  callId: string;
  time: number;
  thisArg: any;
  args: any;
  env: any;
}

export interface ExitEvent {
  type: "exit";
  fnId: string;
  callId: string;
  time: number;
  outcome: {
    kind: "return" | "throw";
    value?: any;
    error?: any;
  };
}

export type TraceEvent = EnterEvent | ExitEvent;
