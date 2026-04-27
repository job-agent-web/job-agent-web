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
    const model = normalizeModel(body.model || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite");
    const goal = String(body.goal || "").trim();
    const localSteps = Array.isArray(body.localSteps) ? body.localSteps.map(cleanText).filter(Boolean).slice(0, 12) : [];
    const localCertifications = Array.isArray(body.localCertifications) ? body.localCertifications.map(cleanText).filter(Boolean).slice(0, 8) : [];
    const localChannels = Array.isArray(body.localChannels) ? body.localChannels.map(cleanText).filter(Boolean).slice(0, 8) : [];
    const previousOutputs = aiHistory.normalizePreviousOutputs(body.previousOutputs);

    if (!goal) {
      return json(200, {
        ok: false,
        message: "Career goal is required."
      });
    }

    const aiResult = await aiProviders.generateWithFailover({
      model: model,
      providerOrder: ["gemini", "gptoss", "cloudflare", "huggingface"],
      cycles: 1,
      systemInstruction: buildSystemInstruction(),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Career goal: " + goal,
                "",
                "Built-in draft steps:",
                localSteps.length ? localSteps.map(function (step, index) { return (index + 1) + ". " + step; }).join("\n") : "No local steps were provided.",
                "",
                "Built-in certification ideas:",
                localCertifications.length ? localCertifications.join("\n") : "No local certifications were provided.",
                "",
                "Built-in YouTube channels:",
                localChannels.length ? localChannels.join("\n") : "No local channels were provided.",
                "",
                aiHistory.buildAvoidanceBlock(previousOutputs, "Previous career plans to avoid repeating")
              ].join("\n")
            }
          ]
        }
      ],
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 700,
      expectJson: true
    });

    if (!aiResult.ok) {
      return json(200, {
        ok: false,
        message: aiResult.message || "No AI provider could build the career path right now.",
        failures: aiResult.failures || []
      });
    }

    const payload = safeJson(aiResult.text);
    const steps = uniqueList(payload && payload.steps);
    const track = cleanText(payload && payload.track);
    const certifications = uniqueList(payload && payload.certifications);
    const channels = uniqueList(payload && payload.channels);

    if (!steps.length) {
      return json(200, {
        ok: false,
        message: "The AI providers did not return a usable career path plan."
      });
    }

    return json(200, {
      ok: true,
      model: aiResult.model,
      provider: aiResult.provider,
      track: track || "career progression",
      steps: steps.slice(0, 10),
      certifications: certifications.slice(0, 6),
      channels: channels.slice(0, 6)
    });
  } catch (error) {
    return json(200, {
      ok: false,
      message: "Could not build the career path right now."
    });
  }
};

function buildSystemInstruction() {
  return [
    "You are an expert UK career path planner.",
    "Return JSON only.",
    'Use this exact schema: {"track":"...","steps":["..."],"certifications":["..."],"channels":["..."]}.',
    "Write polished UK English.",
    "Create a clean, practical, non-generic step-by-step route into the target career.",
    "Keep the steps unique, well ordered, and realistic for someone entering or moving towards that path.",
    "Recommend useful certifications and YouTube channels that genuinely help someone build towards the target career.",
    "Do not recommend Google IT, Microsoft cloud, coding, data analytics, or cyber certificates unless the requested career is clearly an IT, software, data, analytics, cloud, or cyber career.",
    "For Nursing, Adult Nursing, Mental Health Nursing, Children's Nursing, Learning Disability Nursing, Midwifery, or similar clinical courses, focus on NMC-approved routes, nursing degree or nursing degree apprenticeship options, clinical placements, DBS and occupational health checks, NMC registration, preceptorship, NHS Careers, RCN, and NMC guidance.",
    "For Medical Laboratory Science, Med Lab Science, Biomedical Science, Biomedical Scientist, Clinical Laboratory Science, or pathology laboratory careers, focus on IBMS-accredited degrees or top-up modules, IBMS Registration Training Portfolio, HCPC registration, medical laboratory assistant or trainee biomedical scientist entry routes, NHS pathology settings, quality control, COSHH, GCLP, and laboratory safety.",
    "For Public Health, MPH, Epidemiology, Global Health, or Health Promotion, focus on MPH or relevant public health study where appropriate, health improvement, epidemiology, evaluation, UKHSA, local authority public health routes, Faculty of Public Health, and NHS population health routes.",
    "Use the built-in draft only as rough context, not as final phrasing.",
    "Do not duplicate the same advice in slightly different wording.",
    "Avoid vague filler and make the route feel tailored to the exact career named by the user."
  ].join("\n");
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

function normalizeModel(input) {
  return aiProviders.normalizeModel(input, "gemini-2.5-flash-lite");
}

function json(statusCode, payload) {
  return {
    statusCode,
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




