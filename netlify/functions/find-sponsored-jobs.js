"use strict";

const https = require("https");
const aiProviders = require("./_ai-provider-failover");

const SEARCH_SITES = [
  "uk.indeed.com",
  "www.linkedin.com",
  "www.reed.co.uk",
  "www.totaljobs.com",
  "www.cv-library.co.uk",
  "findajob.dwp.gov.uk",
  "www.glassdoor.co.uk",
  "www.monster.co.uk",
  "www.jobsite.co.uk",
  "www.adzuna.co.uk",
  "www.jobsora.com",
  "www.jobisjob.co.uk",
  "www.fish4.co.uk",
  "www.simplyhired.co.uk",
  "www.jobserve.com",
  "www.jobrapido.com",
  "www.trovit.co.uk",
  "www.talent.com",
  "uk.jooble.org",
  "www.ziprecruiter.co.uk",
  "www.jobijoba.co.uk",
  "www.whatjobs.com",
  "www.breakroom.cc",
  "www.otta.com",
  "wellfound.com",
  "www.workcircle.co.uk",
  "jobs.theguardian.com",
  "jobs.telegraph.co.uk",
  "www.prospects.ac.uk",
  "www.jobs.ac.uk",
  "www.charityjob.co.uk",
  "www.efinancialcareers.co.uk",
  "www.technojobs.co.uk",
  "www.bmj.com",
  "jobs.nhs.uk",
  "beta.jobs.nhs.uk",
  "www.healthjobsuk.com",
  "www.rcn.org.uk",
  "www.civilservicejobs.service.gov.uk",
  "www.localgovjobs.co.uk",
  "www.lgjobs.com",
  "www.jobsgopublic.com",
  "www.educationjobs.com",
  "www.tes.com",
  "www.protocol-education.com",
  "www.justengineers.net",
  "www.greenjobs.co.uk",
  "www.s1jobs.com",
  "www.scotjobsnet.co.uk",
  "www.nijobs.com",
  "www.welshjobs.co.uk",
  "apply.workable.com",
  "jobs.ashbyhq.com",
  "boards.greenhouse.io",
  "jobs.lever.co",
  "careers.smartrecruiters.com",
  "jobs.jobvite.com"
];

const SPONSORSHIP_TERMS = [
  "visa sponsorship",
  "sponsorship",
  "skilled worker",
  "certificate of sponsorship",
  "cos",
  "health and care worker visa",
  "eligible for sponsorship",
  "sponsorship available"
];

const MAX_RETURNED_JOBS = 60;
const MAX_QUERY_COUNT = 260;
const SEARCH_DEADLINE_MS = 26000;

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return json(204, {});
  }
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, message: "Method not allowed." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const jobTitle = cleanText(body.jobTitle);
    const industry = cleanText(body.industry);
    const location = cleanText(body.location);
    const companies = Array.isArray(body.companies) ? uniqueList(body.companies).slice(0, 30) : [];

    if (!jobTitle || !industry || !location) {
      return json(200, {
        ok: false,
        message: "Job title, industry, and location are required."
      });
    }

    const jobs = await searchAdvertResults(jobTitle, industry, location, companies);

    if (!jobs.length) {
      return json(200, {
        ok: false,
        message: "No live visa sponsorship adverts were found right now, even after AI-assisted query expansion."
      });
    }

      return json(200, {
        ok: true,
        source: "ai-assisted-live-search",
        jobs: jobs.slice(0, MAX_RETURNED_JOBS)
      });
  } catch (error) {
    return json(200, {
      ok: false,
      message: "Could not search live visa sponsorship adverts right now."
    });
  }
};

