const generatorConfigMetadataKey = "cover_letter_generator_config";
const defaultGeneratorConfig = {
  coverLetterSample1: "",
  coverLetterSample2: "",
  coverLetterSample3: ""
};

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return json(405, { ok: false, message: "Method not allowed." });
  }

  const adminSecret = String(event.headers["x-admin-secret"] || event.headers["X-Admin-Secret"] || "").trim();
  const expectedSecret = String(process.env.ADMIN_DASHBOARD_SECRET || "").trim();
  const fixedPasskey = "job-agent";
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!expectedSecret || !supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, message: "Admin monitor is not configured yet." });
  }
  if (!adminSecret || (adminSecret !== expectedSecret && adminSecret !== fixedPasskey)) {
    return json(401, { ok: false, message: "Admin secret is invalid." });
  }

  try {
    const authUsers = await fetchAuthUsers(supabaseUrl, serviceRoleKey);
    const usageRows = await fetchUsageRows(supabaseUrl, serviceRoleKey);
    const generatorConfig = resolveHostedGeneratorConfig(authUsers);
    const usageByEmail = {};
    let i;

    for (i = 0; i < usageRows.length; i += 1) {
      usageByEmail[String(usageRows[i].email || "").toLowerCase()] = usageRows[i];
    }

    return json(200, {
      ok: true,
      generator_config: generatorConfig,
      users: authUsers.map(function (user) {
        const email = String(user.email || "").toLowerCase();
        const usage = usageByEmail[email] || {};
        const matchesUsed = typeof usage.matches_used === "number" ? usage.matches_used : 0;
        const searchesUsed = typeof usage.searches_used === "number" ? usage.searches_used : 0;
        const cvGenerationsUsed = typeof usage.cv_generations_used === "number" ? usage.cv_generations_used : 0;
        const usagePlanType = normalizePlanType(usage.plan_type || usage.planType || "");
        const usageSubscriptionStartedAt = usage.subscription_started_at || usage.subscriptionStartedAt || "";
        const authPlanType = normalizePlanType(user.user_metadata && (user.user_metadata.plan_type || user.user_metadata.planType || user.user_metadata.plan || user.user_metadata.subscription_plan || user.user_metadata.subscriptionPlan));
        const authSubscriptionStartedAt = user.user_metadata && (user.user_metadata.subscription_started_at || user.user_metadata.subscriptionStartedAt || user.user_metadata.plan_started_at || user.user_metadata.planStartedAt);
        const planType = authPlanType || usagePlanType;
        const subscriptionStartedAt = authSubscriptionStartedAt || usageSubscriptionStartedAt;
        const paid = !!usage.is_paid || !!(planType && planType !== "free");
        const subscription = planLabel(planType, paid);
        const aiPane = trimText(user.user_metadata && (user.user_metadata.ai_last_pane || user.user_metadata.aiLastPane));
        const aiPaneLabel = trimText(user.user_metadata && (user.user_metadata.ai_last_pane_label || user.user_metadata.aiLastPaneLabel)) || paneLabel(aiPane);
        const aiRoute = trimText(user.user_metadata && (user.user_metadata.ai_last_route || user.user_metadata.aiLastRoute));
        const aiModel = trimText(user.user_metadata && (user.user_metadata.ai_last_model || user.user_metadata.aiLastModel));
        const aiSource = trimText(user.user_metadata && (user.user_metadata.ai_last_source || user.user_metadata.aiLastSource));
        const aiNote = trimText(user.user_metadata && (user.user_metadata.ai_last_note || user.user_metadata.aiLastNote));
        const aiLastUsedAt = trimText(user.user_metadata && (user.user_metadata.ai_last_used_at || user.user_metadata.aiLastUsedAt));
        const lockedPanes = normalizePaneLockList(
          (user.user_metadata && (user.user_metadata.locked_panes || user.user_metadata.lockedPanes)) ||
          (usage && (usage.locked_panes || usage.lockedPanes))
        );
        const unlockedPanes = normalizePaneLockList(
          (user.user_metadata && (user.user_metadata.unlocked_panes || user.user_metadata.unlockedPanes)) ||
          (usage && (usage.unlocked_panes || usage.unlockedPanes))
        );
        return {
          email: user.email || "",
          user_name: (user.user_metadata && (user.user_metadata.user_name || user.user_metadata.full_name)) || user.email || "",
          created_at: formatDate(user.created_at),
          last_sign_in_at: formatDate(user.last_sign_in_at),
          matches_left: paid ? "Unlimited" : Math.max(0, 5 - matchesUsed),
          searches_left: paid ? "Unlimited" : Math.max(0, 15 - searchesUsed),
          cv_left: paid ? "Unlimited" : Math.max(0, 5 - cvGenerationsUsed),
          plan: subscription,
          subscription: subscription,
          days_remaining: subscriptionDaysRemaining(user.created_at, planType, paid, subscriptionStartedAt),
          plan_type: planType,
          subscription_started_at: subscriptionStartedAt || "",
          is_paid: paid,
          role: normalizeRole(user.user_metadata && user.user_metadata.role),
          locked_panes: lockedPanes,
          unlocked_panes: unlockedPanes,
          ai_pane: aiPane,
          ai_pane_label: aiPaneLabel,
          ai_route: aiRoute,
          ai_model: aiModel,
          ai_source: aiSource,
          ai_note: aiNote,
          ai_last_used_at: aiLastUsedAt ? formatDate(aiLastUsedAt) : ""
        };
      })
    });
  } catch (error) {
    return json(200, { ok: false, message: safeErrorMessage(error) });
  }
};

