(function () {
  var installPanels = Array.prototype.slice.call(document.querySelectorAll(".app-download-panel"));
  var installLinks = Array.prototype.slice.call(document.querySelectorAll("[data-install-platform]"));
  var installStatus = document.querySelector("[data-install-status]");
  var deferredInstallPrompt = null;
  var instructionsModal = null;

  function setInstallStatus(message) {
    if (installStatus) {
      installStatus.textContent = message;
    }
  }

  function isInstalled() {
    return !!(
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) ||
      window.navigator.standalone
    );
  }

  function shouldShowInstallPanel() {
    return /^https?:$/i.test(String(window.location.protocol || "")) && !isInstalled();
  }

  function syncInstallPanel() {
    var show = shouldShowInstallPanel();
    installPanels.forEach(function (panel) {
      panel.hidden = !show;
    });
  }

  function closeInstructions() {
    if (!instructionsModal) {
      return;
    }
    instructionsModal.hidden = true;
    document.body.classList.remove("app-install-open");
  }

  function ensureInstructionsModal() {
    var closeButton;
    var doneButton;
    if (instructionsModal) {
      return instructionsModal;
    }
    instructionsModal = document.createElement("div");
    instructionsModal.className = "app-install-modal";
    instructionsModal.hidden = true;
    instructionsModal.innerHTML = [
      '<div class="app-install-card" role="dialog" aria-modal="true" aria-labelledby="appInstallTitle">',
      '<button class="app-install-close" type="button" aria-label="Close install instructions">Close</button>',
      '<p class="card-label">iPhone and iPad</p>',
      '<h2 id="appInstallTitle">Install Job Match Agent</h2>',
      '<p class="app-install-copy">Use Safari to add Job Match Agent to your Home Screen.</p>',
      '<ol class="app-install-steps">',
      '<li>Open this page in Safari.</li>',
      '<li>Tap the Share button in Safari.</li>',
      '<li>Choose Add to Home Screen.</li>',
      '<li>Tap Add to finish.</li>',
      '</ol>',
      '<button class="primary-button app-install-done" type="button">Done</button>',
      '</div>'
    ].join("");
    document.body.appendChild(instructionsModal);
    closeButton = instructionsModal.querySelector(".app-install-close");
    doneButton = instructionsModal.querySelector(".app-install-done");
    if (closeButton) {
      closeButton.addEventListener("click", closeInstructions);
    }
    if (doneButton) {
      doneButton.addEventListener("click", closeInstructions);
    }
    instructionsModal.addEventListener("click", function (event) {
      if (event.target === instructionsModal) {
        closeInstructions();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && instructionsModal && !instructionsModal.hidden) {
        closeInstructions();
      }
    });
    return instructionsModal;
  }

  function showIosInstructions() {
    var modal = ensureInstructionsModal();
    var doneButton;
    modal.hidden = false;
    document.body.classList.add("app-install-open");
    doneButton = modal.querySelector(".app-install-done");
    if (doneButton) {
      doneButton.focus();
    }
    setInstallStatus("On iPhone or iPad, follow the instructions to add Job Match Agent to your Home Screen.");
  }

  function promptForInstall(fallbackMessage) {
    if (!deferredInstallPrompt) {
      setInstallStatus(fallbackMessage);
      return Promise.resolve(false);
    }
    deferredInstallPrompt.prompt();
    return deferredInstallPrompt.userChoice.then(function () {
      deferredInstallPrompt = null;
      setInstallStatus("If installation did not finish, open your browser menu and choose Install app.");
      return true;
    });
  }

  function handleInstallClick(event) {
    var platform = String(event.currentTarget.getAttribute("data-install-platform") || "").toLowerCase();
    event.preventDefault();
    if (platform === "ios") {
      showIosInstructions();
      return;
    }
    if (platform === "android") {
      promptForInstall("On Android, open this page in Chrome, tap the menu, then choose Install app or Add to Home screen.");
      return;
    }
    promptForInstall("On PC, open this page in Edge or Chrome, then use the browser menu to choose Apps, Install this site, or Pin this page to your taskbar.");
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
      return;
    }
    navigator.serviceWorker.register("./sw.js").catch(function () {
      setInstallStatus("Installation is still available from your browser menu.");
    });
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    if (!shouldShowInstallPanel()) {
      return;
    }
    event.preventDefault();
    deferredInstallPrompt = event;
    setInstallStatus("Installation is ready. Choose PC or Android to continue.");
  });

  window.addEventListener("appinstalled", function () {
    deferredInstallPrompt = null;
    syncInstallPanel();
  });

  installLinks.forEach(function (link) {
    link.addEventListener("click", handleInstallClick);
  });

  syncInstallPanel();
  registerServiceWorker();
}());
