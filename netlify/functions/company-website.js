const https = require("https");

let sponsorWebsiteCache = { websites: {} };
try {
  sponsorWebsiteCache = require("../../sponsor_websites.json");
} catch (error) {
  sponsorWebsiteCache = { websites: {} };
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return json(204, "");
  }
  if (event.httpMethod !== "GET") {
    return json(405, { ok: false, website: "", message: "Method not allowed." });
  }

  const company = cleanText(event.queryStringParameters && event.queryStringParameters.company);
  if (!company) {
    return json(200, { ok: false, website: "", message: "Missing company name." });
  }

  try {
    const cachedWebsite = lookupCachedSponsorWebsite(company);
    if (cachedWebsite) {
      return json(200, {
        ok: true,
        company,
        website: cachedWebsite,
        source: "sponsor-websites-cache",
        message: "Official company website found in sponsor cache."
      });
    }

    const website = await findOfficialWebsite(company);
    if (website) {
      return json(200, { ok: true, company, website, message: "Official company website found." });
    }
    return json(200, { ok: false, company, website: "", message: "No exact company website found yet." });
  } catch (error) {
    return json(200, { ok: false, company, website: "", message: "Could not search for the company website right now." });
  }
};

function normalizeSponsorWebsiteKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\b(t\/a|trading as|ta)\b[\s\S]*$/i, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(ltd|limited|plc|llp|inc|uk|company|group|holdings|services|service)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lookupCachedSponsorWebsite(company) {
  const websites = sponsorWebsiteCache.websites || sponsorWebsiteCache || {};
  const key = normalizeSponsorWebsiteKey(company);
  const keys = [key, String(company || "").toLowerCase(), String(company || "").trim()];
  let entry = null;
  let entryKey;
  let name;
  let i;

  if (!key || !websites) {
    return "";
  }

  for (i = 0; i < keys.length; i += 1) {
    if (websites[keys[i]]) {
      entry = websites[keys[i]];
      break;
    }
  }

  if (!entry) {
    for (name in websites) {
      if (!Object.prototype.hasOwnProperty.call(websites, name)) {
        continue;
      }
      entryKey = normalizeSponsorWebsiteKey(name);
      if (entryKey && (key === entryKey || key.indexOf(entryKey) !== -1 || entryKey.indexOf(key) !== -1)) {
        entry = websites[name];
        break;
      }
    }
  }

  if (!entry) {
    return "";
  }
  if (typeof entry === "string") {
    return cleanText(entry);
  }
  return cleanText(entry.careersUrl || entry.website || entry.url || "");
}

async function findOfficialWebsite(company) {
  const queries = [
    '"' + company + '"',
    '"' + company + '" official website UK',
    '"' + company + '" careers official website',
    '"' + company + '" company website',
    '"' + company + '" contact'
  ];
  const seen = {};
  let i;
  let urls;
  let j;
  let candidate;
  let searches;

  for (i = 0; i < queries.length; i += 1) {
    searches = [
      searchGoogle(queries[i])
    ];
    urls = await collectSearchResults(searches);
    for (j = 0; j < urls.length; j += 1) {
      candidate = normalizeHomepage(urls[j]);
      if (!candidate || seen[candidate]) {
        continue;
      }
      seen[candidate] = true;
      if (await isVerifiedOfficialCompanyWebsite(candidate, company)) {
        return candidate;
      }
    }
  }
  return "";
}

async function collectSearchResults(searches) {
  const settled = await Promise.all(searches.map(function (search) {
    return search.catch(function () { return []; });
  }));
  const seen = {};
  const urls = [];
  let i;
  let j;
  let value;
  for (i = 0; i < settled.length; i += 1) {
    for (j = 0; j < settled[i].length; j += 1) {
      value = settled[i][j];
      if (value && !seen[value]) {
        seen[value] = true;
        urls.push(value);
      }
    }
  }
  return urls;
}

async function searchGoogle(query) {
  const html = await requestText("https://www.google.com/search?num=10&hl=en&q=" + encodeURIComponent(query));
  return extractLinks(html);
}

async function searchBing(query) {
  const html = await requestText("https://www.bing.com/search?q=" + encodeURIComponent(query));
  return extractLinks(html);
}

async function searchDuckDuckGo(query) {
  const html = await requestText("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query));
  return extractLinks(html);
}

function extractLinks(html) {
  const urls = [];
  const seen = {};
  const regex = /href="([^"]+)"/gi;
  let match;
  let decoded;

  while ((match = regex.exec(String(html || ""))) !== null) {
    decoded = decodeSearchUrl(match[1]);
    if (!decoded || seen[decoded]) {
      continue;
    }
    seen[decoded] = true;
    urls.push(decoded);
    if (urls.length >= 20) {
      break;
    }
  }
  return urls;
}

