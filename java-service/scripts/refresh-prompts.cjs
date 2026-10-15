"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const prompts = {};
for (const name of ["generate-cv", "generate-cover-letter", "chat-with-rex", "career-path-planner", "generate-interview-questions", "score-cv", "search-results-insights"]) {
  const filename = path.join(root, "netlify/functions", name + ".js");
  const context = {
    require: id => require(require.resolve(id, { paths: [path.dirname(filename)] })),
    exports: {}, module: { exports: {} }, process: { env: {} }, console,
    URL, URLSearchParams, Buffer, setTimeout, clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(filename, "utf8") + "\nexports.javaPrompt = buildSystemInstruction();\nexports.javaSamples = typeof builtInCoverLetterReferenceSamples !== 'undefined' ? builtInCoverLetterReferenceSamples : [];", context, { filename });
  prompts[name] = context.exports.javaPrompt;
  if (name === "generate-cover-letter") prompts._coverLetterReferences = context.exports.javaSamples;
}
fs.writeFileSync(path.resolve(__dirname, "../src/main/resources/prompts.json"), JSON.stringify(prompts, null, 2) + "\n");
console.log("Preserved instructions for " + Object.keys(prompts).filter(key => !key.startsWith("_")).length + " AI features and the existing cover-letter reference samples.");
