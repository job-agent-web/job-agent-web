"use strict";

function cleanText(value) {
  return String(value || "").trim();
}

function normalizePreviousOutputs(input, limit) {
  const max = typeof limit === "number" && limit > 0 ? limit : 6;
  let list = [];

  if (Array.isArray(input)) {
    list = input;
  } else if (typeof input === "string" && input.trim()) {
    list = input.split(/\n{2,}/);
  }

  return list
    .map(function (item) { return cleanText(item); })
    .filter(Boolean)
    .slice(0, max);
}

function buildAvoidanceBlock(previousOutputs, heading) {
  const items = normalizePreviousOutputs(previousOutputs);
  const label = cleanText(heading) || "Previous outputs to avoid repeating";
  if (!items.length) {
    return "";
  }
  return [
    label + ":",
    items.map(function (item, index) {
      return "Previous output " + (index + 1) + ":\n" + item.slice(0, 1200);
    }).join("\n\n"),
    "Do not repeat the structure, phrasing, examples, questions, or sequencing from those previous outputs.",
    "Make this response feel fresh, clearly different, and non-repetitive."
  ].join("\n");
}

function buildHistorySet(previousOutputs) {
  const items = normalizePreviousOutputs(previousOutputs, 12);
  const seen = {};
  let i;
  let parts;
  let j;
  let key;

  for (i = 0; i < items.length; i += 1) {
    parts = String(items[i] || "").split(/\r?\n/);
    for (j = 0; j < parts.length; j += 1) {
      key = cleanText(parts[j]).toLowerCase();
      if (key) {
        seen[key] = true;
      }
    }
  }

  return seen;
}

module.exports = {
  normalizePreviousOutputs,
  buildAvoidanceBlock,
  buildHistorySet
};
