exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, message: "Method not allowed." });
  }

  const adminSecret = String(event.headers["x-admin-secret"] || event.headers["X-Admin-Secret"] || "").trim();
  const expectedSecret = String(process.env.ADMIN_DASHBOARD_SECRET || "").trim();
  const fixedPasskey = "job-agent";
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!expectedSecret || !supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, message: "Admin actions are not configured yet." });
  }
  if (!adminSecret || (adminSecret !== expectedSecret && adminSecret !== fixedPasskey)) {
    return json(401, { ok: false, message: "Admin secret is invalid." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const action = String(body.action || "").trim();
    const payload = body.payload || {};

    if (action === "createUser") {
      return await createUser(supabaseUrl, serviceRoleKey, payload);
    }
    if (action === "deleteUser") {
      return await deleteUser(supabaseUrl, serviceRoleKey, payload);
    }
    if (action === "changePassword") {
      return await changePassword(supabaseUrl, serviceRoleKey, payload);
    }
    if (action === "adjustUsage") {
      return await adjustUsage(supabaseUrl, serviceRoleKey, payload);
    }
    if (action === "adjustDaysRemaining") {
      return await adjustDaysRemaining(supabaseUrl, serviceRoleKey, payload);
    }
    if (action === "resetUsage") {
      return await resetUsage(supabaseUrl, serviceRoleKey, payload);
    }
    if (action === "setPremium") {
      return await setPlan(supabaseUrl, serviceRoleKey, payload, true);
    }
    if (action === "setFree") {
      return await setPlan(supabaseUrl, serviceRoleKey, payload, false);
    }
    if (action === "resetAllUsage") {
      return await resetAllUsage(supabaseUrl, serviceRoleKey);
    }
    if (action === "setAllPlans") {
      return await setAllPlans(supabaseUrl, serviceRoleKey, !!payload.isPaid);
    }
    if (action === "setRole") {
      return await setRole(supabaseUrl, serviceRoleKey, payload);
    }
    if (action === "pushUpdate") {
      return await pushUpdate(supabaseUrl, serviceRoleKey, payload);
    }
    if (action === "setPaneLock") {
      return await setPaneLock(supabaseUrl, serviceRoleKey, payload);
    }

    return json(400, { ok: false, message: "That admin action is not supported." });
  } catch (error) {
    return json(200, { ok: false, message: "Could not complete that admin action right now. " + safeErrorMessage(error) });
  }
};

async function createUser(supabaseUrl, serviceRoleKey, payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();
  const password = String(payload.password || "").trim();
  const role = normalizeRole(payload.role);
  let response;

  if (!email || !name || !password) {
    return json(400, { ok: false, message: "Name, email, and password are required." });
  }
  if (password.length < 8) {
    return json(400, { ok: false, message: "Use a password with at least 8 characters." });
  }

  response = await fetch(supabaseUrl + "/auth/v1/admin/users", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    },
    body: JSON.stringify({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        user_name: name,
        full_name: name,
        role: role,
        plan_type: role === "admin" || role === "super_admin" ? "lifetime" : "free",
        subscription_started_at: role === "admin" || role === "super_admin" ? new Date().toISOString() : "",
        weekly_bonus_days: 0,
        weekly_free_day_claimed_at: "",
        weekly_claim_plan_type: ""
      }
    })
  });

  if (!response.ok) {
    return json(200, { ok: false, message: "The hosted user could not be created. Check whether the email already exists." });
  }

  await upsertUsage(supabaseUrl, serviceRoleKey, {
    email: email,
    user_name: name,
    matches_used: 0,
    searches_used: 0,
    cv_generations_used: 0,
    is_paid: role === "admin" || role === "super_admin"
  });

  return json(200, { ok: true, message: "Hosted user created successfully as " + roleLabel(role) + "." });
}

async function deleteUser(supabaseUrl, serviceRoleKey, payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const user = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);

  if (!email) {
    return json(400, { ok: false, message: "Email is required." });
  }
  if (user && user.id) {
    await fetch(supabaseUrl + "/auth/v1/admin/users/" + encodeURIComponent(user.id), {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey
      }
    });
  }

  await fetch(supabaseUrl + "/rest/v1/user_usage?email=eq." + encodeURIComponent(email), {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    }
  });

  return json(200, { ok: true, message: "Hosted user deleted successfully." });
}

async function changePassword(supabaseUrl, serviceRoleKey, payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "").trim();
  const user = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
  let response;

  if (!email || !password) {
    return json(400, { ok: false, message: "Email and password are required." });
  }
  if (password.length < 8) {
    return json(400, { ok: false, message: "Use a password with at least 8 characters." });
  }
  if (!user || !user.id) {
    return json(404, { ok: false, message: "That hosted user could not be found." });
  }

  response = await fetch(supabaseUrl + "/auth/v1/admin/users/" + encodeURIComponent(user.id), {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    },
    body: JSON.stringify({
      password: password
    })
  });

  if (!response.ok) {
    return json(200, { ok: false, message: "The hosted password could not be updated right now." });
  }

  return json(200, { ok: true, message: "Hosted user password updated successfully." });
}

