"use strict";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_GPT_OSS_MODEL = "openai/gpt-oss-120b:fastest";
const DEFAULT_CF_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const DEFAULT_HF_MODEL = "meta-llama/Llama-3.1-8B-Instruct";

async function generateWithFailover(options) {
  const attemptOrder = buildAttemptOrder(options);
  const failures = [];
  let i;
  let result;

  for (i = 0; i < attemptOrder.length; i += 1) {
    try {
      result = await callProvider(attemptOrder[i], options);
    } catch (error) {
      result = {
        ok: false,
        message: error && error.message ? error.message : "Provider request crashed before returning a response."
      };
    }
    if (result.ok) {
      return {
        ok: true,
        provider: attemptOrder[i],
        model: result.model,
        text: result.text
      };
    }
    failures.push({
      provider: attemptOrder[i],
      message: result.message || "Unknown provider failure."
    });
  }

  return {
    ok: false,
    message: failures.length ? failures[failures.length - 1].message : "No AI provider could generate a response.",
    failures: failures
  };
}

function buildAttemptOrder(options) {
  const explicitOrder = options && options.providerOrder && options.providerOrder.length
    ? options.providerOrder
    : null;
  const raw = explicitOrder
    ? explicitOrder.join(",")
    : String(process.env.AI_PROVIDER_ORDER || "").trim().toLowerCase();
  const repeats = Math.max(1, Number(options && options.cycles || process.env.AI_PROVIDER_CYCLES || 3) || 3);
  let baseOrder;
  let out = [];
  let i;
  if (raw) {
    baseOrder = raw.split(",").map(function (item) { return item.trim(); }).filter(Boolean);
  } else {
    baseOrder = ["gemini", "gptoss", "cloudflare", "huggingface"];
  }
  for (i = 0; i < repeats; i += 1) {
    out = out.concat(baseOrder);
  }
  return out;
}

async function callProvider(provider, options) {
  if (provider === "gemini") {
    return callGemini(options);
  }
  if (provider === "gptoss" || provider === "gpt-oss") {
    return callGptOss(options);
  }
  if (provider === "cloudflare") {
    return callCloudflare(options);
  }
  if (provider === "huggingface") {
    return callHuggingFace(options);
  }
  return {
    ok: false,
    message: "Provider " + provider + " is not supported."
  };
}

async function callGemini(options) {
  const apiKey = getEnvValue(["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GEMINI_API_KEY", "GEMINI_KEY"]);
  const model = normalizeModel(options.model || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_MODEL);
  let response;
  let rawText;
  let parsed;
  let text;

  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY is not configured." };
  }

  response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent?key=" +
      encodeURIComponent(apiKey),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: String(options.systemInstruction || "") }]
        },
        contents: options.contents || [],
        generationConfig: buildGeminiConfig(options)
      })
    }
  );

  rawText = await response.text();
  parsed = safeJson(rawText);

  if (!response.ok) {
    return {
      ok: false,
      message: parsed && parsed.error && parsed.error.message ? parsed.error.message : "Gemini request failed."
    };
  }

  text = extractGeminiText(parsed);
  if (!text) {
    return {
      ok: false,
      message: "Gemini returned no usable text."
    };
  }

  return { ok: true, model: model, text: text.trim() };
}

async function callCloudflare(options) {
  const accountId = String(process.env.CF_ACCOUNT_ID || "").trim();
  const token = String(process.env.CF_API_TOKEN || "").trim();
  const model = String(process.env.CF_WORKERS_AI_MODEL || DEFAULT_CF_MODEL).trim();
  let response;
  let parsed;
  let text;

  if (!accountId || !token) {
    return { ok: false, message: "Cloudflare Workers AI is not configured." };
  }

  response = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" +
      encodeURIComponent(accountId) +
      "/ai/run/" +
      encodeURIComponent(model),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + token
      },
      body: JSON.stringify({
        messages: convertContentsToChatMessages(options),
        max_tokens: options.maxOutputTokens || 1200,
        temperature: typeof options.temperature === "number" ? options.temperature : 0.7
      })
    }
  );

  parsed = safeJson(await response.text());

  if (!response.ok) {
    return {
      ok: false,
      message: parsed && parsed.errors && parsed.errors[0] && parsed.errors[0].message
        ? parsed.errors[0].message
        : "Cloudflare request failed."
    };
  }

  text = extractCloudflareText(parsed);
  if (!text) {
    return {
      ok: false,
      message: "Cloudflare returned no usable text."
    };
  }

  return { ok: true, model: model, text: text.trim() };
}

