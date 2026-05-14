const aiProviders = require("./_ai-provider-failover");
const aiHistory = require("./_ai-history");
const cvQualityRubric = [
  "National Careers Service CV guidance: make the CV clear, easy to read, consistent, concise, and tailored to the job and company.",
  "ATS/recruiter readability: use standard section headings, plain role titles, clean bullet points, and natural job-description keywords without keyword stuffing.",
  "Professional quality: profile must be specific to the target role, duties must be action-led and evidence-based, and every bullet should show responsibility, output, stakeholder value, or impact.",
  "Integrity: do not invent employers, qualifications, metrics, systems, achievements, or responsibilities not supported by the candidate data.",
  "Originality: do not copy distinctive sentences or long phrases from the job description; rewrite requirements in fresh CV-ready language.",
  "Safety rules: never mention the target employer/company from the job description inside the CV, and never replace a previous employer with the target company."
];

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
      providerOrder: ["gptoss", "gemini", "cloudflare", "huggingface"],
      cycles: 4,
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
    let doc = normalizeCvDocument(parsedResult, data);
    let qualityResult = null;

    if (!doc || !doc.profile || !doc.roles || !doc.roles.length) {
      return json(200, {
        ok: false,
        message: "The AI response did not return a usable CV document."
      });
    }

    qualityResult = await refineCvDocumentWithQualityPass({
      doc,
      data,
      model,
      provider: aiResult.provider,
      previousOutputs
    });
    if (qualityResult && qualityResult.doc) {
      doc = qualityResult.doc;
    }

    return json(200, {
      ok: true,
      model: qualityResult && qualityResult.model ? qualityResult.model : aiResult.model,
      provider: qualityResult && qualityResult.provider ? qualityResult.provider : aiResult.provider,
      qualityReviewed: !!(qualityResult && qualityResult.doc),
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
    "Follow current professional CV best practice: clear structure, consistent formatting, concise sections, ATS-readable wording, and natural role keywords.",
    "Use the quality bar expected by recruiters: specific, credible, action-led, and free from generic filler.",
    "Return 10 to 12 unique core skills.",
    "For each role return exactly 4 strong duties.",
    "Each duty must be written for the exact role title the user entered in candidate.roles[i].title, not for a generic role.",
    "Use the pasted job description to decide which responsibilities, skills, tools, stakeholders, and outcomes each entered role should emphasise.",
    "Do not copy sentences, bullet points, or distinctive phrases from the pasted job description.",
    "Rewrite every responsibility in fresh, professional CV language, blending the user's entered role title with the meaning of the advert rather than reusing the advert wording.",
    "Do not mention the target employer, hiring company, organisation, or brand name from the job description anywhere in the CV.",
    "Previous employers must come only from candidate.roles[i].employer; never infer or insert the target company as a previous employer.",
    "Connect every duty to both: the user's entered role title and the target job description requirements.",
    "Do not write broad duties that could fit any job; include concrete role-specific actions, outputs, stakeholders, systems, records, analysis, service delivery, or governance where supported by the job description and role notes.",
    "Role duties must be unique and must not repeat each other.",
    "Use only the supplied candidate data and job description. Do not invent employers, dates, or qualifications.",
    "If previous CV outputs are provided, do not recycle their phrasing, ordering, or duty wording.",
    "Before returning the JSON, self-review against this rubric: tailored relevance, ATS readability, recruiter clarity, evidence quality, originality, grammar, no invented facts, no target-company leakage."
  ].join("\n");
}

function buildCvQualityReviewInstruction() {
  return [
    "You are the final CV quality reviewer and editor.",
    "Compare the draft CV against the supplied professional quality rubric and improve it before returning it.",
    "Return JSON only, using this exact schema: {\"profile\":\"...\",\"skills\":[\"...\"],\"roles\":[{\"title\":\"...\",\"employer\":\"...\",\"dates\":\"...\",\"duties\":[\"...\"]}],\"certifications\":[{\"line\":\"...\"}],\"education\":[{\"line\":\"...\"}]}",
    "Preserve the candidate's factual data, employers, dates, qualifications, and role titles.",
    "Do not invent achievements, metrics, systems, employers, qualifications, responsibilities, or outcomes.",
    "Do not mention the target employer/company from the job description anywhere in the CV.",
    "Do not copy distinctive wording from the job description; rewrite requirements in fresh professional CV language.",
    "Improve weak or generic profile wording, strengthen action-led duties, sharpen keyword alignment naturally, and keep the CV ATS-readable.",
    "Each role must still have exactly 4 strong, non-repeating duties.",
    "Return 10 to 12 unique core skills."
  ].join("\n");
}