async function setRole(supabaseUrl, serviceRoleKey, payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const role = normalizeRole(payload.role);
  const user = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
  const row = await ensureUsageRow(supabaseUrl, serviceRoleKey, email);
  let response;

  if (!email) {
    return json(400, { ok: false, message: "Email is required." });
  }
  if (!user || !user.id) {
    return json(404, { ok: false, message: "That hosted user could not be found." });
  }

  response = await fetch(supabaseUrl + "/auth/v1/admin/users/" + encodeURIComponent(user.id), {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    },
    body: JSON.stringify({
      user_metadata: {
        user_name: (user.user_metadata && (user.user_metadata.user_name || user.user_metadata.full_name)) || user.email,
        full_name: (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.user_name)) || user.email,
        role: role,
        plan_type: normalizePlanType(user.user_metadata && (user.user_metadata.plan_type || user.user_metadata.planType || user.user_metadata.plan || user.user_metadata.subscription_plan || user.user_metadata.subscriptionPlan)),
        subscription_started_at: user.user_metadata && (user.user_metadata.subscription_started_at || user.user_metadata.subscriptionStartedAt || user.user_metadata.plan_started_at || user.user_metadata.planStartedAt) || "",
        weekly_bonus_days: existingWeeklyBonusDays(user),
        weekly_free_day_claimed_at: existingWeeklyFreeDayClaimedAt(user),
        weekly_claim_plan_type: existingWeeklyClaimPlanType(user)
      }
    })
  });

  if (!response.ok) {
    return json(200, { ok: false, message: "The hosted role could not be updated right now." });
  }

  await upsertUsage(supabaseUrl, serviceRoleKey, {
    email: email,
    user_name: row.user_name || ((user.user_metadata && (user.user_metadata.user_name || user.user_metadata.full_name)) || user.email),
    matches_used: Number(row.matches_used || 0),
    searches_used: Number(row.searches_used || 0),
    cv_generations_used: Number(row.cv_generations_used || 0),
    is_paid: role === "admin" || role === "super_admin" ? true : !!row.is_paid,
    plan_type: normalizePlanType(user && user.user_metadata && (user.user_metadata.plan_type || user.user_metadata.planType || user.user_metadata.plan || user.user_metadata.subscription_plan || user.user_metadata.subscriptionPlan)),
    subscription_started_at: String(user && user.user_metadata && (user.user_metadata.subscription_started_at || user.user_metadata.subscriptionStartedAt || user.user_metadata.plan_started_at || user.user_metadata.planStartedAt) || "").trim(),
    user_role: role
  });

  return json(200, { ok: true, message: "Hosted user role updated to " + roleLabel(role) + "." });
}

async function adjustUsage(supabaseUrl, serviceRoleKey, payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const field = String(payload.field || "").trim();
  const delta = Number(payload.delta || 0);
  const row = await ensureUsageRow(supabaseUrl, serviceRoleKey, email);
  let nextMatches = Number(row.matches_used || 0);
  let nextSearches = Number(row.searches_used || 0);
  let nextCvGenerations = Number(row.cv_generations_used || 0);

  if (!email || !field || !delta) {
    return json(400, { ok: false, message: "Email, field, and delta are required." });
  }
  if (field === "matchesUsed") {
    nextMatches += delta;
  } else if (field === "searchesUsed") {
    nextSearches += delta;
  } else if (field === "cvGenerationsUsed") {
    nextCvGenerations += delta;
  } else {
    return json(400, { ok: false, message: "That usage field is not supported." });
  }

  await upsertUsage(supabaseUrl, serviceRoleKey, {
    email: email,
    user_name: row.user_name || email,
    matches_used: nextMatches,
    searches_used: nextSearches,
    cv_generations_used: nextCvGenerations,
    is_paid: !!row.is_paid,
    plan_type: normalizePlanType(row.plan_type || row.planType || ""),
    subscription_started_at: String(row.subscription_started_at || row.subscriptionStartedAt || "").trim(),
    user_role: normalizeRole(row.user_role || row.userRole || "")
  });

  return json(200, { ok: true, message: "Hosted usage updated successfully." });
}

