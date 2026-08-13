import { File } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, lstat, readFile, readdir } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";

const API_ROOT = "https://api.pinata.cloud";
const RELEASE_PREFIX = "powerrr-release-";
const DEFAULT_ARTIFACT = "apps/website/.output/public";

const [command, argument] = process.argv.slice(2);
const token = process.env.PINATA_JWT;
if (!token) throw new Error("PINATA_JWT is required.");

if (command === "upload-directory") {
  const artifactPath = resolve(argument ?? DEFAULT_ARTIFACT);
  const result = await uploadDirectory(artifactPath, token);
  await emitOutput("cid", result.cid);
  await emitOutput("ipfs_url", `https://${result.cid}.ipfs.inbrowser.link/`);
  console.log(`Pinned ${result.size} bytes as ${result.cid}.`);
} else if (command === "prune") {
  await pruneReleases(token, Number(argument ?? 3));
} else {
  throw new Error(
    "Usage: node tooling/pinata-release.mjs <upload-directory [path]|prune [count]>",
  );
}

async function uploadDirectory(artifactPath, jwt) {
  const files = await walkFiles(artifactPath);
  if (!files.length) throw new Error("The static artifact is empty.");
  await verifyChecksums(artifactPath, files);

  const sourceRef = getSourceRef();
  const releaseName = `${RELEASE_PREFIX}${sourceRef}`;
  const form = new FormData();
  let totalSize = 0;

  for (const path of files) {
    const contents = await readFile(path);
    const relativePath = relative(artifactPath, path).split(sep).join("/");
    const uploadPath = `${basename(artifactPath)}/${relativePath}`;
    totalSize += contents.byteLength;
    form.append("file", new File([contents], uploadPath), uploadPath);
  }

  form.append(
    "pinataMetadata",
    JSON.stringify({
      name: releaseName,
      keyvalues: { project: "powerrr", source_ref: sourceRef },
    }),
  );
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const response = await fetch(`${API_ROOT}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Pinata directory upload failed (${response.status}): ${body.slice(0, 1_000)}`,
    );
  }
  const result = JSON.parse(body);
  if (!result?.IpfsHash) throw new Error("Pinata returned no CID.");
  return { cid: result.IpfsHash, size: result.PinSize ?? totalSize };
}

async function pruneReleases(jwt, retainCount) {
  if (!Number.isInteger(retainCount) || retainCount < 1) {
    throw new Error("Retention count must be a positive integer.");
  }
  const rows = (await listPublicFiles(jwt))
    .filter(
      (row) =>
        row.metadata?.name?.startsWith(RELEASE_PREFIX) && row.ipfs_pin_hash,
    )
    .sort(
      (left, right) =>
        new Date(right.date_pinned).getTime() -
        new Date(left.date_pinned).getTime(),
    );

  const uniqueRows = rows.filter(
    (row, index) =>
      rows.findIndex(
        (candidate) => candidate.ipfs_pin_hash === row.ipfs_pin_hash,
      ) === index,
  );

  await emitOutput(
    "rollback_cids",
    JSON.stringify(
      uniqueRows.slice(1, retainCount).map((row) => row.ipfs_pin_hash),
    ),
  );

  for (const row of uniqueRows.slice(retainCount)) {
    const deleteResponse = await fetch(
      `${API_ROOT}/pinning/unpin/${encodeURIComponent(row.ipfs_pin_hash)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${jwt}` } },
    );
    if (!deleteResponse.ok) {
      throw new Error(
        `Could not delete old release ${row.ipfs_pin_hash} (${deleteResponse.status}).`,
      );
    }
    console.log(
      `Removed old Powerrr release ${row.ipfs_pin_hash} from Pinata.`,
    );
  }
}

async function listPublicFiles(jwt) {
  const rows = [];
  let pageOffset = 0;
  do {
    const query = new URLSearchParams({
      status: "pinned",
      pageLimit: "1000",
      pageOffset: String(pageOffset),
      includeCount: "false",
    });
    const response = await fetch(`${API_ROOT}/data/pinList?${query}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `Pinata list failed (${response.status}): ${body.slice(0, 1_000)}`,
      );
    }
    const page = JSON.parse(body).rows ?? [];
    rows.push(...page);
    pageOffset += page.length;
    if (page.length < 1000) break;
  } while (true);
  return rows;
}

async function verifyChecksums(artifactPath, files) {
  const checksumPath = resolve(artifactPath, "SHA256SUMS");
  const expected = await readFile(checksumPath, "utf8");
  const actual = [];

  for (const path of files) {
    if (path === checksumPath) continue;
    const contents = await readFile(path);
    const uploadPath = relative(artifactPath, path).split(sep).join("/");
    actual.push(
      `${createHash("sha256").update(contents).digest("hex")}  ${uploadPath}`,
    );
  }

  actual.sort();
  if (`${actual.join("\n")}\n` !== expected) {
    throw new Error(
      "Static artifact checksums do not match SHA256SUMS. Rebuild before deployment.",
    );
  }
}

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = resolve(directory, entry.name);
    const details = await lstat(path);
    if (details.isSymbolicLink()) {
      throw new Error(`Static artifacts cannot contain symlinks: ${path}`);
    }
    if (details.isDirectory()) output.push(...(await walkFiles(path)));
    else if (details.isFile()) output.push(path);
  }
  return output;
}

async function emitOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, "utf8");
  }
}

function getSourceRef() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    const revision = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).trim();
    return dirty ? `${revision}-dirty` : revision;
  } catch {
    return "local";
  }
}
