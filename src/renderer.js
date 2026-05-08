const doriShell = document.querySelector("#doriShell");
const stageLabel = document.querySelector("#stageLabel");
const timerLabel = document.querySelector("#timerLabel");
const speechBubble = document.querySelector("#speechBubble");
const chatLog = document.querySelector("#chatLog");
const askForm = document.querySelector("#askForm");
const askInput = document.querySelector("#askInput");
const askButton = document.querySelector("#askButton");
const modeButtons = [...document.querySelectorAll(".mode-actions button")];
const minimizeButton = document.querySelector("#minimizeButton");
const closeButton = document.querySelector("#closeButton");
const pinButton = document.querySelector("#pinButton");
const settingsButton = document.querySelector("#settingsButton");
const settingsForm = document.querySelector("#settingsForm");
const settingsApiKeyInput = document.querySelector("#settingsApiKey");
const settingsModelSelect = document.querySelector("#settingsModel");
const settingsCancelButton = document.querySelector("#settingsCancel");
const settingsStatus = document.querySelector("#settingsStatus");
const apiKeyLinkButton = document.querySelector("#apiKeyLink");
const mascotButton = document.querySelector("#mascotButton");
const mascot = document.querySelector(".mascot");
const doriImage = document.querySelector("#doriImage");

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
let cachedSettings = { geminiApiKey: "", geminiModel: DEFAULT_GEMINI_MODEL };
let settingsStatusTimer = null;

let view = "idle";
let activeMode = null;
let modeStartedAt = null;
let modeTimerId = null;
let mascotDrag = null;
const pendingMessages = new Map();
const modeLabels = {
  coding: "코딩 중...",
  break: "쉬는 중...",
  lunch: "밥먹는 중...",
  work: "일하는 중..."
};

const modeImages = {
  coding: "./assets/dog-coder.png",
  break: "./assets/dog-break.png",
  lunch: "./assets/dog-lunch.png",
  work: "./assets/dog-work.png"
};

function setView(nextView, focusInput = false) {
  view = ["idle", "menu", "chat", "settings"].includes(nextView) ? nextView : "idle";
  doriShell.classList.toggle("idle", view === "idle");
  doriShell.classList.toggle("menu", view === "menu");
  doriShell.classList.toggle("chat", view === "chat");
  doriShell.classList.toggle("settings", view === "settings");
  window.desktopTimer.setView(view);

  if (view === "chat" && focusInput) {
    requestAnimationFrame(() => askInput.focus());
  }
}

function resetCompactBubble() {
  chatLog.innerHTML = "";
  speechBubble.classList.remove("expanded");
  addMessage("assistant", "도리에게 물어보세요", false);
}

function renderDefaultLabel() {
  if (!activeMode) stageLabel.textContent = "도리";
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function renderElapsed() {
  if (!modeStartedAt) return;
  timerLabel.textContent = formatElapsed(Date.now() - modeStartedAt);
}

function addMessage(role, text, expandBubble = true) {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.textContent = text;
  chatLog.append(message);
  if (expandBubble) speechBubble.classList.add("expanded");
  chatLog.scrollTop = chatLog.scrollHeight;
  return message;
}

function setLoading(loading) {
  askInput.disabled = loading;
  askButton.disabled = loading;
  mascot.classList.toggle("thinking", loading);
  askButton.textContent = loading ? "..." : "전송";
}

window.desktopTimer.onChatChunk(({ requestId, chunk }) => {
  const message = pendingMessages.get(requestId);
  if (!message) return;

  message.className = "message assistant";
  message.textContent += chunk;
  chatLog.scrollTop = chatLog.scrollHeight;
});

window.desktopTimer.onChatDone(({ requestId, text }) => {
  const message = pendingMessages.get(requestId);
  if (!message) return;

  if (!message.textContent.trim()) message.textContent = text || "응답이 비어 있습니다.";
  message.className = "message assistant";
  pendingMessages.delete(requestId);
});

window.desktopTimer.onChatError(({ requestId, message: errorMessage }) => {
  const message = pendingMessages.get(requestId);
  if (!message) return;

  message.className = "message assistant error";
  message.textContent = errorMessage || "Gemini 호출에 실패했어요. API 키와 인터넷 연결을 확인해주세요.";
  pendingMessages.delete(requestId);
});

function setDoriMode(mode) {
  const nextMode = modeLabels[mode] ? mode : "coding";
  activeMode = nextMode;
  modeStartedAt = Date.now();
  stageLabel.textContent = modeLabels[nextMode];
  doriImage.src = modeImages[nextMode];
  doriShell.dataset.mode = nextMode;
  mascot.dataset.mode = nextMode;

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === nextMode);
  });

  clearInterval(modeTimerId);
  renderElapsed();
  modeTimerId = setInterval(renderElapsed, 1000);
}

askForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = askInput.value.trim();
  if (!question) return;

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  askInput.value = "";
  addMessage("user", question);
  const pending = addMessage("assistant loading", "");
  pendingMessages.set(requestId, pending);
  setLoading(true);

  try {
    const answer = await window.desktopTimer.ask(question, requestId);
    pending.className = "message assistant";
    if (!pending.textContent.trim()) pending.textContent = answer || "응답이 비어 있습니다.";
  } catch (error) {
    if (pendingMessages.has(requestId)) {
      pending.className = "message assistant error";
      pending.textContent =
        error.message || "Gemini 호출에 실패했어요. API 키와 인터넷 연결을 확인해주세요.";
      pendingMessages.delete(requestId);
    }
  } finally {
    setLoading(false);
    askInput.focus();
    chatLog.scrollTop = chatLog.scrollHeight;
  }
});