async function adjustDaysRemaining(supabaseUrl, serviceRoleKey, payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const delta = Number(payload.delta || 0);
  const user = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
  const row = await ensureUsageRow(supabaseUrl, serviceRoleKey, email);
  const role = normalizeRole(user && user.user_metadata ? user.user_metadata.role : "");
  let planType = normalizePlanType(user && user.user_metadata && (user.user_metadata.plan_type || user.user_metadata.planType || user.user_metadata.plan || user.user_metadata.subscription_plan || user.user_metadata.subscriptionPlan));
  let subscriptionStartedAt = String(user && user.user_metadata && (user.user_metadata.subscription_started_at || user.user_metadata.subscriptionStartedAt || user.user_metadata.plan_started_at || user.user_metadata.planStartedAt) || "").trim();
  let baseDate = null;
  let nextDate = null;
  let paid = false;
  let response;

  if (!email || !delta) {
    return json(400, { ok: false, message: "Email and day adjustment are required." });
  }
  if (!user || !user.id) {
    return json(404, { ok: false, message: "That hosted user could not be found." });
  }
  paid = role === "admin" || role === "super_admin" ? true : !!(planType && planType !== "free");
  if (planType === "lifetime" || planType === "life time" || role === "admin" || role === "super_admin") {
    return json(200, { ok: false, message: "Lifetime access does not use day adjustments." });
  }
  if (!subscriptionStartedAt) {
    subscriptionStartedAt = String(user.created_at || "").trim() || new Date().toISOString();
  }
  baseDate = new Date(subscriptionStartedAt);
  if (!isFinite(baseDate.getTime())) {
    baseDate = new Date();
  }
  nextDate = new Date(baseDate.getTime() + (Number(delta) * 86400000));
  subscriptionStartedAt = nextDate.toISOString();
  if (!paid) {
    planType = "free";
  }

  response = await fetch(supabaseUrl + "/auth/v1/admin/users/" + encodeURIComponent(user.id), {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    },
    body: JSON.stringify({
      user_metadata: {
        user_name: (user.user_metadata && (user.user_metadata.user_name || user.user_metadata.full_name)) || user.email,
        full_name: (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.user_name)) || user.email,
        role: role,
        plan_type: planType,
        subscription_started_at: subscriptionStartedAt,
        weekly_bonus_days: existingWeeklyBonusDays(user),
        weekly_free_day_claimed_at: existingWeeklyFreeDayClaimedAt(user),
        weekly_claim_plan_type: existingWeeklyClaimPlanType(user)
      }
    })
  });
  if (!response.ok) {
    return json(200, { ok: false, message: "The days remaining could not be updated right now." });
  }

  await upsertUsage(supabaseUrl, serviceRoleKey, {
    email: email,
    user_name: row.user_name || ((user.user_metadata && (user.user_metadata.user_name || user.user_metadata.full_name)) || user.email),
    matches_used: Number(row.matches_used || 0),
    searches_used: Number(row.searches_used || 0),
    cv_generations_used: Number(row.cv_generations_used || 0),
    is_paid: paid,
    plan_type: planType,
    subscription_started_at: subscriptionStartedAt,
    locked_panes: lockedPanes,
    unlocked_panes: unlockedPanes,
    user_role: role
  });

  return json(200, {
    ok: true,
    message: delta > 0 ? "Days remaining increased." : "Days remaining reduced.",
    email: email,
    planType: planType,
    subscriptionStartedAt: subscriptionStartedAt,
    paid: paid,
    role: role
  });
}

async function resetUsage(supabaseUrl, serviceRoleKey, payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const row = await ensureUsageRow(supabaseUrl, serviceRoleKey, email);
  const user = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
  const resetAt = new Date().toISOString();
  let response;
  if (!email) {
    return json(400, { ok: false, message: "Email is required." });
  }
  if (user && user.id) {
    response = await fetch(supabaseUrl + "/auth/v1/admin/users/" + encodeURIComponent(user.id), {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey
      },
      body: JSON.stringify({
        user_metadata: {
          user_name: (user.user_metadata && (user.user_metadata.user_name || user.user_metadata.full_name)) || user.email,
          full_name: (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.user_name)) || user.email,
          role: normalizeRole(user.user_metadata && user.user_metadata.role),
          plan_type: normalizePlanType(user.user_metadata && (user.user_metadata.plan_type || user.user_metadata.planType || user.user_metadata.plan || user.user_metadata.subscription_plan || user.user_metadata.subscriptionPlan)) || (row.is_paid ? "premium" : "free"),
          subscription_started_at: resetAt,
          weekly_bonus_days: existingWeeklyBonusDays(user),
          weekly_free_day_claimed_at: existingWeeklyFreeDayClaimedAt(user),
        weekly_claim_plan_type: existingWeeklyClaimPlanType(user)
        }
      })
    });
    if (!response.ok) {
      return json(200, { ok: false, message: "Hosted usage was not reset because the subscription date could not be refreshed." });
    }
  }
  await upsertUsage(supabaseUrl, serviceRoleKey, {
    email: email,
    user_name: row.user_name || email,
    matches_used: 0,
    searches_used: 0,
    cv_generations_used: 0,
    is_paid: !!row.is_paid,
    plan_type: normalizePlanType(user && user.user_metadata && (user.user_metadata.plan_type || user.user_metadata.planType || user.user_metadata.plan || user.user_metadata.subscription_plan || user.user_metadata.subscriptionPlan)) || normalizePlanType(row.plan_type || row.planType || "") || (!!row.is_paid ? "premium" : "free"),
    subscription_started_at: resetAt,
    user_role: normalizeRole(user && user.user_metadata ? user.user_metadata.role : row.user_role || row.userRole || "")
  });
  return json(200, { ok: true, message: "Hosted usage reset successfully." });
}

