export interface EnterEvent {
  type: "enter";
  fnId: string;
  callId: string;
  thisArg: any;
  thisArgTypes: string[];
  args: any;
  argsTypes: string[];
  env: any;
  envTypes: string[];
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
  // [returnValueType, errorType]
  outcomeTypes: string[];
  env: any;
  envTypes: string[];
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
