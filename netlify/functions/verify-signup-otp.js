const crypto = require("crypto");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

function decodeBase64url(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function verifyToken(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [encoded, signature] = parts;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  if (signature !== expected) {
    return null;
  }
  return JSON.parse(decodeBase64url(encoded));
}

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { message: "Method not allowed." });
  }

  const otpSecret = process.env.OTP_SIGNING_SECRET;
  if (!otpSecret) {
    return json(500, { message: "OTP verification service is not configured yet." });
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const token = String(payload.verificationToken || "").trim();
    const otp = String(payload.otp || "").trim();
    const verified = verifyToken(token, otpSecret);

    if (!verified) {
      return json(400, { message: "The verification token is invalid." });
    }
    if (Date.now() > Number(verified.expiresAt || 0)) {
      return json(400, { message: "This OTP has expired. Request a new one." });
    }
    if (String(verified.otp) !== otp) {
      return json(400, { message: "The OTP code is incorrect." });
    }

    return json(200, {
      verified: true,
      name: verified.name,
      email: verified.email,
      passwordHash: verified.passwordHash
    });
  } catch (error) {
    return json(500, { message: "OTP verification failed." });
  }
};
