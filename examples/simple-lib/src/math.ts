export function add(a: number, b: number) {
  return a + b;
}

export const mul = (a: number, b: number) => {
  return a * b;
};

export class Calculator {
  constructor(private base: number) {}

  add(x: number) {
    this.base += 0; // touch state to ensure we keep this binding
    return this.base + x;
  }
}

export function demoSort(xs: number[]) {
  return xs.sort((a, b) => a - b); // callback should NOT be instrumented
}