async function searchAdvertResults(jobTitle, industry, location, companies) {
  const attempts = buildSearchAttempts(jobTitle, industry, location, companies);
  const deadline = Date.now() + SEARCH_DEADLINE_MS;
  let aiQueries = [];
  const seen = {};
  const output = [];
  let attemptIndex;
  let queries;
  let i;
  let items;
  let j;
  let job;

  for (attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
    if (Date.now() > deadline) {
      return output;
    }
    queries = buildQueries(
      attempts[attemptIndex].jobTitle,
      attempts[attemptIndex].industry,
      attempts[attemptIndex].location,
      attempts[attemptIndex].companies
    );
    for (i = 0; i < queries.length; i += 1) {
      if (Date.now() > deadline) {
        return output;
      }
      try {
        items = await fetchQueryResults(queries[i]);
      } catch (error) {
        items = [];
      }
      for (j = 0; j < items.length; j += 1) {
        job = normalizeSearchItem(
          items[j],
          attempts[attemptIndex].jobTitle,
          attempts[attemptIndex].industry,
          attempts[attemptIndex].location,
          attempts[attemptIndex].companies,
          companies
        );
        if (!job || !job.url || seen[job.url]) {
          continue;
        }
        seen[job.url] = true;
        output.push(job);
        if (output.length >= MAX_RETURNED_JOBS) {
          return output;
        }
      }
    }
    if (output.length >= 10) {
      return output;
    }
  }

  if (output.length < 10 && Date.now() < deadline) {
    try {
      aiQueries = await buildAiQueries(jobTitle, industry, location, companies);
    } catch (error) {
      aiQueries = [];
    }
  }

  if (aiQueries.length && Date.now() < deadline) {
    await collectFromQueries(aiQueries, jobTitle, industry, location, companies, companies, seen, output);
  }

  return output;
}

async function collectFromQueries(queries, jobTitle, industry, location, companies, sponsorCompanies, seen, output) {
  const deadline = Date.now() + 6000;
  let i;
  let items;
  let j;
  let job;

  for (i = 0; i < queries.length; i += 1) {
    if (Date.now() > deadline) {
      return output;
    }
    try {
      items = await fetchQueryResults(queries[i]);
    } catch (error) {
      items = [];
    }
    for (j = 0; j < items.length; j += 1) {
      job = normalizeSearchItem(
        items[j],
        jobTitle,
        industry,
        location,
        companies,
        sponsorCompanies
      );
      if (!job || !job.url || seen[job.url]) {
        continue;
      }
      seen[job.url] = true;
      output.push(job);
      if (output.length >= MAX_RETURNED_JOBS) {
        return output;
      }
    }
  }

  return output;
}

function buildSearchAttempts(jobTitle, industry, location, companies) {
  const attempts = [];
  const broaderLocation = getBroaderLocation(location);

  attempts.push({
    jobTitle: jobTitle,
    industry: industry,
    location: location,
    companies: companies
  });
  attempts.push({
    jobTitle: jobTitle,
    industry: "",
    location: location,
    companies: companies
  });
  if (broaderLocation && broaderLocation !== location) {
    attempts.push({
      jobTitle: jobTitle,
      industry: industry,
      location: broaderLocation,
      companies: companies
    });
    attempts.push({
      jobTitle: jobTitle,
      industry: "",
      location: broaderLocation,
      companies: companies
    });
  }
  attempts.push({
    jobTitle: jobTitle,
    industry: industry,
    location: "",
    companies: companies
  });
  attempts.push({
    jobTitle: jobTitle,
    industry: "",
    location: "",
    companies: companies
  });

  return attempts;
}

function getBroaderLocation(location) {
  const value = cleanText(location).toLowerCase();
  const map = {
    "birmingham": "West Midlands",
    "coventry": "West Midlands",
    "wolverhampton": "West Midlands",
    "walsall": "West Midlands",
    "solihull": "West Midlands",
    "manchester": "North West",
    "liverpool": "North West",
    "leeds": "Yorkshire and the Humber",
    "sheffield": "Yorkshire and the Humber",
    "cardiff": "Wales",
    "swansea": "Wales",
    "newport": "Wales",
    "glasgow": "Scotland",
    "edinburgh": "Scotland",
    "aberdeen": "Scotland",
    "dundee": "Scotland",
    "belfast": "Northern Ireland",
    "bristol": "South West",
    "london": "London"
  };
  return map[value] || cleanText(location);
}

async function fetchQueryResults(query) {
  const urls = [
    "https://www.bing.com/search?format=rss&q=" + encodeURIComponent(query),
    "https://news.google.com/rss/search?q=" + encodeURIComponent(query + " UK job advert")
  ];
  const seen = {};
  let output = [];
  let i;
  let items;
  let j;
  for (i = 0; i < urls.length; i += 1) {
    try {
      items = parseRssItems(await requestText(urls[i]));
    } catch (error) {
      items = [];
    }
    for (j = 0; j < items.length; j += 1) {
      if (items[j] && items[j].url && !seen[items[j].url]) {
        seen[items[j].url] = true;
        output.push(items[j]);
      }
    }
  }
  return output;
}