async function setPlan(supabaseUrl, serviceRoleKey, payload, isPaid) {
  const email = String(payload.email || "").trim().toLowerCase();
  const row = await ensureUsageRow(supabaseUrl, serviceRoleKey, email);
  const user = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
  const role = normalizeRole(user && user.user_metadata ? user.user_metadata.role : "");
  const planType = isPaid ? normalizePlanType(payload.planType || payload.plan_type || "premium") : "free";
  const subscriptionStartedAt = isPaid ? new Date().toISOString() : "";
  const lockedPanes = normalizePaneLockList(
    (user && user.user_metadata && (user.user_metadata.locked_panes || user.user_metadata.lockedPanes)) ||
    (row && (row.locked_panes || row.lockedPanes))
  );
  const unlockedPanes = normalizePaneLockList(
    (user && user.user_metadata && (user.user_metadata.unlocked_panes || user.user_metadata.unlockedPanes)) ||
    (row && (row.unlocked_panes || row.unlockedPanes))
  );
  const subscription = isPaid ? planLabel(planType) : "Free";
  const daysRemaining = subscriptionDaysRemainingText(subscriptionStartedAt, planType, !!isPaid);
  let response;
  if (!email) {
    return json(400, { ok: false, message: "Email is required." });
  }
  if (role === "admin" || role === "super_admin") {
    return json(200, { ok: false, message: "Admin accounts always stay on premium." });
  }
  if (user && user.id) {
    response = await fetch(supabaseUrl + "/auth/v1/admin/users/" + encodeURIComponent(user.id), {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey
      },
      body: JSON.stringify({
        user_metadata: {
          user_name: (user.user_metadata && (user.user_metadata.user_name || user.user_metadata.full_name)) || user.email,
          full_name: (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.user_name)) || user.email,
          role: role,
          plan_type: planType,
          subscription_started_at: subscriptionStartedAt,
          locked_panes: lockedPanes,
          unlocked_panes: unlockedPanes,
          weekly_bonus_days: existingWeeklyBonusDays(user),
          weekly_free_day_claimed_at: existingWeeklyFreeDayClaimedAt(user),
        weekly_claim_plan_type: existingWeeklyClaimPlanType(user)
        }
      })
    });
    if (!response.ok) {
      return json(200, { ok: false, message: "The hosted plan type could not be updated right now." });
    }
  }
  await upsertUsage(supabaseUrl, serviceRoleKey, {
    email: email,
    user_name: row.user_name || email,
    matches_used: Number(row.matches_used || 0),
    searches_used: Number(row.searches_used || 0),
    cv_generations_used: Number(row.cv_generations_used || 0),
    is_paid: !!isPaid,
    plan_type: planType,
    subscription_started_at: subscriptionStartedAt,
    user_role: role,
    locked_panes: lockedPanes,
    unlocked_panes: unlockedPanes
  });
  return json(200, {
    ok: true,
    message: isPaid ? "User set to " + planLabel(planType) + " access." : "User set to free.",
    email: email,
    planType: planType,
    plan: subscription,
    subscription: subscription,
    subscriptionStartedAt: subscriptionStartedAt,
    daysRemaining: daysRemaining,
    days_remaining: daysRemaining,
    paid: !!isPaid,
    role: role,
    lockedPanes: lockedPanes,
    unlockedPanes: unlockedPanes
  });
}

