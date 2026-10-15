var adminSecretKey = "jobMatchAgentAdminSecret";
var adminFixedPasskey = ["job", "agent"].join("-");
document.addEventListener("DOMContentLoaded", function () {
  var button = document.getElementById("checkAiConnectionsBtn"), status = document.getElementById("aiConnectionsStatus");
  if (!button || !status) return;
  button.addEventListener("click", async function () {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = "Checking each provider. This can take up to two minutes.";
    try {
      var response = await fetch(adminFunctionUrl("/.netlify/functions/ai-diagnostics"), {
        method: "POST", headers: {"content-type":"application/json", "x-admin-secret":getValidatedAdminSecret()}, body: "{}"
      });
      var data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "AI connection checks could not be completed.");
      var names = {gemini:"Gemini",deepseek:"DeepSeek",gptoss:"GPT-OSS",cloudflare:"Cloudflare",huggingface:"Hugging Face"};
      var reasons = {"credits-exhausted":"Add credits in the provider account", "rate-limit-or-quota":"Provider quota or rate limit reached", "credentials-or-permissions":"Check the provider key and permissions", "model-or-endpoint-not-found":"Check the configured model", "timeout":"Provider timed out", "provider-unavailable":"Provider is temporarily unavailable", "invalid-request":"Check the provider configuration"};
      status.replaceChildren();
      var list = document.createElement("ul");
      Object.keys(data.checks || {}).forEach(function (provider) {
        var check = data.checks[provider], item = document.createElement("li");
        var message = !check.configured ? "Not configured" : check.usable ? "Connected and responding" : reasons[check.category] || "Connection failed; check provider settings";
        if (check.providerCode === "CF_ACCOUNT_ID_INVALID") message = "Set a valid Cloudflare account ID";
        item.textContent = (names[provider] || provider) + ": " + message;
        list.append(item);
      });
      status.append(list);
    } catch (error) { status.textContent = error.message || "AI connection checks could not be completed."; }
    finally { button.disabled = false; }
  });
});
var generatorConfigKey = "jobMatchAgentGeneratorConfig";
var openAiKeyStorageKey = "jobMatchAgentOpenAiKey";
var openAiModelStorageKey = "jobMatchAgentOpenAiModel";
var aiModelUsageStorageKey = "jobMatchAgentAiModelUsage";
var defaultOpenAiModel = "gemini-2.5-flash-lite";
var defaultGeneratorConfig = {
  coverLetterSample1: "",
  coverLetterSample2: "",
  coverLetterSample3: ""
};
var adminAccessForm = document.getElementById("adminAccessForm");
var adminAccessCard = document.getElementById("adminAccessCard");
var adminSecretInput = document.getElementById("adminSecret");
var adminStatus = document.getElementById("adminStatus");
var adminPanel = document.getElementById("adminPanel");
var adminToolsPanel = document.getElementById("adminToolsPanel");
var adminAiSettingsPanel = document.getElementById("adminAiSettingsPanel");
var adminGeneratorPanel = document.getElementById("adminGeneratorPanel");
var adminAiModelPanel = document.getElementById("adminAiModelPanel");
var adminAiModelTableBody = document.getElementById("adminAiModelTableBody");
var adminSummary = document.getElementById("adminSummary");
var adminTableBody = document.getElementById("adminTableBody");
var adminSearchInput = document.getElementById("adminSearchInput");
var jumpAdminGeneratorBtn = document.getElementById("jumpAdminGeneratorBtn");
var adminGeneratorToggleBtn = document.getElementById("adminGeneratorToggleBtn");
var adminGeneratorPanelBody = document.getElementById("adminGeneratorPanelBody");
var adminGeneratorToggleIcon = document.getElementById("adminGeneratorToggleIcon");
var exportAdminBtn = document.getElementById("exportAdminBtn");
var refreshAdminBtn = document.getElementById("refreshAdminBtn");
var signOutAdminBtn = document.getElementById("signOutAdminBtn");
var adminNewUserName = document.getElementById("adminNewUserName");
var adminNewUserEmail = document.getElementById("adminNewUserEmail");
var adminNewUserPassword = document.getElementById("adminNewUserPassword");
var adminNewUserRole = document.getElementById("adminNewUserRole");
var hostedAiApiKeyInfo = document.getElementById("hostedAiApiKeyInfo");
var hostedAiModel = document.getElementById("hostedAiModel");
var saveHostedAiSettingsBtn = document.getElementById("saveHostedAiSettingsBtn");
var hostedAiSettingsStatus = document.getElementById("hostedAiSettingsStatus");
var adminGeneratorSample1 = document.getElementById("adminGeneratorSample1");
var adminGeneratorSample2 = document.getElementById("adminGeneratorSample2");
var adminGeneratorSample3 = document.getElementById("adminGeneratorSample3");
var adminGeneratorSample1ToggleBtn = document.getElementById("adminGeneratorSample1ToggleBtn");
var adminGeneratorSample2ToggleBtn = document.getElementById("adminGeneratorSample2ToggleBtn");
var adminGeneratorSample3ToggleBtn = document.getElementById("adminGeneratorSample3ToggleBtn");
var adminGeneratorSample1Body = document.getElementById("adminGeneratorSample1Body");
var adminGeneratorSample2Body = document.getElementById("adminGeneratorSample2Body");
var adminGeneratorSample3Body = document.getElementById("adminGeneratorSample3Body");
var adminGeneratorSample1ToggleIcon = document.getElementById("adminGeneratorSample1ToggleIcon");
var adminGeneratorSample2ToggleIcon = document.getElementById("adminGeneratorSample2ToggleIcon");
var adminGeneratorSample3ToggleIcon = document.getElementById("adminGeneratorSample3ToggleIcon");
var saveAdminGeneratorConfigBtn = document.getElementById("saveAdminGeneratorConfigBtn");
var resetAdminGeneratorConfigBtn = document.getElementById("resetAdminGeneratorConfigBtn");
var adminGeneratorConfigStatus = document.getElementById("adminGeneratorConfigStatus");
var addAdminUserBtn = document.getElementById("addAdminUserBtn");
var resetAllAdminUsageBtn = document.getElementById("resetAllAdminUsageBtn");
var setAllAdminFreeBtn = document.getElementById("setAllAdminFreeBtn");
var setAllAdminPremiumBtn = document.getElementById("setAllAdminPremiumBtn");
var adminUsersCache = [];
var adminDayAdjustmentsPending = {};
var planBroadcastKey = "jobMatchAgentHostedPlanBroadcast";
var planMirrorKey = "jobMatchAgentHostedPlanMirror";
var paneOverrideMirrorKey = "jobMatchAgentPaneOverrideMirror";
var hostedAdminApiBase = "https://jobmatchagent.vercel.app";

