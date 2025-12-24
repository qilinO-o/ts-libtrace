import fs from "fs-extra";
import superjson from "superjson";
import { TraceEvent } from "../runtime/types.js";
import { CallTriple } from "./types.js";

export function readTraceFile(traceFile: string): TraceEvent[] {
  const content = fs.readFileSync(traceFile, "utf8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  return lines.map((line) => superjson.parse(line) as TraceEvent);
}

export function groupEventsToCallTriples(events: TraceEvent[]): CallTriple[] {
  const byCallId = new Map<string, CallTriple>();

  events.forEach((event) => {
    const bucket = byCallId.get(event.callId) ?? { enter: undefined, call: undefined, exit: undefined };

    if (event.type === "enter") {
      bucket.enter = event;
    } else if (event.type === "call") {
      bucket.call = event;
    } else if (event.type === "exit") {
      bucket.exit = event;
    }

    byCallId.set(event.callId, bucket);
  });

  return Array.from(byCallId.values());
}

