let callCounter = 0;

export const __trace = {
  enter(fnId: string, _data: { thisArg: any; args: any; env: any }): string {
    callCounter += 1;
    return `${fnId}#${Date.now().toString()}#${callCounter}`;
  },
  exit(
    fnId: string,
    callId: string,
    _outcome: { kind: "return" | "throw"; value?: any; error?: any }
  ): void {
    // Placeholder for future trace writer integration
    console.log("TRACE exit placeholder", { fnId, callId, _outcome });
  }
};