if (adminAccessForm) {
  adminAccessForm.onsubmit = function (event) {
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    saveSecretAndLoad();
    return false;
  };
}
if (refreshAdminBtn) {
  refreshAdminBtn.onclick = function () {
    loadAdminUsers();
    return false;
  };
}
if (exportAdminBtn) {
  exportAdminBtn.onclick = function () {
    downloadAdminExcel();
    return false;
  };
}
if (signOutAdminBtn) {
  signOutAdminBtn.onclick = function () {
    clearSecret();
    return false;
  };
}
if (addAdminUserBtn) {
  addAdminUserBtn.onclick = function () {
    createHostedUser();
    return false;
  };
}
if (resetAllAdminUsageBtn) {
  resetAllAdminUsageBtn.onclick = function () {
    runAdminAction("resetAllUsage", {});
    return false;
  };
}
if (setAllAdminFreeBtn) {
  setAllAdminFreeBtn.onclick = function () {
    runAdminAction("setAllPlans", { isPaid: false });
    return false;
  };
}
if (setAllAdminPremiumBtn) {
  setAllAdminPremiumBtn.onclick = function () {
    runAdminAction("setAllPlans", { isPaid: true });
    return false;
  };
}
if (adminSearchInput) {
  adminSearchInput.oninput = function () {
    applyAdminSearch();
  };
}
if (jumpAdminGeneratorBtn) {
  jumpAdminGeneratorBtn.onclick = function () {
    jumpToAdminGeneratorPanel();
    return false;
  };
}
if (saveHostedAiSettingsBtn) {
  saveHostedAiSettingsBtn.onclick = function () {
    saveHostedAiSettings();
    return false;
  };
}
if (adminGeneratorToggleBtn) {
  adminGeneratorToggleBtn.onclick = function () {
    toggleAdminGeneratorPanel();
    return false;
  };
}
if (saveAdminGeneratorConfigBtn) {
  saveAdminGeneratorConfigBtn.onclick = function () {
    saveAdminGeneratorConfig();
    return false;
  };
}
if (resetAdminGeneratorConfigBtn) {
  resetAdminGeneratorConfigBtn.onclick = function () {
    resetAdminGeneratorConfig();
    return false;
  };
}
if (adminGeneratorSample1ToggleBtn) {
  adminGeneratorSample1ToggleBtn.onclick = function () {
    toggleGeneratorSamplePanel(adminGeneratorSample1ToggleBtn, adminGeneratorSample1Body, adminGeneratorSample1ToggleIcon);
    return false;
  };
}
if (adminGeneratorSample2ToggleBtn) {
  adminGeneratorSample2ToggleBtn.onclick = function () {
    toggleGeneratorSamplePanel(adminGeneratorSample2ToggleBtn, adminGeneratorSample2Body, adminGeneratorSample2ToggleIcon);
    return false;
  };
}
if (adminGeneratorSample3ToggleBtn) {
  adminGeneratorSample3ToggleBtn.onclick = function () {
    toggleGeneratorSamplePanel(adminGeneratorSample3ToggleBtn, adminGeneratorSample3Body, adminGeneratorSample3ToggleIcon);
    return false;
  };
}

restoreSecretAndMaybeLoad();
populateHostedAiSettings();
populateAdminGeneratorControls();
renderAdminAiModelIndicator();
if (window.addEventListener) {
  window.addEventListener("storage", function (event) {
    if (!event || event.key === aiModelUsageStorageKey) {
      renderAdminAiModelIndicator();
    }
  });
  window.addEventListener("jobmatch-ai-model-usage-updated", renderAdminAiModelIndicator);
}
window.setInterval(renderAdminAiModelIndicator, 15000);

