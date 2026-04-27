"use strict";

const aiProviders = require("./_ai-provider-failover");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return json(204, "");
  }
  if (event.httpMethod !== "GET") {
    return json(405, { ok: false, message: "Method not allowed." });
  }

  return json(200, {
    ok: true,
    providers: aiProviders.getProviderStatus(),
    message: "AI health endpoint is reachable. A provider is usable when configured is true."
  });
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type"
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload)
  };
}
