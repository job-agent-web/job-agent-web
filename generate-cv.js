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
    const data = body.data || {};
    const previousOutputs = aiHistory.normalizePreviousOutputs(body.previousOutputs);

    if (!data.name || !data.phone || !data.email || !data.address || !Array.isArray(data.roles) || !data.roles.length || !data.jobDescription) {
      return json(200, {
        ok: false,
        message: "Name, phone, email, address, at least one role, and the job description are required."
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
              text: JSON.stringify({
                candidate: data,
                previousOutputs: previousOutputs
              })
            }
          ]
        }
      ],
      temperature: 0.75,
      topP: 0.95,
      maxOutputTokens: 1500,
      expectJson: true
    });

    if (!aiResult.ok) {
      return json(200, {
        ok: false,
        message: aiResult.message || "No AI provider could generate the CV right now."
      });
    }

    const text = aiResult.text;
    const parsedResult = safeJson(text);
    const doc = normalizeCvDocument(parsedResult, data);

    if (!doc || !doc.profile || !doc.roles || !doc.roles.length) {
      return json(200, {
        ok: false,
        message: "The AI response did not return a usable CV document."
      });
    }

    return json(200, {
      ok: true,
      model: aiResult.model,
      provider: aiResult.provider,
      document: doc
    });
  } catch (error) {
    return json(200, {
      ok: false,
      message: "Could not generate the CV right now."
    });
  }
};

function buildSystemInstruction() {
  return [
    "You generate a tailored CV document from structured candidate data and a pasted job description.",
    "Write in polished UK English.",
    "Return JSON only.",
    'Use this exact schema: {"profile":"...","skills":["..."],"roles":[{"title":"...","employer":"...","dates":"...","duties":["..."]}],"certifications":[{"line":"..."}],"education":[{"line":"..."}]}.',
    "Create a high-quality professional profile tailored to the target role.",
    "Return 10 to 12 unique core skills.",
    "For each role return exactly 4 strong duties.",
    "Each duty must be written for the exact role title the user entered in candidate.roles[i].title, not for a generic role.",
    "Use the pasted job description to decide which responsibilities, skills, tools, stakeholders, and outcomes each entered role should emphasise.",
    "Connect every duty to both: the user's entered role title and the target job description requirements.",
    "Do not write broad duties that could fit any job; include concrete role-specific actions, outputs, stakeholders, systems, records, analysis, service delivery, or governance where supported by the job description and role notes.",
    "Role duties must be unique and must not repeat each other.",
    "Use only the supplied candidate data and job description. Do not invent employers, dates, or qualifications.",
    "If previous CV outputs are provided, do not recycle their phrasing, ordering, or duty wording."
  ].join("\n");
}

function normalizeCvDocument(result, input) {
  const roles = [];
  const skills = uniqueList(result && result.skills).slice(0, 12);
  let i;
  let item;

  if (Array.isArray(input.roles)) {
    for (i = 0; i < input.roles.length; i += 1) {
      item = Array.isArray(result && result.roles) ? (result.roles[i] || {}) : {};
      const sourceRole = input.roles[i] || {};
      const sourceTitle = String(sourceRole.title || item.title || "Professional Experience").trim();
      let duties = uniqueList(item.duties).slice(0, 4);
      if (duties.length < 4) {
        duties = uniqueList(duties.concat(buildServerFallbackDuties(sourceTitle, input.jobDescription, sourceRole))).slice(0, 4);
      }
      duties = enforceRoleDutyTitle(duties, sourceTitle).slice(0, 4);
      roles.push({
        title: sourceTitle,
        employer: String(item.employer || sourceRole.employer || "Organisation not specified").trim(),
        dates: String(item.dates || formatInputDateRange(sourceRole)).trim(),
        duties: duties
      });
    }
  }

  return {
    name: String(input.name || "").trim(),
    phone: String(input.phone || "").trim(),
    email: String(input.email || "").trim(),
    address: String(input.address || "").trim(),
    profile: String(result && result.profile || "").trim(),
    skills: skills,
    roles: roles,
    certifications: normalizeCredentialLines(result && result.certifications, input.certifications),
    education: normalizeCredentialLines(result && result.education, input.education),
    fileName: safeFileName(String(input.name || "generated_cv") + "_CV.docx")
  };
}

function enforceRoleDutyTitle(duties, roleTitle) {
  const cleanTitle = String(roleTitle || "this role").trim();
  return uniqueList(duties).map(function (duty) {
    const text = String(duty || "").trim().replace(/^[-*•]\s*/, "");
    if (!text) {
      return text;
    }
    if (text.toLowerCase().indexOf(cleanTitle.toLowerCase()) !== -1) {
      return text;
    }
    return "As " + cleanTitle + ", " + text.charAt(0).toLowerCase() + text.slice(1);
  }).filter(Boolean);
}

function buildServerFallbackDuties(roleTitle, jobDescription, role) {
  const requirements = extractRequirementLines(jobDescription);
  const evidence = String((role && role.notes) || "practical role experience").split(/[.;\n]/).map(function (line) { return line.trim(); }).filter(Boolean)[0] || "practical role experience";
  const title = String(roleTitle || "this role").trim();
  const focus = requirements.length ? requirements : ["accurate delivery of role priorities", "clear stakeholder communication", "organised documentation and follow-up", "quality-focused service delivery"];
  return [
    "As " + title + ", delivered work linked to " + lowerFirst(focus[0]) + " using " + lowerFirst(evidence) + ", keeping outputs accurate and relevant to the target job description.",
    "As " + title + ", coordinated actions, records, and communication around " + lowerFirst(focus[1] || focus[0]) + ", ensuring priorities were progressed professionally.",
    "As " + title + ", applied the requirements of the target vacancy to " + lowerFirst(focus[2] || focus[0]) + ", improving clarity, consistency, and follow-through.",
    "As " + title + ", supported stakeholders with " + lowerFirst(focus[3] || focus[0]) + ", maintaining dependable standards and practical outcomes."
  ];
}

function extractRequirementLines(text) {
  const out = [];
  String(text || "").split(/\r?\n|(?<=[.!?])\s+/).forEach(function (line) {
    const cleaned = String(line || "").replace(/^[-*•]\s*/, "").trim();
    if (cleaned.length > 24 && (/(responsib|require|essential|desirable|experience|ability|support|manage|coordinate|analyse|report|stakeholder|communicat|document|deliver)/i.test(cleaned) || line.trim().match(/^[-*•]/))) {
      out.push(cleaned.replace(/[;:]+$/g, ""));
    }
  });
  return uniqueList(out).slice(0, 8);
}

function formatInputDateRange(role) {
  const start = String((role && role.start) || "").trim();
  const end = role && role.current ? "Present" : String((role && role.end) || "").trim();
  if (start && end) {
    return start + " - " + end;
  }
  return start || end || "Dates not specified";
}

function lowerFirst(text) {
  text = String(text || "").trim();
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
}
function normalizeCredentialLines(resultList, inputList) {
  const out = [];
  const source = Array.isArray(resultList) && resultList.length ? resultList : inputList;
  let i;
  let line;
  let item;

  if (!Array.isArray(source)) {
    return out;
  }

  for (i = 0; i < source.length; i += 1) {
    item = source[i] || {};
    line = typeof item === "string" ? item : item.line || [item.name, item.issuer, item.date, item.notes].filter(Boolean).join(" | ");
    line = String(line || "").trim();
    if (line) {
      out.push({ line: line });
    }
  }

  return out;
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

function safeFileName(name) {
  return String(name || "generated_cv.docx").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
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