function trim(value) {
  return String(value || "").replace(/^\s+|\s+$/g, "");
}
function low(value) {
  return trim(value).toLowerCase();
}
function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function setStatus(tone, text) {
  if (!adminStatus) {
    return;
  }
  adminStatus.className = "auth-status " + tone;
  adminStatus.innerHTML = esc(text);
}
function serviceErrorMessage(text, fallback) {
  var clean = trim(text);
  if (/<!doctype html/i.test(clean) || /<html[\s>]/i.test(clean) || /page not found/i.test(clean)) {
    return "Netlify Functions are not deployed on this site yet. Upload the netlify/functions folder to GitHub and redeploy.";
  }
  return clean || fallback;
}
function adminFunctionUrl(path) {
  var clean = String(path || "");
  if (/^https?:\/\//i.test(clean)) {
    return clean;
  }
  if (window.location && window.location.protocol === "file:") {
    return hostedAdminApiBase + clean;
  }
  return clean;
}
function adminNetworkErrorMessage(error, fallback) {
  var message = trim(error && error.message || "");
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "The admin page could not reach the hosted admin service at " + hostedAdminApiBase + ". Refresh the page, check your internet connection, or use the live admin page.";
  }
  return message || fallback;
}
function setAdminAccessVisible(show) {
  if (adminAccessCard) {
    adminAccessCard.hidden = !show;
    adminAccessCard.style.display = show ? "" : "none";
    adminAccessCard.className = show ? "auth-card" : "auth-card admin-auto-entry";
  }
  if (adminAccessForm) {
    adminAccessForm.hidden = !show;
    adminAccessForm.style.display = show ? "grid" : "none";
  }
  if (adminSecretInput) {
    adminSecretInput.disabled = !show;
  }
  if (adminStatus && !show) {
    adminStatus.innerHTML = "";
  }
}
function broadcastHostedPlanUpdate(data) {
  var mirror = {};
  var paneMirror = {};
  var email = "";
  var authUsersKey = "jobMatchAgentHostedUsers";
  var authSessionKey = "jobMatchAgentHostedSession";
  var usageKey = "jobMatchAgentHostedUsage";
  var users = [];
  var usage = {};
  var session = null;
  var i;
  var planType = "";
  var subscriptionStartedAt = "";
  var paid = false;
  var role = "";
  var lockedPanes = [];
  var unlockedPanes = [];
  if (!data || !data.email) {
    return;
  }
  email = String(data.email || "").trim().toLowerCase();
  planType = String(data.planType || data.plan_type || "").trim();
  subscriptionStartedAt = String(data.subscriptionStartedAt || data.subscription_started_at || "").trim();
  paid = !!data.paid;
  role = String(data.role || "").trim();
  lockedPanes = Array.isArray(data.lockedPanes) ? data.lockedPanes.slice(0) : [];
  unlockedPanes = Array.isArray(data.unlockedPanes) ? data.unlockedPanes.slice(0) : [];
  try {
    if (window.localStorage) {
      window.localStorage.setItem(planBroadcastKey, JSON.stringify({
        email: email,
        planType: planType,
        subscriptionStartedAt: subscriptionStartedAt,
        paid: paid,
        role: role,
        lockedPanes: lockedPanes,
        unlockedPanes: unlockedPanes,
        updatedAt: (new Date()).toISOString()
      }));
      mirror = JSON.parse(window.localStorage.getItem(planMirrorKey) || "{}");
      if (!mirror || typeof mirror !== "object") {
        mirror = {};
      }
      mirror[email] = {
        email: email,
        planType: planType,
        subscriptionStartedAt: subscriptionStartedAt,
        paid: paid,
        role: role,
        lockedPanes: lockedPanes,
        unlockedPanes: unlockedPanes,
        updatedAt: (new Date()).toISOString()
      };
      paneMirror[email] = {
        email: email,
        lockedPanes: lockedPanes.slice(0),
        unlockedPanes: unlockedPanes.slice(0),
        updatedAt: (new Date()).toISOString()
      };
      window.localStorage.setItem(planMirrorKey, JSON.stringify(mirror));
      window.localStorage.setItem(paneOverrideMirrorKey, JSON.stringify(paneMirror));
      users = JSON.parse(window.localStorage.getItem(authUsersKey) || "[]");
      if (!Array.isArray(users)) {
        users = [];
      }
      for (i = 0; i < users.length; i += 1) {
        if (String(users[i] && users[i].email || "").trim().toLowerCase() === email) {
          users[i].planType = planType;
          users[i].plan_type = planType;
          users[i].subscriptionStartedAt = subscriptionStartedAt;
          users[i].subscription_started_at = subscriptionStartedAt;
          users[i].lockedPanes = lockedPanes.slice(0);
          users[i].locked_panes = lockedPanes.slice(0);
          users[i].unlockedPanes = unlockedPanes.slice(0);
          users[i].unlocked_panes = unlockedPanes.slice(0);
          if (role) {
            users[i].role = role;
          }
          break;
        }
      }
      window.localStorage.setItem(authUsersKey, JSON.stringify(users));
      usage = JSON.parse(window.localStorage.getItem(usageKey) || "{}");
      if (!usage || typeof usage !== "object") {
        usage = {};
      }
      if (!usage[email] || typeof usage[email] !== "object") {
        usage[email] = {};
      }
      usage[email].planType = planType;
      usage[email].plan_type = planType;
      usage[email].subscriptionStartedAt = subscriptionStartedAt;
      usage[email].subscription_started_at = subscriptionStartedAt;
      usage[email].paid = paid;
      usage[email].lockedPanes = lockedPanes.slice(0);
      usage[email].locked_panes = lockedPanes.slice(0);
      usage[email].unlockedPanes = unlockedPanes.slice(0);
      usage[email].unlocked_panes = unlockedPanes.slice(0);
      if (role) {
        usage[email].user_role = role;
      }
      window.localStorage.setItem(usageKey, JSON.stringify(usage));
      session = JSON.parse(window.localStorage.getItem(authSessionKey) || "null");
      if (session && String(session.email || "").trim().toLowerCase() === email) {
        session.planType = planType;
        session.plan_type = planType;
        session.subscriptionStartedAt = subscriptionStartedAt;
        session.subscription_started_at = subscriptionStartedAt;
        session.lockedPanes = lockedPanes.slice(0);
        session.locked_panes = lockedPanes.slice(0);
        session.unlockedPanes = unlockedPanes.slice(0);
        session.unlocked_panes = unlockedPanes.slice(0);
        if (role) {
          session.role = role;
        }
        window.localStorage.setItem(authSessionKey, JSON.stringify(session));
      }
    }
  } catch (error) {}
}
function setHostedAiSettingsStatus(tone, text) {
  if (!hostedAiSettingsStatus) {
    return;
  }
  hostedAiSettingsStatus.className = "auth-status " + tone;
  hostedAiSettingsStatus.innerHTML = esc(text);
}
function populateHostedAiSettings() {
  var model = defaultOpenAiModel;
  try {
    model = window.localStorage ? trim(window.localStorage.getItem(openAiModelStorageKey) || defaultOpenAiModel) || defaultOpenAiModel : defaultOpenAiModel;
  } catch (error) {
    model = defaultOpenAiModel;
  }
  if (hostedAiApiKeyInfo) {
    try {
      hostedAiApiKeyInfo.value = window.localStorage ? trim(window.localStorage.getItem(openAiKeyStorageKey) || "") : "";
    } catch (error2) {
      hostedAiApiKeyInfo.value = "";
    }
  }
  if (hostedAiModel) {
    hostedAiModel.value = model;
  }
  setHostedAiSettingsStatus("neutral", "Use Netlify GEMINI_API_KEY for all users. Optional browser fallback key is saved only on this device.");
}
function saveHostedAiSettings() {
  var apiKey = trim(hostedAiApiKeyInfo && hostedAiApiKeyInfo.value);
  var model = trim(hostedAiModel && hostedAiModel.value) || defaultOpenAiModel;
  try {
    if (window.localStorage) {
      if (apiKey) {
        window.localStorage.setItem(openAiKeyStorageKey, apiKey);
      } else {
        window.localStorage.removeItem(openAiKeyStorageKey);
      }
      window.localStorage.setItem(openAiModelStorageKey, model);
    }
  } catch (error) {
    setHostedAiSettingsStatus("bad", "The preferred hosted AI model could not be saved in this browser.");
    return;
  }
  if (hostedAiModel) {
    hostedAiModel.value = model;
  }
  setHostedAiSettingsStatus("good", apiKey ? "Hosted AI model and browser fallback Gemini key saved on this device." : "Hosted AI model saved. Add GEMINI_API_KEY in Netlify for all users.");
}
function renderAdminAiModelIndicator() {
  var geminiModel = defaultOpenAiModel || "gemini-2.5-flash-lite";
  var failover = "Gemini (" + geminiModel + ") -> DeepSeek (deepseek-v4-pro) -> GPT-OSS (openai/gpt-oss-120b:fastest) -> Cloudflare (@cf/meta/llama-3.1-8b-instruct) -> Hugging Face (meta-llama/Llama-3.1-8B-Instruct)";
  var usage = loadAiModelUsage();
  var rows = [
    ["cv-builder", "1. Generate CV", failover, "Generated CV tries all AI providers for 3 cycles before built-in fallback. The indicator shows the latest provider the CV pane actually used."],
    ["cover-letter", "2. Generate Cover Letter", failover, "Cover letter tries all AI providers for 3 cycles before built-in fallback. The indicator shows the latest provider the cover-letter pane actually used."],
    ["sponsor-search", "3. Search for Companies with Skilled Worker Licence", "Sponsor database first; AI insight summary uses " + failover, "Search results come from the sponsor database. AI only helps summarise and rank visible results when available."],
    ["visa-jobs", "4. Land a Job with Visa Sponsorship", "No AI model", "This pane finds sponsor-matched live adverts through the hosted search flow and browser search helpers rather than an AI generation model."],
    ["remote-jobs", "5. Land a Remote Job", "No AI model", "This pane links users to remote-job platforms and does not call an AI model."],
    ["cv-scorer", "6. CV Scorer", failover, "CV Scorer tries the AI route first, then uses the built-in ATS scoring rules if needed."],
    ["career-plan", "7. Career Path Planner", failover, "Tries the route for 3 cycles, then uses the built-in 1000-role planner if needed."],
    ["interview-questions", "8. Get Possible Interview Questions", failover, "Tries the route for 3 cycles, then uses the built-in interview-question generator if needed."],
    ["rex-chat", "9. Chat with Rex (Interview Coach)", failover, "Rex tries Gemini, DeepSeek, GPT-OSS, Cloudflare, and Hugging Face for 3 cycles before built-in fallback. The indicator shows the latest provider Rex actually used."]
  ];
  var html = "", i, used, route, note;
  if (!adminAiModelTableBody) {
    return;
  }
  for (i = 0; i < rows.length; i += 1) {
    used = usage[rows[i][0]] || null;
    route = used && used.route ? "Last used: " + used.route : rows[i][2];
    note = used && used.lastUsedAt ? (used.note || "Updated from app usage.") + " Last updated: " + used.lastUsedAt + "." : rows[i][3];
    html += "<tr><td>" + esc(rows[i][1]) + "</td><td>" + esc(route) + "</td><td>" + esc(note) + "</td></tr>";
  }
  adminAiModelTableBody.innerHTML = html;
}
function loadAiModelUsage() {
  var raw = "";
  try {
    raw = window.localStorage ? window.localStorage.getItem(aiModelUsageStorageKey) || "" : "";
  } catch (error) {
    raw = "";
  }
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) || {};
  } catch (error2) {
    return {};
  }
}
function loadGeneratorConfig() {
  var stored = null;
  var config = {};
  var key;
  try {
    stored = window.localStorage ? JSON.parse(window.localStorage.getItem(generatorConfigKey) || "null") : null;
  } catch (error) {
    stored = null;
  }
  for (key in defaultGeneratorConfig) {
    if (defaultGeneratorConfig.hasOwnProperty(key)) {
      config[key] = stored && typeof stored[key] === "string" && trim(stored[key]) ? stored[key] : defaultGeneratorConfig[key];
    }
  }
  return config;
}
function saveGeneratorConfig(config) {
  try {
    if (window.localStorage) {
      window.localStorage.setItem(generatorConfigKey, JSON.stringify(config));
    }
    return true;
  } catch (error) {
    return false;
  }
}
function normalizeGeneratorConfigObject(input) {
  var source = input && typeof input === "object" ? input : {};
  var config = {};
  var key;
  var value;
  if (!trim(source.coverLetterSample1) && trim(source.masterCoverLetterTemplate)) {
    source = {
      coverLetterSample1: trim(source.masterCoverLetterTemplate),
      coverLetterSample2: trim(source.coverLetterSample2),
      coverLetterSample3: trim(source.coverLetterSample3)
    };
  }
  for (key in defaultGeneratorConfig) {
    if (defaultGeneratorConfig.hasOwnProperty(key)) {
      value = trim(source[key]);
      config[key] = value || defaultGeneratorConfig[key];
    }
  }
  return config;
}
function saveHostedGeneratorConfigToServer(config) {
  var secret = getValidatedAdminSecret();
  if (!secret) {
    setAdminAccessVisible(true);
    setStatus("bad", "Admin passkey is incorrect.");
    return Promise.reject(new Error("Admin passkey is incorrect."));
  }
  return fetch(adminFunctionUrl("/.netlify/functions/admin-manage-user"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-secret": secret,
      "cache-control": "no-store",
      "pragma": "no-cache"
    },
    body: JSON.stringify({
      action: "setCoverLetterGeneratorConfig",
      payload: {
        config: normalizeGeneratorConfigObject(config)
      }
    })
  }).then(function (response) {
    return response.text().then(function (text) {
      var data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (parseError) {
        data = { ok: false, message: serviceErrorMessage(text, "The cover letter logic service returned " + response.status + ".") };
      }
      if (!response.ok || !data || !data.ok) {
        throw new Error(data && data.message ? data.message : "The hosted cover letter logic could not be saved.");
      }
      return data;
    });
  });
}
function readAdminGeneratorControls() {
  return normalizeGeneratorConfigObject({
    coverLetterSample1: trim(adminGeneratorSample1 && adminGeneratorSample1.value),
    coverLetterSample2: trim(adminGeneratorSample2 && adminGeneratorSample2.value),
    coverLetterSample3: trim(adminGeneratorSample3 && adminGeneratorSample3.value)
  });
}
function populateAdminGeneratorControls() {
  var config = normalizeGeneratorConfigObject(loadGeneratorConfig());
  if (adminGeneratorSample1) {
    adminGeneratorSample1.value = config.coverLetterSample1;
  }
  if (adminGeneratorSample2) {
    adminGeneratorSample2.value = config.coverLetterSample2;
  }
  if (adminGeneratorSample3) {
    adminGeneratorSample3.value = config.coverLetterSample3;
  }
}
function setAdminGeneratorStatus(tone, text) {
  if (!adminGeneratorConfigStatus) {
    return;
  }
  adminGeneratorConfigStatus.className = "auth-status " + tone;
  adminGeneratorConfigStatus.innerHTML = esc(text);
}
function saveAdminGeneratorConfig() {
  var next = readAdminGeneratorControls();
  setAdminGeneratorStatus("neutral", "Saving the hosted cover letter samples now...");
  saveHostedGeneratorConfigToServer(next).then(function (data) {
    var saved = normalizeGeneratorConfigObject(data && data.generator_config ? data.generator_config : next);
    if (!saveGeneratorConfig(saved)) {
      setAdminGeneratorStatus("bad", "The hosted cover letter samples were saved, but the admin copy could not be refreshed.");
      return;
    }
    populateAdminGeneratorControls();
    setAdminGeneratorStatus("good", "Saved the hosted cover letter samples. Future generated cover letters will use them as guidance templates.");
  }).catch(function (error) {
    setAdminGeneratorStatus("bad", trim(error && error.message || "") || "The hosted cover letter samples could not be saved.");
  });
}
function resetAdminGeneratorConfig() {
  setAdminGeneratorStatus("neutral", "Resetting the hosted cover letter samples...");
  saveHostedGeneratorConfigToServer(defaultGeneratorConfig).then(function (data) {
    var resetConfig = normalizeGeneratorConfigObject(data && data.generator_config ? data.generator_config : defaultGeneratorConfig);
    if (!saveGeneratorConfig(resetConfig)) {
      setAdminGeneratorStatus("bad", "The hosted cover letter samples were reset, but the admin copy could not be refreshed.");
      return;
    }
    populateAdminGeneratorControls();
    setAdminGeneratorStatus("good", "Reset the hosted cover letter samples.");
  }).catch(function (error) {
    setAdminGeneratorStatus("bad", trim(error && error.message || "") || "The hosted cover letter samples could not be reset.");
  });
}
function jumpToAdminGeneratorPanel() {
  if (adminGeneratorPanel && adminGeneratorPanel.hidden) {
    adminGeneratorPanel.hidden = false;
  }
  if (!adminGeneratorPanel) {
    return;
  }
  toggleAdminGeneratorPanel(true);
  try {
    adminGeneratorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {}
  try {
    if (adminGeneratorSample1) {
      adminGeneratorSample1.focus();
    }
  } catch (error) {}
}
function toggleAdminGeneratorPanel(forceOpen) {
  var willOpen;
  if (!adminGeneratorPanel || !adminGeneratorPanelBody || !adminGeneratorToggleBtn) {
    return;
  }
  if (adminGeneratorPanel.hidden && forceOpen !== true) {
    return;
  }
  willOpen = typeof forceOpen === "boolean" ? forceOpen : !!adminGeneratorPanelBody.hidden;
  adminGeneratorPanelBody.hidden = !willOpen;
  adminGeneratorToggleBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  adminGeneratorPanel.className = willOpen ? "auth-card collapsed-panel open" : "auth-card collapsed-panel";
  if (adminGeneratorToggleIcon) {
    adminGeneratorToggleIcon.innerHTML = willOpen ? "-" : "+";
  }
}
function toggleGeneratorSamplePanel(button, body, icon, forceOpen) {
  var willOpen;
  if (!button || !body) {
    return;
  }
  willOpen = typeof forceOpen === "boolean" ? forceOpen : !!body.hidden;
  body.hidden = !willOpen;
  button.setAttribute("aria-expanded", willOpen ? "true" : "false");
  if (icon) {
    icon.innerHTML = willOpen ? "-" : "+";
  }
}
function normalizeRole(value) {
  var role = trim(value).toLowerCase();
  if (role === "admin" || role === "super_admin") {
    return role;
  }
  return "user";
}
function roleLabel(value) {
  var role = normalizeRole(value);
  if (role === "super_admin") {
    return "Super admin";
  }
  if (role === "admin") {
    return "Admin";
  }
  return "User";
}
function saveSecret(secret) {
  try {
    if (window.localStorage) {
      window.localStorage.setItem(adminSecretKey, secret);
    }
  } catch (error) {}
}
function getSecret() {
  try {
    return window.localStorage ? window.localStorage.getItem(adminSecretKey) || "" : "";
  } catch (error) {
    return "";
  }
}
function isValidAdminPasskey(value) {
  return trim(value) === adminFixedPasskey;
}
function getValidatedAdminSecret() {
  var secret = trim(adminSecretInput && adminSecretInput.value) || getSecret();
  if (isValidAdminPasskey(secret)) {
    return adminFixedPasskey;
  }
  return "";
}
function clearSecret() {
  try {
    if (window.localStorage) {
      window.localStorage.removeItem(adminSecretKey);
    }
  } catch (error) {}
  if (adminSecretInput) {
    adminSecretInput.value = "";
  }
  setAdminAccessVisible(true);
  if (adminPanel) {
    adminPanel.hidden = true;
  }
  if (adminToolsPanel) {
    adminToolsPanel.hidden = true;
  }
  if (adminAiSettingsPanel) {
    adminAiSettingsPanel.hidden = true;
  }
  if (adminAiModelPanel) {
    adminAiModelPanel.hidden = true;
  }
  if (adminGeneratorPanel) {
    adminGeneratorPanel.hidden = true;
  }
  setStatus("neutral", "Enter the admin passkey.");
}
function restoreSecretAndMaybeLoad() {
  var secret = getSecret();
  if (secret && !isValidAdminPasskey(secret)) {
    clearSecret();
    setStatus("neutral", "Enter the admin passkey.");
    return;
  }
  if (adminSecretInput) {
    adminSecretInput.value = secret;
  }
  if (secret) {
    setAdminAccessVisible(false);
    setStatus("neutral", "Loading user activity now...");
    loadAdminUsers();
    return;
  }
  setAdminAccessVisible(true);
}
function saveSecretAndLoad() {
  var secret = trim(adminSecretInput && adminSecretInput.value);
  if (!isValidAdminPasskey(secret)) {
    setStatus("bad", "Admin passkey is incorrect.");
    return;
  }
  saveSecret(adminFixedPasskey);
  setAdminAccessVisible(false);
  loadAdminUsers();
}
function loadAdminUsers() {
  var secret = getValidatedAdminSecret();
  if (!secret) {
    setAdminAccessVisible(true);
    setStatus("bad", "Admin passkey is incorrect.");
    return;
  }
  setStatus("neutral", "Loading user activity now...");
  fetch(adminFunctionUrl("/.netlify/functions/admin-users?ts=" + Date.now()), {
    cache: "no-store",
    headers: {
      "x-admin-secret": secret,
      "cache-control": "no-store",
      "pragma": "no-cache"
    }
  }).then(function (response) {
    return response.text().then(function (text) {
      var data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (parseError) {
        data = { ok: false, message: serviceErrorMessage(text, "The monitoring service returned " + response.status + ".") };
      }
      return { ok: response.ok, data: data };
    });
  }).then(function (result) {
    if (!result.ok || !result.data || !result.data.ok) {
      setAdminAccessVisible(true);
      setStatus("bad", result.data && result.data.message ? result.data.message : "Could not load the monitoring view.");
      if (adminPanel) {
        adminPanel.hidden = true;
      }
      if (adminToolsPanel) {
        adminToolsPanel.hidden = true;
      }
      if (adminAiSettingsPanel) {
    adminAiSettingsPanel.hidden = true;
  }
  if (adminAiModelPanel) {
    adminAiModelPanel.hidden = true;
  }
      if (adminGeneratorPanel) {
        adminGeneratorPanel.hidden = true;
      }
      adminUsersCache = [];
      return;
    }
    adminUsersCache = (result.data.users || []).slice(0);
    if (result.data.generator_config && saveGeneratorConfig(normalizeGeneratorConfigObject(result.data.generator_config))) {
      populateAdminGeneratorControls();
    }
    setAdminAccessVisible(false);
    applyAdminSearch();
    if (adminPanel) {
      adminPanel.hidden = false;
    }
    if (adminToolsPanel) {
      adminToolsPanel.hidden = false;
    }
    if (adminAiSettingsPanel) {
      adminAiSettingsPanel.hidden = false;
    }
    if (adminAiModelPanel) {
      adminAiModelPanel.hidden = false;
    }
    if (adminGeneratorPanel) {
      adminGeneratorPanel.hidden = false;
    }
    populateHostedAiSettings();
    renderAdminAiModelIndicator();
    toggleAdminGeneratorPanel(false);
    populateAdminGeneratorControls();
    setStatus("good", "Monitoring view updated successfully.");
  }).catch(function (error) {
    setAdminAccessVisible(true);
    setStatus("bad", adminNetworkErrorMessage(error, "Could not load the monitoring view."));
    if (adminPanel) {
      adminPanel.hidden = true;
    }
    if (adminToolsPanel) {
      adminToolsPanel.hidden = true;
    }
    if (adminAiSettingsPanel) {
    adminAiSettingsPanel.hidden = true;
  }
  if (adminAiModelPanel) {
    adminAiModelPanel.hidden = true;
  }
    if (adminGeneratorPanel) {
      adminGeneratorPanel.hidden = true;
    }
  });
}
function renderAdminUsers(users) {
  var rows = "", i, user;
  if (!users.length) {
    adminSummary.className = "summary-bar empty-state";
    adminSummary.innerHTML = adminUsersCache.length ? "No users matched your search." : "No registered users were returned yet.";
    adminTableBody.innerHTML = "<tr><td colspan=\"7\">No users found.</td></tr>";
    return;
  }
  adminSummary.className = "summary-bar";
  adminSummary.innerHTML = "Showing <strong>" + users.length + "</strong> user account(s).";
  for (i = 0; i < users.length; i += 1) {
    user = users[i];
    rows += "<tr>" +
      "<td>" + esc(user.user_name || "-") + "</td>" +
      "<td>" + esc(user.email || "-") + "</td>" +
      "<td>" + esc(user.created_at || "-") + "</td>" +
      "<td>" + esc(user.last_sign_in_at || "-") + "</td>" +
      "<td>" + esc(user.subscription || user.plan || "Free") + "</td>" +
      "<td>" + renderDaysRemainingControls(user) + "</td>" +
      "<td>" + esc(roleLabel(user.role)) + "</td>" +
      "</tr>" +
      "<tr class=\"admin-user-action-row\"><td colspan=\"7\"><div class=\"admin-user-actions\">" +
      "<button class=\"ghost-button small-button admin-adjust-btn\" type=\"button\" data-email=\"" + esc(user.email || "") + "\" data-action=\"resetUsage\">Reset usage</button>" +
      buildPlanSelectHtml(user.email || "") +
      "<button class=\"ghost-button small-button admin-admin-btn\" type=\"button\" data-email=\"" + esc(user.email || "") + "\" data-action=\"" + (normalizeRole(user.role) === "admin" ? "setUserRole" : "setAdminRole") + "\">" + (normalizeRole(user.role) === "admin" ? "Make user" : "Make admin") + "</button>" +
      "<button class=\"ghost-button small-button admin-admin-btn\" type=\"button\" data-email=\"" + esc(user.email || "") + "\" data-action=\"changePassword\">Change password</button>" +
      "<button class=\"ghost-button small-button admin-admin-btn\" type=\"button\" data-email=\"" + esc(user.email || "") + "\" data-action=\"deleteUser\">Delete</button>" +
      buildPaneSelectHtml(user.email || "", "lockPane", "Lock") +
      buildPaneSelectHtml(user.email || "", "unlockPane", "Unlock") +
      renderPaneSummaryHtml(user) +
      "</div></td></tr>";
  }
  adminTableBody.innerHTML = rows;
}
function renderDaysRemainingControls(user) {
  var email = trim(user && user.email || "");
  var value = trim(user && (user.days_remaining || user.daysRemaining) || "-");
  if (low(value) === "unlimited") {
    return "<span class=\"admin-days-value\">Unlimited</span>";
  }
  return "<div class=\"admin-days-controls\">" +
    "<button class=\"ghost-button small-button admin-inline-btn admin-days-btn\" type=\"button\" data-email=\"" + esc(email) + "\" data-action=\"adjustDaysRemaining\" data-delta=\"-1\" aria-label=\"Remove one day from " + esc(email) + "\" title=\"Remove 1 day\">-</button>" +
    "<span class=\"admin-days-value\" aria-live=\"polite\">" + esc(value) + "</span>" +
    "<button class=\"ghost-button small-button admin-inline-btn admin-days-btn\" type=\"button\" data-email=\"" + esc(email) + "\" data-action=\"adjustDaysRemaining\" data-delta=\"1\" aria-label=\"Add one day to " + esc(email) + "\" title=\"Add 1 day\">+</button>" +
    "</div>";
}
function setDayAdjustmentBusy(email, busy) {
  var key = low(email);
  var buttons = adminTableBody ? adminTableBody.querySelectorAll(".admin-days-btn") : [];
  var i, button;
  if (busy) {
    adminDayAdjustmentsPending[key] = true;
  } else {
    delete adminDayAdjustmentsPending[key];
  }
  for (i = 0; i < buttons.length; i += 1) {
    button = buttons[i];
    if (low(button.getAttribute("data-email")) === key) {
      button.disabled = !!busy;
      button.setAttribute("aria-busy", busy ? "true" : "false");
    }
  }
}
function adjustUserDays(email, delta) {
  var key = low(email);
  if (adminDayAdjustmentsPending[key]) {
    return;
  }
  setDayAdjustmentBusy(email, true);
  runAdminAction("adjustDaysRemaining", { email: email, delta: delta }).then(function () {
    setDayAdjustmentBusy(email, false);
  });
}
function renderPaneSummaryHtml(user) {
  var locked = normalizePaneLockList(user && (user.locked_panes || user.lockedPanes || []));
  return "<div class=\"admin-pane-summary\"><strong>Locked panes:</strong> " + esc(locked.length ? locked.map(paneSummaryLabel).join(", ") : "None") + "</div>";
}
function normalizePaneLockId(value) {
  var text = low(String(value || "")).replace(/[^a-z0-9]+/g, "");
  if (text === "pane1" || text === "1" || text === "cvbuilder" || text === "cvbuildertogglebtn") { return "pane1"; }
  if (text === "pane2" || text === "2" || text === "coverletter" || text === "coverlettertogglebtn") { return "pane2"; }
  if (text === "pane3" || text === "3" || text === "sponsorsearch" || text === "sponsorsearchtogglebtn") { return "pane3"; }
  if (text === "pane4" || text === "4" || text === "visajobs" || text === "visajobstogglebtn") { return "pane4"; }
  if (text === "pane5" || text === "5" || text === "remotejobs" || text === "remotejobstogglebtn") { return "pane5"; }
  if (text === "pane6" || text === "6" || text === "cvscorer" || text === "cvscorertogglebtn") { return "pane6"; }
  if (text === "pane7" || text === "7" || text === "careerplan" || text === "careerpath" || text === "careerpathtogglebtn") { return "pane7"; }
  if (text === "pane8" || text === "8" || text === "interviewquestions" || text === "interviewquestionstogglebtn") { return "pane8"; }
  if (text === "pane9" || text === "9" || text === "rexchat" || text === "rexchattogglebtn") { return "pane9"; }
  return "";
}
function normalizePaneLockList(value) {
  var input = Array.isArray(value) ? value : (value ? [value] : []);
  var output = [];
  var i, item = "";
  for (i = 0; i < input.length; i += 1) {
    item = normalizePaneLockId(input[i]);
    if (item && output.indexOf(item) === -1) {
      output.push(item);
    }
  }
  return output;
}
function paneSummaryLabel(value) {
  var paneId = normalizePaneLockId(value);
  if (paneId === "pane1") { return "Pane 1 - Generate CV"; }
  if (paneId === "pane2") { return "Pane 2 - Generate Cover Letter"; }
  if (paneId === "pane3") { return "Pane 3 - Search for Companies with Skilled Worker Licence"; }
  if (paneId === "pane4") { return "Pane 4 - Land a Job with Visa Sponsorship"; }
  if (paneId === "pane5") { return "Pane 5 - Land a Remote Job"; }
  if (paneId === "pane6") { return "Pane 6 - CV Scorer"; }
  if (paneId === "pane7") { return "Pane 7 - Career Path Planner"; }
  if (paneId === "pane8") { return "Pane 8 - Get Possible Interview Questions"; }
  if (paneId === "pane9") { return "Pane 9 - Chat with Rex"; }
  return String(value || "");
}
function buildPaneSelectHtml(email, action, label) {
  var options = [
    "<option value=\"\">" + esc(label) + " pane</option>",
    "<option value=\"pane1\">Pane 1</option>",
    "<option value=\"pane2\">Pane 2</option>",
    "<option value=\"pane3\">Pane 3</option>",
    "<option value=\"pane4\">Pane 4</option>",
    "<option value=\"pane5\">Pane 5</option>",
    "<option value=\"pane6\">Pane 6</option>",
    "<option value=\"pane7\">Pane 7</option>",
    "<option value=\"pane8\">Pane 8</option>",
    "<option value=\"pane9\">Pane 9</option>"
  ];
  return "<select class=\"admin-pane-select\" data-email=\"" + esc(email || "") + "\" data-action=\"" + esc(action) + "\">" + options.join("") + "</select>";
}
function buildPlanSelectHtml(email) {
  var options = [
    "<option value=\"\">Change plan</option>",
    "<option value=\"1 month\">1 Month</option>",
    "<option value=\"6 months\">6 Months</option>",
    "<option value=\"12 months\">12 Months</option>",
    "<option value=\"lifetime\">Lifetime</option>"
  ];
  return "<select class=\"admin-plan-select\" data-email=\"" + esc(email || "") + "\" data-action=\"setSubscription\">" + options.join("") + "</select>";
}

function mergeAdminUserUpdate(payload) {
  var email = low(trim(payload && payload.email || ""));
  var i, user, planValue, startedAtValue, daysValue, lockedValue, unlockedValue;
  if (!email || !Array.isArray(adminUsersCache)) {
    return false;
  }
  for (i = 0; i < adminUsersCache.length; i += 1) {
    user = adminUsersCache[i];
    if (low(user && user.email || "") !== email) {
      continue;
    }
    planValue = trim(payload && (payload.plan || payload.subscription) || "");
    startedAtValue = trim(payload && (payload.subscriptionStartedAt || payload.subscription_started_at) || "");
    daysValue = trim(payload && (payload.daysRemaining || payload.days_remaining) || "");
    lockedValue = normalizePaneLockList(payload && (payload.lockedPanes || payload.locked_panes || []));
    unlockedValue = normalizePaneLockList(payload && (payload.unlockedPanes || payload.unlocked_panes || []));
    if (planValue) {
      user.plan = planValue;
      user.subscription = planValue;
    }
    if (payload && Object.prototype.hasOwnProperty.call(payload, "planType")) {
      user.plan_type = trim(payload.planType || "");
    } else if (payload && Object.prototype.hasOwnProperty.call(payload, "plan_type")) {
      user.plan_type = trim(payload.plan_type || "");
    }
    if (startedAtValue) {
      user.subscription_started_at = startedAtValue;
    }
    if (daysValue) {
      user.days_remaining = daysValue;
      user.daysRemaining = daysValue;
    }
    if (payload && Object.prototype.hasOwnProperty.call(payload, "paid")) {
      user.is_paid = !!payload.paid;
    }
    if (payload && Object.prototype.hasOwnProperty.call(payload, "role")) {
      user.role = trim(payload.role || user.role || "");
    }
    if (payload && (Object.prototype.hasOwnProperty.call(payload, "lockedPanes") || Object.prototype.hasOwnProperty.call(payload, "locked_panes"))) {
      user.locked_panes = lockedValue;
      user.lockedPanes = lockedValue;
    }
    if (payload && (Object.prototype.hasOwnProperty.call(payload, "unlockedPanes") || Object.prototype.hasOwnProperty.call(payload, "unlocked_panes"))) {
      user.unlocked_panes = unlockedValue;
      user.unlockedPanes = unlockedValue;
    }
    return true;
  }
  return false;
}
function applyAdminSearch() {
  var query = trim(adminSearchInput && adminSearchInput.value).toLowerCase();
  var filtered = [];
  var i, user, name, email;
  if (!query) {
    renderAdminUsers(adminUsersCache.slice(0));
    return;
  }
  for (i = 0; i < adminUsersCache.length; i += 1) {
    user = adminUsersCache[i];
    name = trim(user.user_name || "").toLowerCase();
    email = trim(user.email || "").toLowerCase();
    if (name.indexOf(query) !== -1 || email.indexOf(query) !== -1) {
      filtered.push(user);
    }
  }
  renderAdminUsers(filtered);
}
function downloadAdminExcel() {
  var rows = adminUsersCache || [], html, blob, url, link, i, user;
  if (!rows.length) {
    setStatus("bad", "Load the monitoring view before downloading the Excel sheet.");
    return;
  }
  html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body><table border=\"1\"><thead><tr><th>User</th><th>Email</th><th>Signed up</th><th>Last sign in</th><th>Subscription</th><th>Days remaining</th><th>Role</th></tr></thead><tbody>";
  for (i = 0; i < rows.length; i += 1) {
    user = rows[i];
    html += "<tr>" +
      "<td>" + esc(user.user_name || "-") + "</td>" +
      "<td>" + esc(user.email || "-") + "</td>" +
      "<td>" + esc(user.created_at || "-") + "</td>" +
      "<td>" + esc(user.last_sign_in_at || "-") + "</td>" +
      "<td>" + esc(user.subscription || user.plan || "Free") + "</td>" +
      "<td>" + esc(user.days_remaining || "-") + "</td>" +
      "<td>" + esc(roleLabel(user.role)) + "</td>" +
      "</tr>";
  }
  html += "</tbody></table></body></html>";
  blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel" });
  url = (window.URL || window.webkitURL).createObjectURL(blob);
  link = document.createElement("a");
  link.href = url;
  link.download = "job-match-agent-users.xls";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function () {
    (window.URL || window.webkitURL).revokeObjectURL(url);
  }, 1000);
}

