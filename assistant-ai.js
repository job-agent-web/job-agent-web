(function () {
  if (!window.el || !el.chatInput || !window.handleAssistantCommand) {
    return;
  }

  var apiKeyStorageKey = "jobMatchAgentOpenAiKey";
  var modelStorageKey = "jobMatchAgentOpenAiModel";
  var originalHandleAssistantCommand = window.handleAssistantCommand;
  var assistantHistory = [];
  var keyInput = document.getElementById("assistantApiKey");
  var modelInput = document.getElementById("assistantModel");
  var saveButton = document.getElementById("saveAssistantKeyBtn");
  var statusNode = document.getElementById("assistantStatus");

  if (!keyInput || !modelInput || !saveButton || !statusNode) {
    return;
  }

  hydrateAssistantSettings();
  refreshAssistantStatus();

  saveButton.onclick = function () {
    saveAssistantSettings();
    refreshAssistantStatus("Assistant settings saved locally on this device.");
    return false;
  };

  window.runAssistantCommand = function () {
    var message = trim(el.chatInput && el.chatInput.value);
    var parsed;

    if (!message) {
      return;
    }

    addChatMessage("user", message);
    el.chatInput.value = "";

    if (!hasDesktopAiBridge()) {
      addChatMessage("assistant", "This view does not have the local AI bridge. Open the desktop app to use the ChatGPT-style assistant. I can still use the built-in rule commands here if you start your message with /local.");
      refreshAssistantStatus("Model-backed chat is available in the desktop app.", "error");
      return;
    }

    if (low(message).indexOf("/local") === 0) {
      addChatMessage("assistant", originalHandleAssistantCommand(trim(message.replace(/^\/local/i, ""))));
      refreshAssistantStatus("Using local rule commands.", "ready");
      return;
    }

    if (!trim(keyInput.value)) {
      addChatMessage("assistant", "Add your OpenAI API key above, then press Save Key. After that, I can behave much more like ChatGPT and still apply changes inside the platform.");
      refreshAssistantStatus("Add an OpenAI API key to enable model-backed chat.", "error");
      return;
    }

    refreshAssistantStatus("Thinking and checking the current platform state...", "loading");
    parsed = askModel(message);

    if (!parsed.ok) {
      addChatMessage("assistant", parsed.reply || "I could not reach the model right now. If you want, you can still use /local commands while we sort that out.");
      refreshAssistantStatus(parsed.statusText || "The assistant could not reach the model.", "error");
      return;
    }

    addChatMessage("assistant", parsed.reply);
    assistantHistory.push({ role: "user", text: message });
    assistantHistory.push({ role: "assistant", text: parsed.reply });
    if (assistantHistory.length > 12) {
      assistantHistory = assistantHistory.slice(assistantHistory.length - 12);
    }
    refreshAssistantStatus("Model-backed assistant is ready.", "ready");
  };

  function askModel(message) {
    var host = topHost();
    var payload;
    var response;
    var parsed;
    var actionNotes = [];
    var i;

    payload = {
      model: trim(modelInput.value) || "gpt-4.1-mini",
      input: buildModelPrompt(message),
      max_output_tokens: 1400
    };

    response = host.callOpenAIResponses(trim(keyInput.value), payload);
    if (!response || !response.ok) {
      return {
        ok: false,
        reply: buildModelFailureMessage(response),
        statusText: "OpenAI request failed."
      };
    }

    parsed = parseAssistantResponse(response.text);
    if (!parsed.commands.length) {
      return { ok: true, reply: parsed.reply || "I am ready. Tell me what you want to change in the platform." };
    }

    for (i = 0; i < parsed.commands.length; i += 1) {
      actionNotes.push(applyPlatformCommand(parsed.commands[i]));
    }

    if (actionNotes.length) {
      parsed.reply += "\n\nApplied changes:\n- " + actionNotes.join("\n- ");
    }

    return { ok: true, reply: parsed.reply };
  }

  function buildModelPrompt(message) {
    var transcript = buildTranscript();
    var currentCv = trim(window.getActiveProfileText ? getActiveProfileText() : "");
    var cvExcerpt = currentCv ? currentCv.slice(0, 4000) : "No CV uploaded yet.";
    var jobExcerpt = trim(el.jobInput.value).slice(0, 4000) || "No pasted job description yet.";
    var settings = [
      "Selected CV: " + (el.activeCv2 && el.activeCv2.checked ? "CV 2" : "CV 1"),
      "Job title override: " + (trim(el.jobTitle.value) || "Not set"),
      "Company override: " + (trim(el.company.value) || "Not set"),
      "Salary override: " + (trim(el.manualSalary.value) || "Not set"),
      "Minimum salary: GBP " + el.minSalary.value,
      "Sponsorship mode: " + el.sponsorMode.value,
      "Location focus: " + el.locationMode.value
    ].join("\n");

    return [
      "You are the in-app AI assistant for a job application platform.",
      "Behave like a natural, polished ChatGPT-style assistant, but keep replies practical and grounded.",
      "When useful, apply platform changes by returning commands in the exact command syntax listed below.",
      "Return strict JSON only. No markdown fences. Use this shape:",
      '{"reply":"short natural response to the user","commands":["set company to NHS England","run match"]}',
      "If no platform changes are needed, return an empty commands array.",
      "Available commands:",
      "- set job title to ...",
      "- set company to ...",
      "- set salary to ...",
      "- set minimum salary to ...",
      "- set sponsorship to required|preferred|ignore",
      "- set location to remote|west midlands|west midlands and remote|any uk",
      "- use cv 1 or use cv 2",
      "- paste job text to ...",
      "- clear job paste",
      "- clear overrides",
      "- clear cvs",
      "- run match",
      "Only use commands when they genuinely help.",
      "",
      "Current platform state:",
      settings,
      "",
      "Selected CV excerpt:",
      cvExcerpt,
      "",
      "Pasted job text excerpt:",
      jobExcerpt,
      "",
      "Recent transcript:",
      transcript,
      "",
      "Latest user request:",
      message
    ].join("\n");
  }

  function buildTranscript() {
    var start = Math.max(0, assistantHistory.length - 8);
    var lines = [];
    var i;
    for (i = start; i < assistantHistory.length; i += 1) {
      lines.push(assistantHistory[i].role.toUpperCase() + ": " + assistantHistory[i].text);
    }
    return lines.join("\n") || "No earlier transcript.";
  }

  function parseAssistantResponse(text) {
    var raw = trim(text || "");
    var match;
    var parsed;

    if (!raw) {
      return { reply: "I did not get a usable response back from the model.", commands: [] };
    }

    try {
      parsed = JSON.parse(raw);
      return normalizeParsedAssistantResponse(parsed, raw);
    } catch (error) {
    }

    match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
        return normalizeParsedAssistantResponse(parsed, raw);
      } catch (innerError) {
      }
    }

    return { reply: raw, commands: [] };
  }

  function normalizeParsedAssistantResponse(parsed, fallbackText) {
    var commands = [];
    var i;
    if (parsed && parsed.commands && parsed.commands.length) {
      for (i = 0; i < parsed.commands.length; i += 1) {
        if (trim(parsed.commands[i])) {
          commands.push(trim(parsed.commands[i]));
        }
      }
    }
    return {
      reply: trim(parsed && parsed.reply ? parsed.reply : fallbackText),
      commands: commands
    };
  }

  function applyPlatformCommand(command) {
    try {
      return originalHandleAssistantCommand(command);
    } catch (error) {
      return "I tried to apply `" + command + "` but it failed.";
    }
  }

  function hasDesktopAiBridge() {
    var host = topHost();
    return !!(host && typeof host.callOpenAIResponses === "function");
  }

  function buildModelFailureMessage(response) {
    var body = response && response.body ? String(response.body) : "";
    if (body.length > 300) {
      body = body.slice(0, 300) + "...";
    }
    if (body) {
      return "The assistant could not reach OpenAI successfully. The response was: " + body;
    }
    return "The assistant could not reach OpenAI successfully. Check the API key, the model name, and your internet connection.";
  }

  function hydrateAssistantSettings() {
    try {
      keyInput.value = window.localStorage ? window.localStorage.getItem(apiKeyStorageKey) || "" : "";
      modelInput.value = window.localStorage ? window.localStorage.getItem(modelStorageKey) || modelInput.value : modelInput.value;
    } catch (error) {
    }
  }

  function saveAssistantSettings() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(apiKeyStorageKey, trim(keyInput.value));
        window.localStorage.setItem(modelStorageKey, trim(modelInput.value) || "gpt-4.1-mini");
      }
    } catch (error) {
    }
  }

  function refreshAssistantStatus(message, tone) {
    var text = message;
    var kind = tone || "ready";
    if (!text) {
      if (!hasDesktopAiBridge()) {
        text = "This browser view cannot call the local AI bridge. Use the desktop app for the full ChatGPT-style assistant.";
        kind = "error";
      } else if (!trim(keyInput.value)) {
        text = "Add your OpenAI API key and save it locally to unlock the model-backed assistant.";
        kind = "";
      } else {
        text = "Model-backed assistant is ready in the desktop app.";
      }
    }
    statusNode.className = "assistant-status" + (kind ? " " + kind : "");
    statusNode.innerHTML = esc(text);
  }
}());
