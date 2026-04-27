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
    const mode = String(body.mode || "civil").trim().toLowerCase() === "nhs" ? "nhs" : "civil";
    const jobTitle = String(body.jobTitle || "").trim();
    const company = String(body.company || "").trim();
    const jobDescription = String(body.jobDescription || "").trim();
    const rawCvText = String(body.cvText || "").trim();
    const cvText = prepareCvEvidenceText(rawCvText);
    const coverLetterName = String(body.coverLetterName || "").trim();
    const wordRange = normalizeWordRange(body.wordRange);
    const previousOutputs = aiHistory.normalizePreviousOutputs(body.previousOutputs);

    if (!jobTitle || !company || !jobDescription || !rawCvText) {
      return json(200, {
        ok: false,
        message: "Job title, company, job description, and CV text are all required."
      });
    }

    const result = await aiProviders.generateWithFailover({
      model: model,
      providerOrder: ["gemini", "gptoss", "cloudflare", "huggingface"],
      systemInstruction: buildSystemInstruction(),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildUserPrompt({
                mode,
                jobTitle,
                company,
                jobDescription,
                cvText,
                coverLetterName,
                wordRange,
                previousOutputs
              })
            }
          ]
        }
      ],
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: wordRange.max > 1000 ? 3200 : 2400,
      cycles: 3
    });

    if (!result.ok) {
      return json(200, {
        ok: false,
        message: result.message || "No AI provider could generate the cover letter right now.",
        failures: result.failures || []
      });
    }

    let finalText = cleanCoverLetterText(result.text, coverLetterName);
    if (needsRewrite(finalText, wordRange)) {
      const rewrite = await aiProviders.generateWithFailover({
        model: model,
        providerOrder: ["gemini", "gptoss", "cloudflare", "huggingface"],
        systemInstruction: buildRewriteSystemInstruction(),
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildRewritePrompt({
                  draft: finalText,
                  mode,
                  jobTitle,
                  company,
                  jobDescription,
                  cvText,
                  coverLetterName,
                  wordRange,
                  previousOutputs
                })
              }
            ]
          }
        ],
        temperature: 0.55,
        topP: 0.9,
        maxOutputTokens: wordRange.max > 1000 ? 3200 : 2400,
        cycles: 3
      });
      if (rewrite.ok && rewrite.text) {
        finalText = cleanCoverLetterText(rewrite.text, coverLetterName);
      }
    }

    finalText = enforceWordRange(finalText, {
      wordRange,
      coverLetterName,
      jobTitle,
      company,
      jobDescription,
      cvText,
      mode
    });

    return json(200, {
      ok: true,
      model: result.model,
      provider: result.provider,
      text: finalText
    });
  } catch (error) {
    return json(200, {
      ok: false,
      message: "Could not generate the AI cover letter right now."
    });
  }
};

function buildSystemInstruction() {
  return [
    "You write premium job application cover letters.",
    "Write in polished UK English.",
    "Use the STAR approach internally to shape practical evidence in every evidence paragraph.",
    "STAR must guide the logic only: context, responsibility, action taken, and relevance/result should be woven naturally into prose.",
    "Use only the role evidence extracted from the CV and the pasted job description.",
    "Do not invent qualifications, employers, achievements, metrics, tools, or responsibilities.",
    "Keep the letter tailored to the employer and role.",
    "Do not show STAR, Situation, Task, Action, or Result as visible headings, labels, bullet labels, or paragraph titles.",
    "Separate evidence according to the candidate's different roles where possible.",
    "Do not use bullet points, markdown fences, or repeated content.",
    "Avoid duplication across paragraphs.",
    "Write like a premium tailored supporting statement, not a generic template.",
    "Sound comparable to an excellent executive-quality application: precise, confident, specific, and credible.",
    "Critically discuss each relevant role in relation to the job description rather than listing duties in isolation.",
    "Use concrete role-based examples and thematic paragraphs that reflect the advert requirements.",
    "For each major role used, write one developed paragraph that naturally includes the situation/responsibility, the task or expectation, the action taken, and the result or relevance to this application.",
    "Do not pad the letter with filler just to reach the word count.",
    "Do not write self-referential lines about the CV, the advert, or what the applicant would do in the final application.",
    "Do not write generic claims such as 'my CV shows', 'the advert highlights', 'I would use the final application', or similar meta commentary.",
    "Every paragraph should advance a distinct point relevant to the role.",
    "When previous session outputs are provided, make this cover letter clearly different from them in structure, sequencing, and wording."
  ].join("\n");
}

