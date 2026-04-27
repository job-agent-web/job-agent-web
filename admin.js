var adminSecretKey = "jobMatchAgentAdminSecret";
var generatorConfigKey = "jobMatchAgentGeneratorConfig";
var generatorConfigHistoryKey = "jobMatchAgentGeneratorConfigPrevious";
var openAiKeyStorageKey = "jobMatchAgentOpenAiKey";
var openAiModelStorageKey = "jobMatchAgentOpenAiModel";
var aiModelUsageStorageKey = "jobMatchAgentAiModelUsage";
var defaultOpenAiModel = "gemini-2.5-flash-lite";
var defaultGeneratorConfig = {
  introTemplate: "My background in data analysis, reporting, record management, stakeholder support, and service-focused coordination gives me a strong foundation for the responsibilities described in the job description and person specification.",
  strengthTemplate: "Emphasise analytical capability, dependable administration, record accuracy, stakeholder support, and organised delivery with direct relevance to the target role.",
  nhsTemplate: "Use a service-led NHS tone that reflects professionalism, discretion, teamwork, confidentiality, and consistent support for high-quality care and operational delivery.",
  civilTemplate: "Use a clear Civil Service tone that highlights evidence-led thinking, organisation, behaviours, public service standards, and practical contribution to team objectives.",
  closingTemplate: "Thank the employer, restate fit for the role, and close with a confident invitation to discuss alignment with the role requirements and organisational needs."
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
var adminGeneratorIntroTemplate = document.getElementById("adminGeneratorIntroTemplate");
var adminGeneratorStrengthTemplate = document.getElementById("adminGeneratorStrengthTemplate");
var adminGeneratorNhsTemplate = document.getElementById("adminGeneratorNhsTemplate");
var adminGeneratorCivilTemplate = document.getElementById("adminGeneratorCivilTemplate");
var adminGeneratorClosingTemplate = document.getElementById("adminGeneratorClosingTemplate");
var previewAdminGeneratorConfigBtn = document.getElementById("previewAdminGeneratorConfigBtn");
var saveAdminGeneratorConfigBtn = document.getElementById("saveAdminGeneratorConfigBtn");
var restoreAdminGeneratorConfigBtn = document.getElementById("restoreAdminGeneratorConfigBtn");
var resetAdminGeneratorConfigBtn = document.getElementById("resetAdminGeneratorConfigBtn");
var adminGeneratorPreview = document.getElementById("adminGeneratorPreview");
var adminGeneratorConfigStatus = document.getElementById("adminGeneratorConfigStatus");
var addAdminUserBtn = document.getElementById("addAdminUserBtn");
var resetAllAdminUsageBtn = document.getElementById("resetAllAdminUsageBtn");
var setAllAdminFreeBtn = document.getElementById("setAllAdminFreeBtn");
var setAllAdminPremiumBtn = document.getElementById("setAllAdminPremiumBtn");
var adminUsersCache = [];
var planBroadcastKey = "jobMatchAgentHostedPlanBroadcast";
var planMirrorKey = "jobMatchAgentHostedPlanMirror";
var paneOverrideMirrorKey = "jobMatchAgentPaneOverrideMirror";

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
if (previewAdminGeneratorConfigBtn) {
  previewAdminGeneratorConfigBtn.onclick = function () {
    previewAdminGeneratorConfig();
    return false;
  };
}
if (restoreAdminGeneratorConfigBtn) {
  restoreAdminGeneratorConfigBtn.onclick = function () {
    restoreAdminGeneratorConfig();
    return false;
  };
}
if (resetAdminGeneratorConfigBtn) {
  resetAdminGeneratorConfigBtn.onclick = function () {
    resetAdminGeneratorConfig();
    return false;
  };
}

restoreSecretAndMaybeLoad();
populateHostedAiSettings();
populateAdminGeneratorControls();
previewAdminGeneratorConfig();
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
  var failover = "Gemini (" + geminiModel + ") -> GPT-OSS (openai/gpt-oss-120b:fastest) -> Cloudflare (@cf/meta/llama-3.1-8b-instruct) -> Hugging Face (meta-llama/Llama-3.1-8B-Instruct)";
  var usage = loadAiModelUsage();
  var rows = [
    ["cv-builder", "1. Generate CV", failover, "Generated CV tries all AI providers for 3 cycles before local fallback. The indicator shows the latest provider the CV pane actually used."],
    ["cover-letter", "2. Generate Cover Letter", failover, "Cover letter tries all AI providers for 3 cycles before local fallback. The indicator shows the latest provider the cover-letter pane actually used."],
    ["sponsor-search", "3. Search for Companies with Skilled Worker Licence", "Local sponsor database first; AI insight summary uses " + failover, "Search results are local. AI only helps summarise and rank visible results when available."],
    ["visa-jobs", "4. Land a Job with Visa Sponsorship", "No AI model", "This pane finds sponsor-matched live adverts through the hosted search flow and browser search helpers rather than an AI generation model."],
    ["remote-jobs", "5. Land a Remote Job", "No AI model", "This pane links users to remote-job platforms and does not call an AI model."],
    ["career-plan", "6. Career Path Planner", failover, "Tries the route for 3 cycles, then uses the built-in 50-career local planner if needed."],
    ["interview-questions", "7. Get Possible Interview Questions", failover, "Tries the route for 3 cycles, then uses the built-in local interview-question generator if needed."],
    ["rex-chat", "8. Chat with Rex (Interview Coach)", failover, "Rex tries Gemini, GPT-OSS, Cloudflare, and Hugging Face for 3 cycles before local fallback. The indicator shows the latest provider Rex actually used."]
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
function loadPreviousGeneratorConfig() {
  var stored = null;
  var config = {};
  var key;
  try {
    stored = window.localStorage ? JSON.parse(window.localStorage.getItem(generatorConfigHistoryKey) || "null") : null;
  } catch (error) {
    stored = null;
  }
  if (!stored) {
    return null;
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
function savePreviousGeneratorConfig(config) {
  try {
    if (window.localStorage) {
      window.localStorage.setItem(generatorConfigHistoryKey, JSON.stringify(config));
    }
    return true;
  } catch (error) {
    return false;
  }
}
function readAdminGeneratorControls() {
  return {
    introTemplate: trim(adminGeneratorIntroTemplate && adminGeneratorIntroTemplate.value) || defaultGeneratorConfig.introTemplate,
    strengthTemplate: trim(adminGeneratorStrengthTemplate && adminGeneratorStrengthTemplate.value) || defaultGeneratorConfig.strengthTemplate,
    nhsTemplate: trim(adminGeneratorNhsTemplate && adminGeneratorNhsTemplate.value) || defaultGeneratorConfig.nhsTemplate,
    civilTemplate: trim(adminGeneratorCivilTemplate && adminGeneratorCivilTemplate.value) || defaultGeneratorConfig.civilTemplate,
    closingTemplate: trim(adminGeneratorClosingTemplate && adminGeneratorClosingTemplate.value) || defaultGeneratorConfig.closingTemplate
  };
}
function populateAdminGeneratorControls() {
  var config = loadGeneratorConfig();
  if (adminGeneratorIntroTemplate) {
    adminGeneratorIntroTemplate.value = config.introTemplate;
  }
  if (adminGeneratorStrengthTemplate) {
    adminGeneratorStrengthTemplate.value = config.strengthTemplate;
  }
  if (adminGeneratorNhsTemplate) {
    adminGeneratorNhsTemplate.value = config.nhsTemplate;
  }
  if (adminGeneratorCivilTemplate) {
    adminGeneratorCivilTemplate.value = config.civilTemplate;
  }
  if (adminGeneratorClosingTemplate) {
    adminGeneratorClosingTemplate.value = config.closingTemplate;
  }
}
function renderGeneratorPreview(config) {
  var opener = config.introTemplate + " This preview is shaped for a Data Analyst vacancy in Wolverhampton.";
  var strengths = config.strengthTemplate + " Highlight SQL reporting, dashboard production, stakeholder communication, and record accuracy with direct relevance to the advertised duties.";
  var sector = config.nhsTemplate + " " + config.civilTemplate;
  var closing = config.closingTemplate + " Yours faithfully, Hiring Candidate";
  return opener + "\n\n" + strengths + "\n\n" + sector + "\n\n" + closing;
}
function setAdminGeneratorPreview(text) {
  if (!adminGeneratorPreview) {
    return;
  }
  adminGeneratorPreview.textContent = text;
}
function setAdminGeneratorStatus(tone, text) {
  if (!adminGeneratorConfigStatus) {
    return;
  }
  adminGeneratorConfigStatus.className = "auth-status " + tone;
  adminGeneratorConfigStatus.innerHTML = esc(text);
}
function saveAdminGeneratorConfig() {
  var current = loadGeneratorConfig();
  var next = readAdminGeneratorControls();
  if (!savePreviousGeneratorConfig(current) || !saveGeneratorConfig(next)) {
    setAdminGeneratorStatus("bad", "The hosted cover letter logic could not be saved.");
    return;
  }
  setAdminGeneratorPreview(renderGeneratorPreview(next));
  setAdminGeneratorStatus("good", "Saved hosted cover letter generator logic. New generated drafts will use it.");
}
function previewAdminGeneratorConfig() {
  var config = readAdminGeneratorControls();
  setAdminGeneratorPreview(renderGeneratorPreview(config));
  setAdminGeneratorStatus("neutral", "Preview updated from the current logic fields.");
}
function restoreAdminGeneratorConfig() {
  var previous = loadPreviousGeneratorConfig();
  var current = loadGeneratorConfig();
  if (!previous) {
    setAdminGeneratorStatus("bad", "There is no earlier saved logic to restore yet.");
    return;
  }
  if (!savePreviousGeneratorConfig(current) || !saveGeneratorConfig(previous)) {
    setAdminGeneratorStatus("bad", "The previous hosted cover letter logic could not be restored.");
    return;
  }
  populateAdminGeneratorControls();
  setAdminGeneratorPreview(renderGeneratorPreview(previous));
  setAdminGeneratorStatus("good", "Restored the previous saved cover letter logic.");
}
function resetAdminGeneratorConfig() {
  var current = loadGeneratorConfig();
  if (!savePreviousGeneratorConfig(current) || !saveGeneratorConfig(defaultGeneratorConfig)) {
    setAdminGeneratorStatus("bad", "The hosted cover letter logic could not be reset.");
    return;
  }
  populateAdminGeneratorControls();
  setAdminGeneratorPreview(renderGeneratorPreview(defaultGeneratorConfig));
  setAdminGeneratorStatus("good", "Reset hosted cover letter generator logic to the default rules.");
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
    if (adminGeneratorIntroTemplate) {
      adminGeneratorIntroTemplate.focus();
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
  setStatus("neutral", "Enter your passkey to continue.");
}
function restoreSecretAndMaybeLoad() {
  var secret = getSecret();
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
  if (!secret) {
    setStatus("bad", "Enter your passkey first.");
    return;
  }
  saveSecret(secret);
  setAdminAccessVisible(false);
  loadAdminUsers();
}
function loadAdminUsers() {
  var secret = trim(adminSecretInput && adminSecretInput.value) || getSecret();
  if (!secret) {
    setAdminAccessVisible(true);
    setStatus("bad", "Enter your passkey first.");
    return;
  }
  setStatus("neutral", "Loading user activity now...");
  fetch("/.netlify/functions/admin-users?ts=" + Date.now(), {
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
        data = { ok: false, message: trim(text) || ("The monitoring service returned " + response.status + ".") };
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
    setStatus("bad", trim(error && error.message || "") || "Could not load the monitoring view.");
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
      "<td><div class=\"admin-days-controls\"><button class=\"ghost-button small-button admin-inline-btn admin-days-btn\" type=\"button\" data-email=\"" + esc(user.email || "") + "\" data-action=\"adjustDaysRemaining\" data-delta=\"-1\">-</button><span class=\"admin-days-value\">" + esc(user.days_remaining || user.daysRemaining || "-") + "</span><button class=\"ghost-button small-button admin-inline-btn admin-days-btn\" type=\"button\" data-email=\"" + esc(user.email || "") + "\" data-action=\"adjustDaysRemaining\" data-delta=\"1\">+</button></div></td>" +
      "<td>" + esc(roleLabel(user.role)) + "</td>" +
      "</tr>" +
      "<tr class=\"admin-user-action-row\"><td colspan=\"7\"><div class=\"admin-user-actions\">" +
      "<button class=\"ghost-button small-button admin-adjust-btn\" type=\"button\" data-email=\"" + esc(user.email || "") + "\" data-action=\"resetUsage\">Reset usage</button>" +
      "<button class=\"ghost-button small-button admin-admin-btn\" type=\"button\" data-email=\"" + esc(user.email || "") + "\" data-action=\"setSubscription\" data-plan=\"1 month\">1 Month</button>" +
      "<button class=\"ghost-button small-button admin-admin-btn\" type=\"button\" data-email=\"" + esc(user.email || "") + "\" data-action=\"setSubscription\" data-plan=\"6 months\">6 Months</button>" +
      "<button class=\"ghost-button small-button admin-admin-btn\" type=\"button\" data-email=\"" + esc(user.email || "") + "\" data-action=\"setSubscription\" data-plan=\"12 months\">12 Months</button>" +
      "<button class=\"ghost-button small-button admin-admin-btn\" type=\"button\" data-email=\"" + esc(user.email || "") + "\" data-action=\"setSubscription\" data-plan=\"lifetime\">Lifetime</button>" +
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
function renderPaneSummaryHtml(user) {
  var locked = normalizePaneLockList(user && (user.locked_panes || user.lockedPanes || []));
  return "<div class=\"admin-pane-summary\"><strong>Locked panes:</strong> " + esc(locked.length ? locked.map(paneSummaryLabel).join(", ") : "None") + "</div>";
}
function normalizePaneLockId(value) {
  var text = low(String(value || "")).replace(/[^a-z0-9]+/g, "");
  if (text === "pane1" || text === "1" || text === "cvbuildertogglebtn") { return "pane1"; }
  if (text === "pane2" || text === "2" || text === "coverlettertogglebtn") { return "pane2"; }
  if (text === "pane3" || text === "3" || text === "sponsorsearchtogglebtn") { return "pane3"; }
  if (text === "pane4" || text === "4" || text === "visajobstogglebtn") { return "pane4"; }
  if (text === "pane5" || text === "5" || text === "remotejobstogglebtn") { return "pane5"; }
  if (text === "pane6" || text === "6" || text === "careerpathtogglebtn") { return "pane6"; }
  if (text === "pane7" || text === "7" || text === "interviewquestionstogglebtn") { return "pane7"; }
  if (text === "pane8" || text === "8" || text === "rexchattogglebtn") { return "pane8"; }
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
  if(paneId==="pane5"){return "Pane 5 - Land a Remote Job";}if(paneId==="pane6"){return "Pane 6 - Career Path Planner";}if(paneId==="pane7"){return "Pane 7 - Get Possible Interview Questions";}if(paneId==="pane8"){return "Pane 8 - Chat with Rex";}return paneId ? ("Pane " + paneId.replace("pane", "")) : String(value || "");
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
    "<option value=\"pane8\">Pane 8</option>"
  ];
  return "<select class=\"admin-pane-select\" data-email=\"" + esc(email || "") + "\" data-action=\"" + esc(action) + "\">" + options.join("") + "</select>";
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
      runAdminAction(action, { email: email, delta: delta });
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
    if (!target || !target.getAttribute || String(target.className || "").indexOf("admin-pane-select") === -1) {
      return;
    }
    action = trim(target.getAttribute("data-action"));
    email = trim(target.getAttribute("data-email"));
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
  var secret = trim(adminSecretInput && adminSecretInput.value) || getSecret();
  if (!secret) {
    setStatus("bad", "Enter your passkey first.");
    return Promise.resolve(false);
  }
  setStatus("neutral", "Applying admin change now...");
  return fetch("/.netlify/functions/admin-manage-user", {
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
        data = { ok: false, message: trim(text) || ("The admin service returned " + response.status + ".") };
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
    setStatus("bad", trim(error && error.message || "") || "That admin action could not be completed.");
    return false;
  });
}








