import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("public");
const destination = resolve("dist");

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

const indexStats = await stat(resolve(destination, "index.html"));
if (indexStats.size < 1000) {
  throw new Error("Build validation failed: dist/index.html is unexpectedly small.");
}

console.log(`Built ${destination}`);
