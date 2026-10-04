import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateExpandedDemoData, validateExpandedDemoData } from "../src/db/expanded-demo.js";

const data = generateExpandedDemoData();
const errors = validateExpandedDemoData(data);
if (errors.length > 0) throw new Error(`Expanded demo validation failed:\n${errors.slice(0, 20).join("\n")}`);

const outputDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/dental_demo_data_package/expanded");
const outputFile = path.join(outputDirectory, "expanded_demo_data.json");
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log("Expanded synthetic dataset generated:", { outputFile, ...(data.manifest.counts as object), checksum: data.manifest.checksum_sha256 });
