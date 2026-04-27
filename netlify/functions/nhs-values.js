const DEFAULT_RESULT = {
  ok: false,
  values: [],
  sourceUrl: "",
  message: "No NHS Trust values found."
};

exports.handler = async function (event) {
  const company = String((event.queryStringParameters && event.queryStringParameters.company) || "").trim();

  if (!company) {
    return json(400, {
      ok: false,
      values: [],
      sourceUrl: "",
      message: "Missing company query parameter."
    });
  }

  if (!isNhsTrustName(company)) {
    return json(200, {
      ok: false,
      values: [],
      sourceUrl: "",
      message: "Company name does not look like an NHS Trust."
    });
  }

  try {
    const searchUrl = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(company + " our values nhs trust");
    const searchHtml = await fetchHtml(searchUrl);
    const candidateUrls = extractNhsValuesUrls(searchHtml);

    for (let i = 0; i < candidateUrls.length; i += 1) {
      const pageHtml = await fetchHtml(candidateUrls[i]);
      const values = extractNhsValuesFromPage(pageHtml);

      if (values.length) {
        return json(200, {
          ok: true,
          values,
          sourceUrl: candidateUrls[i],
          message: "NHS Trust values found."
        });
      }
    }

    return json(200, DEFAULT_RESULT);
  } catch (error) {
    return json(200, {
      ok: false,
      values: [],
      sourceUrl: "",
      message: "Could not fetch NHS Trust values right now."
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

function extractNhsValuesUrls(html) {
  const regex = /href="([^"]+)"/gi;
  const urls = [];
  const seen = {};
  let match;

  while ((match = regex.exec(String(html || ""))) !== null) {
    const decoded = decodeSearchUrl(match[1]);
    if (!decoded || seen[decoded]) {
      continue;
    }
    if (isLikelyNhsValuesUrl(decoded)) {
      seen[decoded] = true;
      urls.push(decoded);
    }
    if (urls.length >= 5) {
      break;
    }
  }

  return urls;
}

function decodeSearchUrl(url) {
  const raw = String(url || "");
  if (!raw) {
    return "";
  }
  if (raw.indexOf("//duckduckgo.com/l/?uddg=") !== -1 || raw.indexOf("duckduckgo.com/l/?uddg=") !== -1) {
    const uddg = raw.match(/[?&]uddg=([^&]+)/i);
    if (uddg && uddg[1]) {
      try {
        return decodeURIComponent(uddg[1]);
      } catch (error) {
        return uddg[1];
      }
    }
  }
  if (raw.indexOf("http://") === 0 || raw.indexOf("https://") === 0) {
    return raw;
  }
  return "";
}

function isNhsTrustName(name) {
  const lower = String(name || "").toLowerCase();
  return lower.indexOf("nhs") !== -1 ||
    lower.indexOf("foundation trust") !== -1 ||
    lower.indexOf("hospital trust") !== -1 ||
    lower.indexOf("healthcare trust") !== -1 ||
    lower.indexOf("university hospitals") !== -1;
}

function isLikelyNhsValuesUrl(url) {
  const lower = String(url || "").toLowerCase();
  if (lower.indexOf("nhs.uk") === -1) {
    return false;
  }
  return lower.indexOf("values") !== -1 ||
    lower.indexOf("trust-values") !== -1 ||
    lower.indexOf("our-values") !== -1 ||
    lower.indexOf("values-and-behaviours") !== -1;
}

function extractNhsValuesFromPage(html) {
  const cleaned = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?(div|section|article|ul|ol|br|p|h1|h2|h3|h4|li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  const blocks = cleaned.split(/\n+/);
  const values = [];
  const seen = {};
  let started = false;

  for (let i = 0; i < blocks.length; i += 1) {
    let line = String(blocks[i] || "").trim();
    const lower = line.toLowerCase();

    if (!line) {
      continue;
    }
    if (!started && (lower === "our values" || lower === "trust values" || lower.indexOf("our values are") !== -1 || lower.indexOf("values and behaviours") !== -1)) {
      started = true;
      continue;
    }
    if (!started) {
      continue;
    }
    if (line.length < 3 || line.length > 80) {
      continue;
    }
    if (lower.indexOf("home") === 0 || lower.indexOf("about us") === 0 || lower.indexOf("read more") === 0 || lower.indexOf("find out more") === 0) {
      continue;
    }
    if (lower.indexOf("we are ") === 0) {
      line = line.replace(/^we are\s+/i, "");
    }
    if (line.indexOf(" - ") !== -1) {
      line = line.split(" - ")[0];
    }
    if (!seen[line]) {
      seen[line] = true;
      values.push(line);
    }
    if (values.length >= 6) {
      break;
    }
  }

  return values;
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600"
    },
    body: JSON.stringify(payload)
  };
}
