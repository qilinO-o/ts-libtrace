const gStrSet: Set<string> = new Set<string>;

export class UseStdTest {
  strCount: Map<string, number>;
  constructor() {
    this.strCount = new Map();
  }

  recordStr(s: string) {
    const n = this.strCount.get(s);
    if (n === undefined) this.strCount.set(s, 1);
    else this.strCount.set(s, n + 1);
  }
}

export function checkSet(s: string): string {
  if (gStrSet.has(s)) {
    return "already had";
  } else {
    if (s.startsWith("g")) {
      gStrSet.add(s);
      return s;
    } else return "unqualified";
  }
}