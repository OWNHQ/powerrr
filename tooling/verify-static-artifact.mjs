import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const outputRoot = resolve("apps/website/.output/public");
const forbidden = [
  "/api/",
  "ethereum-rpc.publicnode.com",
  "api.morpho.org/graphql",
  "ALCHEMY_API_KEY",
  "ETHEREUM_RPC_URL",
  "OWN_LEAD_WEBHOOK",
];
if (!process.env.NUXT_PUBLIC_CLARITY_PROJECT_ID?.trim()) {
  forbidden.push("clarity.ms", "c.bing.com");
}
const files = (await walk(outputRoot)).filter(
  (file) => !file.endsWith("SHA256SUMS"),
);
const checksumPath = resolve(outputRoot, "SHA256SUMS");
const violations = [];
const checksums = [];

for (const file of files) {
  const contents = await readFile(file);
  const path = relative(outputRoot, file);
  checksums.push(
    `${createHash("sha256").update(contents).digest("hex")}  ${path}`,
  );
  if (/\.(?:html|js|json|css|map)$/.test(file)) {
    const text = contents.toString("utf8");
    for (const pattern of forbidden) {
      if (text.includes(pattern)) violations.push(`${path}: ${pattern}`);
    }
  }
}

if (violations.length) {
  throw new Error(
    `Static artifact contains forbidden runtime dependencies:\n${violations.join("\n")}`,
  );
}

checksums.sort();
const checksumContents = `${checksums.join("\n")}\n`;
if (process.argv.includes("--write-checksums")) {
  await writeFile(checksumPath, checksumContents, "utf8");
} else {
  let existingChecksums;
  try {
    existingChecksums = await readFile(checksumPath, "utf8");
  } catch {
    throw new Error(
      "Static artifact has no SHA256SUMS file. Run pnpm build:static first.",
    );
  }
  if (existingChecksums !== checksumContents) {
    throw new Error(
      "Static artifact checksums do not match SHA256SUMS. Rebuild the artifact before deployment.",
    );
  }
}

console.log(
  `Verified ${files.length} static files: no Powerrr API, RPC fallback, GraphQL, or lead-webhook dependency found.`,
);

async function walk(directory) {
  const entries = await readdir(directory);
  const output = [];
  for (const entry of entries) {
    const path = resolve(directory, entry);
    if ((await stat(path)).isDirectory()) output.push(...(await walk(path)));
    else output.push(path);
  }
  return output;
}