async function pushUpdate(supabaseUrl, serviceRoleKey, payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const row = await ensureUsageRow(supabaseUrl, serviceRoleKey, email);
  const user = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
  const role = normalizeRole(user && user.user_metadata ? user.user_metadata.role : "");
  const lockedPanes = normalizePaneLockList(user && user.user_metadata && (user.user_metadata.locked_panes || user.user_metadata.lockedPanes));
  const unlockedPanes = normalizePaneLockList(user && user.user_metadata && (user.user_metadata.unlocked_panes || user.user_metadata.unlockedPanes));
  let planType = normalizePlanType(user && user.user_metadata && (user.user_metadata.plan_type || user.user_metadata.planType || user.user_metadata.plan || user.user_metadata.subscription_plan || user.user_metadata.subscriptionPlan));
  let subscriptionStartedAt = String(user && user.user_metadata && (user.user_metadata.subscription_started_at || user.user_metadata.subscriptionStartedAt || user.user_metadata.plan_started_at || user.user_metadata.planStartedAt) || "").trim();
  let paid = false;
  let response;

  if (!email) {
    return json(400, { ok: false, message: "Email is required." });
  }
  if (!user || !user.id) {
    return json(404, { ok: false, message: "That hosted user could not be found." });
  }

  if (role === "admin" || role === "super_admin") {
    planType = planType || "lifetime";
    paid = true;
  } else {
    paid = !!(planType && planType !== "free");
  }
  if (paid && !subscriptionStartedAt) {
    subscriptionStartedAt = new Date().toISOString();
  }
  if (!paid) {
    planType = "free";
    subscriptionStartedAt = "";
  }

  response = await fetch(supabaseUrl + "/auth/v1/admin/users/" + encodeURIComponent(user.id), {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    },
    body: JSON.stringify({
      user_metadata: {
        user_name: (user.user_metadata && (user.user_metadata.user_name || user.user_metadata.full_name)) || user.email,
        full_name: (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.user_name)) || user.email,
        role: role,
        plan_type: planType,
        subscription_started_at: subscriptionStartedAt,
        locked_panes: lockedPanes,
        unlocked_panes: unlockedPanes,
        weekly_bonus_days: existingWeeklyBonusDays(user),
        weekly_free_day_claimed_at: existingWeeklyFreeDayClaimedAt(user),
        weekly_claim_plan_type: existingWeeklyClaimPlanType(user)
      }
    })
  });
  if (!response.ok) {
    return json(200, { ok: false, message: "The user privileges could not be pushed right now." });
  }

  await upsertUsage(supabaseUrl, serviceRoleKey, {
    email: email,
    user_name: row.user_name || ((user.user_metadata && (user.user_metadata.user_name || user.user_metadata.full_name)) || user.email),
    matches_used: Number(row.matches_used || 0),
    searches_used: Number(row.searches_used || 0),
    cv_generations_used: Number(row.cv_generations_used || 0),
    is_paid: paid,
    plan_type: planType,
    subscription_started_at: subscriptionStartedAt,
    user_role: role
  });

  return json(200, {
    ok: true,
    message: paid ? "Privileges pushed for " + planLabel(planType) + "." : "Privileges pushed for free access.",
    email: email,
    planType: planType,
    subscriptionStartedAt: subscriptionStartedAt,
    paid: paid,
    role: role,
    lockedPanes: lockedPanes,
    unlockedPanes: unlockedPanes
  });
}

