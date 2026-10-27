import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const dependency = "aa56ecfceb85b6d6f78158ac34d37440103942a4";
const root = new URL("../", import.meta.url);
const source = new URL(
  "contracts/scenario-planning.proposal.openapi.json",
  root,
);
if (process.argv.includes("--import-proposal")) {
  // Consumer snapshot only: never checkout/modify Backend or shared producers.
  const content = execFileSync(
    "git",
    [
      "-c",
      `safe.directory=${fileURLToPath(new URL("../../", import.meta.url))
        .replaceAll("\\", "/")
        .replace(/\/$/, "")}`,
      "show",
      `${dependency}:backend/docs/scenario-planning.openapi.json`,
    ],
    {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      windowsHide: true,
    },
  );
  await mkdir(new URL("contracts/", root), { recursive: true });
  await writeFile(source, content.replace(/\r\n/g, "\n"));
}
const raw = (await readFile(source, "utf8")).replace(/\r\n/g, "\n");
if (
  createHash("sha256").update(raw).digest("hex") !==
  "5cec46e4c7e8777b42252e0d783c2a5889dd1e18784bab0a0578c9c4034677af"
)
  throw new Error(
    "Pinned producer proposal changed; review dependency SHA and hash together before updating the consumer",
  );
const contract = JSON.parse(raw);
const definitions = { ...contract.components.schemas };
for (const [path, methods] of Object.entries(contract.paths))
  for (const [method, operation] of Object.entries(methods)) {
    const name = `${method}_${path}`
      .replace(/\{([^}]+)\}/g, "by_$1")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/_$/, "");
    for (const [status, response] of Object.entries(operation.responses))
      if (status.startsWith("2"))
        definitions[name] = response.content["application/json"].schema;
  }
const schema = JSON.parse(
  JSON.stringify({
    type: "object",
    additionalProperties: false,
    definitions,
  }).replaceAll("#/components/schemas/", "#/definitions/"),
);
const types = await compile(schema, "ScenarioProposalCatalog", {
  bannerComment: `/* Generated consumer of Backend PROPOSAL ${dependency}. Engine results remain UNFROZEN; do not infer fields. */`,
  unreachableDefinitions: true,
  maxItems: -1,
  unknownAny: true,
});
const manifest = {
  status: "PROPOSAL_NOT_API_READY",
  producer_sha: dependency,
  source_sha256: createHash("sha256").update(raw).digest("hex"),
  engine_result: "PENDING_FLEX",
  comparison: "PENDING_FLEX",
  runnable: false,
  sensitivity: false,
  live_handoff: false,
};
await mkdir(new URL("types/generated/", root), { recursive: true });
for (const [file, value] of [
  ["scenario-planning.ts", types],
  ["scenario-planning.schema.json", JSON.stringify(schema, null, 2) + "\n"],
  ["scenario-planning.manifest.json", JSON.stringify(manifest, null, 2) + "\n"],
]) {
  const target = new URL(`types/generated/${file}`, root);
  if (process.argv.includes("--check")) {
    const current = await readFile(target, "utf8").catch(() => "");
    if (current.replace(/\r\n/g, "\n") !== value.replace(/\r\n/g, "\n")) {
      console.error(`Scenario consumer drift: ${file}`);
      process.exitCode = 1;
    }
  } else await writeFile(target, value);
}