function buildUserPrompt(input) {
  const tone = input.mode === "nhs" ? "NHS-style" : "professional";
  const signoff = input.coverLetterName ? "Yours faithfully\n" + input.coverLetterName : "Yours faithfully";

  return [
    "Write a unique premium cover letter for this application.",
    "Keep the content persuasive, well organised, and non-repetitive.",
    "Keep the final cover letter strictly between " + input.wordRange.min + " and " + input.wordRange.max + " words.",
    "Use only the role history and role responsibility evidence provided in the CV evidence extract.",
    "Do not use profile summaries, skills lists, education, certifications, references, or unrelated CV text as evidence unless it appears inside a role evidence section.",
    "Open with a strong role-specific introduction, then develop substantial evidence paragraphs based on the most relevant themes in the advert.",
    "Critically discuss each relevant role in relation to the job description and person specification.",
    "Use the candidate's actual roles to organise the evidence naturally, while still grouping it around the employer's priorities.",
    "For each role paragraph, make the relevance explicit: explain what the applicant handled, how they handled it, and why that matters for this exact role.",
    "Apply STAR thinking implicitly in every role paragraph, but never label STAR or use Situation, Task, Action, or Result subheadings.",
    "Each evidence paragraph should read as a polished application paragraph, not as an interview answer format.",
    "Make the tone read like a real high-quality application for this exact role, not like generic employability advice.",
    "Do not mention that the information came from a CV or job description.",
    "Do not include empty enthusiasm or placeholder claims.",
    "Use persuasive concrete sentences that sound ready to submit.",
    "Do not collapse multiple roles into one vague paragraph when the CV provides distinct roles.",
    "Finish with this sign-off exactly:",
    signoff,
    "",
    "Mode: " + tone,
    "Requested word range: " + input.wordRange.label,
    "Job title: " + input.jobTitle,
    "Company: " + input.company,
    "",
    "Candidate CV role evidence only:",
    input.cvText,
    "",
    "Job description:",
    input.jobDescription,
    "",
    aiHistory.buildAvoidanceBlock(input.previousOutputs, "Previous cover letters to avoid repeating")
  ].join("\n");
}

function buildRewriteSystemInstruction() {
  return [
    "You are rewriting a draft cover letter into a premium final version.",
    "Keep only evidence supported by the supplied CV text and job description.",
    "Write in polished UK English.",
    "Remove repetition, filler, and weak generic phrasing.",
    "Strengthen the analytical discussion of each relevant role against the employer's requirements.",
    "Use implicit STAR reasoning inside the prose without visible STAR headings.",
    "Rewrite any visible Situation, Task, Action, or Result content into natural connected paragraphs.",
    "Do not mention the CV, advert, job description, or drafting process.",
    "Do not use STAR headings, Situation/Task/Action/Result labels, bullet points, or markdown.",
    "Make the result sound like a confident, highly tailored final application."
  ].join("\n");
}

function buildRewritePrompt(input) {
  const signoff = input.coverLetterName ? "Yours faithfully\n" + input.coverLetterName : "Yours faithfully";
  return [
    "Rewrite this cover letter into a stronger final draft.",
    "Keep it strictly between " + input.wordRange.min + " and " + input.wordRange.max + " words.",
    "Preserve only supported evidence.",
    "Improve structure, specificity, and quality.",
    "Critically discuss each relevant role in relation to the job requirements.",
    "Make the role-by-role evidence sharper and more analytical.",
    "Remove repetition and any meta commentary about the CV or advert.",
    "End with this sign-off exactly:",
    signoff,
    "",
    "Job title: " + input.jobTitle,
    "Company: " + input.company,
    "",
    "CV role evidence only:",
    input.cvText,
    "",
    "Job description:",
    input.jobDescription,
    "",
    "Draft to rewrite:",
    input.draft,
    "",
    aiHistory.buildAvoidanceBlock(input.previousOutputs, "Previous cover letters to avoid repeating")
  ].join("\n");
}

