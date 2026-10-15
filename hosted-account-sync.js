(function () {
  var productionApiBase = "https://jobmatchagent.vercel.app";
  var paneByButton = {
    cvBuilderToggleBtn: "pane1",
    coverLetterToggleBtn: "pane2",
    sponsorSearchToggleBtn: "pane3",
    visaJobsToggleBtn: "pane4",
    remoteJobsToggleBtn: "pane5",
    cvScorerToggleBtn: "pane6",
    careerPathToggleBtn: "pane7",
    interviewQuestionsToggleBtn: "pane8",
    rexChatToggleBtn: "pane9"
  };
  var paneNames = {
    cvBuilderToggleBtn: "Pane 1 - Generate CV",
    coverLetterToggleBtn: "Pane 2 - Generate Cover Letter",
    sponsorSearchToggleBtn: "Pane 3 - Search for Companies with Skilled Worker Licence",
    visaJobsToggleBtn: "Pane 4 - Land a Job with Visa Sponsorship",
    remoteJobsToggleBtn: "Pane 5 - Land a Remote Job",
    cvScorerToggleBtn: "Pane 6 - CV Scorer",
    careerPathToggleBtn: "Pane 7 - Career Path Planner",
    interviewQuestionsToggleBtn: "Pane 8 - Get Possible Interview Questions",
    rexChatToggleBtn: "Pane 9 - Chat with Rex"
  };
  var premiumOnly = {
    visaJobsToggleBtn: true,
    remoteJobsToggleBtn: true,
    rexChatToggleBtn: true
  };
  var originalFetchHostedPlanSnapshot = window.fetchHostedPlanSnapshot;
  var originalSyncHostedPlanState = window.syncHostedPlanState;
  var originalApplyHostedPlanBroadcast = window.applyHostedPlanBroadcast;

  function currentApiBase() {
    try {
      if (/^https?:$/i.test(String(window.location.protocol || ""))) {
        return "";
      }
    } catch (locationError) {}
    return productionApiBase;
  }

  // Hosted pages must read plans and run AI through their own deployment.
  // The legacy app bundle still points at an older Netlify project.
  getCareerPathApiBase = window.getCareerPathApiBase = currentApiBase;
  getVisaJobsApiBase = window.getVisaJobsApiBase = currentApiBase;

  function safeTrim(value) {
    if (typeof window.trim === "function") {
      return window.trim(value);
    }
    return String(value == null ? "" : value).trim();
  }

  function safeLow(value) {
    if (typeof window.low === "function") {
      return window.low(value);
    }
    return safeTrim(value).toLowerCase();
  }

  function normalizePlan(value) {
    if (typeof window.normalizePlanType === "function") {
      return window.normalizePlanType(value);
    }
    return safeLow(value);
  }

  function normalizePaneId(value) {
    var text = safeLow(value).replace(/[^a-z0-9]/g, "");
    if (text === "pane1" || text === "1" || text === "cvbuilder" || text === "cvbuildertogglebtn") { return "pane1"; }
    if (text === "pane2" || text === "2" || text === "coverletter" || text === "coverlettertogglebtn") { return "pane2"; }
    if (text === "pane3" || text === "3" || text === "sponsorsearch" || text === "sponsorsearchtogglebtn") { return "pane3"; }
    if (text === "pane4" || text === "4" || text === "visajobs" || text === "visajobstogglebtn") { return "pane4"; }
    if (text === "pane5" || text === "5" || text === "remotejobs" || text === "remotejobstogglebtn") { return "pane5"; }
    if (text === "pane6" || text === "6" || text === "cvscorer" || text === "cvscorertogglebtn") { return "pane6"; }
    if (text === "pane7" || text === "7" || text === "careerplan" || text === "careerpath" || text === "careerpathtogglebtn") { return "pane7"; }
    if (text === "pane8" || text === "8" || text === "interviewquestions" || text === "interviewquestionstogglebtn") { return "pane8"; }
    if (text === "pane9" || text === "9" || text === "rexchat" || text === "rexchattogglebtn") { return "pane9"; }
    return "";
  }

  function normalizePaneList(value) {
    var source = Array.isArray(value) ? value : [];
    var list = [];
    source.forEach(function (item) {
      var pane = normalizePaneId(item);
      if (pane && list.indexOf(pane) === -1) {
        list.push(pane);
      }
    });
    return list;
  }

  function currentEmail() {
    var user = typeof window.getCurrentHostedUser === "function" ? window.getCurrentHostedUser() : null;
    return safeLow(user && user.email || "");
  }

  function syncPaneAccess(payload) {
    var email = safeLow(payload && payload.email || "");
    var locked = normalizePaneList(payload && (payload.lockedPanes || payload.locked_panes || []));
    var unlocked = normalizePaneList(payload && (payload.unlockedPanes || payload.unlocked_panes || []));
    var usage = null;
    var i;
    if (!email || !payload) {
      return false;
    }
    try {
      if (typeof window.getUserUsage === "function" && typeof window.setUserUsage === "function") {
        usage = window.getUserUsage(email);
        usage.lockedPanes = locked.slice(0);
        usage.locked_panes = locked.slice(0);
        usage.unlockedPanes = unlocked.slice(0);
        usage.unlocked_panes = unlocked.slice(0);
        if (payload.role) usage.role = safeTrim(payload.role);
        window.setUserUsage(email, usage);
      }
    } catch (usageError) {}
    try {
      if (window.authState && window.authState.session && safeLow(window.authState.session.email || "") === email) {
        window.authState.session.lockedPanes = locked.slice(0);
        window.authState.session.locked_panes = locked.slice(0);
        window.authState.session.unlockedPanes = unlocked.slice(0);
        window.authState.session.unlocked_panes = unlocked.slice(0);
        if (payload.role) window.authState.session.role = safeTrim(payload.role);
        if (typeof window.persistAuthSession === "function") {
          window.persistAuthSession();
        }
      }
      if (window.authState && Array.isArray(window.authState.users)) {
        for (i = 0; i < window.authState.users.length; i += 1) {
          if (safeLow(window.authState.users[i].email || "") === email) {
            window.authState.users[i].lockedPanes = locked.slice(0);
            window.authState.users[i].locked_panes = locked.slice(0);
            window.authState.users[i].unlockedPanes = unlocked.slice(0);
            window.authState.users[i].unlocked_panes = unlocked.slice(0);
            if (payload.role) window.authState.users[i].role = safeTrim(payload.role);
            if (typeof window.persistAuthUsers === "function") {
              window.persistAuthUsers();
            }
            break;
          }
        }
      }
    } catch (authError) {}
    return true;
  }

  function syncPlanMirror(payload) {
    var email = safeLow(payload && payload.email || "");
    var mirror = null;
    if (!email || typeof window.loadHostedPlanMirror !== "function" || typeof window.saveHostedPlanMirror !== "function") {
      return false;
    }
    try {
      mirror = window.loadHostedPlanMirror() || {};
      mirror[email] = {
        email: email,
        planType: safeTrim(payload.planType || payload.plan_type || ""),
        subscriptionStartedAt: safeTrim(payload.subscriptionStartedAt || payload.subscription_started_at || ""),
        paid: !!(payload.paid || payload.is_paid),
        role: safeTrim(payload.role || payload.user_role || ""),
        lockedPanes: normalizePaneList(payload.lockedPanes || payload.locked_panes || []),
        unlockedPanes: normalizePaneList(payload.unlockedPanes || payload.unlocked_panes || []),
        updatedAt: payload.updatedAt || payload.updated_at || new Date().toISOString()
      };
      window.saveHostedPlanMirror(mirror);
      return true;
    } catch (mirrorError) {
      return false;
    }
  }

  function syncHostedSnapshot(payload) {
    if (!payload || !payload.email) {
      return false;
    }
    window._jobMatchLatestHostedPlanSnapshot = payload;
    syncPlanMirror(payload);
    syncPaneAccess(payload);
    return true;
  }

  if (typeof originalFetchHostedPlanSnapshot === "function") {
    fetchHostedPlanSnapshot = window.fetchHostedPlanSnapshot = async function () {
      var snapshot = await originalFetchHostedPlanSnapshot.apply(this, arguments);
      syncHostedSnapshot(snapshot);
      return snapshot;
    };
  }

  if (typeof originalSyncHostedPlanState === "function") {
    syncHostedPlanState = window.syncHostedPlanState = function (email, planType, subscriptionStartedAt, paidOverride) {
      var payload = window._jobMatchLatestHostedPlanSnapshot;
      var changed = originalSyncHostedPlanState.apply(this, arguments);
      if (!payload || safeLow(payload.email || "") !== safeLow(email || "")) {
        payload = {
          email: email,
          planType: planType,
          subscriptionStartedAt: subscriptionStartedAt,
          paid: paidOverride
        };
      }
      syncHostedSnapshot(payload);
      return changed;
    };
  }

  if (typeof originalApplyHostedPlanBroadcast === "function") {
    applyHostedPlanBroadcast = window.applyHostedPlanBroadcast = function (payload) {
      var changed = originalApplyHostedPlanBroadcast.apply(this, arguments);
      syncHostedSnapshot(payload);
      return changed;
    };
  }

  getCurrentUserPlanType = window.getCurrentUserPlanType = function () {
    var user = typeof window.getCurrentHostedUser === "function" ? window.getCurrentHostedUser() : null;
    var usage = null;
    var sessionPlan = "";
    var metaPlan = "";
    var mirrorPlan = "";
    var email = "";
    var mirror = null;
    if (!user) {
      return "";
    }
    email = safeLow(user.email || "");
    try {
      usage = typeof window.getUserUsage === "function" ? window.getUserUsage(email) : null;
    } catch (usageError) {
      usage = null;
    }
    if (window.authState && window.authState.session && safeLow(window.authState.session.email || "") === email) {
      sessionPlan = safeTrim(window.authState.session.planType || window.authState.session.plan_type || window.authState.session.plan || "");
    }
    metaPlan = safeTrim(user.planType || user.plan_type || user.plan || user.subscriptionPlan || user.subscription_plan || "");
    try {
      mirror = typeof window.loadHostedPlanMirror === "function" ? window.loadHostedPlanMirror() : null;
      mirrorPlan = mirror && mirror[email] ? safeTrim(mirror[email].planType || mirror[email].plan_type || "") : "";
    } catch (mirrorError) {
      mirrorPlan = "";
    }
    return normalizePlan(safeTrim(usage && (usage.planType || usage.plan_type || usage.plan || usage.subscriptionPlan || usage.subscription_plan) || "") || sessionPlan || metaPlan || mirrorPlan || "");
  };

  getCurrentSubscriptionStartedAt = window.getCurrentSubscriptionStartedAt = function () {
    var user = typeof window.getCurrentHostedUser === "function" ? window.getCurrentHostedUser() : null;
    var usage = null;
    var email = "";
    if (!user) {
      return "";
    }
    email = safeLow(user.email || "");
    try {
      usage = typeof window.getUserUsage === "function" ? window.getUserUsage(email) : null;
    } catch (usageError) {
      usage = null;
    }
    if (usage && (usage.subscriptionStartedAt || usage.subscription_started_at || usage.planStartedAt || usage.plan_started_at)) {
      return safeTrim(usage.subscriptionStartedAt || usage.subscription_started_at || usage.planStartedAt || usage.plan_started_at || "");
    }
    if (window.authState && window.authState.session && safeLow(window.authState.session.email || "") === email) {
      return safeTrim(window.authState.session.subscriptionStartedAt || window.authState.session.subscription_started_at || "");
    }
    return safeTrim(user.subscriptionStartedAt || user.subscription_started_at || user.planStartedAt || user.plan_started_at || "");
  };

  function getManualPaneAccess(buttonId) {
    var pane = paneByButton[buttonId] || normalizePaneId(buttonId);
    var email = currentEmail();
    var usage = null;
    var locked = [];
    var unlocked = [];
    if (!pane || !email) {
      return { locked: false, unlocked: false };
    }
    try {
      usage = typeof window.getUserUsage === "function" ? window.getUserUsage(email) : null;
      locked = locked.concat(normalizePaneList(usage && (usage.lockedPanes || usage.locked_panes || [])));
      unlocked = unlocked.concat(normalizePaneList(usage && (usage.unlockedPanes || usage.unlocked_panes || [])));
    } catch (usageError) {}
    try {
      if (window.authState && window.authState.session && safeLow(window.authState.session.email || "") === email) {
        locked = locked.concat(normalizePaneList(window.authState.session.lockedPanes || window.authState.session.locked_panes || []));
        unlocked = unlocked.concat(normalizePaneList(window.authState.session.unlockedPanes || window.authState.session.unlocked_panes || []));
      }
    } catch (authError) {}
    return {
      locked: locked.indexOf(pane) !== -1,
      unlocked: unlocked.indexOf(pane) !== -1
    };
  }

  getPaneAccessState = window.getPaneAccessState = function (buttonId) {
    var manual = getManualPaneAccess(buttonId);
    var expiredLocked = typeof window.isExpiredPaneLockActive === "function" ? !!window.isExpiredPaneLockActive() : false;
    var premiumLocked = false;
    var manualLocked = false;
    if (!paneNames[buttonId]) {
      return { known: false, locked: false, expiredLocked: false, premiumLocked: false, manualLocked: false, paneName: "" };
    }
    manualLocked = !expiredLocked && !!manual.locked;
    premiumLocked = !expiredLocked && !manualLocked && !manual.unlocked && premiumOnly[buttonId] && window.JOB_MATCH_LOCAL_UNLOCK_PREMIUM !== true && !!(typeof window.getCurrentHostedUser === "function" && window.getCurrentHostedUser()) && !(typeof window.hasSixMonthPlusAccess === "function" && window.hasSixMonthPlusAccess());
    return {
      known: true,
      locked: !!(expiredLocked || manualLocked || premiumLocked),
      expiredLocked: !!expiredLocked,
      premiumLocked: !!premiumLocked,
      manualLocked: !!manualLocked,
      paneName: paneNames[buttonId]
    };
  };

  canOpenPremiumPane = window.canOpenPremiumPane = function (buttonId) {
    var state = getPaneAccessState(buttonId);
    if (!state.known || (!state.premiumLocked && !state.manualLocked)) {
      return true;
    }
    if (!(typeof window.getCurrentHostedUser === "function" && window.getCurrentHostedUser())) {
      if (typeof window.renderAuthState === "function") {
        window.renderAuthState();
      }
      return false;
    }
    if (typeof window.refreshHostedPlanTypeFromSupabase === "function") {
      window.refreshHostedPlanTypeFromSupabase();
    }
    if (typeof window.showPremiumPaneUpgrade === "function") {
      window.showPremiumPaneUpgrade(state.paneName);
    }
    return false;
  };

  window.jobMatchCanOpenPane = function (buttonId) {
    var state = getPaneAccessState(buttonId);
    if (state.expiredLocked) {
      if (typeof window.showExpiredPaneUpgrade === "function") {
        window.showExpiredPaneUpgrade(state.paneName);
      }
      return false;
    }
    return canOpenPremiumPane(buttonId);
  };
  window.jobMatchGetPaneAccessState = getPaneAccessState;

  try {
    if (typeof window.refreshHostedPlanTypeFromSupabase === "function") {
      window.refreshHostedPlanTypeFromSupabase();
    }
    if (typeof window.updatePremiumPaneLocks === "function") {
      window.updatePremiumPaneLocks();
    }
  } catch (startupError) {}
}());
