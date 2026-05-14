const aiProviders = require("./_ai-provider-failover");
const aiHistory = require("./_ai-history");
const generatorConfigMetadataKey = "cover_letter_generator_config";
const coverLetterQualityRubric = [
  "National Careers Service cover-letter guidance: write a tailored letter for each role, keep a professional tone, match employer language, show relevant skills and experience, and use STAR-style evidence where useful.",
  "Formal structure: clear opening, evidence-led body paragraphs, role/company fit, concise close, correct sign-off, and clean paragraph spacing.",
  "Recruiter quality: specific, confident, credible, non-repetitive, grammatically polished, and strong enough to make the reader want to read the CV.",
  "Integrity: do not invent achievements, qualifications, metrics, employers, incidents, systems, or outcomes not supported by the CV evidence.",
  "Originality: do not copy the job description or the reference templates; synthesise meaning in fresh application language.",
  "Consistency: the letter should support the CV, not contradict it, and should not include employment dates unless the user explicitly asks."
];
const defaultGeneratorConfig = {
  coverLetterSample1: "",
  coverLetterSample2: "",
  coverLetterSample3: ""
};
const builtInCoverLetterReferenceSamples = [
  {
    label: "Template 1 - Data, analytics, NHS and public sector",
    text: [
      "Education, Technical Knowledge & Experience",
      "I am pleased to apply for the target role at the target organisation. I bring strong experience across data, reporting, healthcare or service-focused environments, where I have developed advanced technical skills alongside a user-focused approach to delivering meaningful and accessible insights. Where relevant, academic or professional training should be used to demonstrate analytical capability and sector understanding.",
      "I am proficient in using analytical tools such as Excel, SQL, Power BI, Tableau or other relevant systems to extract, analyse and present data effectively. I have experience producing dashboards, reporting outputs and clear visual summaries that help stakeholders interpret data and support evidence-based decision-making. The final letter should adapt these technical themes to the exact role and sector rather than copying tool lists that are not supported by the CV.",
      "Data Analysis, Problem-Solving & Insight Generation",
      "A strong version should explain a challenge, the data or information problem, the action taken, and the value created. For analytical roles, describe extracting, cleaning, validating and analysing complex datasets; creating dashboards or reports; highlighting trends; supporting planning, performance monitoring, service improvement or resource allocation; and improving data quality, efficiency or user experience.",
      "Communication & User Engagement",
      "The letter should show stakeholder engagement, user support, training or clear explanation of technical information. It should explain how complex outputs were translated into practical insight for non-technical users, how working relationships were built, and how confidence, data literacy or consistent use of information improved.",
      "Planning, Organisation & Delivery",
      "The letter should show structured delivery, workload management, workshops, mentoring, project planning, progress monitoring and the ability to work across multiple responsibilities. It should connect planning and organisation to quality outputs, timely delivery and changing priorities.",
      "Information Governance, Ethics & Confidentiality",
      "For healthcare, public sector or data-heavy roles, the letter should demonstrate high standards of data protection, information governance, confidentiality, integrity and secure handling of sensitive information.",
      "Values, Improvement & Development",
      "A strong close should connect equality, inclusion, collaboration, continuous improvement and professional development to the organisation's values and service aims. It should finish confidently by explaining how the applicant's technical expertise, stakeholder-focused approach and commitment to improvement will add value."
    ].join("\n\n")
  },
  {
    label: "Template 2 - Executive support, administration and programme delivery",
    text: [
      "Opening Positioning",
      "I am pleased to apply for the target role at the target organisation. The opening should connect genuine motivation with the organisation's mission and show that strong administrative, analytical or operational leadership is central to delivery. It should position the applicant as someone who thinks strategically while delivering operationally, anticipates needs, protects senior time and contributes to decision-making.",
      "Business Management and Planning",
      "For executive assistant, project, programme, business support and administrative leadership roles, the letter should describe coordinating complex workstreams, supporting senior stakeholders, managing meetings, preparing agendas, recording minutes accurately, tracking actions, improving reporting frameworks and helping leaders make faster, better-informed decisions.",
      "Business Cases, Analysis and Policy Implementation",
      "Where relevant, the letter should explain research, analysis and interpretation of operational, financial or performance information; preparation of evidence-based recommendations; support for business cases; policy implementation; compliance monitoring; and practical action that improves organisational delivery.",
      "Communication",
      "The letter should show the ability to distil complex information into clear briefings, reports, presentations or updates for senior leaders. It should emphasise concise communication, risk escalation, stakeholder coordination and the ability to support urgent decisions under pressure.",
      "Information Governance and Adaptability",
      "The letter should show secure handling of sensitive data, information governance awareness, audit or compliance improvement, adaptability during restructuring or uncertainty, and the ability to establish new workflows, inbox management protocols or coordination procedures.",
      "Equality, Inclusion and Professional Contribution",
      "Where supported by the CV, the letter can draw on inclusive working, recruitment fairness, standardised processes, project management, governance and senior-level support. It should end by connecting the applicant's experience to the organisation's mission and inviting discussion at interview."
    ].join("\n\n")
  }
];
let hostedGeneratorConfigCache = {
  expiresAt: 0,
  value: null
};

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
    const generatorConfig = await loadHostedGeneratorConfig();

    if (!jobTitle || !company || !jobDescription || !rawCvText) {
      return json(200, {
        ok: false,
        message: "Job title, company, job description, and CV text are all required."
      });
    }

    const result = await aiProviders.generateWithFailover({
      model: model,
      providerOrder: ["gptoss", "gemini", "cloudflare", "huggingface"],
      systemInstruction: buildSystemInstruction(generatorConfig),
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
                previousOutputs,
                generatorConfig
              }, generatorConfig)
            }
          ]
        }
      ],
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: wordRange.max > 1000 ? 1800 : 1600,
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
        providerOrder: ["gptoss", "gemini", "cloudflare", "huggingface"],
        systemInstruction: buildRewriteSystemInstruction(generatorConfig),
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
                  previousOutputs,
                  generatorConfig
                }, generatorConfig)
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
      }
    }

    const qualityResult = await refineCoverLetterWithQualityPass({
      draft: finalText,
      model,
      provider: result.provider,
      mode,
      jobTitle,
      company,
      jobDescription,
      cvText,
      coverLetterName,
      wordRange,
      previousOutputs,
      generatorConfig
    });
    if (qualityResult && qualityResult.text) {
      finalText = cleanCoverLetterText(qualityResult.text, coverLetterName);
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
      model: qualityResult && qualityResult.model ? qualityResult.model : result.model,
      provider: qualityResult && qualityResult.provider ? qualityResult.provider : result.provider,
      qualityReviewed: !!(qualityResult && qualityResult.text),
      text: finalText
    });
  } catch (error) {
    return json(200, {
      ok: false,
      message: "Could not generate the AI cover letter right now."
    });
  }
};

