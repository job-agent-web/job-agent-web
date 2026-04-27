const crypto = require("crypto");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function signPayload(payload, secret) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${encoded}.${signature}`;
}

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { message: "Method not allowed." });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL || "jobmatchagent01@gmail.com";
  const otpSecret = process.env.OTP_SIGNING_SECRET;

  if (!resendApiKey || !resendFromEmail || !otpSecret) {
    return json(500, { message: "OTP email service is not configured yet." });
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim();
    const passwordHash = String(payload.passwordHash || "").trim();

    if (!name || !email || !passwordHash) {
      return json(400, { message: "Name, email, and password are required." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { message: "Enter a valid email address." });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const verificationToken = signPayload({ name, email, passwordHash, otp, expiresAt }, otpSecret);

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#11203b;">
        <p>Hello ${name},</p>
        <p>Your Job Match Agent verification code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px;">${otp}</p>
        <p>This code expires in 10 minutes.</p>
      </div>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: resendFromEmail,
        reply_to: "jobmatchagent01@gmail.com",
        to: [email],
        subject: "Your Job Match Agent OTP",
        html: emailHtml
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return json(502, { message: "The OTP email could not be sent.", detail: errorBody });
    }

    return json(200, {
      message: "OTP sent successfully.",
      verificationToken
    });
  } catch (error) {
    return json(500, { message: "The OTP email could not be prepared." });
  }
};
