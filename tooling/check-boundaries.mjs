import { readFile } from "node:fs/promises";

const liveRuntimeFiles = [
  "packages/protocol-adapters/src/aave-like-live-source.ts",
  "packages/protocol-adapters/src/compound-live-source.ts",
  "packages/protocol-adapters/src/morpho-live-source.ts",
  "packages/protocol-adapters/src/live-snapshots.ts",
  "apps/website/server/utils/live-engine-dependencies.ts",
];

const violations = [];
for (const file of liveRuntimeFiles) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  if (source.includes("@powerrr/fixtures")) {
    violations.push(file);
  }
}

if (violations.length) {
  console.error(
    `Live runtime files must not import fixtures:\n${violations.join("\n")}`,
  );
  process.exitCode = 1;
}
