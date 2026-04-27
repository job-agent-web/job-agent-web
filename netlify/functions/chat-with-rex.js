const aiProviders = require("./_ai-provider-failover");
const aiHistory = require("./_ai-history");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return json(204, "");
  }
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, message: "Method not allowed." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const model = normalizeModel(process.env.GEMINI_MODEL || "gemini-2.5-flash-lite");
    const userName = String(body.userName || "").trim();
    const message = String(body.message || "").trim();
    const messages = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
    const fileName = String(body.fileName || "").trim();
    const fileContext = String(body.fileContext || "").trim();
    const previousOutputs = aiHistory.normalizePreviousOutputs(body.previousOutputs);

    if (!message) {
      return json(200, { ok: false, message: "A chat message is required." });
    }

    const result = await aiProviders.generateWithFailover({
      model: model,
      systemInstruction: buildSystemInstruction(),
      contents: buildContents({ userName, message, messages, fileName, fileContext, previousOutputs }),
      temperature: 0.8,
      topP: 0.95,
      maxOutputTokens: 900,
      providerOrder: ["gemini", "gptoss", "cloudflare", "huggingface"],
      cycles: 3
    });

    if (!result.ok) {
      return json(200, {
        ok: false,
        message: aiProviders.sanitizeProviderMessage(result.message) || "No AI provider could generate a Rex chat response right now.",
        failures: result.failures || []
      });
    }

    return json(200, {
      ok: true,
      model: result.model,
      provider: result.provider,
      text: result.text
    });
  } catch (error) {
    return json(200, {
      ok: false,
      message: "Could not generate a Rex chat response right now."
    });
  }
};

function buildSystemInstruction() {
  return [
    "You are Rex, the interview coach inside Job Match Agent.",
    "Write in polished UK English and behave like a strong interview coach rather than a general chatbot.",
    "Lead with the direct coaching point, then add practical detail, examples, and stronger sample answers when useful.",
    "Be practical, supportive, encouraging, natural, and concise without sounding robotic.",
    "Use short paragraphs or bullets when that improves clarity.",
    "Help mainly with interview preparation, mock interview support, answer improvement, confidence building, CV framing for interviews, and role-specific coaching.",
    "When a user shares an interview question, help them build a stronger answer using STAR or a similar evidence-based structure where appropriate.",
    "If a user asks for writing help, improve the wording so it sounds interview-ready, specific, and persuasive.",
    "If a user asks for a direct answer, answer directly before adding useful interview coaching detail.",
    "Do not claim to have completed actions you have not completed.",
    "If previous coaching replies are provided, avoid recycling the same wording and examples."
  ].join("\n");
}

function buildContents(input) {
  const parts = [];
  const contents = [];

  if (input.userName) {
    parts.push({
      text: "Signed-in user name: " + input.userName
    });
  }

  if (input.messages && input.messages.length) {
    input.messages.forEach(function (item) {
      if (!item || !item.role || !item.text) {
        return;
      }
      contents.push({
        role: item.role === "assistant" ? "model" : "user",
        parts: [
          {
            text: String(item.text)
          }
        ]
      });
    });
  }

  if (parts.length) {
    contents.unshift({
      role: "user",
      parts: parts
    });
  }

  if (input.fileContext) {
    contents.push({
      role: "user",
      parts: [
        {
          text: [
            "Attached file context" + (input.fileName ? " from " + input.fileName : "") + ":",
            input.fileContext.slice(0, 12000)
          ].join("\n")
        }
      ]
    });
  }

  if (input.previousOutputs && input.previousOutputs.length) {
    contents.push({
      role: "user",
      parts: [
        {
          text: aiHistory.buildAvoidanceBlock(input.previousOutputs, "Previous Rex replies to avoid repeating")
        }
      ]
    });
  }

  contents.push({
    role: "user",
    parts: [
      {
        text: input.message
      }
    ]
  });

  return contents;
}

function normalizeModel(input) {
  return aiProviders.normalizeModel(input, "gemini-2.5-flash-lite");
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload)
  };
}

