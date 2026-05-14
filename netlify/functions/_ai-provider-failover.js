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

function getProviderTimeoutMs(options) {
  const configured = Number(options && options.providerTimeoutMs || process.env.AI_PROVIDER_TIMEOUT_MS || 8500);
  if (!isFinite(configured) || configured <= 0) {
    return 8500;
  }
  return Math.max(2500, Math.min(configured, 12000));
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer = null;
  if (controller) {
    init = Object.assign({}, init || {}, { signal: controller.signal });
    timer = setTimeout(function () {
      try {
        controller.abort();
      } catch (error) {}
    }, timeoutMs);
  }
  try {
    return await fetch(url, init);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function getGeminiRetryDelayMs(message) {
  const text = String(message || "");
  const match = text.match(/retry in\s+([0-9.]+)s/i);
  const seconds = match ? Number(match[1]) : 0;
  if (!isFinite(seconds) || seconds <= 0 || seconds > 20) {
    return 0;
  }
  return Math.ceil(seconds * 1000) + 350;
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
  const model = normalizeModel(process.env.GEMINI_MODEL || options.model || DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_MODEL);
  let response;
  let rawText;
  let parsed;
  let retryDelayMs;
  let text;

  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY is not configured." };
  }

  response = await sendGeminiRequest(model, apiKey, options);
  rawText = await response.text();
  parsed = safeJson(rawText);

  if (!response.ok) {
    retryDelayMs = getGeminiRetryDelayMs(parsed && parsed.error && parsed.error.message);
    if (retryDelayMs > 0) {
      await sleep(retryDelayMs);
      response = await sendGeminiRequest(model, apiKey, options);
      rawText = await response.text();
      parsed = safeJson(rawText);
    }
  }

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

async function sendGeminiRequest(model, apiKey, options) {
  return fetchWithTimeout(
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
    },
    getProviderTimeoutMs(options)
  );
}

async function callCloudflare(options) {
  const accountId = getCloudflareAccountId();
  const token = getCloudflareApiToken();
  const model = normalizeCloudflareModel(process.env.CF_WORKERS_AI_MODEL || DEFAULT_CF_MODEL);
  let response;
  let parsed;
  let text;

  if (!accountId || !token) {
    return { ok: false, message: "Cloudflare Workers AI is not configured." };
  }

  response = await fetchWithTimeout(
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
    },
    getProviderTimeoutMs(options)
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
  let rawText;
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

  response = await fetchWithTimeout("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token
    },
    body: JSON.stringify(body)
  }, getProviderTimeoutMs(options));

  rawText = await response.text();
  parsed = safeJson(rawText);

  if (!response.ok) {
    return {
      ok: false,
      message: extractProviderErrorMessage(parsed, rawText, "Hugging Face request failed.", response.status)
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
  let rawText;
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

  response = await fetchWithTimeout("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token
    },
    body: JSON.stringify(body)
  }, getProviderTimeoutMs(options));

  rawText = await response.text();
  parsed = safeJson(rawText);

  if (!response.ok) {
    return {
      ok: false,
      message: extractProviderErrorMessage(parsed, rawText, "GPT-OSS fallback request failed.", response.status)
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

function extractProviderErrorMessage(parsed, rawText, fallback, statusCode) {
  let message = "";
  if (parsed && parsed.error && typeof parsed.error.message === "string") {
    message = parsed.error.message;
  } else if (parsed && typeof parsed.error === "string") {
    message = parsed.error;
  } else if (parsed && typeof parsed.message === "string") {
    message = parsed.message;
  } else if (typeof rawText === "string" && rawText.trim()) {
    message = rawText.trim().slice(0, 240);
  }
  if (!message) {
    message = fallback || "Provider request failed.";
  }
  if (statusCode) {
    message = "HTTP " + statusCode + ": " + message;
  }
  return message;
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
    if (value && !isPlaceholderValue(value)) {
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
      configured: !!(getCloudflareAccountId() && getCloudflareApiToken()),
      model: normalizeCloudflareModel(process.env.CF_WORKERS_AI_MODEL || DEFAULT_CF_MODEL)
    },
    huggingface: {
      configured: !!getHuggingFaceToken(),
      model: String(process.env.HF_CHAT_MODEL || DEFAULT_HF_MODEL).trim()
    }
  };
}

function normalizeModel(input, fallback) {
  const raw = String(input || "").trim().replace(/^models\//i, "");
  const safeFallback = isValidGeminiModel(fallback) ? String(fallback).trim().replace(/^models\//i, "") : DEFAULT_GEMINI_MODEL;
  if (!raw || !isValidGeminiModel(raw)) {
    return safeFallback;
  }
  return raw;
}

function isValidGeminiModel(input) {
  const raw = String(input || "").trim().replace(/^models\//i, "");
  return /^gemini-[a-z0-9][a-z0-9.-]*$/i.test(raw);
}

function normalizeCloudflareModel(input) {
  const raw = String(input || "").trim();
  if (!raw || isPlaceholderValue(raw) || raw.indexOf("=") !== -1) {
    return DEFAULT_CF_MODEL;
  }
  if (/^llama-/i.test(raw)) {
    return "@cf/meta/" + raw;
  }
  return raw;
}

function getCloudflareAccountId() {
  const raw = String(process.env.CF_ACCOUNT_ID || "").trim();
  if (!raw || isPlaceholderValue(raw) || raw.indexOf("=") !== -1 || !/^[a-f0-9]{32}$/i.test(raw)) {
    return "";
  }
  return raw;
}

function getCloudflareApiToken() {
  const raw = String(process.env.CF_API_TOKEN || "").trim();
  if (!raw || isPlaceholderValue(raw) || raw.indexOf("CF_ACCOUNT_ID=") !== -1) {
    return "";
  }
  return raw;
}

function isPlaceholderValue(input) {
  const text = String(input || "").trim().toLowerCase();
  return !text ||
    text.indexOf("your-") !== -1 ||
    text.indexOf("replace-me") !== -1 ||
    text.indexOf("placeholder") !== -1 ||
    text.indexOf("example") !== -1 ||
    text === "changeme" ||
    text === "todo";
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