async function callHuggingFace(options) {
  const token = getHuggingFaceToken();
  const model = String(process.env.HF_CHAT_MODEL || DEFAULT_HF_MODEL).trim();
  let response;
  let parsed;
  let text;
  const body = {
    model: model,
    messages: convertContentsToChatMessages(options),
    temperature: typeof options.temperature === "number" ? options.temperature : 0.7,
    max_tokens: options.maxOutputTokens || 1200
  };

  if (!token) {
    return { ok: false, message: "Hugging Face is not configured." };
  }

  response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token
    },
    body: JSON.stringify(body)
  });

  parsed = safeJson(await response.text());

  if (!response.ok) {
    return {
      ok: false,
      message: parsed && parsed.error && parsed.error.message
        ? parsed.error.message
        : parsed && parsed.message
          ? parsed.message
          : "Hugging Face request failed."
    };
  }

  text = extractHuggingFaceText(parsed);
  if (!text) {
    return {
      ok: false,
      message: "Hugging Face returned no usable text."
    };
  }

  return { ok: true, model: model, text: text.trim() };
}

async function callGptOss(options) {
  const token = getHuggingFaceToken();
  const model = String(process.env.GPT_OSS_MODEL || DEFAULT_GPT_OSS_MODEL).trim();
  let response;
  let parsed;
  let text;
  const body = {
    model: model,
    messages: convertContentsToChatMessages(options),
    temperature: typeof options.temperature === "number" ? options.temperature : 0.7,
    max_tokens: options.maxOutputTokens || 1200
  };

  if (!token) {
    return { ok: false, message: "GPT-OSS fallback is not configured. Add HF_TOKEN for router access." };
  }

  response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token
    },
    body: JSON.stringify(body)
  });

  parsed = safeJson(await response.text());

  if (!response.ok) {
    return {
      ok: false,
      message: parsed && parsed.error && parsed.error.message
        ? parsed.error.message
        : parsed && parsed.message
          ? parsed.message
          : "GPT-OSS fallback request failed."
    };
  }

  text = extractHuggingFaceText(parsed);
  if (!text) {
    return {
      ok: false,
      message: "GPT-OSS fallback returned no usable text."
    };
  }

  return { ok: true, model: model, text: text.trim() };
}

function buildGeminiConfig(options) {
  const config = {
    temperature: typeof options.temperature === "number" ? options.temperature : 0.7,
    topP: typeof options.topP === "number" ? options.topP : 0.95,
    maxOutputTokens: options.maxOutputTokens || 1200
  };
  if (options.expectJson) {
    config.responseMimeType = "application/json";
  }
  return config;
}

function convertContentsToChatMessages(options) {
  const messages = [];
  let i;
  let j;
  let content;
  let text;

  if (options.systemInstruction) {
    messages.push({
      role: "system",
      content: String(options.systemInstruction)
    });
  }

  for (i = 0; i < (options.contents || []).length; i += 1) {
    content = options.contents[i] || {};
    text = [];
    for (j = 0; j < ((content.parts || []).length); j += 1) {
      if (content.parts[j] && typeof content.parts[j].text === "string") {
        text.push(content.parts[j].text);
      }
    }
    if (!text.length) {
      continue;
    }
    messages.push({
      role: content.role === "model" ? "assistant" : "user",
      content: text.join("\n\n")
    });
  }

  return messages;
}