if (adminTableBody) {
  adminTableBody.onclick = function (event) {
    var target = event.target || event.srcElement;
    var action = "";
    var email = "";
    var field = "";
    var delta = 0;
    if (!target || !target.getAttribute) {
      return;
    }
    if (String(target.className || "").indexOf("admin-adjust-btn") === -1 && String(target.className || "").indexOf("admin-admin-btn") === -1 && String(target.className || "").indexOf("admin-inline-btn") === -1) {
      return;
    }
    action = trim(target.getAttribute("data-action"));
    email = trim(target.getAttribute("data-email"));
    field = trim(target.getAttribute("data-field"));
    delta = Number(target.getAttribute("data-delta") || 0);
    if (!action || !email) {
      return;
    }
    if (action === "adjustUsage") {
      runAdminAction(action, { email: email, field: field, delta: delta });
      return;
    }
    if (action === "adjustDaysRemaining") {
      if (event && event.preventDefault) {
        event.preventDefault();
      }
      adjustUserDays(email, delta);
      return;
    }
    if (action === "changePassword") {
      changeHostedUserPassword(email);
      return;
    }
    if (action === "setSubscription") {
      runAdminAction("setPremium", { email: email, planType: trim(target.getAttribute("data-plan")) });
      return;
    }
    if (action === "resetUsage" || action === "setFree" || action === "deleteUser") {
      runAdminAction(action, { email: email });
      return;
    }
    if (action === "setAdminRole" || action === "setUserRole") {
      runAdminAction("setRole", { email: email, role: action === "setAdminRole" ? "admin" : "user" });
    }
  };
  adminTableBody.onchange = function (event) {
    var target = event.target || event.srcElement;
    var action = "";
    var email = "";
    var paneId = "";
    var className = String(target && target.className || "");
    if (!target || !target.getAttribute || (className.indexOf("admin-pane-select") === -1 && className.indexOf("admin-plan-select") === -1)) {
      return;
    }
    action = trim(target.getAttribute("data-action"));
    email = trim(target.getAttribute("data-email"));
    if (className.indexOf("admin-plan-select") !== -1) {
      if (!action || !email || !trim(target.value)) {
        return;
      }
      runAdminAction("setPremium", { email: email, planType: trim(target.value) });
      target.value = "";
      return;
    }
    paneId = trim(target.value);
    if (!action || !email || !paneId) {
      return;
    }
    runAdminAction("setPaneLock", {
      email: email,
      paneId: paneId,
      mode: action === "lockPane" ? "lock" : "unlock"
    });
    target.value = "";
  };
}