async function buildAiQueries(jobTitle, industry, location, companies) {
  let hfQueries = [];
  let result;

  const promptCompanies = (companies || []).slice(0, 8).join("\n") || "No sponsor company seeds provided.";
  try {
    result = await aiProviders.generateWithFailover({
      model: aiProviders.normalizeModel(process.env.GEMINI_MODEL || "gemini-2.5-flash-lite", "gemini-2.5-flash-lite"),
      providerOrder: ["gemini", "gptoss", "cloudflare", "huggingface"],
      systemInstruction: [
        "You help generate targeted web search queries for finding live UK visa sponsorship job adverts.",
        "Return JSON only.",
        'Use this exact schema: {"queries":["..."]}.',
        "Focus on exact advert pages or job-board advert pages, not generic homepage searches.",
        "Prefer UK job platforms and careers boards.",
        "Keep queries concise and realistic for web search.",
        "Do not invent companies beyond the supplied sponsor seeds."
      ].join("\n"),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Job title: " + jobTitle,
                "Industry: " + industry,
                "Location: " + location,
                "",
                "Sponsor seed companies:",
                promptCompanies,
                "",
                "Generate up to 12 strong web queries for finding live job adverts with visa sponsorship."
              ].join("\n")
            }
          ]
        }
      ],
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: 500,
      expectJson: true,
      cycles: 3
    });
  } catch (error) {
    return [];
  }
  if (result.ok) {
    return normaliseAiQueryPayload(result.text);
  }
  try {
    hfQueries = await buildHuggingFaceQueries(jobTitle, industry, location, companies);
  } catch (error) {
    hfQueries = [];
  }
  return hfQueries;
}

async function buildHuggingFaceQueries(jobTitle, industry, location, companies) {
  const token = getHuggingFaceToken();
  const promptCompanies = (companies || []).slice(0, 8).join("\n") || "No sponsor company seeds provided.";
  let response;
  let parsed;

  if (!token) {
    return [];
  }

  response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b:fastest",
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: [
            "You generate fast, high-precision UK job-search queries for live visa sponsorship adverts.",
            "Return JSON only.",
            'Use exactly this schema: {"queries":["..."]}.',
            "Prefer direct advert pages and job-board advert pages.",
            "Use supplied sponsor-company seeds heavily.",
            "Do not invent unsupported companies."
          ].join("\n")
        },
        {
          role: "user",
          content: [
            "Job title: " + jobTitle,
            "Industry: " + industry,
            "Location: " + location,
            "",
            "Sponsor seed companies:",
            promptCompanies,
            "",
            "Generate up to 12 concise UK web queries for live recruiting adverts. Include some queries without explicit sponsorship wording when a seed company is likely licensed to sponsor."
          ].join("\n")
        }
      ]
    })
  });

  parsed = aiProviders.safeJson(await response.text());
  if (!response.ok || !parsed) {
    return [];
  }

  return normaliseAiQueryPayload(
    parsed.choices && parsed.choices[0] && parsed.choices[0].message
      ? parsed.choices[0].message.content
      : ""
  );
}

