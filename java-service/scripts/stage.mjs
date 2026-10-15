import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preparePublic } from "./public-assets.mjs";

const service = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.dirname(service);
const destination = path.join(root, ".vercel", "java-staging");
preparePublic(root, path.join(destination, "public"));
fs.mkdirSync(path.join(destination, "java-service"), { recursive: true });
fs.copyFileSync(path.join(service, "pom.xml"), path.join(destination, "java-service", "pom.xml"));
fs.cpSync(path.join(service, "src"), path.join(destination, "java-service", "src"), { recursive: true });
fs.copyFileSync(path.join(service, "Dockerfile.vercel"), path.join(destination, "Dockerfile.vercel"));
fs.mkdirSync(path.join(destination, ".vercel"), { recursive: true });
fs.copyFileSync(path.join(root, ".vercel", "project.json"), path.join(destination, ".vercel", "project.json"));
fs.writeFileSync(path.join(destination, "vercel.json"), JSON.stringify({
  "$schema": "https://openapi.vercel.sh/vercel.json",
  regions: ["iad1"],
  services: { jobmatchagent: { root: ".", runtime: "container", entrypoint: "Dockerfile.vercel" } },
  rewrites: [{ source: "/(.*)", destination: { service: "jobmatchagent" } }]
}, null, 2) + "\n");
fs.writeFileSync(path.join(destination, ".dockerignore"), ".vercel\n.env*\n**/target\n.git\n");
console.log("Prepared Java deployment for the existing jobmatchagent project:");
console.log(destination);
console.log("Run a preview deployment there first with: npx vercel deploy --yes");
console.log("After migration and preview validation: npx vercel deploy --prod --yes");