function prepareCvEvidenceText(cvText) {
  const roleSections = extractRoleEvidenceSections(cvText);
  const detectedRoles = extractDetectedRoles(cvText);
  const fallback = extractResponsibilityLines(cvText, 26);
  const parts = [];
  let i;

  if (detectedRoles.length) {
    parts.push("Detected CV roles:");
    for (i = 0; i < detectedRoles.length; i += 1) {
      parts.push("Role " + (i + 1) + ": " + detectedRoles[i]);
    }
  }

  if (roleSections.length) {
    parts.push("");
    parts.push("Role evidence sections:");
    for (i = 0; i < roleSections.length; i += 1) {
      parts.push("Role " + (i + 1) + ":");
      parts.push(roleSections[i]);
    }
  } else if (fallback.length) {
    parts.push("");
    parts.push("Role responsibility evidence extracted from CV:");
    parts.push(fallback.join("\n"));
  }

  return parts.join("\n").trim() || String(cvText || "").trim();
}

function extractRoleEvidenceSections(cvText) {
  const lines = String(cvText || "").replace(/\r/g, "").split(/\n/).map((line) => line.trim()).filter(Boolean);
  const sections = [];
  let current = null;
  let i;
  let line;

  for (i = 0; i < lines.length; i += 1) {
    line = cleanCvLine(lines[i]);
    if (!line || isIgnoredCvSection(line)) {
      if (current && current.length > 1) {
        sections.push(current.join("\n"));
      }
      current = null;
      continue;
    }
    if (looksLikeRoleHeading(line)) {
      if (current && current.length > 1) {
        sections.push(current.join("\n"));
      }
      current = [line];
      continue;
    }
    if (current && looksLikeRoleDetail(line)) {
      current.push(line);
    }
  }
  if (current && current.length > 1) {
    sections.push(current.join("\n"));
  }
  return sections.slice(0, 8);
}

function cleanCvLine(line) {
  return String(line || "").replace(/^[-*]\s*/, "").replace(/\s+/g, " ").trim();
}

function looksLikeRoleHeading(line) {
  const text = String(line || "").trim();
  const lower = text.toLowerCase();
  if (!text || text.length > 150 || isIgnoredCvSection(text)) {
    return false;
  }
  return /(analyst|manager|assistant|administrator|coordinator|officer|specialist|executive|lead|consultant|advisor|adviser|nurse|support worker|care worker|developer|engineer|technician|supervisor|director|intern|trainee|associate|program|programme|project|business|data|healthcare)/i.test(text) &&
    !/(summary|profile|skills|education|qualification|certification|reference|hobby|interest)/i.test(lower);
}

function looksLikeRoleDetail(line) {
  const text = String(line || "").trim();
  if (!text || text.length < 18 || isIgnoredCvSection(text)) {
    return false;
  }
  return /(\bmanaged\b|\bled\b|\bsupported\b|\bcoordinated\b|\bdelivered\b|\bdeveloped\b|\bcreated\b|\bprepared\b|\banalysed\b|\banalyzed\b|\breported\b|\bmonitored\b|\bimplemented\b|\bimproved\b|\bmaintained\b|\bhandled\b|\bworked\b|\bresponsible\b|\bachieved\b|\bprovided\b|\bconducted\b|\bproduced\b|\bprocessed\b|\bplanned\b|\borganised\b|\borganized\b|\bstakeholder\b|\bproject\b|\bprogramme\b|\bdata\b|\breport\b|\bpatient\b|\bservice\b|\bteam\b|\bclient\b|\bcustomer\b|\bcompliance\b|\brisk\b|\bgovernance\b)/i.test(text);
}

