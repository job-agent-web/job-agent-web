(function () {
  "use strict";
  var nativeFetch = window.fetch.bind(window);
  var legacyOrigin = "https://yucfznjiipzsfgrmjcer.supabase.co";
  var previousSites = ["https://aquamarine-puppy-2a08ef.netlify.app", "https://job-match-agent-web.netlify.app", "https://jobmatchagent.vercel.app"];
  try {
    var previousSession = JSON.parse(localStorage.getItem("sb-yucfznjiipzsfgrmjcer-auth-token") || "null");
    if (previousSession && previousSession.access_token) {
      var encodedClaims = previousSession.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      var claims = JSON.parse(atob(encodedClaims));
      if (claims.iss !== "jobmatchagent") {
        localStorage.removeItem("sb-yucfznjiipzsfgrmjcer-auth-token");
        localStorage.removeItem("jobMatchAgentHostedSession");
      }
    }
  } catch (sessionError) {}
  function accessToken() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key === "sb-yucfznjiipzsfgrmjcer-auth-token") {
          var session = JSON.parse(localStorage.getItem(key) || "null");
          if (session && session.access_token) return session.access_token;
        }
      }
    } catch (error) {}
    return "";
  }
  window.fetch = function (input, init) {
    var source = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, location.href);
    var local = source.origin === location.origin;
    var legacyAuth = source.origin === legacyOrigin && /^\/(auth|rest)\/v1\//.test(source.pathname);
    var previousApi = previousSites.indexOf(source.origin) !== -1 && /^\/(?:api\/|\.netlify\/functions\/)/.test(source.pathname);
    if (!local && !legacyAuth && !previousApi) return nativeFetch(input, init);
    var destination = legacyAuth || previousApi ? location.origin + source.pathname + source.search : source.href;
    var request = input instanceof Request ? new Request(destination, input) : new Request(destination, init);
    if (input instanceof Request && init) request = new Request(request, init);
    if (/^\/(?:api\/|\.netlify\/functions\/|rest\/v1\/)/.test(source.pathname)) {
      var headers = new Headers(request.headers);
      var token = accessToken();
      if (token && !headers.has("Authorization")) headers.set("Authorization", "Bearer " + token);
      request = new Request(request, { headers: headers });
    }
    return nativeFetch(request);
  };
  document.addEventListener("DOMContentLoaded", function () {
    if (typeof window.hostedAdminApiBase !== "undefined") window.hostedAdminApiBase = location.origin;
    // The Java server validates the configured secret; the browser must not hard-code a second passkey.
    if (document.getElementById("adminAccessForm")) {
      window.isValidAdminPasskey = function (value) { return !!String(value || "").trim(); };
      window.getValidatedAdminSecret = function () { return window.getSecret ? window.getSecret() : localStorage.getItem("jobMatchAgentAdminSecret") || ""; };
      window.saveSecretAndLoad = function () {
        var field = document.getElementById("adminSecret");
        var value = String(field && field.value || "").trim();
        if (!value) return;
        window.saveSecret(value);
        window.loadAdminUsers();
      };
    }
  });
})();
