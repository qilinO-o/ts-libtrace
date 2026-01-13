import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { cpus } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const tracesDir = path.resolve(currentDir, "simple-lib", "traces");
const outDir = path.resolve(tracesDir, "tests");
const binPath = path.resolve(currentDir, "..", "dist", "bin.js");

async function collectJsonlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectJsonlFiles(entryPath)));
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(entryPath);
      }
    }),
  );
  return files;
}

function runReplay(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [binPath, "replay", filePath, "--as", "--outDir", outDir],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Replay failed for ${filePath} with code ${code}`));
      }
    });
  });
}

async function runAll(): Promise<void> {
  const files = await collectJsonlFiles(tracesDir);
  if (files.length === 0) {
    return;
  }
  const concurrency = Math.max(1, Math.min(cpus().length, files.length));
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= files.length) {
        return;
      }
      await runReplay(files[current]);
    }
  });
  await Promise.all(workers);
}

runAll().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
