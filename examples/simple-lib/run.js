import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const traceDir =
  process.env.LIBTRACE_DIR ??
  path.resolve(__dirname, "traces");

process.env.LIBTRACE_DIR = traceDir;

const math = await import(new URL("./.instrumented/math.js", import.meta.url).href);

math.add(1, 2);
math.mul(3, 4);
math.addWithOffset(5);
math.multiplyWithConfig(6);
math.nextCounter();
math.nextCounter();

const calc = new math.Calculator(10);
calc.add(5);

math.demoSort([3, 1, 2]);
math.chained(2, 3);


const i1 = new math.INum(1, 2);
const i2 = new math.INum(3, 4);
math.iAdd(i1, i2);