function getHuggingFaceToken() {
  const names = [
    "HF_TOKEN",
    "HF_API_TOKEN",
    "HUGGINGFACE_API_KEY",
    "HUGGING_FACE_API_KEY",
    "HUGGINGFACE_TOKEN",
    "HUGGING_FACE_TOKEN"
  ];
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

function normaliseAiQueryPayload(text) {
  let parsed;
  let queries;
  try {
    parsed = JSON.parse(text || "{}");
  } catch (error) {
    return [];
  }
  queries = Array.isArray(parsed && parsed.queries) ? parsed.queries : [];
  return uniqueList(queries.map(cleanText).filter(Boolean)).slice(0, 20);
}

function buildQueries(jobTitle, industry, location, companies) {
  const queries = [];
  let i;
  let j;

  for (i = 0; i < companies.length && i < 12; i += 1) {
    for (j = 0; j < SEARCH_SITES.length; j += 1) {
      queries.push('site:' + SEARCH_SITES[j] + ' "' + jobTitle + '" "' + companies[i] + '" "' + location + '" "visa sponsorship"');
      queries.push('site:' + SEARCH_SITES[j] + ' "' + jobTitle + '" "' + companies[i] + '" "' + location + '"');
      queries.push('site:' + SEARCH_SITES[j] + ' "' + jobTitle + '" "' + companies[i] + '"');
    }
  }

  for (j = 0; j < SEARCH_SITES.length; j += 1) {
    queries.push('site:' + SEARCH_SITES[j] + ' "' + jobTitle + '" "' + location + '" "' + industry + '" "visa sponsorship"');
    queries.push('site:' + SEARCH_SITES[j] + ' "' + jobTitle + '" "' + location + '" "' + industry + '"');
    queries.push('site:' + SEARCH_SITES[j] + ' "' + jobTitle + '" "' + location + '"');
  }

  queries.push('"' + jobTitle + '" "' + location + '" "' + industry + '" "visa sponsorship"');
  queries.push('"' + jobTitle + '" "' + location + '" "skilled worker visa"');
  queries.push('"' + jobTitle + '" "' + location + '" "' + industry + '"');

  return uniqueList(queries).slice(0, MAX_QUERY_COUNT);
}

function normalizeSearchItem(item, jobTitle, industry, location, companies, sponsorCompanies) {
  const title = cleanText(item && item.title);
  const url = cleanText(item && item.url);
  const snippet = cleanText(item && item.snippet);
  const combined = (title + " " + snippet + " " + url).toLowerCase();
  const company = detectCompany(title, snippet, url, sponsorCompanies || companies);
  const source = detectSource(url);
  const licensedSponsor = companyIsLicensedSponsor(company, sponsorCompanies || companies);

  if (!url || !title || !source) {
    return null;
  }
  if (!licensedSponsor) {
    return null;
  }
  if (!looksLikeAdvert(url, combined)) {
    return null;
  }
  if (!isRelevantToRole(combined, jobTitle, industry, location, company, sponsorCompanies || companies, licensedSponsor)) {
    return null;
  }
  if (!looksLikeRecruitingAdvert(combined) && !licensedSponsor) {
    return null;
  }
  if (!containsAny(combined, SPONSORSHIP_TERMS) && !licensedSponsor) {
    return null;
  }

  return {
    id: safeKey(url),
    title: title,
    company: company || "Recruiting employer",
    location: location,
    source: source,
    snippet: truncateSnippet(snippet),
    url: url
  };
}

function isRelevantToRole(combined, jobTitle, industry, location, company, sponsorCompanies, licensedSponsor) {
  const jobWords = splitUsefulWords(jobTitle);
  const industryWords = splitUsefulWords(industry);
  const locationWords = splitUsefulWords(location);
  const roleHints = buildRoleHints(jobTitle, industry);
  let titleMatches = 0;
  let i;

  for (i = 0; i < jobWords.length; i += 1) {
    if (combined.indexOf(jobWords[i]) !== -1) {
      titleMatches += 1;
    }
  }

  if (!titleMatches && roleHints.length && !containsAny(combined, roleHints)) {
    return false;
  }
  if (!titleMatches && !roleHints.length && jobWords.length) {
    return false;
  }
  if (industryWords.length && !containsAny(combined, industryWords) && !containsAny(combined, roleHints) && !licensedSponsor) {
    return false;
  }
  if (locationWords.length && !containsAny(combined, locationWords) && combined.indexOf("united kingdom") === -1 && combined.indexOf("remote") === -1 && !licensedSponsor) {
    return false;
  }

  return true;
}

function looksLikeRecruitingAdvert(combined) {
  return containsAny(combined, [
    "apply",
    "apply now",
    "apply for this job",
    "job opening",
    "careers",
    "career opportunity",
    "opportunity",
    "role",
    "vacancy",
    "vacancies",
    "job details",
    "job advert",
    "full-time",
    "part-time",
    "closing date",
    "per annum",
    "salary"
  ]);
}

function companyIsLicensedSponsor(company, companies) {
  const candidate = normalizeCompanyName(company);
  let sponsor;
  let i;
  if (!candidate) {
    return false;
  }
  for (i = 0; i < companies.length; i += 1) {
    sponsor = normalizeCompanyName(companies[i]);
    if (candidate === sponsor || candidate.indexOf(sponsor) !== -1 || sponsor.indexOf(candidate) !== -1 || companyTokenScore(candidate, sponsor) >= Math.min(2, sponsor.split(" ").filter(Boolean).length)) {
      return true;
    }
  }
  return false;
}

function buildRoleHints(jobTitle, industry) {
  const title = cleanText(jobTitle).toLowerCase();
  const haystack = (title + " " + cleanText(industry)).toLowerCase();
  let hints = splitUsefulWords(jobTitle).slice(0);

  if (containsAny(haystack, ["analyst", "analytics", "data", "insight", "report", "bi", "mi"])) {
    hints = hints.concat(["analyst", "analytics", "reporting", "insight", "business intelligence", "bi", "mi"]);
  }
  if (containsAny(title, ["registered nurse", "staff nurse", "nurse", "nursing", "midwife"])) {
    hints = hints.concat(["registered nurse", "staff nurse", "nurse", "nursing", "midwife", "ward nurse", "clinical nurse"]);
  } else if (containsAny(title, ["healthcare assistant", "health care assistant", "hca", "clinical support"])) {
    hints = hints.concat(["healthcare assistant", "health care assistant", "hca", "clinical support worker", "patient support"]);
  } else if (containsAny(title, ["support worker", "supported living"])) {
    hints = hints.concat(["support worker", "supported living", "service user support"]);
  } else if (containsAny(title, ["care worker", "carer", "senior carer", "home care", "domiciliary"])) {
    hints = hints.concat(["care worker", "carer", "senior carer", "home care", "domiciliary care"]);
  } else if (containsAny(title, ["pharmacist", "pharmacy", "dispensing"])) {
    hints = hints.concat(["pharmacist", "pharmacy", "dispensing", "chemist"]);
  } else if (containsAny(title, ["dental", "dentist", "orthodontic"])) {
    hints = hints.concat(["dental", "dentist", "orthodontic"]);
  } else if (containsAny(title, ["doctor", "physician", "clinical fellow", "medical officer", "gp"])) {
    hints = hints.concat(["doctor", "physician", "clinical fellow", "medical officer", "general practitioner"]);
  }
  if (containsAny(haystack, ["developer", "software", "engineer", "it", "tech"])) {
    hints = hints.concat(["developer", "engineer", "software", "it", "technical", "application support"]);
  }
  if (containsAny(haystack, ["admin", "administrator", "coordination", "coordinator", "office"])) {
    hints = hints.concat(["administrator", "administration", "coordinator", "coordination", "office"]);
  }

  return uniqueList(hints);
}

function detectCompany(title, snippet, url, companies) {
  const haystack = (title + " " + snippet + " " + url).toLowerCase();
  const normalizedHaystack = normalizeCompanyName(haystack);
  let best = "";
  let bestScore = 0;
  let i;
  for (i = 0; i < companies.length; i += 1) {
    const company = cleanText(companies[i]);
    const normalizedCompany = normalizeCompanyName(company);
    let score = 0;
    if (!normalizedCompany) {
      continue;
    }
    if (haystack.indexOf(company.toLowerCase()) !== -1) {
      return company;
    }
    if (normalizedHaystack.indexOf(normalizedCompany) !== -1) {
      return company;
    }
    score = companyTokenScore(normalizedHaystack, normalizedCompany);
    if (score > bestScore) {
      bestScore = score;
      best = company;
    }
  }
  if (best && bestScore >= 1) {
    return best;
  }
  if (title.indexOf(" - ") !== -1) {
    return cleanText(title.split(" - ").slice(1).join(" - "));
  }
  if (title.indexOf(" | ") !== -1) {
    return cleanText(title.split(" | ").slice(1).join(" | "));
  }
  return "";
}

function detectSource(url) {
  const lower = cleanText(url).toLowerCase();
  if (lower.indexOf("indeed.") !== -1) { return "Indeed"; }
  if (lower.indexOf("linkedin.com") !== -1) { return "LinkedIn Jobs"; }
  if (lower.indexOf("jobs.nhs.uk") !== -1) { return "NHS Jobs"; }
  if (lower.indexOf("healthjobsuk.com") !== -1) { return "Trac Jobs"; }
  if (lower.indexOf("totaljobs.com") !== -1) { return "Totaljobs"; }
  if (lower.indexOf("reed.co.uk") !== -1) { return "Reed"; }
  if (lower.indexOf("cv-library.co.uk") !== -1) { return "CV-Library"; }
  if (lower.indexOf("workable.com") !== -1) { return "Workable"; }
  if (lower.indexOf("ashbyhq.com") !== -1) { return "Ashby"; }
  if (lower.indexOf("smartrecruiters.com") !== -1) { return "SmartRecruiters"; }
  if (lower.indexOf("greenhouse.io") !== -1) { return "Greenhouse"; }
  return "";
}

function normalizeCompanyName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(limited|ltd|plc|llp|inc|uk)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function companyTokenScore(haystack, company) {
  const words = company.split(" ").filter(Boolean);
  let score = 0;
  let i;
  for (i = 0; i < words.length; i += 1) {
    if (words[i].length > 2 && haystack.indexOf(words[i]) !== -1) {
      score += 1;
    }
  }
  return score;
}

function looksLikeAdvert(url, combined) {
  const lowerUrl = url.toLowerCase();
  if (
    lowerUrl.indexOf("/search") !== -1 ||
    lowerUrl.indexOf("/jobs?q=") !== -1 ||
    lowerUrl.indexOf("?q=") !== -1 ||
    lowerUrl.indexOf("google.") !== -1 ||
    lowerUrl.indexOf("bing.com") !== -1 ||
    lowerUrl.indexOf("/careers/search") !== -1 ||
    lowerUrl.indexOf("/jobs/search") !== -1
  ) {
    return false;
  }
  if (
    lowerUrl.indexOf("/viewjob") !== -1 ||
    lowerUrl.indexOf("/jobs/view/") !== -1 ||
    lowerUrl.indexOf("/candidate/jobadvert/") !== -1 ||
    lowerUrl.indexOf("/job/") !== -1 ||
    lowerUrl.indexOf("/jobs/") !== -1 ||
    lowerUrl.indexOf("/vacancy/") !== -1 ||
    lowerUrl.indexOf("/vacancies/") !== -1 ||
    lowerUrl.indexOf("/apply/") !== -1 ||
    lowerUrl.indexOf("/jobadvert/") !== -1 ||
    lowerUrl.indexOf("/position/") !== -1 ||
    lowerUrl.indexOf("/opening/") !== -1 ||
    lowerUrl.indexOf("/j/") !== -1
  ) {
    return true;
  }
  return false;
}

function parseRssItems(xml) {
  const items = [];
  const matches = String(xml || "").match(/<item>[\s\S]*?<\/item>/gi) || [];
  let i;
  for (i = 0; i < matches.length; i += 1) {
    items.push({
      title: decodeHtml(extractTag(matches[i], "title")),
      url: decodeHtml(extractTag(matches[i], "link")),
      snippet: decodeHtml(stripHtml(extractTag(matches[i], "description")))
    });
  }
  return items;
}

function extractTag(block, tagName) {
  const match = String(block || "").match(new RegExp("<" + tagName + ">([\\s\\S]*?)<\\/" + tagName + ">", "i"));
  return match ? match[1] : "";
}

function stripHtml(text) {
  return String(text || "").replace(/<[^>]+>/g, " ");
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function splitUsefulWords(text) {
  return uniqueList(String(text || "").toLowerCase().split(/[^a-z0-9]+/)).filter(function (word) {
    return word && word.length > 2 && ["with", "from", "that", "this", "your", "role", "jobs", "job", "healthcare", "health", "care"].indexOf(word) === -1;
  });
}

function truncateSnippet(text) {
  const clean = cleanText(text);
  if (clean.length <= 220) {
    return clean;
  }
  return clean.slice(0, 217) + "...";
}

function containsAny(text, list) {
  let i;
  const sample = String(text || "").toLowerCase();
  for (i = 0; i < list.length; i += 1) {
    if (sample.indexOf(String(list[i]).toLowerCase()) !== -1) {
      return true;
    }
  }
  return false;
}

function requestText(url) {
  return new Promise(function (resolve, reject) {
    const request = https.get(url, function (response) {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", function (chunk) { data += chunk; });
      response.on("end", function () { resolve(data); });
    });
    request.setTimeout(5000, function () {
      request.destroy(new Error("Search request timed out."));
    });
    request.on("error", reject);
  });
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

function safeKey(text) {
  return cleanText(text).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
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
    body: JSON.stringify(payload)
  };
}




