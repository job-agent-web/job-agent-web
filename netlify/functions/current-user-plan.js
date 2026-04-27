exports.handler = async function (event) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1Y2Z6bmppaXB6c2Zncm1qY2VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDUyNzQsImV4cCI6MjA5MTE4MTI3NH0.ggHJ1pcpeZyBVnCFSyodWMG3KOMaQ_LHp0PFIHoXrYA").trim();
  const authHeader = String(event.headers.authorization || event.headers.Authorization || "").trim();
  let authUser = null;
  let usageRow = null;
  let user = null;
  let planType = "";
  let subscriptionStartedAt = "";
  let paid = false;
  let lockedPanes = [];
  let unlockedPanes = [];
  let weeklyBonusDays = 0;
  let weeklyFreeDayClaimedAt = "";
  let weeklyClaimPlanType = "";

  if (event.httpMethod !== "GET") {
    return json(405, { ok: false, message: "Method not allowed." });
  }
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json(500, { ok: false, message: "User plan lookup is not configured yet." });
  }
  if (!/^Bearer\s+/i.test(authHeader)) {
    return json(401, { ok: false, message: "Missing user session." });
  }

  try {
    authUser = await fetchSignedInUser(supabaseUrl, anonKey, authHeader);
    if (!authUser || !authUser.email) {
      return json(401, { ok: false, message: "User session is invalid." });
    }
    user = authUser && authUser.id ? await fetchAuthUserById(supabaseUrl, serviceRoleKey, authUser.id) : null;
    if (!user) {
      user = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, String(authUser.email || "").trim().toLowerCase());
    }
    usageRow = await fetchUsageRow(supabaseUrl, serviceRoleKey, String(authUser.email || "").trim().toLowerCase());
    planType = normalizePlanType(
      user && user.user_metadata && (
        user.user_metadata.plan_type ||
        user.user_metadata.planType ||
        user.user_metadata.plan ||
        user.user_metadata.subscription_plan ||
        user.user_metadata.subscriptionPlan
      ) ||
      (usageRow && (usageRow.plan_type || usageRow.planType)) ||
      "free"
    );
    subscriptionStartedAt = String(
      user && user.user_metadata && (
        user.user_metadata.subscription_started_at ||
        user.user_metadata.subscriptionStartedAt ||
        user.user_metadata.plan_started_at ||
        user.user_metadata.planStartedAt
      ) ||
      (usageRow && (usageRow.subscription_started_at || usageRow.subscriptionStartedAt)) ||
      (user && user.created_at) ||
      (authUser && authUser.created_at) ||
      ""
    ).trim();
    paid = !!(usageRow && usageRow.is_paid) || !!(planType && planType !== "free");
    lockedPanes = normalizePaneLockList(
      (user && user.user_metadata && (user.user_metadata.locked_panes || user.user_metadata.lockedPanes)) ||
      (usageRow && (usageRow.locked_panes || usageRow.lockedPanes))
    );
    unlockedPanes = normalizePaneLockList(
      (user && user.user_metadata && (user.user_metadata.unlocked_panes || user.user_metadata.unlockedPanes)) ||
      (usageRow && (usageRow.unlocked_panes || usageRow.unlockedPanes))
    );
    weeklyBonusDays = Math.max(0, Number(
      (user && user.user_metadata && (user.user_metadata.weekly_bonus_days || user.user_metadata.weeklyBonusDays)) ||
      (usageRow && (usageRow.weekly_bonus_days || usageRow.weeklyBonusDays)) || 0
    ) || 0);
    weeklyFreeDayClaimedAt = String(
      (user && user.user_metadata && (user.user_metadata.weekly_free_day_claimed_at || user.user_metadata.weeklyFreeDayClaimedAt)) ||
      (usageRow && (usageRow.weekly_free_day_claimed_at || usageRow.weeklyFreeDayClaimedAt)) || ""
    ).trim();
    weeklyClaimPlanType = normalizePlanType(
      (user && user.user_metadata && (user.user_metadata.weekly_claim_plan_type || user.user_metadata.weeklyClaimPlanType)) ||
      (usageRow && (usageRow.weekly_claim_plan_type || usageRow.weeklyClaimPlanType)) ||
      planType
    );
    if (!paid && planType && planType !== "free") {
      paid = true;
    }
    if (!subscriptionStartedAt && paid) {
      subscriptionStartedAt = String((user && user.created_at) || (authUser && authUser.created_at) || "").trim();
    }
    return json(200, {
      ok: true,
      email: String(authUser.email || "").trim().toLowerCase(),
      planType: planType,
      subscriptionStartedAt: subscriptionStartedAt,
      paid: paid,
      role: normalizeRole(user && user.user_metadata ? user.user_metadata.role : authUser.role),
      lockedPanes: lockedPanes,
      unlockedPanes: unlockedPanes,
      weeklyBonusDays: weeklyBonusDays,
      weeklyFreeDayClaimedAt: weeklyFreeDayClaimedAt,
      weeklyClaimPlanType: weeklyClaimPlanType
    });
  } catch (error) {
    return json(200, { ok: false, message: "Could not refresh the user subscription right now." });
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

async function fetchUsageRow(supabaseUrl, serviceRoleKey, email) {
  let response = await fetch(supabaseUrl + "/rest/v1/user_usage?email=eq." + encodeURIComponent(email) + "&select=email,is_paid,plan_type,subscription_started_at,user_role,locked_panes,unlocked_panes,weekly_bonus_days,weekly_free_day_claimed_at,weekly_claim_plan_type,updated_at&order=updated_at.desc.nullslast&limit=1", {
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    }
  });
  if (!response.ok) {
    response = await fetch(supabaseUrl + "/rest/v1/user_usage?email=eq." + encodeURIComponent(email) + "&select=email,is_paid,plan_type,subscription_started_at,user_role,updated_at&limit=1", {
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey
      }
    });
  }
  let rows = null;
  if (!response.ok) {
    return null;
  }
  rows = await response.json();
  return rows && rows.length ? rows[0] : null;
}

function normalizePlanType(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "admin" || role === "super_admin") {
    return role;
  }
  return "user";
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