function isIgnoredCvSection(line) {
  return /^(profile|professional profile|personal profile|summary|key skills|skills|technical skills|education|qualifications|certifications|training|courses|references|referees|hobbies|interests|personal details|contact|contact details)$/i.test(String(line || "").trim());
}

function extractResponsibilityLines(cvText, limit) {
  const lines = String(cvText || "").replace(/\r/g, "").split(/\n/).map(cleanCvLine).filter(Boolean);
  const out = [];
  let i;
  for (i = 0; i < lines.length && out.length < (limit || 24); i += 1) {
    if (looksLikeRoleHeading(lines[i]) || looksLikeRoleDetail(lines[i])) {
      out.push(lines[i]);
    }
  }
  return out;
}

function cleanCoverLetterText(text, coverLetterName) {
  const signoff = coverLetterName ? "Yours faithfully\n" + coverLetterName : "Yours faithfully";
  const badFragments = [
    "my selected cv",
    "the job description highlights",
    "the advert highlights",
    "i would use the final application",
    "the final application",
    "candidate cv",
    "job description"
  ];
  let out = String(text || "")
    .replace(/^\s*(STAR|Situation|Task|Action|Result)\s*:?\s*$/gim, "")
    .replace(/\b(Situation|Task|Action|Result)\s*:\s*/gi, "")
    .replace(/\bSTAR\s*:\s*/gi, "")
    .replace(/\r/g, "");
  const parts = out.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const seen = new Set();
  const cleaned = [];
  parts.forEach((part) => {
    const key = part.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) {
      return;
    }
    if (badFragments.some((fragment) => key.indexOf(fragment) !== -1)) {
      return;
    }
    seen.add(key);
    cleaned.push(part);
  });
  out = cleaned.join("\n\n").trim();
  out = out.replace(/\n\s*(Yours faithfully|Yours sincerely)\s*,?\s*\n[\s\S]*$/i, "").trim();
  return out ? out + "\n\n" + signoff : signoff;
}

function countWords(text) {
  const clean = String(text || "").trim();
  return clean ? clean.split(/\s+/).length : 0;
}

function splitParagraphs(text) {
  return String(text || "").replace(/\r/g, "").split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
}

function trimToMaxWords(text, maxWords) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return String(text || "").trim();
  }
  return words.slice(0, maxWords).join(" ").replace(/[,;:]?\s*$/, ".");
}

function extractDetectedRoles(cvText) {
  const lines = String(cvText || "").split(/\r?\n/);
  const roles = [];
  let i;
  let match;
  for (i = 0; i < lines.length; i += 1) {
    match = String(lines[i] || "").match(/^Role\s+\d+\s*:\s*(.+)$/i);
    if (match && match[1]) {
      roles.push(match[1].trim());
    }
  }
  return roles.slice(0, 6);
}

function extractUsefulSentences(text, limit) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter((item) => item.length > 45);
  return sentences.slice(0, limit || 6);
}

