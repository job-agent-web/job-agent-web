"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../public/java-client.js"), "utf8");
const claims = Buffer.from(JSON.stringify({ iss: "jobmatchagent" })).toString("base64url");
const token = "header." + claims + ".signature";
const values = new Map([
  ["sb-other-project-auth-token", JSON.stringify({ access_token: "unrelated-token" })],
  ["sb-yucfznjiipzsfgrmjcer-auth-token", JSON.stringify({ access_token: token })]
]);
const calls = [];
const context = {
  URL, Request, Headers, atob, console,
  location: { href: "http://localhost:8080/app.html", origin: "http://localhost:8080" },
  localStorage: { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) || null, removeItem: key => values.delete(key) },
  document: { addEventListener() {} },
  window: { fetch: async request => { calls.push(request); return new Response("{}"); } }
};
vm.runInNewContext(source, context);
(async () => {
  await context.window.fetch("https://aquamarine-puppy-2a08ef.netlify.app/.netlify/functions/generate-cover-letter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cvText: "The selected CV" }) });
  assert.equal(calls[0].url, "http://localhost:8080/.netlify/functions/generate-cover-letter");
  assert.equal(calls[0].headers.get("Authorization"), "Bearer " + token);
  assert.equal((await calls[0].json()).cvText, "The selected CV");
  await context.window.fetch("https://yucfznjiipzsfgrmjcer.supabase.co/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email: "test@example.com", password: "private-password" }) });
  assert.equal(calls[1].url, "http://localhost:8080/auth/v1/token?grant_type=password");
  const unrelated = "https://api.example.com/other-request";
  await context.window.fetch(unrelated);
  assert.equal(calls[2], unrelated);
  console.log("Browser bridge: legacy auth and API routes use the Java origin, CV payload is preserved, and unrelated services receive no session token.");
})().catch(error => { console.error(error.message); process.exitCode = 1; });