function buildSystemInstruction(generatorConfig) {
  const config = normalizeGeneratorConfig(generatorConfig);
  const lines = [
    "You write premium job application cover letters.",
    "Write in polished UK English.",
    "Format the final answer like a standard formal cover letter with clear paragraphs separated by blank lines.",
    "Use 5 to 7 well-developed paragraphs: a strong opening, several evidence-led body paragraphs, and a concise closing.",
    "Each paragraph must have one clear purpose and a natural transition into the next paragraph.",
    "Do not return one dense block of text, short fragments, bullet points, or visible section headings unless the employer explicitly asks for a supporting statement.",
    "Use the STAR approach internally to shape practical evidence in every evidence paragraph.",
    "STAR must guide the logic only: context, responsibility, action taken, and relevance/result should be woven naturally into prose.",
    "Extract the strongest evidence from the CV before writing: role, responsibility, action, output, stakeholder value, quality control, and relevance to the target role.",
    "Use stronger paragraph templates: opening fit, evidence paragraph one, evidence paragraph two, role-specific capability paragraph, values or service-fit paragraph, and confident close.",
    "Avoid generic phrases such as 'I have transferable skills', 'I am passionate', 'I work well in a team', or 'my background is relevant' unless they are made specific with evidence.",
    "Use role-specific wording for Data Analyst, Admin, Healthcare, Support Worker, Project, Programme, and Business Support applications.",
    "Use only the role evidence extracted from the CV and the pasted job description.",
    "Do not invent qualifications, employers, achievements, metrics, tools, or responsibilities.",
    "Do not create fictional incidents, examples, problem scenarios, causes, improvements, percentages, or outcomes that are not clearly supported by the CV evidence.",
    "If the CV evidence is general, write sophisticated general relevance instead of pretending a specific event happened.",
    "Keep the letter tailored to the employer and role.",
    "Use the active reference templates as flexible structure and quality guides, adapting them to the job type, role title, employer and job description.",
    "For NHS, public sector, data, programme, executive support, administrative or private-sector roles, choose headings and paragraph themes that fit the vacancy rather than forcing one fixed template.",
    "Do not copy template organisation names, role names, qualifications, tools, achievements or claims unless they are supported by the candidate CV or the pasted job description.",
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
    "When previous session outputs are provided, make this cover letter clearly different from them in structure, sequencing, and wording.",
    "Follow any administrator-defined cover letter logic provided in the prompt.",
    "If administrator or built-in reference cover letters are provided, use them only as quality, tone, structure, and sophistication benchmarks.",
    "Never copy wording, private details, or unsupported claims from the reference cover letters.",
    "Before finalising, self-review against the professional quality rubric: tailored relevance, evidence quality, structure, recruiter impact, grammar, originality, no invented facts, and consistency with the CV."
  ];
  if (hasCoverLetterSamples(config)) {
    lines.push("Active reference cover-letter templates are available. Read them together and intelligently synthesise their strongest qualities into one fresh letter.");
    lines.push("Blend the sharpest opening logic, the best paragraph sequencing, the most persuasive role-evidence integration, the most polished transitions, and the strongest closing from across the active samples.");
    lines.push("The final result must feel guided by all active reference samples rather than paraphrasing any one sample.");
  }
  return lines.join("\n");
}

