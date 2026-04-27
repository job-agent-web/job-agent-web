exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, message: "Method not allowed." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const config = body.config || {};
    const jobTitle = String(body.jobTitle || "").trim();
    const location = String(body.location || "").trim();

    if (!config || !config.searchUrlTemplate || !config.itemPattern || !config.fields) {
      return json(200, { ok: false, message: "Scraper file is missing required fields." });
    }
    if (!jobTitle || !location) {
      return json(200, { ok: false, message: "Both job title and location are required." });
    }

    const url = renderTemplate(config.searchUrlTemplate, { jobTitle, location });
    const html = await fetchHtml(url);
    const jobs = extractJobs(html, config);

    if (!jobs.length) {
      return json(200, { ok: false, message: "No jobs matched the uploaded scraper on that page." });
    }

    return json(200, {
      ok: true,
      sourceUrl: url,
      platform: config.name || "Uploaded scraper",
      jobs
    });
  } catch (error) {
    return json(200, {
      ok: false,
      message: "This search helper is no longer used here."
    });
  }
};

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error("Request failed with status " + response.status);
  }

  return await response.text();
}

function renderTemplate(template, params) {
  return String(template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, function (_, key) {
    const value = params && params[key] !== undefined && params[key] !== null ? String(params[key]) : "";
    return encodeURIComponent(value);
  });
}

function extractJobs(html, config) {
  const jobs = [];
  const itemRegex = new RegExp(config.itemPattern, config.itemFlags || "gi");
  const maxResults = config.maxResults || 10;
  let match;

  while ((match = itemRegex.exec(String(html || ""))) !== null) {
    const item = match[0];
    const job = {
      title: extractRegexValue(item, config.fields.title, config.fieldFlags && config.fieldFlags.title),
      company: extractRegexValue(item, config.fields.company, config.fieldFlags && config.fieldFlags.company),
      location: extractRegexValue(item, config.fields.location, config.fieldFlags && config.fieldFlags.location),
      salary: extractRegexValue(item, config.fields.salary, config.fieldFlags && config.fieldFlags.salary),
      description: extractRegexValue(item, config.fields.description, config.fieldFlags && config.fieldFlags.description)
    };

    if (job.title) {
      jobs.push(job);
    }
    if (jobs.length >= maxResults) {
      break;
    }
    if (match.index === itemRegex.lastIndex) {
      itemRegex.lastIndex += 1;
    }
  }

  return jobs;
}

function extractRegexValue(source, pattern, flags) {
  try {
    const regex = new RegExp(pattern, flags || "i");
    const match = regex.exec(String(source || ""));
    if (!match) {
      return "";
    }
    return stripHtml(match[1] || match[0] || "");
  } catch (error) {
    return "";
  }
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}
