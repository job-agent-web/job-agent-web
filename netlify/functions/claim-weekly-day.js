exports.handler = async function (event) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1Y2Z6bmppaXB6c2Zncm1qY2VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDUyNzQsImV4cCI6MjA5MTE4MTI3NH0.ggHJ1pcpeZyBVnCFSyodWMG3KOMaQ_LHp0PFIHoXrYA").trim();
  const authHeader = String(event.headers.authorization || event.headers.Authorization || "").trim();
  let authUser = null;
  let user = null;
  let metadata = null;
  let email = "";
  let role = "";
  let planType = "";
  let subscriptionStartedAt = "";
  let lockedPanes = [];
  let unlockedPanes = [];
  let paid = false;
  let weeklyBonusDays = 0;
  let weeklyFreeDayClaimedAt = "";
  let weeklyClaimPlanType = "";
  let lastClaimDate = null;
  let nextClaimDate = null;
  let response = null;

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, message: "Method not allowed." });
  }
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json(500, { ok: false, message: "Weekly free-day claims are not configured yet." });
  }
  if (!/^Bearer\s+/i.test(authHeader)) {
    return json(401, { ok: false, message: "Missing user session." });
  }

  try {
    authUser = await fetchSignedInUser(supabaseUrl, anonKey, authHeader);
    if (!authUser || !authUser.email) {
      return json(401, { ok: false, message: "User session is invalid." });
    }
    email = String(authUser.email || "").trim().toLowerCase();
    user = authUser && authUser.id ? await fetchAuthUserById(supabaseUrl, serviceRoleKey, authUser.id) : null;
    if (!user) {
      user = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
    }
    if (!user || !user.id) {
      return json(404, { ok: false, message: "That hosted user could not be found." });
    }

    metadata = Object.assign({}, user.user_metadata || {});
    role = normalizeRole(metadata.role || authUser.role);
    planType = normalizePlanType(metadata.plan_type || metadata.planType || metadata.plan || metadata.subscription_plan || metadata.subscriptionPlan || "free");
    subscriptionStartedAt = String(metadata.subscription_started_at || metadata.subscriptionStartedAt || metadata.plan_started_at || metadata.planStartedAt || user.created_at || authUser.created_at || "").trim();
    lockedPanes = normalizePaneLockList(metadata.locked_panes || metadata.lockedPanes || []);
    unlockedPanes = normalizePaneLockList(metadata.unlocked_panes || metadata.unlockedPanes || []);
    weeklyBonusDays = Math.max(0, Number(metadata.weekly_bonus_days || metadata.weeklyBonusDays || 0) || 0);
    weeklyFreeDayClaimedAt = String(metadata.weekly_free_day_claimed_at || metadata.weeklyFreeDayClaimedAt || "").trim();
    weeklyClaimPlanType = normalizePlanType(metadata.weekly_claim_plan_type || metadata.weeklyClaimPlanType || planType || "free");
    paid = role === "admin" || role === "super_admin" ? true : !!(planType && planType !== "free");

    if (role === "admin" || role === "super_admin" || subscriptionDurationDays(planType) === Infinity) {
      return json(200, { ok: false, message: "This extra weekly day is not needed on unlimited access accounts." });
    }

    if (weeklyFreeDayClaimedAt) {
      lastClaimDate = new Date(weeklyFreeDayClaimedAt);
      if (isFinite(lastClaimDate.getTime())) {
        nextClaimDate = new Date(lastClaimDate.getTime() + (7 * 86400000));
        if (nextClaimDate.getTime() > Date.now()) {
          return json(200, {
            ok: false,
            message: "This week's free day has already been claimed. You can claim again on " + formatDate(nextClaimDate) + "."
          });
        }
      }
    }

    weeklyBonusDays += 1;
    weeklyFreeDayClaimedAt = new Date().toISOString();
    metadata.weekly_bonus_days = weeklyBonusDays;
    metadata.weeklyBonusDays = weeklyBonusDays;
    metadata.weekly_free_day_claimed_at = weeklyFreeDayClaimedAt;
    metadata.weeklyFreeDayClaimedAt = weeklyFreeDayClaimedAt;
    metadata.plan_type = planType;
    metadata.planType = planType;
    metadata.subscription_started_at = subscriptionStartedAt;
    metadata.subscriptionStartedAt = subscriptionStartedAt;
    metadata.weekly_claim_plan_type = weeklyClaimPlanType;
    metadata.weeklyClaimPlanType = weeklyClaimPlanType;

    response = await fetch(supabaseUrl + "/auth/v1/admin/users/" + encodeURIComponent(user.id), {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey
      },
      body: JSON.stringify({
        user_metadata: metadata
      })
    });

    if (!response.ok) {
      return json(200, { ok: false, message: "The weekly free-day claim could not be saved right now." });
    }

    return json(200, {
      ok: true,
      message: "One free day has been added to your remaining access.",
      email: email,
      planType: planType,
      subscriptionStartedAt: subscriptionStartedAt,
      paid: paid,
      role: role,
      lockedPanes: lockedPanes,
      unlockedPanes: unlockedPanes,
      weeklyBonusDays: weeklyBonusDays,
      weeklyFreeDayClaimedAt: weeklyFreeDayClaimedAt,
      weeklyClaimPlanType: weeklyClaimPlanType,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return json(200, { ok: false, message: "The weekly free-day claim could not be saved right now." });
  }
};

