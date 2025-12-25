export function add(a: number, b: number) {
  return a + b;
}

export const mul = (a: number, b: number) => {
  return a * b;
};

const OFFSET = 10;
const config = { factor: 2 };
var GLOBALCOUNTER = 0;

export function addWithOffset(x: number) {
  return x + OFFSET;
}

export function multiplyWithConfig(x: number) {
  return x * config.factor;
}

export function nextCounter() {
  const ret = GLOBALCOUNTER;
  GLOBALCOUNTER += 1;
  return ret;
}

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

export function chained(a: number, b: number) {
  const sum = add(a, b);
  const product = mul(a, b);
  return sum + product;
}

export class INum {
  i: number = 0;
  r: number = 0;
  constructor(i: number, r: number) {
    this.i = i;
    this.r = r;
  }
}

export function iAdd(a: INum, b: INum): INum {
  return new INum(a.i + b.i, a.r + b.r);
}