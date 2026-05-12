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
const doriToast = document.querySelector("#doriToast");
const doriToastTitle = document.querySelector("#doriToastTitle");
const doriToastTime = document.querySelector("#doriToastTime");
const doriToastExtra = document.querySelector("#doriToastExtra");
const doriToastView = document.querySelector("#doriToastView");
const doriToastClose = document.querySelector("#doriToastClose");
const todosButton = document.querySelector("#todosButton");
const todoAddForm = document.querySelector("#todoAddForm");
const todoTitleInput = document.querySelector("#todoTitleInput");
const todoTimeInput = document.querySelector("#todoTimeInput");
const todoList = document.querySelector("#todoList");
const todosStatus = document.querySelector("#todosStatus");
const todosClearNotifiedButton = document.querySelector("#todosClearNotified");
const todoQuickButtons = [...document.querySelectorAll(".todo-quick-buttons button")];
const settingsButton = document.querySelector("#settingsButton");
const settingsForm = document.querySelector("#settingsForm");
const settingsApiKeyInput = document.querySelector("#settingsApiKey");
const settingsModelSelect = document.querySelector("#settingsModel");
const settingsExperimentalLabInput = document.querySelector("#settingsExperimentalLab");
const settingsCancelButton = document.querySelector("#settingsCancel");
const settingsStatus = document.querySelector("#settingsStatus");
const apiKeyLinkButton = document.querySelector("#apiKeyLink");
const mascotButton = document.querySelector("#mascotButton");
const mascot = document.querySelector(".mascot");
const doriImage = document.querySelector("#doriImage");

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
let cachedSettings = {
  geminiApiKey: "",
  geminiModel: DEFAULT_GEMINI_MODEL,
  experimentalLab: false
};
let settingsStatusTimer = null;
let cachedTodos = [];
let todosStatusTimer = null;
const toastQueue = [];
let activeToast = null;
let toastDismissTimer = null;
let preToastView = null;
const TOAST_DURATION_MS = 12000;

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
  work: "일하는 중...",
  hion: "하이온 중...",
  toilet: "화캉스 중..."
};

const modeImages = {
  coding: "./assets/dog-coder.png",
  break: "./assets/dog-break.png",
  lunch: "./assets/dog-lunch.png",
  work: "./assets/dog-work.png",
  hion: "./assets/dog-hion.png",
  toilet: "./assets/dog-hwakangs.png"
};

function setView(nextView, focusInput = false) {
  view = ["idle", "menu", "chat", "settings", "todos"].includes(nextView) ? nextView : "idle";
  doriShell.classList.toggle("idle", view === "idle");
  doriShell.classList.toggle("menu", view === "menu");
  doriShell.classList.toggle("chat", view === "chat");
  doriShell.classList.toggle("settings", view === "settings");
  doriShell.classList.toggle("todos", view === "todos");
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

function clearDoriMode() {
  activeMode = null;
  modeStartedAt = null;
  timerLabel.textContent = "";
  doriImage.src = modeImages.coding;
  delete doriShell.dataset.mode;
  delete mascot.dataset.mode;
  modeButtons.forEach((button) => button.classList.remove("active"));
  clearInterval(modeTimerId);
  renderDefaultLabel();
}

function setExperimentalLabEnabled(enabled) {
  modeButtons.forEach((button) => {
    if (button.dataset.mode !== "hion" && button.dataset.mode !== "toilet") return;
    button.hidden = !enabled;
    button.setAttribute("aria-hidden", enabled ? "false" : "true");
  });

  if (!enabled && (activeMode === "hion"||activeMode == "toilet")) {
    clearDoriMode();
  }
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
            : DEFAULT_GEMINI_MODEL,
        experimentalLab: Boolean(next.experimentalLab)
      };
      setExperimentalLabEnabled(cachedSettings.experimentalLab);
    }
  } catch (_error) {
    /* keep defaults */
  }
}