async function fetchSignedInUser(supabaseUrl, anonKey, authHeader) {
  const response = await fetch(supabaseUrl + "/auth/v1/user", {
    headers: {
      apikey: anonKey,
      Authorization: authHeader
    }
  });
  if (!response.ok) {
    return null;
  }
  return await response.json();
}

async function fetchAuthUserById(supabaseUrl, serviceRoleKey, id) {
  const response = await fetch(supabaseUrl + "/auth/v1/admin/users/" + encodeURIComponent(String(id || "").trim()), {
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    }
  });
  const data = response.ok ? await response.json() : null;
  return data && data.user ? data.user : null;
}

async function findAuthUserByEmail(supabaseUrl, serviceRoleKey, email) {
  const users = await fetchAuthUsers(supabaseUrl, serviceRoleKey);
  let i;
  for (i = 0; i < users.length; i += 1) {
    if (String(users[i].email || "").toLowerCase() === email) {
      return users[i];
    }
  }
  return null;
}

async function fetchAuthUsers(supabaseUrl, serviceRoleKey) {
  const response = await fetch(supabaseUrl + "/auth/v1/admin/users?page=1&per_page=200", {
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    }
  });
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return data && data.users ? data.users : [];
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

function subscriptionDurationDays(plan) {
  plan = normalizePlanType(plan);
  if (plan === "monthly" || plan === "month" || plan === "1 month" || plan === "one month" || plan === "one month subscription" || plan === "monthly subscription" || plan === "1 month subscription") {
    return 30;
  }
  if (plan === "6 months" || plan === "six months" || plan === "6 month" || plan === "six month" || plan === "6months" || plan === "6months subscription" || plan === "6 month subscription" || plan === "6 month plan") {
    return 183;
  }
  if (plan === "yearly" || plan === "annual" || plan === "annual plan" || plan === "year" || plan === "12 months" || plan === "12 month" || plan === "12months" || plan === "12 month subscription" || plan === "12 months subscription" || plan === "one year" || plan === "one year subscription" || plan === "1 year" || plan === "1 year subscription") {
    return 365;
  }
  if (plan === "lifetime" || plan === "life time" || plan === "lifetime access" || plan === "premium" || plan === "premium access") {
    return Infinity;
  }
  return 7;
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

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value || "");
  if (!isFinite(date.getTime())) {
    return "";
  }
  try {
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch (error) {
    return date.toISOString().slice(0, 10);
  }
}

function json(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}