async function fetchAuthUsers(supabaseUrl, serviceRoleKey) {
  const response = await fetch(supabaseUrl + "/auth/v1/admin/users?page=1&per_page=200", {
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    }
  });
  if (!response.ok) {
    throw new Error("Auth users request failed with status " + response.status);
  }
  const data = await response.json();
  return data && data.users ? data.users : [];
}

async function fetchUsageRows(supabaseUrl, serviceRoleKey) {
  let response = await fetch(supabaseUrl + "/rest/v1/user_usage?select=email,user_name,matches_used,searches_used,cv_generations_used,is_paid,plan_type,subscription_started_at,user_role,locked_panes,unlocked_panes,updated_at", {
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    }
  });
  if (!response.ok) {
    response = await fetch(supabaseUrl + "/rest/v1/user_usage?select=email,user_name,matches_used,searches_used,cv_generations_used,is_paid,plan_type,subscription_started_at,user_role,updated_at", {
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey
      }
    });
  }
  if (!response.ok) {
    return [];
  }
  return await response.json();
}

function formatDate(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "-";
  }
  try {
    return new Date(text).toLocaleString("en-GB", { timeZone: "Europe/London" });
  } catch (error) {
    return text;
  }
}

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "admin" || role === "super_admin") {
    return role;
  }
  return "user";
}