function decodeSearchUrl(url) {
  const raw = decodeHtml(String(url || "").replace(/&amp;/g, "&"));
  const uddg = raw.match(/[?&]uddg=([^&]+)/i);
  const google = raw.match(/\/url\?q=([^&]+)/i) || raw.match(/[?&]q=(https?%3A%2F%2F[^&]+)/i);
  const bing = raw.match(/[?&]u=([^&]+)/i);
  if (uddg && uddg[1]) {
    try {
      return decodeURIComponent(uddg[1]);
    } catch (error) {
      return uddg[1];
    }
  }
  if (google && google[1]) {
    try {
      return decodeURIComponent(google[1]);
    } catch (error) {
      return google[1];
    }
  }
  if (bing && bing[1]) {
    try {
      return decodeBingUrl(bing[1]);
    } catch (error) {
      return "";
    }
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  return "";
}

function normalizeHomepage(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch (error) {
    return "";
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    return "";
  }
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = "/";
  return parsed.toString().replace(/\/$/, "/");
}

async function isVerifiedOfficialCompanyWebsite(url, company) {
  if (!isLikelyOfficialCompanyWebsite(url, company)) {
    return false;
  }
  return true;
}

function isLikelyOfficialCompanyWebsite(url, company) {
  return hostMatchesCompany(url, company);
}

function hostMatchesCompany(url, company) {
  let host;
  let tokens;
  let score = 0;
  let i;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch (error) {
    return false;
  }

  if (isBlockedHost(host)) {
    return false;
  }

  tokens = normalizeCompanyTokens(company);
  if (!tokens.length) {
    return false;
  }
  if (tokens.length === 1) {
    return host.indexOf(tokens[0]) !== -1;
  }

  for (i = 0; i < tokens.length; i += 1) {
    if (host.indexOf(tokens[i]) !== -1) {
      score += tokens[i].length >= 5 ? 2 : 1;
    }
  }

  return score >= Math.min(3, tokens.length + 1);
}

function pageMentionsCompany(html, company) {
  const text = decodeHtml(String(html || "").toLowerCase().replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  const tokens = normalizeCompanyTokens(company);
  let hits = 0;
  let i;
  for (i = 0; i < tokens.length; i += 1) {
    if (text.indexOf(tokens[i]) !== -1) {
      hits += 1;
    }
  }
  return hits >= Math.min(2, tokens.length);
}

function normalizeCompanyTokens(company) {
  const stop = {
    limited: 1, ltd: 1, plc: 1, llp: 1, uk: 1, company: 1,
    services: 1, service: 1, group: 1, holdings: 1, the: 1, and: 1, of: 1
  };
  return String(company || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(function (token) {
      return token && token.length > 2 && !stop[token];
    })
    .slice(0, 5);
}

function isBlockedHost(host) {
  return /(^|\.)google\./.test(host) ||
    /(^|\.)bing\.com$/.test(host) ||
    /(^|\.)duckduckgo\.com$/.test(host) ||
    /(^|\.)linkedin\.com$/.test(host) ||
    /(^|\.)indeed\./.test(host) ||
    /(^|\.)glassdoor\./.test(host) ||
    /(^|\.)reed\.co\.uk$/.test(host) ||
    /(^|\.)totaljobs\.com$/.test(host) ||
    /(^|\.)cv-library\.co\.uk$/.test(host) ||
    /(^|\.)facebook\.com$/.test(host) ||
    /(^|\.)instagram\.com$/.test(host) ||
    /(^|\.)x\.com$/.test(host) ||
    /(^|\.)twitter\.com$/.test(host) ||
    /(^|\.)youtube\.com$/.test(host) ||
    /(^|\.)wikipedia\.org$/.test(host) ||
    /(^|\.)gov\.uk$/.test(host) ||
    /(^|\.)company-information\.service\.gov\.uk$/.test(host);
}

function requestText(url) {
  return new Promise(function (resolve, reject) {
    const request = https.get(url, {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-GB,en;q=0.9",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
      }
    }, function (response) {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", function (chunk) { data += chunk; });
      response.on("end", function () { resolve(data); });
    });
    request.setTimeout(5000, function () {
      request.destroy(new Error("Company website search timed out."));
    });
    request.on("error", reject);
  });
}

function decodeBingUrl(value) {
  let raw = decodeURIComponent(String(value || ""));
  if (/^a1/i.test(raw)) {
    raw = raw.slice(2);
    try {
      return Buffer.from(raw, "base64").toString("utf8");
    } catch (error) {
      return "";
    }
  }
  return /^https?:\/\//i.test(raw) ? raw : "";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(value) {
  return String(value || "").trim();
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type"
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload)
  };
}