chatLog.addEventListener("click", () => {
  if (chatLog.textContent.trim() === "도리에게 물어보세요") {
    chatLog.innerHTML = "";
    speechBubble.classList.remove("expanded");
  }
  setView("chat", true);
});

askInput.addEventListener("focus", () => {
  setView("chat", false);
});

minimizeButton.addEventListener("click", () => {
  resetCompactBubble();
  setView("idle", false);
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setDoriMode(button.dataset.mode);
    resetCompactBubble();
    setView("idle", false);
  });
});

mascotButton.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;

  mascotDrag = {
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    lastX: event.screenX,
    lastY: event.screenY,
    moved: false
  };
  mascotButton.setPointerCapture(event.pointerId);
});

mascotButton.addEventListener("pointermove", (event) => {
  if (!mascotDrag || mascotDrag.pointerId !== event.pointerId) return;

  const deltaX = event.screenX - mascotDrag.lastX;
  const deltaY = event.screenY - mascotDrag.lastY;
  const totalX = event.screenX - mascotDrag.startX;
  const totalY = event.screenY - mascotDrag.startY;

  if (!mascotDrag.moved && Math.hypot(totalX, totalY) > 4) {
    mascotDrag.moved = true;
  }

  if (mascotDrag.moved) {
    event.preventDefault();
    window.desktopTimer.dragBy(deltaX, deltaY);
  }

  mascotDrag.lastX = event.screenX;
  mascotDrag.lastY = event.screenY;
});

function finishMascotPointer(event) {
  if (!mascotDrag || mascotDrag.pointerId !== event.pointerId) return;

  const shouldToggle = !mascotDrag.moved;
  if (mascotButton.hasPointerCapture(event.pointerId)) {
    mascotButton.releasePointerCapture(event.pointerId);
  }
  mascotDrag = null;

  if (shouldToggle) {
    setView(view === "idle" ? "menu" : "idle", false);
  }
}

mascotButton.addEventListener("pointerup", finishMascotPointer);
mascotButton.addEventListener("pointercancel", (event) => {
  if (mascotButton.hasPointerCapture(event.pointerId)) {
    mascotButton.releasePointerCapture(event.pointerId);
  }
  mascotDrag = null;
});

closeButton.addEventListener("click", () => {
  window.desktopTimer.close();
});

pinButton.addEventListener("click", () => {
  window.desktopTimer.pinBottom();
});

function showSettingsStatus(text, isError = false) {
  if (!settingsStatus) return;
  settingsStatus.textContent = text;
  settingsStatus.classList.toggle("error", Boolean(isError));
  if (settingsStatusTimer) clearTimeout(settingsStatusTimer);
  if (text) {
    settingsStatusTimer = setTimeout(() => {
      settingsStatus.textContent = "";
      settingsStatus.classList.remove("error");
    }, 1800);
  }
}

async function refreshSettings() {
  try {
    const next = await window.desktopTimer.getSettings();
    if (next && typeof next === "object") {
      cachedSettings = {
        geminiApiKey: typeof next.geminiApiKey === "string" ? next.geminiApiKey : "",
        geminiModel:
          typeof next.geminiModel === "string" && next.geminiModel
            ? next.geminiModel
            : DEFAULT_GEMINI_MODEL
      };
    }
  } catch (_error) {
    /* keep defaults */
  }
}

function openSettings() {
  settingsApiKeyInput.value = cachedSettings.geminiApiKey || "";
  settingsModelSelect.value = cachedSettings.geminiModel || DEFAULT_GEMINI_MODEL;
  if (![...settingsModelSelect.options].some((opt) => opt.value === settingsModelSelect.value)) {
    settingsModelSelect.value = DEFAULT_GEMINI_MODEL;
  }
  showSettingsStatus("");
  setView("settings", false);
  requestAnimationFrame(() => settingsApiKeyInput.focus());
}

function closeSettings() {
  showSettingsStatus("");
  setView("idle", false);
}

settingsButton.addEventListener("click", openSettings);
settingsCancelButton.addEventListener("click", closeSettings);

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    geminiApiKey: settingsApiKeyInput.value.trim(),
    geminiModel: settingsModelSelect.value || DEFAULT_GEMINI_MODEL
  };

  try {
    const saved = await window.desktopTimer.saveSettings(payload);
    cachedSettings = {
      geminiApiKey:
        saved && typeof saved.geminiApiKey === "string" ? saved.geminiApiKey : payload.geminiApiKey,
      geminiModel:
        saved && typeof saved.geminiModel === "string" && saved.geminiModel
          ? saved.geminiModel
          : payload.geminiModel
    };
    showSettingsStatus("저장됐어요!");
  } catch (error) {
    showSettingsStatus(error?.message || "저장에 실패했어요.", true);
  }
});

apiKeyLinkButton.addEventListener("click", () => {
  window.desktopTimer.openExternal("https://aistudio.google.com/app/apikey");
});

renderDefaultLabel();
setView("idle", false);
refreshSettings();
