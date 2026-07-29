import { File } from "node:buffer";
import { appendFile, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const API_ROOT = "https://api.pinata.cloud";
const UPLOAD_ROOT = "https://uploads.pinata.cloud";
const RELEASE_PREFIX = "powerrr-release-";

const [command, argument] = process.argv.slice(2);
const token = process.env.PINATA_JWT;
if (!token) throw new Error("PINATA_JWT is required.");

if (command === "upload-car") {
  const carPath = resolve(argument ?? "build.car");
  const result = await uploadCar(carPath, token);
  await emitOutput("cid", result.cid);
  await emitOutput("ipfs_url", `https://${result.cid}.ipfs.dweb.link/`);
  await emitOutput("pinata_file_id", result.id);
  console.log(`Pinned ${result.size} bytes as ${result.cid}.`);
} else if (command === "prune") {
  await pruneReleases(token, Number(argument ?? 3));
} else {
  throw new Error(
    "Usage: node tooling/pinata-release.mjs <upload-car [path]|prune [count]>",
  );
}

async function uploadCar(carPath, jwt) {
  const contents = await readFile(carPath);
  const gitSha = process.env.GITHUB_SHA ?? "local";
  const releaseName = `${RELEASE_PREFIX}${gitSha}`;
  const form = new FormData();
  form.append("network", "public");
  form.append(
    "file",
    new File([contents], basename(carPath), {
      type: "application/vnd.ipld.car",
    }),
    basename(carPath),
  );
  form.append("name", releaseName);
  form.append(
    "keyvalues",
    JSON.stringify({ project: "powerrr", git_sha: gitSha }),
  );
  form.append("car", "true");

  const response = await fetch(`${UPLOAD_ROOT}/v3/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Pinata CAR upload failed (${response.status}): ${body.slice(0, 1_000)}`,
    );
  }
  const result = JSON.parse(body).data;
  if (!result?.cid || !result?.id) {
    throw new Error("Pinata returned no CID or file ID.");
  }
  return result;
}

async function pruneReleases(jwt, retainCount) {
  if (!Number.isInteger(retainCount) || retainCount < 1) {
    throw new Error("Retention count must be a positive integer.");
  }
  const rows = (await listPublicFiles(jwt))
    .filter((row) => row.name?.startsWith(RELEASE_PREFIX) && row.cid)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    );

  const uniqueRows = rows.filter(
    (row, index) =>
      rows.findIndex((candidate) => candidate.cid === row.cid) === index,
  );

  await emitOutput(
    "rollback_cids",
    JSON.stringify(uniqueRows.slice(1, retainCount).map((row) => row.cid)),
  );

  for (const row of uniqueRows.slice(retainCount)) {
    const deleteResponse = await fetch(
      `${API_ROOT}/v3/files/public/${encodeURIComponent(row.id)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${jwt}` } },
    );
    if (!deleteResponse.ok) {
      throw new Error(
        `Could not delete old release ${row.cid} (${deleteResponse.status}).`,
      );
    }
    console.log(`Removed old Powerrr release ${row.cid} from Pinata.`);
  }
}

async function listPublicFiles(jwt) {
  const rows = [];
  let pageToken;
  do {
    const query = new URLSearchParams({ limit: "100", order: "DESC" });
    if (pageToken) query.set("pageToken", pageToken);
    const response = await fetch(`${API_ROOT}/v3/files/public?${query}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `Pinata list failed (${response.status}): ${body.slice(0, 1_000)}`,
      );
    }
    const data = JSON.parse(body).data ?? {};
    rows.push(...(data.files ?? []));
    pageToken = data.next_page_token;
  } while (pageToken);
  return rows;
}

async function emitOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, "utf8");
  }
}
