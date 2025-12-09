libtrace
========

Trace any pure TypeScript library and capture function I/O, environment values, and calling relationship without changing the source by hand.

What it does
------------
- Instruments TypeScript sources via a custom transformer (CLI command `libtrace instrument`).
- Emits JSONL traces per function (by default grouped under `.libtrace` and per-function files).
- Records enter/exit parameters, captured free-variable environments, and parent/child call relationships.

Quick start
-----------
1) Clone the repo and build the CLI.
```bash
npm run build
```

2) Instrument a project (defaults: include `src/**`, exclude `**/__test__/**`):
```bash
node dist/bin.js instrument --project path/to/tsconfig.json --outDir .instrumented
```
Use `--include` / `--exclude` glob patterns and `--verbose` to inspect the resolved config.

3) Run your instrumented code and set an output directory (default: traces out to `.libtrace`):
```bash
LIBTRACE_DIR=./traces node .instrumented/your-entry.js
```

4) Inspect traces:
Each function gets a JSONL file containing `enter`, `call`, and `exit` events with serialized args, env, and outcomes.

Example
-------
A minimal example lives in `examples/simple-lib`:
```bash
node dist/bin.js instrument --project examples/simple-lib/tsconfig.json
node examples/simple-lib/run.js
```
Check `examples/simple-lib/traces` to see captured env values and child-call relationships.

Notes
-----
- Runtime module is exposed as `libtrace/runtime`; the transformer injects the import automatically. But you have to place the `dist/runtime` under `node_modules` as `libtrace/runtime` and provide a simple `package.json` like:
    ```json
    {
        "name": "libtrace",
        "type": "module",
        "exports": {
            "./runtime": "./runtime/index.js"
        }
    }
    ```
- By default, output is grouped per function; configure `LIBTRACE_GROUP_BY_FUNC=false` to combine all into a single file.
