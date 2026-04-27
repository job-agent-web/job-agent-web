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
    const company = String(body.company || "").trim();
    const jobDescription = String(body.jobDescription || "").trim();
    const previousOutputs = aiHistory.normalizePreviousOutputs(body.previousOutputs);
    const variationSeed = buildVariationSeed(body.variationSeed);

    if (!company || !jobDescription) {
      return json(200, {
        ok: false,
        message: "Company name and job description are required."
      });
    }

    const aiResult = await aiProviders.generateWithFailover({
      model: model,
      systemInstruction: buildSystemInstruction(variationSeed),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Company: " + company,
                "",
                "Job description:",
                jobDescription,
                "",
                "Variation seed for this run: " + variationSeed,
                "",
                aiHistory.buildAvoidanceBlock(previousOutputs, "Previous interview questions to avoid repeating")
              ].join("\n")
            }
          ]
        }
      ],
      temperature: 1,
      topP: 0.95,
      maxOutputTokens: 1300,
      expectJson: true,
      providerOrder: ["gemini", "gptoss", "cloudflare", "huggingface"],
      cycles: 3
    });

    if (!aiResult.ok) {
      return json(200, {
        ok: false,
        message: aiResult.message || "No AI provider could generate interview questions right now.",
        failures: aiResult.failures || []
      });
    }

    const text = aiResult.text;
    const data = safeJson(text);
    const previousQuestionSet = aiHistory.buildHistorySet(previousOutputs);
    let questions = uniqueList(data && data.questions).filter(function (question) {
      return !previousQuestionSet[String(question || "").trim().toLowerCase()];
    });

    if (questions.length < 16) {
      questions = uniqueList(regenerateQuestions(company, jobDescription, previousOutputs, variationSeed, questions));
    }

    if (!questions.length) {
      return json(200, {
        ok: false,
        message: "Gemini did not return usable interview questions."
      });
    }

    return json(200, {
      ok: true,
      model: aiResult.model,
      provider: aiResult.provider,
      questions: questions.slice(0, 24)
    });
  } catch (error) {
    return json(200, {
      ok: false,
      message: "Could not generate interview questions right now."
    });
  }
};

function buildSystemInstruction(variationSeed) {
  return [
    "You generate likely interview questions for a job application.",
    "Write in polished UK English.",
    "Return JSON only.",
    'Use this exact schema: {"questions":["..."]}.',
    "Generate between 18 and 24 interview questions.",
    "Questions must be specific to the company and job description.",
    "Questions must be unique with no duplicates or near-duplicates.",
    "Do not reuse stock phrasings or standard interview-question wording from earlier runs.",
    "Vary the wording, angle, and order on every run while staying relevant to the role.",
    "Mix motivation, experience, behavioural, stakeholder, technical, values, delivery-risk, collaboration, and scenario-based questions.",
    "Include a balanced spread across these buckets: entry motivation, job-specific capability, stakeholder communication, prioritisation, data or technical judgement when relevant, challenge or conflict, improvement, compliance or quality, and future-impact thinking.",
    "If previous question lists are provided, avoid repeating them, lightly rewording them, or keeping the same sequence.",
    "Use the variation seed to deliberately alter phrasing and sequencing for this run: " + variationSeed + "."
  ].join("\n");
}

function regenerateQuestions(company, jobDescription, previousOutputs, variationSeed, currentQuestions) {
  const companyName = company || "the employer";
  const descriptor = deriveFocus(jobDescription);
  const previousQuestionSet = aiHistory.buildHistorySet(previousOutputs);
  const currentSet = aiHistory.buildHistorySet(currentQuestions);
  return uniqueList([
    "What would strong performance in this " + descriptor + " position look like within your first 90 days at " + companyName + "?",
    "Which challenge in this " + descriptor + " role do you think would demand the strongest judgement, and how would you approach it?",
    "How would you diagnose an underperforming process or workload if you inherited it in this post at " + companyName + "?",
    "What trade-offs would you expect to manage in this role, and how would you decide between them when priorities clash?",
    "How would you build credibility quickly with the stakeholders this job needs to influence or support?",
    "Which requirement in the job description looks easiest to underestimate, and why?",
    "How would you adapt your communication style for different internal and external stakeholders in this role?",
    "Tell us about a time you had to challenge unclear expectations and still deliver a strong result.",
    "What signals would tell you that a project, service, or workload in this role was starting to drift off track?",
    "How would you decide what to escalate and what to resolve yourself in this job?",
    "What would you want to understand about the team culture at " + companyName + " before making suggestions or improvements?",
    "If you noticed an avoidable risk early in this role, how would you raise it without creating unnecessary friction?",
    "What would help you prioritise effectively in a week when several urgent requests arrive at the same time?",
    "If the priorities in this role changed suddenly, how would you re-plan your work without losing quality?"
  ]).filter(function (question) {
    const key = String(question || "").trim().toLowerCase();
    return key && !previousQuestionSet[key] && !currentSet[key];
  });
}

function deriveFocus(jobDescription) {
  const text = String(jobDescription || "").toLowerCase();

  if (text.indexOf("data") !== -1 || text.indexOf("analysis") !== -1 || text.indexOf("report") !== -1) {
    return "data-focused";
  }
  if (text.indexOf("stakeholder") !== -1 || text.indexOf("customer") !== -1 || text.indexOf("service user") !== -1) {
    return "stakeholder-facing";
  }
  if (text.indexOf("project") !== -1 || text.indexOf("programme") !== -1) {
    return "delivery";
  }
  if (text.indexOf("compliance") !== -1 || text.indexOf("governance") !== -1 || text.indexOf("policy") !== -1) {
    return "compliance-sensitive";
  }

  return "general";
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
    value = String(list[i] || "").trim();
    key = value.toLowerCase();
    if (!value || seen[key]) {
      continue;
    }
    seen[key] = true;
    out.push(value);
  }

  return out;
}

function buildVariationSeed(input) {
  const cleaned = String(input || "").trim();

  if (cleaned) {
    return cleaned.slice(0, 80);
  }

  return "interview-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
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

