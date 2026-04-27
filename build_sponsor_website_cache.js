const fs = require("fs");
const https = require("https");
const path = require("path");
const vm = require("vm");

const root = __dirname;
const webRoot = path.join(root, "job-agent-web");
const sponsorsPath = path.join(root, "uk_sponsors.js");
const cachePath = path.join(root, "sponsor_websites.json");
const browserCachePath = path.join(root, "sponsor_websites.js");
const webCachePath = path.join(webRoot, "sponsor_websites.json");
const webBrowserCachePath = path.join(webRoot, "sponsor_websites.js");
const limit = Number(readArg("--limit", "50")) || 50;
const offset = Number(readArg("--offset", "0")) || 0;

main().catch(function (error) {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const sponsors = readSponsors();
  const cache = readCache();
  const websites = cache.websites || {};
  const companies = uniqueCompanies(sponsors).filter(function (company) {
    return !lookupCachedSponsorWebsite(websites, company);
  }).slice(offset, offset + limit);
  let found = 0;
  let i;
  let website;
  let key;

  for (i = 0; i < companies.length; i += 1) {
    website = await findOfficialWebsite(companies[i]);
    if (!website) {
      console.log("missing:", companies[i]);
      continue;
    }
    key = normalizeSponsorWebsiteKey(companies[i]);
    websites[key] = {
      company: companies[i],
      website,
      careersUrl: website,
      verified: true,
      source: "automated-search",
      checkedAt: new Date().toISOString().slice(0, 10)
    };
    found += 1;
    console.log("found:", companies[i], "=>", website);
  }

  cache._meta = cache._meta || {};
  cache._meta.generated_at = new Date().toISOString().slice(0, 10);
  cache._meta.count = Object.keys(websites).length;
  cache.websites = sortObject(websites);

  writeCache(cache);
  console.log("Sponsor website cache updated:", cache._meta.count, "entries,", found, "new in this run.");
}

function readSponsors() {
  const code = fs.readFileSync(sponsorsPath, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: sponsorsPath, timeout: 10000 });
  return sandbox.window.UK_SPONSOR_RECORDS || [];
}

function readCache() {
  if (!fs.existsSync(cachePath)) {
    return { _meta: {}, websites: {} };
  }
  return JSON.parse(fs.readFileSync(cachePath, "utf8"));
}

function writeCache(cache) {
  const json = JSON.stringify(cache, null, 2) + "\n";
  const js = "window.SPONSOR_WEBSITE_CACHE = " + json.replace(/;\s*$/, "") + ";\n";
  fs.writeFileSync(cachePath, json, "utf8");
  fs.writeFileSync(browserCachePath, js, "utf8");
  if (fs.existsSync(webRoot)) {
    fs.writeFileSync(webCachePath, json, "utf8");
    fs.writeFileSync(webBrowserCachePath, js, "utf8");
  }
}

function uniqueCompanies(records) {
  const seen = {};
  const values = [];
  let i;
  let company;
  for (i = 0; i < records.length; i += 1) {
    company = cleanText(records[i].Organisation || records[i].organisation || records[i].company || "");
    if (!company || seen[company.toLowerCase()]) {
      continue;
    }
    seen[company.toLowerCase()] = true;
    values.push(company);
  }
  return values.sort(function (a, b) { return a.localeCompare(b); });
}

async function findOfficialWebsite(company) {
  const queries = [
    '"' + company + '" official website UK',
    '"' + company + '" careers official website',
    '"' + company + '" jobs careers'
  ];
  const seen = {};
  let i;
  let urls;
  let j;
  let candidate;

  for (i = 0; i < queries.length; i += 1) {
    urls = await collectSearchResults([
      search("https://www.google.com/search?num=10&hl=en&q=" + encodeURIComponent(queries[i])),
      search("https://www.bing.com/search?q=" + encodeURIComponent(queries[i])),
      search("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(queries[i]))
    ]);
    for (j = 0; j < urls.length; j += 1) {
      candidate = normalizeHomepage(urls[j]);
      if (!candidate || seen[candidate]) {
        continue;
      }
      seen[candidate] = true;
      if (isLikelyOfficialCompanyWebsite(candidate, company)) {
        return candidate;
      }
    }
  }
  return "";
}

async function collectSearchResults(searches) {
  const settled = await Promise.all(searches.map(function (item) {
    return item.catch(function () { return []; });
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

async function search(url) {
  const html = await requestText(url);
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
    if (decoded && !seen[decoded]) {
      seen[decoded] = true;
      urls.push(decoded);
    }
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
    return safeDecode(uddg[1]);
  }
  if (google && google[1]) {
    return safeDecode(google[1]);
  }
  if (bing && bing[1]) {
    return decodeBingUrl(bing[1]);
  }
  return /^https?:\/\//i.test(raw) ? raw : "";
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
  return parsed.toString();
}

function isLikelyOfficialCompanyWebsite(url, company) {
  let host;
  const tokens = normalizeCompanyTokens(company);
  let score = 0;
  let i;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch (error) {
    return false;
  }
  if (isBlockedHost(host) || !tokens.length) {
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

function normalizeCompanyTokens(company) {
  const stop = {
    limited: 1, ltd: 1, plc: 1, llp: 1, uk: 1, company: 1,
    services: 1, service: 1, group: 1, holdings: 1, the: 1, and: 1, of: 1
  };
  return normalizeSponsorWebsiteKey(company).split(/\s+/).filter(function (token) {
    return token && token.length > 2 && !stop[token];
  }).slice(0, 5);
}

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

function lookupCachedSponsorWebsite(websites, company) {
  const key = normalizeSponsorWebsiteKey(company);
  let name;
  let entry;
  let entryKey;
  if (websites[key]) {
    return websites[key];
  }
  for (name in websites) {
    if (!Object.prototype.hasOwnProperty.call(websites, name)) {
      continue;
    }
    entryKey = normalizeSponsorWebsiteKey(name);
    if (entryKey && (key === entryKey || key.indexOf(entryKey) !== -1 || entryKey.indexOf(key) !== -1)) {
      entry = websites[name];
      return entry;
    }
  }
  return null;
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
    /(^|\.)gov\.uk$/.test(host);
}

function requestText(url) {
  return new Promise(function (resolve, reject) {
    const request = https.get(url, {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-GB,en;q=0.9",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
      }
    }, function (response) {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", function (chunk) { data += chunk; });
      response.on("end", function () { resolve(data); });
    });
    request.setTimeout(6000, function () {
      request.destroy(new Error("Search timed out."));
    });
    request.on("error", reject);
  });
}

function decodeBingUrl(value) {
  let raw = safeDecode(value);
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

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch (error) {
    return String(value || "");
  }
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

function sortObject(input) {
  const output = {};
  Object.keys(input).sort().forEach(function (key) {
    output[key] = input[key];
  });
  return output;
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
}