function buildUserPrompt(input, generatorConfig) {
  const tone = input.mode === "nhs" ? "NHS-style" : "professional";
  const signoff = input.coverLetterName ? "Yours faithfully\n" + input.coverLetterName : "Yours faithfully";
  const config = normalizeGeneratorConfig(generatorConfig || input.generatorConfig);
  const referenceSamples = buildReferenceSamplesBlock(config);

  return [
    "Write a unique premium cover letter for this application.",
    "Keep the content persuasive, well organised, and non-repetitive.",
    "Keep the final cover letter strictly between " + input.wordRange.min + " and " + input.wordRange.max + " words.",
    "Format it as a standard formal cover letter with blank lines between paragraphs.",
    "Use 5 to 7 polished paragraphs unless the word range requires fewer.",
    "Do not use section headings for a normal cover letter; use connected paragraphs only.",
    "Each body paragraph should be substantial, specific, and recruiter-ready.",
    "Use only the role history and role responsibility evidence provided in the CV evidence extract.",
    "Do not invent specific workplace incidents, case studies, statistics, challenges, root causes, or outcomes.",
    "Only use phrases like 'for example' when the CV evidence itself contains that example.",
    "Do not use profile summaries, skills lists, education, certifications, references, or unrelated CV text as evidence unless it appears inside a role evidence section.",
    "Open with a strong role-specific introduction, then develop substantial evidence paragraphs based on the most relevant themes in the advert.",
    "Use the reference templates as a flexible framework. Create section headings only when they suit the job type and application style; otherwise use polished formal cover-letter paragraphs.",
    "For data or analyst roles, prioritise technical knowledge, insight generation, data quality, stakeholder communication, planning, governance, and improvement where supported by the evidence.",
    "For executive assistant, administration, programme, project or business support roles, prioritise business management, planning, senior stakeholder support, communication, policy or business-case work, governance, adaptability and inclusive professional contribution where supported by the evidence.",
    "For healthcare roles, prioritise confidentiality, accurate records, safe service delivery, patient or service-user awareness, multidisciplinary communication, escalation, quality standards, and professionalism where supported by evidence.",
    "For support worker roles, prioritise person-centred support, empathy, safeguarding awareness, communication, documentation, de-escalation, escalation, and dependable follow-through where supported by evidence.",
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
    referenceSamples ? "Active cover letter reference templates (style, structure and quality guide only - do not copy wording or unsupported facts):\nReview all active templates together, then synthesise the best qualities across them: opening strength, role-appropriate sectioning, paragraph depth, role evidence cadence, persuasive tone, and closing polish. Tailor the final structure to the job type, role and job description.\n" + referenceSamples : "No cover letter reference templates are active for this generation.",
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

function buildRewriteSystemInstruction(generatorConfig) {
  return [
    "You are rewriting a draft cover letter into a premium final version.",
    "Keep only evidence supported by the supplied CV text and job description.",
    "Write in polished UK English.",
    "Remove any fictional incidents, case studies, statistics, challenges, root causes, or outcomes that are not supported by the supplied evidence.",
    "Format the result as a standard formal cover letter with 5 to 7 clear paragraphs separated by blank lines.",
    "Make each paragraph purposeful: opening, evidence, evidence, evidence, fit/motivation, closing.",
    "Do not return one dense block of text or visible section headings for a normal cover letter.",
    "Remove repetition, filler, and weak generic phrasing.",
    "Strengthen the analytical discussion of each relevant role against the employer's requirements.",
    "Use implicit STAR reasoning inside the prose without visible STAR headings.",
    "Rewrite any visible Situation, Task, Action, or Result content into natural connected paragraphs.",
    "Do not mention the CV, advert, job description, or drafting process.",
    "Do not use STAR headings, Situation/Task/Action/Result labels, bullet points, or markdown.",
    "Make the result sound like a confident, highly tailored final application.",
    "Follow any administrator-defined cover letter logic provided in the prompt.",
    "If administrator or built-in reference cover letters are provided, use them only as refinement benchmarks and never copy their exact wording.",
    "Self-review the final letter against the quality rubric before returning it: tailored relevance, paragraph flow, evidence strength, recruiter impact, grammar, originality, no invented facts, and CV consistency."
  ].join("\n");
}

function buildRewritePrompt(input, generatorConfig) {
  const signoff = input.coverLetterName ? "Yours faithfully\n" + input.coverLetterName : "Yours faithfully";
  const config = normalizeGeneratorConfig(generatorConfig || input.generatorConfig);
  const referenceSamples = buildReferenceSamplesBlock(config);
  return [
    "Rewrite this cover letter into a stronger final draft.",
    "Keep it strictly between " + input.wordRange.min + " and " + input.wordRange.max + " words.",
    "Preserve only supported evidence.",
    "Do not add specific incidents, metrics, problems, causes, or outcomes unless they are explicitly present in the CV evidence.",
    "Improve structure, specificity, and quality.",
    "Restructure the draft into a proper cover-letter flow with blank lines between paragraphs.",
    "Use developed paragraphs rather than bullet points, headings, or a single block of text.",
    "Critically discuss each relevant role in relation to the job requirements.",
    "Make the role-by-role evidence sharper and more analytical.",
    "Replace weak generic phrasing with specific role evidence, action, relevance, and recruiter-ready language.",
    "Remove repetition and any meta commentary about the CV or advert.",
    "End with this sign-off exactly:",
    signoff,
    "",
    referenceSamples ? "Active cover letter reference templates (quality and structure guide only - do not copy wording):\nRefine the draft by synthesising the best qualities across all active templates, especially their strongest opening logic, role-appropriate sectioning, paragraph sequencing, role analysis, transitions, and final close. Keep the final structure tailored to this job type, role and job description.\n" + referenceSamples : "No cover letter reference templates are active for this refinement.",
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

function buildCoverLetterQualityReviewInstruction(generatorConfig) {
  return [
    "You are the final cover-letter quality reviewer and editor.",
    "Compare the draft against the supplied quality rubric and improve it before returning it.",
    "Return only the final cover letter text, with no commentary, score, markdown, or headings unless the vacancy clearly needs a supporting-statement style response.",
    "Keep all evidence truthful and supported by the supplied CV evidence and job description.",
    "Do not invent achievements, metrics, incidents, systems, employers, qualifications, responsibilities, or outcomes.",
    "Do not include employment dates unless the user explicitly asked for dates.",
    "Do not copy the job description or reference cover letters; rewrite in fresh, polished UK application language.",
    "Improve paragraph flow, remove repetition, strengthen role relevance, sharpen the opening, and make the close confident and professional.",
    "Keep the letter within the requested word range and preserve the requested sign-off exactly.",
    hasCoverLetterSamples(normalizeGeneratorConfig(generatorConfig)) ? "Use active administrator reference samples as quality benchmarks only, never as text to copy." : "No administrator reference sample is required for this review."
  ].join("\n");
}

function buildCoverLetterQualityReviewPrompt(input, generatorConfig) {
  const signoff = input.coverLetterName ? "Yours faithfully\n" + input.coverLetterName : "Yours faithfully";
  const config = normalizeGeneratorConfig(generatorConfig || input.generatorConfig);
  const referenceSamples = buildReferenceSamplesBlock(config);
  return [
    "Final quality-review pass for this generated cover letter.",
    "Use the rubric to refine the draft into the strongest possible final version.",
    "Requested word range: " + input.wordRange.min + " to " + input.wordRange.max + " words.",
    "Required sign-off exactly:",
    signoff,
    "",
    "Quality rubric:",
    coverLetterQualityRubric.join("\n"),
    "",
    referenceSamples ? "Reference samples for quality/style benchmarking only, do not copy wording:\n" + referenceSamples : "No active reference samples.",
    "",
    "Job title: " + input.jobTitle,
    "Company: " + input.company,
    "Mode: " + input.mode,
    "",
    "CV role evidence only:",
    input.cvText,
    "",
    "Job description:",
    input.jobDescription,
    "",
    "Draft cover letter to improve:",
    input.draft,
    "",
    aiHistory.buildAvoidanceBlock(input.previousOutputs, "Previous cover letters to avoid repeating")
  ].join("\n");
}

async function refineCoverLetterWithQualityPass(input) {
  const provider = String(input && input.provider || "").trim();
  let result;

  if (!provider || !input || !input.draft) {
    return null;
  }

  try {
    result = await aiProviders.generateWithFailover({
      model: input.model,
      providerOrder: [provider],
      cycles: 1,
      systemInstruction: buildCoverLetterQualityReviewInstruction(input.generatorConfig),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildCoverLetterQualityReviewPrompt(input, input.generatorConfig)
            }
          ]
        }
      ],
      temperature: 0.3,
      topP: 0.9,
      maxOutputTokens: input.wordRange && input.wordRange.max > 1000 ? 1900 : 1700,
      providerTimeoutMs: 7000
    });
  } catch (error) {
    return null;
  }

  if (!result || !result.ok || !trimText(result.text || "")) {
    return null;
  }

  return {
    text: result.text,
    provider: result.provider,
    model: result.model
  };
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
    .replace(/^\s*[-*]\s+/gm, "")
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
    if (isVisibleCoverLetterHeading(part)) {
      return;
    }
    seen.add(key);
    cleaned.push(part);
  });
  out = cleaned.join("\n\n").trim();
  out = out.replace(/\n\s*(Yours faithfully|Yours sincerely)\s*,?\s*\n[\s\S]*$/i, "").trim();
  return out ? formatCoverLetterParagraphs(out + "\n\n" + signoff, signoff) : signoff;
}