function openSettings() {
  settingsApiKeyInput.value = cachedSettings.geminiApiKey || "";
  settingsModelSelect.value = cachedSettings.geminiModel || DEFAULT_GEMINI_MODEL;
  settingsExperimentalLabInput.checked = Boolean(cachedSettings.experimentalLab);
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
    geminiModel: settingsModelSelect.value || DEFAULT_GEMINI_MODEL,
    experimentalLab: settingsExperimentalLabInput.checked
  };

  try {
    const saved = await window.desktopTimer.saveSettings(payload);
    cachedSettings = {
      geminiApiKey:
        saved && typeof saved.geminiApiKey === "string" ? saved.geminiApiKey : payload.geminiApiKey,
      geminiModel:
        saved && typeof saved.geminiModel === "string" && saved.geminiModel
          ? saved.geminiModel
          : payload.geminiModel,
      experimentalLab: Boolean(saved?.experimentalLab)
    };
    setExperimentalLabEnabled(cachedSettings.experimentalLab);
    showSettingsStatus("저장됐어요!");
  } catch (error) {
    showSettingsStatus(error?.message || "저장에 실패했어요.", true);
  }
});

apiKeyLinkButton.addEventListener("click", () => {
  window.desktopTimer.openExternal("https://aistudio.google.com/app/apikey");
});

