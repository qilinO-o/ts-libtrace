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
  env: any;
}

export interface Invocation {
  fnId: string;
  callId: string;
}

export interface CallEvent {
  type: "call";
  fnId: string;
  callId: string;
  childInvocations: Invocation[];
}

export type TraceEvent = EnterEvent | ExitEvent | CallEvent;