async function refineCvDocumentWithQualityPass(input) {
  const provider = String(input && input.provider || "").trim();
  let result;
  let parsed;
  let doc;

  if (!provider || !input || !input.doc || !input.data) {
    return null;
  }

  try {
    result = await aiProviders.generateWithFailover({
      model: input.model,
      providerOrder: [provider],
      cycles: 1,
      systemInstruction: buildCvQualityReviewInstruction(),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: JSON.stringify({
                qualityRubric: cvQualityRubric,
                candidate: input.data,
                draft: input.doc,
                previousOutputs: input.previousOutputs || ""
              })
            }
          ]
        }
      ],
      temperature: 0.28,
      topP: 0.9,
      maxOutputTokens: 1800,
      expectJson: true,
      providerTimeoutMs: 7000
    });
  } catch (error) {
    return null;
  }

  if (!result || !result.ok || !result.text) {
    return null;
  }

  parsed = safeJson(result.text);
  doc = normalizeCvDocument(parsed, input.data);
  if (!doc || !doc.profile || !doc.roles || !doc.roles.length) {
    return null;
  }
  return {
    doc,
    provider: result.provider,
    model: result.model
  };
}
function normalizeCvDocument(result, input) {
  const roles = [];
  const targetCompanies = extractTargetCompanyNames(input.jobDescription);
  const skills = uniqueList(result && result.skills).map(function (skill) {
    return sanitizeTextAgainstTargetCompanies(skill, targetCompanies);
  }).filter(Boolean).slice(0, 12);
  const profile = sanitizeTextAgainstTargetCompanies(
    sanitizeProfileAgainstJobDescription(String(result && result.profile || "").trim(), input.jobDescription, input, skills),
    targetCompanies
  );
  let i;
  let item;

  if (Array.isArray(input.roles)) {
    for (i = 0; i < input.roles.length; i += 1) {
      item = Array.isArray(result && result.roles) ? (result.roles[i] || {}) : {};
      const sourceRole = input.roles[i] || {};
      const sourceTitle = String(sourceRole.title || item.title || "Professional Experience").trim();
      let duties = uniqueList(item.duties).map(function (duty, dutyIndex) {
        return sanitizeDutyAgainstJobDescription(duty, input.jobDescription, sourceTitle, dutyIndex);
      }).slice(0, 4);
      if (duties.length < 4) {
        duties = uniqueList(duties.concat(buildServerFallbackDuties(sourceTitle, input.jobDescription, sourceRole))).slice(0, 4);
      }
      duties = enforceRoleDutyTitle(duties, sourceTitle).map(function (duty, dutyIndex) {
        return sanitizeDutyAgainstJobDescription(duty, input.jobDescription, sourceTitle, dutyIndex);
      }).map(function (duty) {
        return sanitizeTextAgainstTargetCompanies(duty, targetCompanies);
      }).slice(0, 4);
      roles.push({
        title: sourceTitle,
        employer: sanitizeTextAgainstTargetCompanies(String(sourceRole.employer || "Organisation not specified").trim(), targetCompanies) || "Organisation not specified",
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
    profile: profile,
    skills: skills,
    roles: roles,
    certifications: normalizeCredentialLines(result && result.certifications, input.certifications).map(function (item) {
      return sanitizeCredentialEntryAgainstTargetCompanies(item, targetCompanies);
    }),
    education: normalizeCredentialLines(result && result.education, input.education).map(function (item) {
      return sanitizeCredentialEntryAgainstTargetCompanies(item, targetCompanies);
    }),
    fileName: safeFileName(String(input.name || "generated_cv") + "_CV.docx")
  };
}

function enforceRoleDutyTitle(duties, roleTitle) {
  return uniqueList(duties).map(function (duty) {
    const text = String(duty || "").trim().replace(/^[-*•]\s*/, "");
    return text;
  }).filter(Boolean);
}

function buildServerFallbackDuties(roleTitle, jobDescription, role) {
  const requirements = extractRequirementLines(jobDescription).map(rewriteRequirementAsCvFocus);
  const evidence = String((role && role.notes) || "practical role experience").split(/[.;\n]/).map(function (line) { return line.trim(); }).filter(Boolean)[0] || "practical role experience";
  const focus = requirements.length ? requirements : ["accurate delivery of role priorities", "clear stakeholder communication", "organised documentation and follow-up", "quality-focused service delivery"];
  return [
    "Delivered practical improvements across " + lowerFirst(focus[0]) + " using " + lowerFirst(evidence) + ", keeping outputs accurate, organised, and useful for decision-making.",
    "Coordinated actions, records, and communication around " + lowerFirst(focus[1] || focus[0]) + ", ensuring priorities were progressed professionally and followed through.",
    "Converted workplace priorities into clear activity across " + lowerFirst(focus[2] || focus[0]) + ", improving consistency, quality, and stakeholder confidence.",
    "Supported colleagues and stakeholders with " + lowerFirst(focus[3] || focus[0]) + ", maintaining dependable standards and practical outcomes."
  ];
}

function sanitizeDutyAgainstJobDescription(duty, jobDescription, roleTitle, index) {
  const text = String(duty || "").trim().replace(/^[-*•]\s*/, "");
  if (!text) {
    return "";
  }
  if (!hasSharedWordSequence(text, jobDescription, 6)) {
    return text;
  }
  return buildFreshDutyFromTheme(text, roleTitle, index);
}

function buildFreshDutyFromTheme(text, roleTitle, index) {
  const theme = rewriteRequirementAsCvFocus(text);
  const options = [
    "Delivered practical improvements across " + theme + ", combining accurate execution, clear documentation, and reliable follow-through.",
    "Strengthened " + theme + " by organising information, coordinating actions, and turning priorities into useful workplace outputs.",
    "Converted complex workplace needs into clear activity around " + theme + ", supporting better decisions, service quality, and stakeholder confidence.",
    "Maintained high standards across " + theme + " by checking details, managing competing priorities, and communicating progress clearly."
  ];
  return options[Math.max(0, Number(index || 0)) % options.length];
}

function sanitizeProfileAgainstJobDescription(profile, jobDescription, input, skills) {
  if (profile && !hasSharedWordSequence(profile, jobDescription, 7)) {
    return profile;
  }
  return buildFreshProfessionalProfile(input, jobDescription, skills);
}

function buildFreshProfessionalProfile(input, jobDescription, skills) {
  const roles = Array.isArray(input && input.roles) ? input.roles.map(function (role) {
    return String(role && role.title || "").trim();
  }).filter(Boolean).slice(0, 4) : [];
  const roleSummary = roles.length ? roles.join(", ") : "professional experience";
  const focus = extractRequirementLines(jobDescription).map(rewriteRequirementAsCvFocus).filter(Boolean);
  const priorityOne = focus[0] || "role-specific delivery, organised execution, and measurable contribution";
  const priorityTwo = focus[1] || "stakeholder communication, accurate documentation, and dependable follow-through";
  const skillText = uniqueList(skills).slice(0, 5).join(", ") || "communication, organisation, analysis, problem solving, and service delivery";
  return "Results-driven professional with experience across " + roleSummary + ", bringing a strong record of turning workplace priorities into accurate, organised, and useful outputs. Combines practical capability in " + skillText + " with evidence of supporting " + priorityOne + " and " + priorityTwo + ". Known for clear communication, reliable follow-through, and a quality-focused approach that helps teams improve performance, strengthen decisions, and maintain consistently high standards.";
}

function extractTargetCompanyNames(jobDescription) {
  const text = String(jobDescription || "");
  const names = [];
  const lines = text.split(/\r?\n/);
  let i;
  let match;
  function addName(value) {
    let name = String(value || "").trim();
    name = name.replace(/^[:"'\s-]+|[:"'\s.]+$/g, "");
    name = name.replace(/\s+(?:is|are|seeks|requires|looking|invites|has|will|offers)\b[\s\S]*$/i, "").trim();
    name = name.replace(/\s+(?:role|position|vacancy|opportunity)\b[\s\S]*$/i, "").trim();
    if (isLikelyTargetCompanyName(name) && names.map(function (item) { return item.toLowerCase(); }).indexOf(name.toLowerCase()) === -1) {
      names.push(name);
    }
  }
  for (i = 0; i < lines.length; i += 1) {
    match = String(lines[i] || "").match(/^(?:company|employer|organisation|organization|hiring\s+organisation|hiring\s+organization)\s*[:\-]\s*(.+)$/i);
    if (match) {
      addName(match[1]);
    }
    match = String(lines[i] || "").match(/^about\s+(.+)$/i);
    if (match) {
      addName(match[1]);
    }
  }
  [
    /(?:apply|applying|application)\s+for\s+(?:the\s+)?[\s\S]{0,90}?\b(?:role|position|vacancy)\s+at\s+([^.,\n]+)/ig,
    /\b(?:role|position|vacancy|opportunity)\s+at\s+([^.,\n]+)/ig,
    /\b(?:join|joining|work\s+for|work\s+with)\s+([A-Z][A-Za-z0-9&'’.\-]*(?:\s+[A-Z][A-Za-z0-9&'’.\-]*){0,7})/g
  ].forEach(function (pattern) {
    while ((match = pattern.exec(text)) !== null) {
      addName(match[1]);
    }
  });
  return names.sort(function (a, b) { return b.length - a.length; }).slice(0, 8);
}

function isLikelyTargetCompanyName(name) {
  const clean = String(name || "").trim();
  const lowered = clean.toLowerCase();
  if (clean.length < 2 || clean.length > 90) {
    return false;
  }
  if (/^(uk|united kingdom|england|scotland|wales|northern ireland|remote|hybrid|home|office|data analyst|teacher|candidate)$/i.test(clean)) {
    return false;
  }
  if (/\b(role|position|salary|location|hours|contract|permanent|temporary|full time|part time|job title)\b/i.test(clean)) {
    return false;
  }
  return /[A-Z]/.test(clean) ||
    /\b(ltd|limited|plc|llp|group|trust|council|university|college|school|nhs|ukhs|board|authority|services|solutions|care|health|bank|partners)\b/i.test(lowered);
}

function sanitizeTextAgainstTargetCompanies(text, companyNames) {
  let output = String(text || "").trim();
  if (!output || !Array.isArray(companyNames) || !companyNames.length) {
    return output;
  }
  companyNames.forEach(function (name) {
    const clean = String(name || "").trim();
    let pattern;
    if (!clean) {
      return;
    }
    pattern = new RegExp("\\b" + escapeRegExp(clean).replace(/\s+/g, "\\s+") + "\\b", "gi");
    output = output.replace(pattern, "the organisation");
  });
  return output
    .replace(/\bthe\s+the\s+organisation\b/gi, "the organisation")
    .replace(/\borganisation's\s+organisation\b/gi, "organisation")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeCredentialEntryAgainstTargetCompanies(item, companyNames) {
  const output = Object.assign({}, item || {});
  ["line", "name", "issuer", "notes"].forEach(function (key) {
    if (output[key]) {
      output[key] = sanitizeTextAgainstTargetCompanies(output[key], companyNames);
    }
  });
  return output;
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewriteRequirementAsCvFocus(text) {
  const value = String(text || "").toLowerCase();
  const themes = [];
  function add(label, pattern) {
    if (pattern.test(value) && themes.indexOf(label) === -1) {
      themes.push(label);
    }
  }
  add("data analysis, reporting, and insight generation", /data|analys|insight|dashboard|kpi|report|excel|sql|power\s*bi|tableau/);
  add("stakeholder communication and decision support", /stakeholder|communicat|liaison|presentation|decision|business partner/);
  add("documentation, record management, and administrative accuracy", /document|record|admin|minute|case note|filing|accuracy/);
  add("planning, coordination, and workflow control", /coordinat|schedule|planning|diary|meeting|workflow|prioritis|organis/);
  add("service delivery, customer support, and professional follow-through", /customer|client|patient|service user|service delivery|support|enquir|care/);
  add("quality assurance, compliance, and governance", /quality|compliance|governance|audit|regulatory|policy|standard|control/);
  add("process improvement, automation, and operational efficiency", /improv|streamline|automat|efficien|process|optimis|optimiz/);
  add("project delivery, implementation, and progress tracking", /project|programme|program|implementation|milestone|risk|delivery|change/);
  return themes.length ? themes.slice(0, 2).join(" and ") : "role-specific delivery, organised execution, and measurable contribution";
}

function hasSharedWordSequence(candidate, source, minimumWords) {
  const candidateWords = normalizeCopyWords(candidate);
  const sourceText = " " + normalizeCopyWords(source).join(" ") + " ";
  const length = Math.max(4, Number(minimumWords || 6));
  let i;
  let phrase;
  if (candidateWords.length < length || sourceText.length < 8) {
    return false;
  }
  for (i = 0; i <= candidateWords.length - length; i += 1) {
    phrase = candidateWords.slice(i, i + length).join(" ");
    if (phrase.length > 18 && sourceText.indexOf(" " + phrase + " ") !== -1) {
      return true;
    }
  }
  return false;
}

function normalizeCopyWords(text) {
  const stop = { a: true, an: true, the: true, and: true, or: true, to: true, of: true, in: true, for: true, with: true, on: true, by: true, as: true, is: true, are: true, be: true };
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(function (word) {
    return word && word.length > 2 && !stop[word];
  });
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