function localDatetimeValue(date) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function formatDueAt(dueAt) {
  const d = new Date(dueAt);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hh}:${mm}`;
}

function formatRelative(dueAt) {
  const diff = dueAt - Date.now();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  let label;
  if (abs < minute) label = "방금";
  else if (abs < hour) label = `${Math.floor(abs / minute)}분`;
  else if (abs < day) label = `${Math.floor(abs / hour)}시간`;
  else label = `${Math.floor(abs / day)}일`;
  if (label === "방금") return "곧";
  return diff >= 0 ? `${label} 후` : `${label} 전`;
}

function showTodosStatus(text, isError = false) {
  if (!todosStatus) return;
  todosStatus.textContent = text;
  todosStatus.classList.toggle("error", Boolean(isError));
  if (todosStatusTimer) clearTimeout(todosStatusTimer);
  if (text) {
    todosStatusTimer = setTimeout(() => {
      todosStatus.textContent = "";
      todosStatus.classList.remove("error");
    }, 1800);
  }
}

function renderTodos(highlightId) {
  todoList.innerHTML = "";
  const sorted = [...cachedTodos].sort((a, b) => a.dueAt - b.dueAt);

  if (!sorted.length) {
    const empty = document.createElement("li");
    empty.className = "todo-empty";
    empty.textContent = "등록된 할 일이 없어요.";
    todoList.append(empty);
    return;
  }

  for (const todo of sorted) {
    const li = document.createElement("li");
    li.className = "todo-item";
    li.dataset.id = todo.id;
    if (todo.notified) li.classList.add("notified");
    if (highlightId && todo.id === highlightId) li.classList.add("highlight");

    const main = document.createElement("div");
    main.className = "todo-main";

    const title = document.createElement("span");
    title.className = "todo-title";
    title.textContent = todo.title;
    main.append(title);

    const meta = document.createElement("span");
    meta.className = "todo-meta";
    const parts = [formatDueAt(todo.dueAt), formatRelative(todo.dueAt)];
    if (todo.notified) parts.push("알림 보냄");
    meta.textContent = parts.join(" · ");
    main.append(meta);

    li.append(main);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "todo-remove";
    removeBtn.title = "삭제";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", async () => {
      try {
        const next = await window.desktopTimer.removeTodo(todo.id);
        cachedTodos = Array.isArray(next) ? next : [];
        renderTodos();
      } catch (error) {
        showTodosStatus(error?.message || "삭제 실패", true);
      }
    });
    li.append(removeBtn);

    todoList.append(li);
  }
}

async function refreshTodos() {
  try {
    const next = await window.desktopTimer.listTodos();
    cachedTodos = Array.isArray(next) ? next : [];
    renderTodos();
  } catch (_error) {
    /* keep cached */
  }
}

function openTodos() {
  todoTitleInput.value = "";
  todoTimeInput.value = localDatetimeValue(new Date(Date.now() + 30 * 60 * 1000));
  showTodosStatus("");
  setView("todos", false);
  refreshTodos();
  requestAnimationFrame(() => todoTitleInput.focus());
}

todosButton.addEventListener("click", openTodos);

todoAddForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = todoTitleInput.value.trim();
  if (!title) {
    showTodosStatus("제목을 입력해주세요.", true);
    return;
  }

  const raw = todoTimeInput.value;
  const dueAt = raw ? new Date(raw).getTime() : NaN;
  if (!Number.isFinite(dueAt)) {
    showTodosStatus("시간이 올바르지 않아요.", true);
    return;
  }

  try {
    const next = await window.desktopTimer.addTodo({ title, dueAt });
    cachedTodos = Array.isArray(next) ? next : cachedTodos;
    todoTitleInput.value = "";
    todoTimeInput.value = localDatetimeValue(new Date(Date.now() + 30 * 60 * 1000));
    renderTodos();
    showTodosStatus("등록됐어요!");
    todoTitleInput.focus();
  } catch (error) {
    showTodosStatus(error?.message || "등록 실패", true);
  }
});

todoQuickButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const minutes = Number(button.dataset.quick) || 0;
    todoTimeInput.value = localDatetimeValue(new Date(Date.now() + minutes * 60_000));
  });
});

todosClearNotifiedButton.addEventListener("click", async () => {
  try {
    const next = await window.desktopTimer.clearNotifiedTodos();
    cachedTodos = Array.isArray(next) ? next : [];
    renderTodos();
    showTodosStatus("정리했어요!");
  } catch (error) {
    showTodosStatus(error?.message || "정리 실패", true);
  }
});

window.desktopTimer.onTodosChanged((next) => {
  cachedTodos = Array.isArray(next) ? next : [];
  if (view === "todos") renderTodos();
});

window.desktopTimer.onTodosFocus(({ id } = {}) => {
  openTodos();
  if (id) {
    requestAnimationFrame(() => {
      const node = todoList.querySelector(`[data-id="${id}"]`);
      if (node) {
        node.classList.add("highlight");
        node.scrollIntoView({ block: "nearest" });
      }
    });
  }
});

function showNextToast() {
  if (activeToast) return;
  const next = toastQueue.shift();
  if (!next) {
    finishToastSession();
    return;
  }

  activeToast = next;
  doriToastTitle.textContent = next.title || "할 일";
  doriToastTime.textContent = `${formatDueAt(next.dueAt)} · ${formatRelative(next.dueAt)}`;
  const remaining = toastQueue.length;
  doriToastExtra.textContent = remaining ? `대기 중인 알림 ${remaining}개` : "";
  doriToastExtra.classList.toggle("hidden", remaining === 0);

  if (preToastView === null) preToastView = view === "settings" || view === "todos" ? view : "idle";
  doriShell.classList.add("alerting");
  if (view === "idle" || view === "chat") setView("menu", false);

  if (toastDismissTimer) clearTimeout(toastDismissTimer);
  toastDismissTimer = setTimeout(dismissToast, TOAST_DURATION_MS);
}

function dismissToast() {
  if (toastDismissTimer) {
    clearTimeout(toastDismissTimer);
    toastDismissTimer = null;
  }
  activeToast = null;
  if (toastQueue.length) {
    showNextToast();
    return;
  }
  finishToastSession();
}

function finishToastSession() {
  doriShell.classList.remove("alerting");
  if (preToastView && preToastView !== view) {
    setView(preToastView, false);
  }
  preToastView = null;
}

function enqueueToasts(todos) {
  if (!Array.isArray(todos) || !todos.length) return;
  for (const todo of todos) {
    if (todo && typeof todo.title === "string") toastQueue.push(todo);
  }
  showNextToast();
}

doriToastClose.addEventListener("click", dismissToast);
doriToastView.addEventListener("click", () => {
  preToastView = "todos";
  dismissToast();
});

window.desktopTimer.onTodosAlert((todos) => {
  enqueueToasts(todos);
});

renderDefaultLabel();
setExperimentalLabEnabled(cachedSettings.experimentalLab);
setView("idle", false);
refreshSettings();
refreshTodos();
