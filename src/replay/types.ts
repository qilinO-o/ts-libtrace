import { CallEvent, EnterEvent, ExitEvent } from "../runtime/types.js";

export interface CallTriple {
  enter: EnterEvent | undefined;
  call: CallEvent | undefined;
  exit: ExitEvent | undefined;
}

export interface TraceFileMeta {
  path: string;
  mtimeMs: number;
}

export interface CallIndexEntry {
  callId: string;
  fnId: string;
  filePath: string;
  lineNumbers: number[];
}

export interface ReplayIndex {
  files: TraceFileMeta[];
  calls: Map<string, CallIndexEntry>;
}
