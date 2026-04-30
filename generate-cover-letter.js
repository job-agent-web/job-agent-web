const aiProviders = require("./_ai-provider-failover");
const aiHistory = require("./_ai-history");
const COVER_LETTER_PROVIDER_ORDER = ["gptoss", "gptoss", "gemini", "cloudflare", "huggingface"];

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
      providerOrder: COVER_LETTER_PROVIDER_ORDER,
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
      maxOutputTokens: wordRange.max > 1000 ? 2400 : 2200,
      cycles: 4
    });

    if (!result.ok) {
      return json(200, {
        ok: false,
        message: result.message || "No AI provider could generate the cover letter right now.",
        failures: result.failures || []
      });
    }

    let finalText = cleanCoverLetterText(result.text, coverLetterName);
    let finalProvider = result.provider;
    let finalModel = result.model;
    if (needsRewrite(finalText, wordRange)) {
      const rewrite = await aiProviders.generateWithFailover({
        model: model,
        providerOrder: COVER_LETTER_PROVIDER_ORDER,
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
        maxOutputTokens: wordRange.max > 1000 ? 1800 : 1600,
        cycles: 3
      });
      if (rewrite.ok && rewrite.text) {
        finalText = cleanCoverLetterText(rewrite.text, coverLetterName);
        finalProvider = rewrite.provider;
        finalModel = rewrite.model;
      }
    }

    if (countWords(finalText) < wordRange.min) {
      const expansion = await aiProviders.generateWithFailover({
        model: model,
        providerOrder: COVER_LETTER_PROVIDER_ORDER,
        systemInstruction: buildExpansionSystemInstruction(),
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildExpansionPrompt({
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
        temperature: 0.6,
        topP: 0.92,
        maxOutputTokens: wordRange.max > 1000 ? 2400 : 2200,
        cycles: 4
      });
      if (expansion.ok && expansion.text) {
        finalText = cleanCoverLetterText(expansion.text, coverLetterName);
        finalProvider = expansion.provider;
        finalModel = expansion.model;
      }
    }

    if (shouldRunGeminiRefinement(finalProvider, finalModel)) {
      const refinement = await aiProviders.generateWithFailover({
        model: normalizeModel(process.env.GEMINI_MODEL || "gemini-2.5-flash-lite"),
        providerOrder: ["gemini"],
        systemInstruction: buildGeminiRefinementSystemInstruction(),
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildGeminiRefinementPrompt({
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
        temperature: 0.45,
        topP: 0.88,
        maxOutputTokens: wordRange.max > 1000 ? 1900 : 1700,
        cycles: 2
      });
      if (refinement.ok && refinement.text) {
        finalText = cleanCoverLetterText(refinement.text, coverLetterName);
        finalProvider = refinement.provider;
        finalModel = refinement.model;
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
      model: finalModel,
      provider: finalProvider,
      text: finalText,
      wordCount: countWords(finalText)
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
    "You write highly sophisticated job application cover letters.",
    "Write in polished UK English.",
    "Generate well-structured, compelling paragraphs that leave a strong and lasting impression on the reader.",
    "Ensure the writing reflects exceptional quality, refinement, and professional authority.",
    "Use the STAR approach internally to shape practical evidence in every evidence paragraph.",
    "Do not reference any methodology, framework, prompt, or hidden writing process in the final letter.",
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
    "Write a unique highly sophisticated premium cover letter for this application.",
    "Generate compelling, well-structured paragraphs that create a strong and lasting impression on the reader.",
    "Ensure the writing sounds exceptionally refined, credible, and professionally persuasive.",
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
    "Do not reference any methodology, framework, prompt, or drafting technique.",
    "Do not include empty enthusiasm or placeholder claims.",
    "Use persuasive concrete sentences that sound ready to submit.",
    "Do not collapse multiple roles into one vague paragraph when the CV provides distinct roles.",
    "Never mention employment dates, months, years, or date ranges anywhere in the final cover letter.",
    "Refer to previous experience by role title only, not by employer timeline strings.",
    "Write 7 to 9 substantial paragraphs before the sign-off.",
    "Finish with this sign-off exactly:",
    signoff,
    "",
    "Mode: " + tone,
    "Requested word range: " + input.wordRange.label,
    "Job title: " + input.jobTitle,
    "Company: " + input.company,
    "",
    "Candidate CV role evidence only:",
    stripCoverLetterDateText(input.cvText),
    "",
    "Job description:",
    input.jobDescription,
    "",
    aiHistory.buildAvoidanceBlock(input.previousOutputs, "Previous cover letters to avoid repeating")
  ].join("\n");
}

function buildRewriteSystemInstruction() {
  return [
    "You are rewriting a draft cover letter into a highly sophisticated premium final version.",
    "Keep only evidence supported by the supplied CV text and job description.",
    "Write in polished UK English.",
    "Generate well-structured, compelling paragraphs that leave a strong and lasting impression on the reader.",
    "Ensure the writing reflects exceptional quality, refinement, and professional authority.",
    "Remove repetition, filler, and weak generic phrasing.",
    "Strengthen the analytical discussion of each relevant role against the employer's requirements.",
    "Use implicit STAR reasoning inside the prose without visible STAR headings.",
    "Rewrite any visible Situation, Task, Action, or Result content into natural connected paragraphs.",
    "Do not mention the CV, advert, job description, or drafting process.",
    "Do not use STAR headings, Situation/Task/Action/Result labels, bullet points, or markdown.",
    "Make the result sound like a confident, highly tailored final application.",
    "Make every paragraph feel compelling, mature, and memorable without mentioning any methodology or framework."
  ].join("\n");
}

function buildExpansionSystemInstruction() {
  return [
    "You are expanding an under-length cover letter into a highly sophisticated premium final version.",
    "Write in polished UK English.",
    "Generate well-structured, compelling paragraphs that leave a strong and lasting impression on the reader.",
    "Ensure the writing reflects exceptional quality, refinement, and professional authority.",
    "Use only the supplied CV role evidence and job description.",
    "Keep the structure persuasive, specific, and submission-ready.",
    "Make the expanded result feel compelling, refined, and memorable to a hiring reader.",
    "Expand the draft into 7 to 9 substantial paragraphs.",
    "Do not summarise the draft.",
    "Do not use bullet points, markdown, headings, or meta commentary.",
    "Do not mention the CV, advert, job description, or drafting process.",
    "Never mention employment dates, months, years, or date ranges anywhere in the final cover letter.",
    "Refer to previous experience by role title only."
  ].join("\n");
}

function buildRewritePrompt(input) {
  const signoff = input.coverLetterName ? "Yours faithfully\n" + input.coverLetterName : "Yours faithfully";
  return [
    "Rewrite this cover letter into a stronger, more sophisticated final draft.",
    "Keep it strictly between " + input.wordRange.min + " and " + input.wordRange.max + " words.",
    "Preserve only supported evidence.",
    "Improve structure, specificity, and quality.",
    "Make the paragraphs more compelling and more impressive to a hiring reader.",
    "Critically discuss each relevant role in relation to the job requirements.",
    "Make the role-by-role evidence sharper and more analytical.",
    "If the draft is too short, expand it into 7 to 9 substantial paragraphs and do not return fewer than " + input.wordRange.min + " words.",
    "Remove repetition and any meta commentary about the CV or advert.",
    "Never mention employment dates, months, years, or date ranges anywhere in the final cover letter.",
    "Refer to previous experience by role title only, not by employer timeline strings.",
    "Write 7 to 9 substantial paragraphs before the sign-off.",
    "End with this sign-off exactly:",
    signoff,
    "",
    "Job title: " + input.jobTitle,
    "Company: " + input.company,
    "",
    "CV role evidence only:",
    stripCoverLetterDateText(input.cvText),
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

function buildExpansionPrompt(input) {
  const signoff = input.coverLetterName ? "Yours faithfully\n" + input.coverLetterName : "Yours faithfully";
  return [
    "Expand this under-length cover letter into a full highly sophisticated premium final draft.",
    "Keep it strictly between " + input.wordRange.min + " and " + input.wordRange.max + " words.",
    "Make it read like a refined final application, not a template or summary.",
    "Make the final paragraphs compelling, memorable, and exceptionally polished.",
    "Use role-based evidence from the CV extract and blend it with the job description requirements.",
    "Write 7 to 9 substantial paragraphs before the sign-off.",
    "Do not use bullet points or headings.",
    "Do not mention the CV, the job description, the advert, or the drafting process.",
    "Never mention employment dates, months, years, or date ranges anywhere in the final cover letter.",
    "End with this sign-off exactly:",
    signoff,
    "",
    "Job title: " + input.jobTitle,
    "Company: " + input.company,
    "",
    "CV role evidence only:",
    stripCoverLetterDateText(input.cvText),
    "",
    "Job description:",
    input.jobDescription,
    "",
    "Short draft to expand:",
    input.draft,
    "",
    aiHistory.buildAvoidanceBlock(input.previousOutputs, "Previous cover letters to avoid repeating")
  ].join("\n");
}

function buildGeminiRefinementSystemInstruction() {
  return [
    "You are refining a strong GPT-drafted cover letter into an even more polished final version.",
    "Write in polished UK English.",
    "Preserve the factual basis, role evidence, and employer alignment already present in the draft.",
    "Improve flow, sentence quality, paragraph sophistication, clarity, and persuasive impact.",
    "Make the result feel executive-quality, memorable, and genuinely ready to submit.",
    "Do not invent qualifications, employers, metrics, dates, tools, or responsibilities.",
    "Do not add visible methodology labels, headings, bullet points, or markdown.",
    "Do not mention the CV, the job description, the advert, the model, or the drafting process.",
    "Keep the final letter within the requested word range."
  ].join("\n");
}

function buildGeminiRefinementPrompt(input) {
  const signoff = input.coverLetterName ? "Yours faithfully\n" + input.coverLetterName : "Yours faithfully";
  return [
    "Refine this cover letter into a more sophisticated final version without changing the factual basis.",
    "Keep it strictly between " + input.wordRange.min + " and " + input.wordRange.max + " words.",
    "Improve the paragraph flow, polish, sentence craft, and overall persuasive quality.",
    "Keep the strongest role evidence and employer alignment intact.",
    "Do not add new facts or unsupported claims.",
    "Do not mention the CV, the job description, the advert, the model, or the drafting process.",
    "End with this sign-off exactly:",
    signoff,
    "",
    "Job title: " + input.jobTitle,
    "Company: " + input.company,
    "",
    "Role evidence only:",
    stripCoverLetterDateText(input.cvText),
    "",
    "Job description:",
    input.jobDescription,
    "",
    "Draft to refine:",
    input.draft,
    "",
    aiHistory.buildAvoidanceBlock(input.previousOutputs, "Previous cover letters to avoid repeating")
  ].join("\n");
}

function prepareCvEvidenceText(cvText) {
  const roleSections = extractRoleEvidenceSections(cvText);
  const fallback = extractResponsibilityLines(cvText, 26);
  const parts = [];
  let i;

  if (roleSections.length) {
    for (i = 0; i < roleSections.length; i += 1) {
      parts.push(roleSections[i]);
    }
    return parts.join("\n\n").trim();
  }

  if (fallback.length) {
    return fallback.join("\n").trim();
  }

  return String(cvText || "").trim();
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
      current = [simplifyRoleLabel(line)];
      continue;
    }
    if (current && looksLikeRoleDetail(line)) {
      current.push(stripCoverLetterDateText(line));
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
    if (looksLikeRoleHeading(lines[i])) {
      out.push(simplifyRoleLabel(lines[i]));
    } else if (looksLikeRoleDetail(lines[i])) {
      out.push(stripCoverLetterDateText(lines[i]));
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
    "job description",
    "detected cv roles",
    "role evidence sections",
    "role-based cv evidence only",
    "role responsibility evidence extracted",
    "my experience across",
    "this connects with the requirement",
    "beyond the star example above",
    "in particular, the requirement",
    "direct cv parsing is unavailable",
    "selected cv source"
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
  out = stripCoverLetterDateText(ensureParagraphFlow(cleaned.join("\n\n").trim()));
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

function ensureParagraphFlow(text) {
  const clean = String(text || "").replace(/\r/g, "").trim();
  const parts = splitParagraphs(clean);
  const sentences = clean.replace(/\n+/g, " ").match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [clean];
  const out = [];
  let buffer = [];
  let groupSize;
  let i;
  let sentence;
  if (!clean || parts.length >= 5) {
    return clean;
  }
  groupSize = Math.max(2, Math.ceil(sentences.length / 6));
  for (i = 0; i < sentences.length; i += 1) {
    sentence = String(sentences[i] || "").trim();
    if (!sentence) {
      continue;
    }
    buffer.push(sentence);
    if (buffer.length >= groupSize) {
      out.push(buffer.join(" "));
      buffer = [];
    }
  }
  if (buffer.length) {
    out.push(buffer.join(" "));
  }
  return out.length > 1 ? out.join("\n\n") : clean;
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
      roles.push(simplifyRoleLabel(match[1]));
    }
  }
  return roles.slice(0, 6);
}

function simplifyRoleLabel(text) {
  let value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) {
    return "";
  }
  if (value.indexOf("|") !== -1) {
    value = value.split("|")[0].trim();
  }
  value = value
    .replace(/\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{4}\s*-\s*(?:present|current|(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{4})\b/ig, "")
    .replace(/\b\d{4}\s*-\s*(?:present|current|\d{4})\b/ig, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[|,;-]+\s*$/g, "")
    .trim();
  return value || "my previous role";
}

function stripCoverLetterDateText(text) {
  return String(text || "")
    .replace(/\(\s*(?:(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{4}|\d{4})\s*-\s*(?:present|current|(?:(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{4}|\d{4}))\s*\)/ig, "")
    .replace(/\b(?:(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{4}|\d{4})\s*-\s*(?:present|current|(?:(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{4}|\d{4}))\b/ig, "")
    .replace(/\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{4}\b/ig, "")
    .replace(/\b\d{4}\b(?=\s*(?:-|to)\s*(?:present|current|\d{4}))/ig, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
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
  const roleA = roles[0] || "one previous role";
  const roleB = roles[1] || roles[0] || "another relevant role";
  const roleC = roles[2] || roles[1] || roles[0] || "the wider professional background";
  const jobA = jobSentences[0] || "the responsibilities set out for this post";
  const jobB = jobSentences[1] || "the need for accurate delivery, sound judgement, stakeholder support, and organised working";
  const cvA = cvSentences[0] || "I handled responsibilities requiring accuracy, organisation, communication, and dependable follow-through";
  const cvB = cvSentences[1] || "I supported teams and stakeholders by producing reliable outputs and maintaining a professional standard of work";
  const cvC = cvSentences[2] || "I adapted to changing priorities while keeping records, communication, and delivery clear and consistent";
  return [
    "Across roles such as " + roleText + ", I have built a pattern of delivery rooted in ownership, professionalism, and careful follow-through. That background gives me practical evidence for " + input.jobTitle + " and allows me to present relevant experience with confidence rather than relying on broad claims.",
    roleA + " strengthened my ability to deliver work that is accurate, organised, and useful to others. Through experience such as " + cvA + ", I developed the judgement needed to understand expectations quickly and translate them into dependable outputs that support wider team priorities.",
    "Experience from " + roleB + " also sharpened my ability to contribute in environments where standards matter. " + cvB + ". This is closely aligned with the expectations of " + input.company + ", where success depends on turning information into practical action and maintaining quality in the process.",
    "My wider professional background, including " + roleC + ", shows adaptability as well as consistency. " + cvC + ". That combination would help me contribute effectively in the post because I can manage detail, communicate clearly, and maintain professional standards even when priorities shift.",
    "What gives my application additional strength is the range of evidence across different responsibilities. The experience points to repeated involvement in analysis, communication, documentation, coordination, stakeholder support, and accountable delivery, which are all directly relevant to the day-to-day expectations of " + input.jobTitle + ".",
    "I would therefore approach the role with a clear understanding that strong performance depends on both technical capability and professional judgement. I would take time to understand expectations, respond constructively to feedback, and ensure that my work consistently supports effective decision-making and a high standard of delivery.",
    "Overall, the evidence in my background gives me a strong platform to contribute to " + input.company + ". I can offer practical experience, a disciplined approach to quality, and the ability to connect previous responsibilities to the outcomes the organisation needs from this appointment."
  ];
}


function enforceWordRange(text, input) {
  let clean = cleanCoverLetterText(text, input.coverLetterName);
  let words = countWords(clean);
  const additions = buildExpansionParagraphs(input);
  let i = 0;
  let body;
  let signoff = input.coverLetterName ? "Yours faithfully\n" + input.coverLetterName : "Yours faithfully";
  clean = ensureParagraphFlow(clean.replace(/\n\s*(Yours faithfully|Yours sincerely)\s*,?\s*\n[\s\S]*$/i, "").trim());
  while (words < input.wordRange.min && i < additions.length) {
    body = clean ? clean + "\n\n" + additions[i] : additions[i];
    clean = body.trim();
    words = countWords(clean + "\n\n" + signoff);
    i += 1;
  }
  clean = clean + "\n\n" + signoff;
  if (countWords(clean) > input.wordRange.max) {
    clean = trimToMaxWords(clean, input.wordRange.max);
    clean = ensureParagraphFlow(clean.replace(/\n\s*(Yours faithfully|Yours sincerely)\s*,?\s*\n[\s\S]*$/i, "").trim());
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
    "candidate cv",
    "detected cv roles",
    "role evidence sections",
    "role-based cv evidence only",
    "role responsibility evidence extracted",
    "my experience across",
    "this connects with the requirement",
    "beyond the star example above",
    "in particular, the requirement",
    "direct cv parsing is unavailable",
    "selected cv source"
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

function shouldRunGeminiRefinement(provider, model) {
  const providerValue = String(provider || "").trim().toLowerCase();
  const modelValue = String(model || "").trim().toLowerCase();
  return providerValue === "gptoss" || providerValue === "gpt-oss" || modelValue.indexOf("gpt-oss") !== -1;
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
  return { value: "750-950", min: 750, max: 950, label: "750-950 words" };
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