function buildExpansionParagraphs(input) {
  const roles = extractDetectedRoles(input.cvText);
  const cvSentences = extractUsefulSentences(input.cvText, 8);
  const jobSentences = extractUsefulSentences(input.jobDescription, 8);
  const roleText = roles.length ? roles.join(", ") : "the candidate's previous roles";
  const roleA = roles[0] || "my previous role";
  const roleB = roles[1] || roles[0] || "another relevant role";
  const roleC = roles[2] || roles[1] || roles[0] || "my wider experience";
  const jobA = jobSentences[0] || "the responsibilities set out for this post";
  const jobB = jobSentences[1] || "the need for accurate delivery, sound judgement, stakeholder support, and organised working";
  const cvA = cvSentences[0] || "I handled responsibilities requiring accuracy, organisation, communication, and dependable follow-through";
  const cvB = cvSentences[1] || "I supported teams and stakeholders by producing reliable outputs and maintaining a professional standard of work";
  const cvC = cvSentences[2] || "I adapted to changing priorities while keeping records, communication, and delivery clear and consistent";
  return [
    "My experience across " + roleText + " is directly relevant because it shows a consistent pattern of taking responsibility, understanding the task in context, acting with care, and producing work that supports wider team outcomes. In relation to " + input.jobTitle + ", that means I would bring evidence of practical delivery rather than relying only on broad statements of interest.",
    "In " + roleA + ", " + cvA + ". This connects with the requirement that " + jobA + ", because the role calls for someone who can understand priorities quickly, organise information properly, and turn responsibilities into useful outputs for colleagues, service users, or senior stakeholders.",
    "In " + roleB + ", " + cvB + ". That experience matters for " + input.company + " because " + jobB + ". It shows that I can move from understanding what is needed, to taking practical action, to supporting a result that is clear, dependable, and relevant to organisational priorities.",
    "My wider experience, including " + roleC + ", also demonstrates adaptability. " + cvC + ". This would help me contribute confidently in the post because I can balance detail with judgement, maintain professionalism under pressure, and communicate progress in a way that supports effective decision-making.",
    "What strengthens my suitability is the range of evidence across different responsibilities. The roles do not show one isolated skill; they show repeated exposure to planning, analysis, communication, documentation, stakeholder support, and accountable delivery. Those are the same qualities I would bring to the day-to-day expectations of " + input.jobTitle + ".",
    "I would therefore approach the role with a clear understanding that strong performance depends on both technical delivery and professional behaviour. I would listen carefully to expectations, clarify priorities, act on the information available, and maintain a high standard of written and verbal communication so that my work supports the team from the outset.",
    "Overall, the evidence in my background gives me a strong platform to contribute to " + input.company + ". I can bring practical experience, a disciplined approach to quality, and the ability to connect my previous responsibilities to the specific outcomes the organisation needs from this appointment."
  ];
}

function enforceWordRange(text, input) {
  let clean = cleanCoverLetterText(text, input.coverLetterName);
  let words = countWords(clean);
  const additions = buildExpansionParagraphs(input);
  let i = 0;
  let body;
  let signoff = input.coverLetterName ? "Yours faithfully\n" + input.coverLetterName : "Yours faithfully";
  clean = clean.replace(/\n\s*(Yours faithfully|Yours sincerely)\s*,?\s*\n[\s\S]*$/i, "").trim();
  while (words < input.wordRange.min && i < additions.length) {
    body = clean ? clean + "\n\n" + additions[i] : additions[i];
    clean = body.trim();
    words = countWords(clean + "\n\n" + signoff);
    i += 1;
  }
  clean = clean + "\n\n" + signoff;
  if (countWords(clean) > input.wordRange.max) {
    clean = trimToMaxWords(clean, input.wordRange.max);
    clean = clean.replace(/\n\s*(Yours faithfully|Yours sincerely)\s*,?\s*\n[\s\S]*$/i, "").trim();
    clean = clean + "\n\n" + signoff;
    if (countWords(clean) > input.wordRange.max) {
      clean = trimToMaxWords(clean, input.wordRange.max - countWords(signoff) - 2) + "\n\n" + signoff;
    }
  }
  return clean.trim();
}
function needsRewrite(text, wordRange) {
  const plain = String(text || "").trim();
  const wordCount = plain ? plain.split(/\s+/).length : 0;
  const lower = plain.toLowerCase();
  const suspiciousPhrases = [
    "my selected cv",
    "the advert highlights",
    "the job description highlights",
    "i would use the final application",
    "the final application",
    "candidate cv"
  ];
  if (!plain) {
    return true;
  }
  if (wordCount < wordRange.min || wordCount > wordRange.max) {
    return true;
  }
  if (suspiciousPhrases.some((phrase) => lower.indexOf(phrase) !== -1)) {
    return true;
  }
  return hasDuplicateParagraphs(plain);
}

function hasDuplicateParagraphs(text) {
  const parts = String(text || "").split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const seen = new Set();
  let i;
  let key;
  for (i = 0; i < parts.length; i += 1) {
    key = parts[i].toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
    if (!key) {
      continue;
    }
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}

function normalizeModel(input) {
  return aiProviders.normalizeModel(input, "gemini-2.5-flash-lite");
}

function normalizeWordRange(input) {
  return { value: "750-900", min: 750, max: 900, label: "750-900 words" };
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



