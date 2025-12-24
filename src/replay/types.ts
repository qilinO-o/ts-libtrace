import { CallEvent, EnterEvent, ExitEvent } from "../runtime/types.js";

export interface CallTriple {
  enter: EnterEvent | undefined;
  call: CallEvent | undefined;
  exit: ExitEvent | undefined;
}

