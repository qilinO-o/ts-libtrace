import path from "node:path";
import { fileURLToPath } from "node:url";
import { flush } from "../../dist/runtime/traceWriter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const traceDir =
  process.env.LIBTRACE_DIR ??
  path.resolve(__dirname, "traces");

process.env.LIBTRACE_DIR = traceDir;

const math = await import(new URL("./.instrumented/math.js", import.meta.url).href);

math.add(1, 2);
math.mul(3, 4);

const calc = new math.Calculator(10);
calc.add(5);

math.demoSort([3, 1, 2]);
math.chained(2, 3);

await flush();

console.log(`Traces written to ${traceDir}`);
