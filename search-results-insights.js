"use strict";

const aiProviders = require("./_ai-provider-failover");
const aiHistory = require("./_ai-history");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return json(204, "");
  }
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, message: "Method not allowed." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const pane = cleanText(body.pane || "search-results");
    const query = cleanText(body.query || "");
    const results = Array.isArray(body.results) ? body.results.map(normalizeRow).filter(hasUsefulRow).slice(0, 20) : [];
    const previousOutputs = aiHistory.normalizePreviousOutputs(body.previousOutputs);
    const model = aiProviders.normalizeModel(body.model || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite", "gemini-2.5-flash-lite");

    if (!results.length) {
      return json(200, { ok: false, message: "No search results were available to analyse." });
    }

    const aiResult = await aiProviders.generateWithFailover({
      model: model,
      providerOrder: ["gemini", "gptoss", "cloudflare", "huggingface"],
      cycles: 1,
      systemInstruction: buildSystemInstruction(pane),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Search context: " + (query || "No extra search context provided."),
                "",
                "Structured results:",
                JSON.stringify(results, null, 2),
                "",
                aiHistory.buildAvoidanceBlock(previousOutputs, "Previous summaries to avoid repeating")
              ].join("\n")
            }
          ]
        }
      ],
      temperature: 0.55,
      topP: 0.9,
      maxOutputTokens: 700,
      expectJson: true
    });

    if (!aiResult.ok) {
      return json(200, { ok: false, message: aiResult.message || "No AI provider could analyse the search results right now.", failures: aiResult.failures || [] });
    }

    const payload = safeJson(aiResult.text);
    const summary = cleanText(payload && payload.summary);
    const highlights = uniqueList(payload && payload.highlights).slice(0, 4);

    if (!summary && !highlights.length) {
      return json(200, { ok: false, message: "The AI providers did not return usable search insights." });
    }

    return json(200, {
      ok: true,
      model: aiResult.model,
      provider: aiResult.provider,
      summary: summary,
      highlights: highlights
    });
  } catch (error) {
    return json(200, { ok: false, message: "Could not analyse the search results right now." });
  }
};

function buildSystemInstruction(pane) {
  const subject = pane === "visa-jobs" ? "live visa sponsorship job adverts" : "skilled worker sponsor search results";
  return [
    "You are an expert UK recruitment and sponsorship search analyst.",
    "Return JSON only.",
    'Use this exact schema: {"summary":"...","highlights":["..."]}.',
    "Write polished UK English.",
    "Base everything strictly on the supplied results only.",
    "Do not invent employers, locations, routes, websites, or job adverts.",
    "Write a concise summary that helps the user quickly understand the strongest matches in the supplied " + subject + ".",
    "The highlight bullets should be genuinely useful, specific, and non-repetitive.",
    "Prefer concrete patterns like hiring clusters, location fit, sector fit, or which employers look strongest from the supplied data.",
    "Avoid generic filler such as 'there are several opportunities available'."
  ].join("\n");
}

function normalizeRow(row) {
  return {
    title: cleanText(row && row.title),
    company: cleanText(row && row.company),
    industry: cleanText(row && row.industry),
    location: cleanText(row && row.location),
    route: cleanText(row && row.route),
    type: cleanText(row && row.type),
    source: cleanText(row && row.source),
    snippet: cleanText(row && row.snippet),
    url: cleanText(row && row.url)
  };
}

function hasUsefulRow(row) {
  return !!(row && (row.title || row.company || row.location || row.snippet));
}

function cleanText(value) {
  return String(value || "").trim();
}

function uniqueList(list) {
  const seen = {};
  const out = [];
  let i;
  let value;
  let key;

  if (!Array.isArray(list)) {
    return out;
  }

  for (i = 0; i < list.length; i += 1) {
    value = cleanText(list[i]);
    key = value.toLowerCase();
    if (!value || seen[key]) {
      continue;
    }
    seen[key] = true;
    out.push(value);
  }

  return out;
}

function safeJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch (error) {
    return null;
  }
}

function json(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload)
  };
}