function countWords(text) {
  const clean = String(text || "").trim();
  return clean ? clean.split(/\s+/).length : 0;
}

function splitParagraphs(text) {
  return String(text || "").replace(/\r/g, "").split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
}

function isVisibleCoverLetterHeading(text) {
  const clean = String(text || "").trim();
  if (!clean || clean.length > 90 || /[.!?]$/.test(clean)) {
    return false;
  }
  return /^(education|technical knowledge|experience|data analysis|problem-solving|insight generation|communication|user engagement|planning|organisation|organization|delivery|information governance|ethics|confidentiality|values|improvement|development|business management|business cases|policy implementation|adaptability|opening|closing|strength themes|nhs tone|civil service tone|preview)$/i.test(clean);
}

function splitSentencesForParagraphs(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) || (clean ? [clean] : []);
}

function extractLetterSignoff(text, fallbackSignoff) {
  const clean = enforceFormalCoverLetterSpacing(text);
  const match = clean.match(/\n\s*(Yours faithfully|Yours sincerely)\s*,?\s*\n[\s\S]*$/i);
  return {
    body: match ? clean.slice(0, match.index).trim() : clean,
    signoff: fallbackSignoff || (match ? match[0].trim() : "")
  };
}

function enforceFormalCoverLetterSpacing(text) {
  let out = String(text || "").replace(/\r/g, "").trim();
  if (!out) {
    return "";
  }
  out = out.replace(/^\s*(Dear\s+[^\n,]{1,120},)\s*(?=\S)/i, "$1\n\n");
  out = out.replace(/\s+(Yours faithfully|Yours sincerely)\s*,?\s+([A-Z][A-Z .'-]{1,80})\s*$/i, "\n\n$1\n$2");
  out = out.replace(/\n\s*(Yours faithfully|Yours sincerely)\s*,?\s+([A-Z][^\n]{1,80})\s*$/i, "\n\n$1\n$2");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

function formatCoverLetterParagraphs(text, fallbackSignoff) {
  const extracted = extractLetterSignoff(text, fallbackSignoff);
  const existing = splitParagraphs(extracted.body).filter((part) => !isVisibleCoverLetterHeading(part));
  const formatted = [];
  const sentences = [];
  let current = [];
  let currentWords = 0;
  let currentSentences = 0;
  let i;
  let sentence;
  let paragraph;

  if (!extracted.body) {
    return extracted.signoff || "";
  }

  if (existing.length >= 5 && !existing.some((part) => countWords(part) > 210)) {
    paragraph = existing.join("\n\n");
    return enforceFormalCoverLetterSpacing(paragraph + (extracted.signoff ? "\n\n" + extracted.signoff : ""));
  }

  existing.forEach((part) => {
    splitSentencesForParagraphs(part).forEach((item) => {
      const cleanSentence = String(item || "").trim();
      if (cleanSentence) {
        sentences.push(cleanSentence);
      }
    });
  });

  for (i = 0; i < sentences.length; i += 1) {
    sentence = sentences[i];
    current.push(sentence);
    currentWords += countWords(sentence);
    currentSentences += 1;
    if ((currentWords >= 95 && currentSentences >= 2) || currentWords >= 150 || currentSentences >= 4) {
      formatted.push(current.join(" "));
      current = [];
      currentWords = 0;
      currentSentences = 0;
    }
  }
  if (current.length) {
    if (formatted.length && currentWords < 45 && countWords(formatted[formatted.length - 1]) < 170) {
      formatted[formatted.length - 1] += " " + current.join(" ");
    } else {
      formatted.push(current.join(" "));
    }
  }

  if (formatted.length < 4 && existing.length >= 3) {
    paragraph = existing.join("\n\n");
  } else {
    paragraph = formatted.join("\n\n");
  }
  return enforceFormalCoverLetterSpacing(paragraph + (extracted.signoff ? "\n\n" + extracted.signoff : ""));
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
  const cleanedRoles = roles.map(cleanRoleLabelForLetter).filter(Boolean);
  const cvSentences = extractUsefulSentences(input.cvText, 8);
  const jobSentences = extractUsefulSentences(input.jobDescription, 8);
  const roleText = cleanedRoles.length ? cleanedRoles.join(", ") : "my previous roles";
  const roleA = cleanRoleLabelForLetter(roles[0]) || "my previous role";
  const roleB = cleanRoleLabelForLetter(roles[1]) || cleanRoleLabelForLetter(roles[0]) || "another relevant role";
  const roleC = cleanRoleLabelForLetter(roles[2]) || cleanRoleLabelForLetter(roles[1]) || cleanRoleLabelForLetter(roles[0]) || "my wider experience";
  const jobA = jobSentences[0] || "the responsibilities set out for this post";
  const jobB = jobSentences[1] || "the need for accurate delivery, sound judgement, stakeholder support, and organised working";
  const cvA = cvSentences[0] || "I handled responsibilities requiring accuracy, organisation, communication, and dependable follow-through";
  const cvB = cvSentences[1] || "I supported teams and stakeholders by producing reliable outputs and maintaining a professional standard of work";
  const cvC = cvSentences[2] || "I adapted to changing priorities while keeping records, communication, and delivery clear and consistent";
  return [
    "My background across " + roleText + " gives me a practical foundation for the demands of " + input.jobTitle + ". It shows sustained experience of taking responsibility, interpreting priorities carefully, and producing work that colleagues and stakeholders can rely on in busy professional environments.",
    "A particularly relevant area of my experience is " + roleA + ", where " + cvA + ". This evidence aligns with the expectation that " + jobA + ", because it demonstrates the ability to move from understanding requirements to producing organised, accurate and useful outputs.",
    "I have also strengthened my professional judgement through " + roleB + ", where " + cvB + ". That experience is valuable for this application because " + jobB + ", and because it shows that I can combine careful delivery with communication that supports confident decision-making.",
    "My wider experience, including " + roleC + ", demonstrates adaptability and accountability. " + cvC + ". This would allow me to contribute with a calm, structured approach while maintaining quality, discretion and dependable follow-through.",
    "What makes my suitability stronger is the consistency of this evidence across more than one responsibility. I can bring planning, analysis, communication, documentation, stakeholder support and accountable delivery together in a way that supports the everyday standards expected from " + input.jobTitle + ".",
    "I would approach the role with both confidence and care, taking time to understand team priorities, clarify expectations, and deliver work that is accurate, relevant and professionally presented. That combination of practical evidence and thoughtful delivery would help me add value from the outset.",
    "Overall, I can offer " + input.company + " a credible blend of role-based experience, disciplined organisation and a strong commitment to producing high-quality work. I would welcome the opportunity to discuss how this background can support the team and the wider aims of the organisation."
  ];
}

function cleanRoleLabelForLetter(label) {
  return String(label || "")
    .replace(/^Role\s+\d+\s*:\s*/i, "")
    .replace(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\s*[-–]\s*(?:Present|Current|Now|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})/gi, "")
    .replace(/\b\d{4}\s*[-–]\s*(?:Present|Current|Now|\d{4})\b/gi, "")
    .replace(/\b\d{1,2}\/\d{4}\s*[-–]\s*(?:Present|Current|Now|\d{1,2}\/\d{4})\b/gi, "")
    .replace(/\s*\|\s*$/g, "")
    .replace(/\s*\|\s*/g, " at ")
    .replace(/\s{2,}/g, " ")
    .trim();
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
  clean = formatCoverLetterParagraphs(clean, signoff);
  if (countWords(clean) > input.wordRange.max) {
    clean = trimToMaxWords(clean, input.wordRange.max);
    clean = clean.replace(/\n\s*(Yours faithfully|Yours sincerely)\s*,?\s*\n[\s\S]*$/i, "").trim();
    clean = clean + "\n\n" + signoff;
    clean = formatCoverLetterParagraphs(clean, signoff);
    if (countWords(clean) > input.wordRange.max) {
      clean = trimToMaxWords(clean, input.wordRange.max - countWords(signoff) - 2) + "\n\n" + signoff;
      clean = formatCoverLetterParagraphs(clean, signoff);
    }
  }
  return formatCoverLetterParagraphs(clean, signoff).trim();
}
function needsRewrite(text, wordRange) {
  const plain = String(text || "").trim();
  const wordCount = plain ? plain.split(/\s+/).length : 0;
  const lower = plain.toLowerCase();
  const body = plain.replace(/\n\s*(Yours faithfully|Yours sincerely)\s*,?\s*\n[\s\S]*$/i, "").trim();
  const bodyParagraphs = splitParagraphs(body);
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
  if (wordCount >= Math.min(wordRange.min, 650) && bodyParagraphs.length < 5) {
    return true;
  }
  if (bodyParagraphs.some((part) => countWords(part) > 220)) {
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

async function loadHostedGeneratorConfig() {
  const now = Date.now();
  const supabaseUrl = trimText(process.env.SUPABASE_URL || "");
  const serviceRoleKey = trimText(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  let users = [];
  let response;
  let data;
  if (hostedGeneratorConfigCache.value && hostedGeneratorConfigCache.expiresAt > now) {
    return hostedGeneratorConfigCache.value;
  }
  if (!supabaseUrl || !serviceRoleKey) {
    hostedGeneratorConfigCache = { expiresAt: now + 60000, value: normalizeGeneratorConfig(null) };
    return hostedGeneratorConfigCache.value;
  }
  try {
    response = await fetch(supabaseUrl + "/auth/v1/admin/users?page=1&per_page=200", {
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey
      }
    });
    if (response.ok) {
      data = await response.json();
      users = data && data.users ? data.users : [];
    }
  } catch (error) {
    users = [];
  }
  hostedGeneratorConfigCache = {
    expiresAt: now + 60000,
    value: resolveHostedGeneratorConfig(users)
  };
  return hostedGeneratorConfigCache.value;
}

function resolveHostedGeneratorConfig(users) {
  const list = Array.isArray(users) ? users : [];
  let i;
  let candidate = null;
  for (i = 0; i < list.length; i += 1) {
    if (list[i] && isAdminUser(list[i]) && list[i].user_metadata && list[i].user_metadata[generatorConfigMetadataKey]) {
      candidate = list[i];
      break;
    }
  }
  if (!candidate) {
    for (i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].user_metadata && list[i].user_metadata[generatorConfigMetadataKey]) {
        candidate = list[i];
        break;
      }
    }
  }
  if (!candidate) {
    for (i = 0; i < list.length; i += 1) {
      if (isAdminUser(list[i])) {
        candidate = list[i];
        break;
      }
    }
  }
  if (!candidate && list.length) {
    candidate = list[0];
  }
  return normalizeGeneratorConfig(candidate && candidate.user_metadata ? candidate.user_metadata[generatorConfigMetadataKey] : null);
}

function normalizeGeneratorConfig(input) {
  const source = input && typeof input === "object" ? input : {};
  const config = {};
  let key;
  let value;
  if (!trimText(source.coverLetterSample1) && trimText(source.masterCoverLetterTemplate)) {
    source.coverLetterSample1 = trimText(source.masterCoverLetterTemplate);
  }
  for (key in defaultGeneratorConfig) {
    if (Object.prototype.hasOwnProperty.call(defaultGeneratorConfig, key)) {
      value = trimText(source[key]);
      config[key] = value || defaultGeneratorConfig[key];
    }
  }
  return config;
}

function isAdminUser(user) {
  return /^(admin|super_admin)$/i.test(trimText(user && user.user_metadata && user.user_metadata.role));
}

function trimText(value) {
  return String(value || "").trim();
}

function trimSampleText(value, limit) {
  return trimText(value).slice(0, limit || 3500);
}

function hasCoverLetterSamples(config) {
  return getActiveReferenceSamples(config).length > 0;
}

function getActiveReferenceSamples(config) {
  const normalized = normalizeGeneratorConfig(config);
  const adminSamples = [
    { label: "CL1", text: trimSampleText(normalized.coverLetterSample1) },
    { label: "CL2", text: trimSampleText(normalized.coverLetterSample2) },
    { label: "CL3", text: trimSampleText(normalized.coverLetterSample3) }
  ].filter((sample) => sample.text);
  if (adminSamples.length) {
    return adminSamples;
  }
  return builtInCoverLetterReferenceSamples.map((sample) => ({
    label: sample.label,
    text: trimSampleText(sample.text, 4500)
  })).filter((sample) => sample.text);
}

function buildReferenceSamplesBlock(config) {
  const samples = getActiveReferenceSamples(config);
  if (!samples.length) {
    return "";
  }
  return samples.map((sample) => sample.label + ":\n" + sample.text).join("\n\n");
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