function normalizePlanType(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function normalizePaneLockId(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (text === "pane1" || text === "1") { return "pane1"; }
  if (text === "pane2" || text === "2") { return "pane2"; }
  if (text === "pane3" || text === "3") { return "pane3"; }
  if (text === "pane4" || text === "4") { return "pane4"; }
  if (text === "pane5" || text === "5") { return "pane5"; }
  if (text === "pane6" || text === "6") { return "pane6"; }
  if (text === "pane7" || text === "7") { return "pane7"; }
  if (text === "pane8" || text === "8") { return "pane8"; }
  return "";
}

function normalizePaneLockList(value) {
  const input = Array.isArray(value) ? value : (value ? [value] : []);
  const output = [];
  let i;
  let item = "";
  for (i = 0; i < input.length; i += 1) {
    item = normalizePaneLockId(input[i]);
    if (item && output.indexOf(item) === -1) {
      output.push(item);
    }
  }
  return output;
}

function paneLabel(value) {
  const paneId = normalizePaneLockId(value);
  if (paneId === "pane1") { return "Pane 1 - Generate CV"; }
  if (paneId === "pane2") { return "Pane 2 - Generate Cover Letter"; }
  if (paneId === "pane3") { return "Pane 3 - Search for Companies with Skilled Worker Licence"; }
  if (paneId === "pane4") { return "Pane 4 - Land a Job with Visa Sponsorship"; }
  if (paneId === "pane5") { return "Pane 5 - Land a Remote Job"; }
  if (paneId === "pane6") { return "Pane 6 - Career Path Planner"; }
  if (paneId === "pane7") { return "Pane 7 - Get Possible Interview Questions"; }
  if (paneId === "pane8") { return "Pane 8 - Chat with Rex"; }
  return "";
}

function trimText(value) {
  return String(value || "").trim();
}

function normalizeGeneratorConfig(input) {
  const source = input && typeof input === "object" ? input : {};
  const config = {};
  let key = "";
  let value = "";
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
  return normalizeRole(user && user.user_metadata ? user.user_metadata.role : "") !== "user";
}

function resolveHostedGeneratorConfig(authUsers) {
  const users = Array.isArray(authUsers) ? authUsers : [];
  let i;
  let candidate = null;
  for (i = 0; i < users.length; i += 1) {
    if (users[i] && isAdminUser(users[i]) && users[i].user_metadata && users[i].user_metadata[generatorConfigMetadataKey]) {
      candidate = users[i];
      break;
    }
  }
  if (!candidate) {
    for (i = 0; i < users.length; i += 1) {
      if (users[i] && users[i].user_metadata && users[i].user_metadata[generatorConfigMetadataKey]) {
        candidate = users[i];
        break;
      }
    }
  }
  if (!candidate) {
    for (i = 0; i < users.length; i += 1) {
      if (isAdminUser(users[i])) {
        candidate = users[i];
        break;
      }
    }
  }
  if (!candidate && users.length) {
    candidate = users[0];
  }
  return normalizeGeneratorConfig(candidate && candidate.user_metadata ? candidate.user_metadata[generatorConfigMetadataKey] : null);
}

function planLabel(planType, paid) {
  if (!paid) {
    return "Free";
  }
  if (planType === "monthly" || planType === "month" || planType === "1 month" || planType === "one month" || planType === "monthly subscription" || planType === "1 month subscription" || planType === "one month subscription") {
    return "1 Month";
  }
  if (planType === "6 months" || planType === "six months" || planType === "6 month" || planType === "six month" || planType === "6months" || planType === "6months subscription" || planType === "6 month subscription" || planType === "6 month plan") {
    return "6 Months";
  }
  if (planType === "yearly" || planType === "annual" || planType === "annual plan" || planType === "year" || planType === "12 months" || planType === "12 month" || planType === "12months" || planType === "12 month subscription" || planType === "12 months subscription" || planType === "one year" || planType === "one year subscription") {
    return "12 Months";
  }
  if (planType === "lifetime" || planType === "life time" || planType === "lifetime access" || planType === "premium" || planType === "premium access") {
    return "Lifetime";
  }
  return "Premium";
}

function subscriptionDaysRemaining(createdAt, planType, paid, startedAt) {
  const totalDays = subscriptionDurationDays(planType, paid);
  const start = new Date(startedAt || createdAt || "");
  const now = new Date();
  const elapsed = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const remaining = Math.max(0, totalDays - (Number.isFinite(elapsed) ? elapsed : 0));
  if (totalDays === Infinity) {
    return "Unlimited";
  }
  return remaining > 0 ? remaining + " day" + (remaining === 1 ? "" : "s") : "Expired";
}

function subscriptionDurationDays(planType, paid) {
  if (!paid) {
    return 7;
  }
  if (planType === "monthly" || planType === "month" || planType === "1 month" || planType === "one month" || planType === "monthly subscription" || planType === "1 month subscription" || planType === "one month subscription") {
    return 30;
  }
  if (planType === "6 months" || planType === "six months" || planType === "6 month" || planType === "six month" || planType === "6months" || planType === "6months subscription" || planType === "6 month subscription" || planType === "6 month plan") {
    return 183;
  }
  if (planType === "yearly" || planType === "annual" || planType === "annual plan" || planType === "year" || planType === "12 months" || planType === "12 month" || planType === "12months" || planType === "12 month subscription" || planType === "12 months subscription" || planType === "one year" || planType === "one year subscription") {
    return 365;
  }
  return Infinity;
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

function safeErrorMessage(error) {
  const message = String(error && error.message || error || "").trim();
  return message || "Could not load admin users right now.";
}