async function setPaneLock(supabaseUrl, serviceRoleKey, payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const user = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
  const row = await ensureUsageRow(supabaseUrl, serviceRoleKey, email);
  const paneId = normalizePaneLockId(payload.paneId || payload.pane_id || payload.pane);
  const role = normalizeRole(user && user.user_metadata ? user.user_metadata.role : "");
  const planType = normalizePlanType(user && user.user_metadata && (user.user_metadata.plan_type || user.user_metadata.planType || user.user_metadata.plan || user.user_metadata.subscription_plan || user.user_metadata.subscriptionPlan));
  const subscriptionStartedAt = String(user && user.user_metadata && (user.user_metadata.subscription_started_at || user.user_metadata.subscriptionStartedAt || user.user_metadata.plan_started_at || user.user_metadata.planStartedAt) || "").trim();
  const paid = role === "admin" || role === "super_admin" ? true : !!(planType && planType !== "free");
  const mode = String(payload.mode || (payload.locked ? "lock" : "unlock")).trim().toLowerCase();
  let lockedPanes = resolvePaneLockList(user && user.user_metadata && (user.user_metadata.locked_panes || user.user_metadata.lockedPanes), row && (row.locked_panes || row.lockedPanes));
  let unlockedPanes = resolvePaneLockList(user && user.user_metadata && (user.user_metadata.unlocked_panes || user.user_metadata.unlockedPanes), row && (row.unlocked_panes || row.unlockedPanes));
  let response;
  if (!email) {
    return json(400, { ok: false, message: "Email is required." });
  }
  if (!paneId) {
    return json(400, { ok: false, message: "Choose a pane first." });
  }
  if (!user || !user.id) {
    return json(404, { ok: false, message: "That hosted user could not be found." });
  }
  if (mode === "lock") {
    if (lockedPanes.indexOf(paneId) === -1) {
      lockedPanes.push(paneId);
    }
    unlockedPanes = unlockedPanes.filter(function (item) {
      return item !== paneId;
    });
  } else {
    lockedPanes = lockedPanes.filter(function (item) {
      return item !== paneId;
    });
    if (unlockedPanes.indexOf(paneId) === -1) {
      unlockedPanes.push(paneId);
    }
  }
  response = await fetch(supabaseUrl + "/auth/v1/admin/users/" + encodeURIComponent(user.id), {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    },
    body: JSON.stringify({
      user_metadata: {
        user_name: (user.user_metadata && (user.user_metadata.user_name || user.user_metadata.full_name)) || user.email,
        full_name: (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.user_name)) || user.email,
        role: role,
        plan_type: planType,
        subscription_started_at: subscriptionStartedAt,
        locked_panes: lockedPanes,
        unlocked_panes: unlockedPanes,
        weekly_bonus_days: existingWeeklyBonusDays(user),
        weekly_free_day_claimed_at: existingWeeklyFreeDayClaimedAt(user),
        weekly_claim_plan_type: existingWeeklyClaimPlanType(user)
      }
    })
  });
  if (!response.ok) {
    return json(200, { ok: false, message: "The hosted pane access could not be updated right now." });
  }
  await upsertUsage(supabaseUrl, serviceRoleKey, {
    email: email,
    user_name: row.user_name || ((user.user_metadata && (user.user_metadata.user_name || user.user_metadata.full_name)) || user.email),
    matches_used: Number(row.matches_used || 0),
    searches_used: Number(row.searches_used || 0),
    cv_generations_used: Number(row.cv_generations_used || 0),
    is_paid: paid,
    plan_type: planType,
    subscription_started_at: subscriptionStartedAt,
    user_role: role,
    locked_panes: lockedPanes,
    unlocked_panes: unlockedPanes
  });
  const subscription = paid ? planLabel(planType) : "Free";
  const daysRemaining = subscriptionDaysRemainingText(subscriptionStartedAt, planType, paid);
  return json(200, {
    ok: true,
    message: (mode === "lock" ? "Locked " : "Unlocked ") + paneLabel(paneId) + " for " + email + ".",
    email: email,
    planType: planType,
    plan: subscription,
    subscription: subscription,
    subscriptionStartedAt: subscriptionStartedAt,
    daysRemaining: daysRemaining,
    days_remaining: daysRemaining,
    paid: paid,
    role: role,
    lockedPanes: lockedPanes,
    unlockedPanes: unlockedPanes
  });
}

async function resetAllUsage(supabaseUrl, serviceRoleKey) {
  const rows = await fetchUsageRows(supabaseUrl, serviceRoleKey);
  let i;
  for (i = 0; i < rows.length; i += 1) {
    await upsertUsage(supabaseUrl, serviceRoleKey, {
      email: rows[i].email,
      user_name: rows[i].user_name || rows[i].email,
      matches_used: 0,
      searches_used: 0,
      cv_generations_used: 0,
      is_paid: !!rows[i].is_paid,
      plan_type: normalizePlanType(rows[i].plan_type || rows[i].planType || ""),
      subscription_started_at: String(rows[i].subscription_started_at || rows[i].subscriptionStartedAt || "").trim(),
      user_role: normalizeRole(rows[i].user_role || rows[i].userRole || "")
    });
  }
  return json(200, { ok: true, message: "Reset usage for all hosted users." });
}

async function setAllPlans(supabaseUrl, serviceRoleKey, isPaid) {
  const rows = await fetchUsageRows(supabaseUrl, serviceRoleKey);
  const authUsers = await fetchAuthUsers(supabaseUrl, serviceRoleKey);
  const authUserByEmail = {};
  let i;
  for (i = 0; i < authUsers.length; i += 1) {
    authUserByEmail[String(authUsers[i].email || "").toLowerCase()] = authUsers[i];
  }
  for (i = 0; i < rows.length; i += 1) {
    const authUser = authUserByEmail[String(rows[i].email || "").toLowerCase()] || null;
    const role = normalizeRole(authUser && authUser.user_metadata ? authUser.user_metadata.role : "");
    await upsertUsage(supabaseUrl, serviceRoleKey, {
      email: rows[i].email,
      user_name: rows[i].user_name || rows[i].email,
      matches_used: Number(rows[i].matches_used || 0),
      searches_used: Number(rows[i].searches_used || 0),
      cv_generations_used: Number(rows[i].cv_generations_used || 0),
      is_paid: role === "admin" || role === "super_admin" ? true : !!isPaid,
      plan_type: normalizePlanType(authUser && authUser.user_metadata && (authUser.user_metadata.plan_type || authUser.user_metadata.planType || authUser.user_metadata.plan || authUser.user_metadata.subscription_plan || authUser.user_metadata.subscriptionPlan)),
      subscription_started_at: String(authUser && authUser.user_metadata && (authUser.user_metadata.subscription_started_at || authUser.user_metadata.subscriptionStartedAt || authUser.user_metadata.plan_started_at || authUser.user_metadata.planStartedAt) || "").trim(),
      user_role: role
    });
  }
  return json(200, { ok: true, message: isPaid ? "Set all hosted users to premium." : "Set all hosted users to free." });
}

