import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const allowedLicenses = new Set([
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
  "OFL-1.1",
]);

const workspaceTrees = JSON.parse(
  execFileSync(
    "pnpm",
    ["-r", "list", "--prod", "--depth", "Infinity", "--json"],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  ),
);
const packages = new Map();

for (const workspace of workspaceTrees) {
  collectPackages(workspace.dependencies);
}

const rejected = [...packages.values()].filter(
  ({ license }) => !allowedLicenses.has(license),
);
if (rejected.length) {
  throw new Error(
    `Production dependencies use unapproved or unknown licenses:\n${rejected
      .map(({ name, version, license }) => `- ${name}@${version}: ${license}`)
      .join("\n")}`,
  );
}

const summary = Object.groupBy(
  [...packages.values()],
  ({ license }) => license,
);
console.log(
  `Verified ${packages.size} production dependencies: ${Object.entries(summary)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([license, entries]) => `${license} (${entries.length})`)
    .join(", ")}.`,
);

function collectPackages(dependencies = {}) {
  for (const [name, dependency] of Object.entries(dependencies)) {
    if (dependency.path && !dependency.version?.startsWith("link:")) {
      const manifest = JSON.parse(
        readFileSync(join(dependency.path, "package.json"), "utf8"),
      );
      const license = normalizeLicense(manifest.license ?? manifest.licenses);
      packages.set(`${name}@${dependency.version}`, {
        name,
        version: dependency.version,
        license,
      });
    }
    collectPackages(dependency.dependencies);
  }
}

function normalizeLicense(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry : entry?.type))
      .filter(Boolean)
      .join(" OR ");
  }
  return "NOASSERTION";
}