function createHostedUser() {
  var name = trim(adminNewUserName && adminNewUserName.value);
  var email = trim(adminNewUserEmail && adminNewUserEmail.value);
  var password = trim(adminNewUserPassword && adminNewUserPassword.value);
  var role = normalizeRole(adminNewUserRole && adminNewUserRole.value);
  if (!name || !email || !password) {
    setStatus("bad", "Enter a user name, email, and password before adding a hosted user.");
    return;
  }
  if (password.length < 8) {
    setStatus("bad", "Use a password with at least 8 characters for the hosted user.");
    return;
  }
  runAdminAction("createUser", { name: name, email: email, password: password, role: role }).then(function (ok) {
    if (!ok) {
      return;
    }
    if (adminNewUserName) {
      adminNewUserName.value = "";
    }
    if (adminNewUserEmail) {
      adminNewUserEmail.value = "";
    }
    if (adminNewUserPassword) {
      adminNewUserPassword.value = "";
    }
    if (adminNewUserRole) {
      adminNewUserRole.value = "user";
    }
  });
}

function changeHostedUserPassword(email) {
  var password = window.prompt("Enter the new hosted password for " + email, "");
  if (password === null) {
    return;
  }
  password = trim(password);
  if (!password) {
    setStatus("bad", "Enter a password before updating the hosted user.");
    return;
  }
  if (password.length < 8) {
    setStatus("bad", "Use a password with at least 8 characters for the hosted user.");
    return;
  }
  runAdminAction("changePassword", { email: email, password: password });
}