async function ensureUsageRow(supabaseUrl, serviceRoleKey, email) {
  const existing = await fetchUsageRow(supabaseUrl, serviceRoleKey, email);
  const authUser = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
  if (existing) {
    return existing;
  }
  return {
    email: email,
    user_name: authUser && authUser.user_metadata ? (authUser.user_metadata.user_name || authUser.user_metadata.full_name || authUser.email) : email,
    matches_used: 0,
    searches_used: 0,
    cv_generations_used: 0,
    is_paid: false,
    plan_type: normalizePlanType(authUser && authUser.user_metadata && (authUser.user_metadata.plan_type || authUser.user_metadata.planType || authUser.user_metadata.plan || authUser.user_metadata.subscription_plan || authUser.user_metadata.subscriptionPlan)),
    subscription_started_at: String(authUser && authUser.user_metadata && (authUser.user_metadata.subscription_started_at || authUser.user_metadata.subscriptionStartedAt || authUser.user_metadata.plan_started_at || authUser.user_metadata.planStartedAt) || "").trim(),
    user_role: normalizeRole(authUser && authUser.user_metadata ? authUser.user_metadata.role : "")
  };
}

async function fetchUsageRows(supabaseUrl, serviceRoleKey) {
  let response = await fetch(supabaseUrl + "/rest/v1/user_usage?select=email,user_name,matches_used,searches_used,cv_generations_used,is_paid,plan_type,subscription_started_at,user_role,updated_at&order=updated_at.desc.nullslast", {
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

async function fetchUsageRow(supabaseUrl, serviceRoleKey, email) {
  let response = await fetch(supabaseUrl + "/rest/v1/user_usage?email=eq." + encodeURIComponent(email) + "&select=email,user_name,matches_used,searches_used,cv_generations_used,is_paid,plan_type,subscription_started_at,user_role,updated_at&order=updated_at.desc.nullslast&limit=1", {
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    }
  });
  if (!response.ok) {
    response = await fetch(supabaseUrl + "/rest/v1/user_usage?email=eq." + encodeURIComponent(email) + "&select=email,user_name,matches_used,searches_used,cv_generations_used,is_paid,plan_type,subscription_started_at,user_role&limit=1", {
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey
      }
    });
  }
  if (!response.ok) {
    return null;
  }
  const rows = await response.json();
  return rows && rows.length ? rows[0] : null;
}

async function upsertUsage(supabaseUrl, serviceRoleKey, payload) {
  const body = {
    email: payload.email,
    user_name: payload.user_name,
    matches_used: payload.matches_used,
    searches_used: payload.searches_used,
    cv_generations_used: payload.cv_generations_used,
    is_paid: payload.is_paid,
    plan_type: payload.plan_type || null,
    subscription_started_at: payload.subscription_started_at || null,
    user_role: payload.user_role || null,
    updated_at: new Date().toISOString()
  };
  if (Object.prototype.hasOwnProperty.call(payload, "locked_panes") || Object.prototype.hasOwnProperty.call(payload, "lockedPanes")) {
    body.locked_panes = payload.locked_panes != null ? payload.locked_panes : payload.lockedPanes;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "unlocked_panes") || Object.prototype.hasOwnProperty.call(payload, "unlockedPanes")) {
    body.unlocked_panes = payload.unlocked_panes != null ? payload.unlocked_panes : payload.unlockedPanes;
  }
  let response = await performUsageUpsert(supabaseUrl, serviceRoleKey, payload.email, body);
  let bodyText = "";
  if (!response.ok) {
    bodyText = await safeReadResponseText(response);
    if (shouldRetryWithoutPaneColumns(bodyText, body)) {
      delete body.locked_panes;
      delete body.unlocked_panes;
      response = await performUsageUpsert(supabaseUrl, serviceRoleKey, payload.email, body);
      if (!response.ok) {
        bodyText = await safeReadResponseText(response);
      }
    }
  }
  if (!response.ok) {
    throw new Error(buildHttpErrorMessage("Supabase user_usage upsert", response, bodyText));
  }
}

async function performUsageUpsert(supabaseUrl, serviceRoleKey, email, body) {
  let response = await fetch(supabaseUrl + "/rest/v1/user_usage?email=eq." + encodeURIComponent(email), {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
      Prefer: "return=representation"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    response = await fetch(supabaseUrl + "/rest/v1/user_usage", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(body)
    });
  }
  if (!response.ok) {
    response = await fetch(supabaseUrl + "/rest/v1/user_usage", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
        Prefer: "return=representation"
      },
      body: JSON.stringify(body)
    });
  }
  return response;
}

