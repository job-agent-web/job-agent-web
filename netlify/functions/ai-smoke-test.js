"use strict";

const aiProviders = require("./_ai-provider-failover");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return json(204, "");
  }
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return json(405, { ok: false, message: "Method not allowed." });
  }

  try {
    const result = await aiProviders.generateWithFailover({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
      providerOrder: ["gemini", "gptoss", "cloudflare", "huggingface"],
      cycles: 1,
      systemInstruction: [
        "You are running an AI smoke test for Job Match Agent.",
        "Reply in one short sentence.",
        "Include the words AI smoke test OK."
      ].join("\n"),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Reply with one short sentence confirming that AI generation is working."
            }
          ]
        }
      ],
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 80
    });

    if (!result.ok) {
      return json(200, {
        ok: false,
        message: aiProviders.sanitizeProviderMessage(result.message) || "No AI provider could complete the smoke test.",
        failures: result.failures || [],
        providers: aiProviders.getProviderStatus()
      });
    }

    return json(200, {
      ok: true,
      provider: result.provider,
      model: result.model,
      text: String(result.text || "").trim(),
      providers: aiProviders.getProviderStatus()
    });
  } catch (error) {
    return json(200, {
      ok: false,
      message: String(error && error.message || "The AI smoke test failed."),
      providers: aiProviders.getProviderStatus()
    });
  }
};

function json(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload)
  };
}