function extractGeminiText(parsed) {
  let parts = [];
  let i;
  let j;

  if (!parsed || !Array.isArray(parsed.candidates)) {
    return "";
  }

  for (i = 0; i < parsed.candidates.length; i += 1) {
    if (!parsed.candidates[i] || !parsed.candidates[i].content || !Array.isArray(parsed.candidates[i].content.parts)) {
      continue;
    }
    for (j = 0; j < parsed.candidates[i].content.parts.length; j += 1) {
      if (parsed.candidates[i].content.parts[j] && typeof parsed.candidates[i].content.parts[j].text === "string") {
        parts.push(parsed.candidates[i].content.parts[j].text);
      }
    }
  }

  return parts.join("\n\n").trim();
}

function extractCloudflareText(parsed) {
  if (!parsed || !parsed.result) {
    return "";
  }
  if (typeof parsed.result.response === "string") {
    return parsed.result.response;
  }
  if (typeof parsed.result.text === "string") {
    return parsed.result.text;
  }
  return "";
}

function extractHuggingFaceText(parsed) {
  if (!parsed) {
    return "";
  }
  if (parsed.choices && parsed.choices[0] && parsed.choices[0].message && typeof parsed.choices[0].message.content === "string") {
    return parsed.choices[0].message.content;
  }
  if (typeof parsed.generated_text === "string") {
    return parsed.generated_text;
  }
  return "";
}

function shouldRetry(message) {
  const text = String(message || "").toLowerCase();
  return text.indexOf("quota") !== -1 ||
    text.indexOf("rate") !== -1 ||
    text.indexOf("429") !== -1 ||
    text.indexOf("404") !== -1 ||
    text.indexOf("no route for that uri") !== -1 ||
    text.indexOf("not found") !== -1 ||
    text.indexOf("unsupported model") !== -1 ||
    text.indexOf("model not found") !== -1 ||
    text.indexOf("temporar") !== -1 ||
    text.indexOf("timeout") !== -1 ||
    text.indexOf("unavailable") !== -1 ||
    text.indexOf("overloaded") !== -1 ||
    text.indexOf("resource exhausted") !== -1;
}

function getEnvValue(names) {
  let i;
  let value;
  for (i = 0; i < names.length; i += 1) {
    value = String(process.env[names[i]] || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function getHuggingFaceToken() {
  return getEnvValue([
    "HF_TOKEN",
    "HF_API_TOKEN",
    "HUGGINGFACE_API_KEY",
    "HUGGING_FACE_API_KEY",
    "HUGGINGFACE_TOKEN",
    "HUGGING_FACE_TOKEN"
  ]);
}

function sanitizeProviderMessage(message) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();
  if (!text) {
    return "No AI provider could generate a response.";
  }
  if (
    lower.indexOf("no route for that uri") !== -1 ||
    lower.indexOf("unsupported model") !== -1 ||
    lower.indexOf("model not found") !== -1 ||
    lower.indexOf("not found") !== -1
  ) {
    return "One of the AI provider routes is not configured correctly right now.";
  }
  return text;
}

function getProviderStatus() {
  return {
    gemini: {
      configured: !!getEnvValue(["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GEMINI_API_KEY", "GEMINI_KEY"]),
      model: normalizeModel(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_MODEL)
    },
    gptoss: {
      configured: !!getHuggingFaceToken(),
      model: String(process.env.GPT_OSS_MODEL || DEFAULT_GPT_OSS_MODEL).trim()
    },
    cloudflare: {
      configured: !!(String(process.env.CF_ACCOUNT_ID || "").trim() && String(process.env.CF_API_TOKEN || "").trim()),
      model: String(process.env.CF_WORKERS_AI_MODEL || DEFAULT_CF_MODEL).trim()
    },
    huggingface: {
      configured: !!getHuggingFaceToken(),
      model: String(process.env.HF_CHAT_MODEL || DEFAULT_HF_MODEL).trim()
    }
  };
}

function normalizeModel(input, fallback) {
  const raw = String(input || "").trim();
  if (!raw || /^gpt-/i.test(raw)) {
    return fallback;
  }
  return raw;
}

function safeJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch (error) {
    return null;
  }
}

module.exports = {
  generateWithFailover: generateWithFailover,
  extractGeminiText: extractGeminiText,
  safeJson: safeJson,
  normalizeModel: normalizeModel,
  sanitizeProviderMessage: sanitizeProviderMessage,
  getProviderStatus: getProviderStatus
};
