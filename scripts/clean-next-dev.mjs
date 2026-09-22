import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const nextDirectory = resolve(repositoryRoot, ".next");
const generatedDevDirectory = resolve(nextDirectory, "dev");

if (dirname(generatedDevDirectory) !== nextDirectory) {
  throw new Error(`Refusing to remove an unexpected path: ${generatedDevDirectory}`);
}

rmSync(generatedDevDirectory, { force: true, recursive: true });
