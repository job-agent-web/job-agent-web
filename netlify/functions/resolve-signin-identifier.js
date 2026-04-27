exports.handler = async function (event) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const identifier = String((event.queryStringParameters && event.queryStringParameters.identifier) || "").trim().toLowerCase();
  let users = [];
  let i;
  let user = null;
  let email = "";
  let userName = "";
  let fullName = "";

  if (event.httpMethod !== "GET") {
    return json(405, { ok: false, message: "Method not allowed." });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, message: "Sign-in lookup is not configured yet." });
  }
  if (!identifier) {
    return json(400, { ok: false, message: "Identifier is required." });
  }

  try {
    users = await fetchAuthUsers(supabaseUrl, serviceRoleKey);
    for (i = 0; i < users.length; i += 1) {
      user = users[i] || {};
      email = String(user.email || "").trim().toLowerCase();
      userName = String(user.user_metadata && user.user_metadata.user_name || "").trim().toLowerCase();
      fullName = String(user.user_metadata && user.user_metadata.full_name || "").trim().toLowerCase();
      if (identifier === email || identifier === userName || identifier === fullName) {
        return json(200, { ok: true, email: user.email || "" });
      }
    }
    return json(200, { ok: false, message: "No account matched that email or username." });
  } catch (error) {
    return json(200, { ok: false, message: "Could not resolve that sign-in identifier right now." });
  }
};

async function fetchAuthUsers(supabaseUrl, serviceRoleKey) {
  const response = await fetch(supabaseUrl + "/auth/v1/admin/users?page=1&per_page=200", {
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    }
  });
  const data = response.ok ? await response.json() : {};
  return data && data.users ? data.users : [];
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
