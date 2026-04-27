exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, message: "Method not allowed." });
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, message: "Usage tracking is not configured yet." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const email = String(body.email || "").trim().toLowerCase();
    const userName = String(body.userName || "").trim();
    const matchesUsed = Number(body.matchesUsed || 0);
    const searchesUsed = Number(body.searchesUsed || 0);
    const cvGenerationsUsed = Number(body.cvGenerationsUsed || 0);
    const isPaid = !!body.isPaid;

    if (!email) {
      return json(400, { ok: false, message: "Email is required." });
    }

    let existingRow = null;
    let response = null;
    response = await fetch(supabaseUrl + "/rest/v1/user_usage?email=eq." + encodeURIComponent(email) + "&select=email,plan_type,subscription_started_at,user_role&limit=1", {
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey
      }
    });
    if (response.ok) {
      existingRow = await response.json();
      existingRow = existingRow && existingRow.length ? existingRow[0] : null;
    }
    response = await fetch(supabaseUrl + "/rest/v1/user_usage", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({
        email: email,
        user_name: userName,
        matches_used: matchesUsed,
        searches_used: searchesUsed,
        cv_generations_used: cvGenerationsUsed,
        is_paid: isPaid,
        plan_type: existingRow && existingRow.plan_type ? existingRow.plan_type : null,
        subscription_started_at: existingRow && existingRow.subscription_started_at ? existingRow.subscription_started_at : null,
        user_role: existingRow && existingRow.user_role ? existingRow.user_role : null,
        updated_at: new Date().toISOString()
      })
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
        body: JSON.stringify({
          email: email,
          user_name: userName,
          matches_used: matchesUsed,
          searches_used: searchesUsed,
          cv_generations_used: cvGenerationsUsed,
          is_paid: isPaid,
          updated_at: new Date().toISOString()
        })
      });
      if (!response.ok) {
        return json(200, { ok: false, message: "Usage tracking table is not ready yet." });
      }
    }

    return json(200, { ok: true });
  } catch (error) {
    return json(200, { ok: false, message: "Could not record usage right now." });
  }
};

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