function runAdminAction(action, payload) {
  var secret = getValidatedAdminSecret();
  if (!secret) {
    setStatus("bad", "Admin passkey is incorrect.");
    return Promise.resolve(false);
  }
  setStatus("neutral", "Applying admin change now...");
  return fetch(adminFunctionUrl("/.netlify/functions/admin-manage-user"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-secret": secret
    },
    body: JSON.stringify({
      action: action,
      payload: payload || {}
    })
  }).then(function (response) {
    return response.text().then(function (text) {
      var data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (parseError) {
        data = { ok: false, message: serviceErrorMessage(text, "The admin service returned " + response.status + ".") };
      }
      return { ok: response.ok, data: data };
    });
  }).then(function (result) {
    if (!result.ok || !result.data || !result.data.ok) {
      setStatus("bad", result.data && result.data.message ? result.data.message : "That admin action could not be completed.");
      return false;
    }
    broadcastHostedPlanUpdate(result.data);
    if (mergeAdminUserUpdate(result.data)) {
      applyAdminSearch();
    }
    setStatus("good", result.data.message || "Admin change completed.");
    loadAdminUsers();
    return true;
  }).catch(function (error) {
    setStatus("bad", adminNetworkErrorMessage(error, "That admin action could not be completed."));
    return false;
  });
}