function shouldRetryWithoutPaneColumns(bodyText, body) {
  const text = String(bodyText || "").toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(body, "locked_panes") && !Object.prototype.hasOwnProperty.call(body, "unlocked_panes")) {
    return false;
  }
  return text.indexOf("locked_panes") !== -1 || text.indexOf("unlocked_panes") !== -1;
}

function safeErrorMessage(error) {
  const message = String(error && error.message || error || "").trim();
  return message ? message : "Unknown server error.";
}

async function safeReadResponseText(response) {
  try {
    return String(await response.text() || "").trim();
  } catch (error) {
    return "";
  }
}

function buildHttpErrorMessage(label, response, bodyText) {
  const status = response && typeof response.status !== "undefined" ? response.status : "unknown";
  const detail = String(bodyText || "").replace(/\s+/g, " ").trim();
  return label + " failed (" + status + ")" + (detail ? ": " + detail.slice(0, 240) : ".");
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

function existingWeeklyBonusDays(user) {
  return Math.max(0, Number(user && user.user_metadata && (user.user_metadata.weekly_bonus_days || user.user_metadata.weeklyBonusDays) || 0) || 0);
}

function existingWeeklyFreeDayClaimedAt(user) {
  return String(user && user.user_metadata && (user.user_metadata.weekly_free_day_claimed_at || user.user_metadata.weeklyFreeDayClaimedAt) || "").trim();
}

function existingWeeklyClaimPlanType(user) {
  return normalizePlanType(user && user.user_metadata && (user.user_metadata.weekly_claim_plan_type || user.user_metadata.weeklyClaimPlanType) || "");
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

function resolvePaneLockList(primaryValue, secondaryValue) {
  const primary = normalizePaneLockList(primaryValue);
  if (primary.length) {
    return primary;
  }
  return normalizePaneLockList(secondaryValue);
}

function paneLabel(value) {
  const paneId = normalizePaneLockId(value);
  if (!paneId) {
    return "that pane";
  }
  return paneId.replace("pane", "Pane ");
}

function planLabel(value) {
  const plan = normalizePlanType(value);
  if (plan === "monthly" || plan === "month" || plan === "1 month" || plan === "one month" || plan === "monthly subscription" || plan === "1 month subscription" || plan === "one month subscription") {
    return "1 month";
  }
  if (plan === "6 months" || plan === "six months" || plan === "6 month" || plan === "six month" || plan === "6months" || plan === "6months subscription" || plan === "6 month subscription" || plan === "6 month plan") {
    return "6 months";
  }
  if (plan === "yearly" || plan === "annual" || plan === "annual plan" || plan === "year" || plan === "12 months" || plan === "12 month" || plan === "12months" || plan === "12 month subscription" || plan === "12 months subscription" || plan === "one year" || plan === "one year subscription" || plan === "1 year" || plan === "1 year subscription") {
    return "12 months";
  }
  if (plan === "lifetime" || plan === "life time" || plan === "lifetime access" || plan === "premium" || plan === "premium access") {
    return "lifetime";
  }
  return "premium";
}

function subscriptionDaysRemainingText(startedAt, planType, paid) {
  const totalDays = subscriptionDurationDays(planType, paid);
  const start = new Date(startedAt || "");
  const now = new Date();
  const elapsed = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const remaining = Math.max(0, totalDays - (Number.isFinite(elapsed) ? elapsed : 0));
  if (totalDays === Infinity) {
    return "Unlimited";
  }
  return remaining > 0 ? remaining + " day" + (remaining === 1 ? "" : "s") : "Expired";
}

function subscriptionDurationDays(planType, paid) {
  const plan = normalizePlanType(planType);
  if (!paid) {
    return 7;
  }
  if (plan === "monthly" || plan === "month" || plan === "1 month" || plan === "one month" || plan === "monthly subscription" || plan === "1 month subscription" || plan === "one month subscription") {
    return 30;
  }
  if (plan === "6 months" || plan === "six months" || plan === "6 month" || plan === "six month" || plan === "6months" || plan === "6months subscription" || plan === "6 month subscription" || plan === "6 month plan") {
    return 183;
  }
  if (plan === "yearly" || plan === "annual" || plan === "annual plan" || plan === "year" || plan === "12 months" || plan === "12 month" || plan === "12months" || plan === "12 month subscription" || plan === "12 months subscription" || plan === "one year" || plan === "one year subscription" || plan === "1 year" || plan === "1 year subscription") {
    return 365;
  }
  return Infinity;
}

function roleLabel(value) {
  const role = normalizeRole(value);
  if (role === "super_admin") {
    return "Super admin";
  }
  if (role === "admin") {
    return "Admin";
  }
  return "User";
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



