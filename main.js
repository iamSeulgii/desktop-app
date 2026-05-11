const { app, BrowserWindow, Notification, ipcMain, powerMonitor, screen, shell } = require("electron");
const https = require("https");
const fs = require("fs");
const path = require("path");

const IDLE_WIDTH = 188;
const IDLE_HEIGHT = 220;
const MENU_WIDTH = 510;
const MENU_HEIGHT = 300;
const EXPANDED_WIDTH = 720;
const EXPANDED_HEIGHT = 380;
const BOTTOM_MARGIN = 18;
const RIGHT_MARGIN = 18;

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const ALLOWED_MODELS = new Set([
  "gemini-3.1-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
]);

function loadConfig() {
  const defaults = {
    maxTokens: 512,
    temperature: 0.7,
    systemPrompt:
      "너는 데스크탑 강아지 비서 도리야. 한국어로 친절하고 정확하게 답해. 답변은 간결하게 하되, 필요한 경우 단계별로 설명해."
  };

  try {
    const configPath = path.join(__dirname, "config.json");
    const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return { ...defaults, ...fileConfig };
  } catch (_error) {
    return defaults;
  }
}

const config = loadConfig();

const MAX_TIMEOUT_MS = 2_147_483_647;

let mainWindow;
let currentView = "idle";
let hasManualPosition = false;
let todoTimerId = null;
const chatHistory = [];

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), "utf8");
    const parsed = JSON.parse(raw);
    const apiKey = typeof parsed.geminiApiKey === "string" ? parsed.geminiApiKey : "";
    const model =
      typeof parsed.geminiModel === "string" && ALLOWED_MODELS.has(parsed.geminiModel)
        ? parsed.geminiModel
        : DEFAULT_GEMINI_MODEL;
    return {
      geminiApiKey: apiKey,
      geminiModel: model,
      experimentalLab: Boolean(parsed.experimentalLab)
    };
  } catch {
    return { geminiApiKey: "", geminiModel: DEFAULT_GEMINI_MODEL, experimentalLab: false };
  }
}

function saveSettingsToDisk(patch) {
  const current = loadSettings();
  const next = { ...current };

  if (patch && typeof patch === "object") {
    if (typeof patch.geminiApiKey === "string") {
      next.geminiApiKey = patch.geminiApiKey.trim();
    }
    if (typeof patch.geminiModel === "string" && ALLOWED_MODELS.has(patch.geminiModel)) {
      next.geminiModel = patch.geminiModel;
    }
    if (typeof patch.experimentalLab === "boolean") {
      next.experimentalLab = patch.experimentalLab;
    }
  }

  const filepath = getSettingsPath();
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function getTodosPath() {
  return path.join(app.getPath("userData"), "todos.json");
}

function loadTodos() {
  try {
    const raw = fs.readFileSync(getTodosPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (todo) =>
          todo &&
          typeof todo.id === "string" &&
          typeof todo.title === "string" &&
          Number.isFinite(todo.dueAt)
      )
      .map((todo) => ({
        id: todo.id,
        title: todo.title,
        dueAt: Number(todo.dueAt),
        createdAt: Number.isFinite(todo.createdAt) ? Number(todo.createdAt) : Date.now(),
        notified: Boolean(todo.notified)
      }));
  } catch {
    return [];
  }
}

function saveTodosToDisk(todos) {
  const filepath = getTodosPath();
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(todos, null, 2), "utf8");
}

function broadcastTodosChanged(todos) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("todos:changed", todos);
}

function showTodoNotification(todo) {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title: "도리 알림",
    body: todo.title,
    silent: false
  });
  notif.on("click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("todos:focus", { id: todo.id });
  });
  notif.show();
}

function fireDueTodos() {
  todoTimerId = null;
  const todos = loadTodos();
  const now = Date.now();
  const fired = [];

  for (const todo of todos) {
    if (!todo.notified && todo.dueAt <= now) {
      showTodoNotification(todo);
      todo.notified = true;
      fired.push({ ...todo });
    }
  }

  if (fired.length) {
    saveTodosToDisk(todos);
    broadcastTodosChanged(todos);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("todos:alert", fired);
    }
  }

  scheduleNextTodo();
}

function scheduleNextTodo() {
  if (todoTimerId) {
    clearTimeout(todoTimerId);
    todoTimerId = null;
  }

  const upcoming = loadTodos()
    .filter((todo) => !todo.notified)
    .sort((a, b) => a.dueAt - b.dueAt)[0];

  if (!upcoming) return;

  const delay = Math.max(0, upcoming.dueAt - Date.now());
  if (delay <= MAX_TIMEOUT_MS) {
    todoTimerId = setTimeout(fireDueTodos, delay);
  } else {
    todoTimerId = setTimeout(scheduleNextTodo, MAX_TIMEOUT_MS);
  }
}

function getWindowSize(view = currentView) {
  if (view === "chat" || view === "settings" || view === "todos") {
    return { width: EXPANDED_WIDTH, height: EXPANDED_HEIGHT };
  }
  if (view === "menu") return { width: MENU_WIDTH, height: MENU_HEIGHT };
  return { width: IDLE_WIDTH, height: IDLE_HEIGHT };
}

function getBottomRightBounds(view = currentView) {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const { width: windowWidth, height: windowHeight } = getWindowSize(view);

  return {
    width: windowWidth,
    height: windowHeight,
    x: Math.round(x + width - windowWidth - RIGHT_MARGIN),
    y: Math.round(y + height - windowHeight - BOTTOM_MARGIN)
  };
}

function clampToDisplay(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const { x, y, width, height } = display.workArea;

  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, x), x + width - bounds.width),
    y: Math.min(Math.max(bounds.y, y), y + height - bounds.height)
  };
}

function positionAtBottomRight() {
  if (!mainWindow) return;
  hasManualPosition = false;
  mainWindow.setBounds(getBottomRightBounds(), false);
}

function getViewBounds(view = currentView) {
  if (!hasManualPosition || !mainWindow) return getBottomRightBounds(view);

  const { x, y } = mainWindow.getBounds();
  const { width, height } = getWindowSize(view);
  return clampToDisplay({ x, y, width, height });
}

function setViewBounds(view, animate = true) {
  if (!mainWindow) return;
  currentView = view;
  mainWindow.setBounds(getViewBounds(view), animate);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...getBottomRightBounds(),
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  });
  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));

  screen.on("display-metrics-changed", positionAtBottomRight);
  screen.on("display-added", positionAtBottomRight);
  screen.on("display-removed", positionAtBottomRight);
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.hide();
  }

  createWindow();
  scheduleNextTodo();
  powerMonitor.on("resume", fireDueTodos);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.on("window:close", () => {
  app.quit();
});

ipcMain.on("window:pin-bottom", positionAtBottomRight);

ipcMain.on("window:drag-by", (_event, delta) => {
  if (!mainWindow) return;

  const deltaX = Number(delta?.deltaX) || 0;
  const deltaY = Number(delta?.deltaY) || 0;
  if (!deltaX && !deltaY) return;

  const bounds = mainWindow.getBounds();
  hasManualPosition = true;
  mainWindow.setPosition(Math.round(bounds.x + deltaX), Math.round(bounds.y + deltaY), false);
});

ipcMain.on("window:set-expanded", (_event, expanded) => {
  if (!mainWindow) return;
  setViewBounds(expanded ? "chat" : "menu", true);
});

ipcMain.on("window:set-view", (_event, view) => {
  if (!mainWindow) return;
  const nextView = ["idle", "menu", "chat", "settings", "todos"].includes(view) ? view : "idle";
  setViewBounds(nextView, true);
});

ipcMain.handle("settings:get", () => loadSettings());

ipcMain.handle("settings:save", (_event, payload) => saveSettingsToDisk(payload));

ipcMain.on("shell:open-external", (_event, url) => {
  if (typeof url !== "string") return;
  if (!/^https:\/\//i.test(url)) return;
  shell.openExternal(url);
});

ipcMain.handle("todos:list", () => loadTodos());

ipcMain.handle("todos:add", (_event, payload) => {
  const title = String(payload?.title || "").trim().slice(0, 200);
  const dueAt = Number(payload?.dueAt);

  if (!title) throw new Error("제목을 입력해주세요.");
  if (!Number.isFinite(dueAt)) throw new Error("시간이 올바르지 않아요.");

  const todos = loadTodos();
  const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  todos.push({ id, title, dueAt, createdAt: Date.now(), notified: false });
  saveTodosToDisk(todos);
  scheduleNextTodo();
  return todos;
});

ipcMain.handle("todos:remove", (_event, id) => {
  const next = loadTodos().filter((todo) => todo.id !== String(id || ""));
  saveTodosToDisk(next);
  scheduleNextTodo();
  return next;
});

ipcMain.handle("todos:clear-notified", () => {
  const next = loadTodos().filter((todo) => !todo.notified);
  saveTodosToDisk(next);
  scheduleNextTodo();
  return next;
});

function buildGeminiContents(prompt) {
  const history = chatHistory.map((entry) => ({
    role: entry.role === "assistant" ? "model" : "user",
    parts: [{ text: entry.content }]
  }));

  return [...history, { role: "user", parts: [{ text: prompt }] }];
}

function rememberExchange(prompt, answer) {
  if (!answer) return;

  chatHistory.push({ role: "user", content: prompt }, { role: "assistant", content: answer });
  if (chatHistory.length > 16) {
    chatHistory.splice(0, chatHistory.length - 16);
  }
}

function callGemini({ apiKey, model, contents, systemInstruction, generationConfig }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(generationConfig ? { generationConfig } : {})
    });

    const req = https.request(
      {
        method: "POST",
        hostname: "generativelanguage.googleapis.com",
        path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            let detail = `HTTP ${res.statusCode || "?"}`;
            try {
              const errJson = JSON.parse(data);
              if (errJson?.error?.message) detail = errJson.error.message;
            } catch (_error) {
              /* keep default */
            }
            reject(new Error(`Gemini API 오류: ${detail}`));
            return;
          }

          try {
            const json = JSON.parse(data);
            const candidate = json?.candidates?.[0];
            const finishReason = candidate?.finishReason;
            const parts = candidate?.content?.parts || [];
            const text = parts.map((part) => part?.text || "").join("");

            if (!text && finishReason && finishReason !== "STOP") {
              reject(new Error(`응답이 차단되었어요 (${finishReason}).`));
              return;
            }

            resolve(text);
          } catch (_error) {
            reject(new Error("Gemini API 응답을 파싱하지 못했어요."));
          }
        });
      }
    );

    req.on("error", (err) => reject(new Error(`Gemini API 요청 실패: ${err.message}`)));
    req.write(body);
    req.end();
  });
}

async function createGeminiResponse(prompt, requestId, webContents) {
  const settings = loadSettings();
  if (!settings.geminiApiKey) {
    const message = "Gemini API 키가 없어요. 설정(⚙)에서 키를 입력해주세요.";
    webContents.send("chat:error", { requestId, message });
    throw new Error(message);
  }

  try {
    const text = await callGemini({
      apiKey: settings.geminiApiKey,
      model: settings.geminiModel || DEFAULT_GEMINI_MODEL,
      contents: buildGeminiContents(prompt),
      systemInstruction: config.systemPrompt
        ? { parts: [{ text: config.systemPrompt }] }
        : undefined,
      generationConfig: {
        temperature: typeof config.temperature === "number" ? config.temperature : 0.7,
        maxOutputTokens: config.maxTokens || 512
      }
    });

    const answer = (text || "").trim();
    rememberExchange(prompt, answer);
    webContents.send("chat:done", { requestId, text: answer });
    return answer;
  } catch (error) {
    webContents.send("chat:error", { requestId, message: error.message });
    throw error;
  }
}

ipcMain.handle("chat:ask", async (event, payload) => {
  const trimmed = String(payload?.prompt || "").trim();
  const requestId = String(payload?.requestId || Date.now());

  if (!trimmed) {
    throw new Error("질문을 입력해주세요.");
  }

  try {
    return await createGeminiResponse(trimmed, requestId, event.sender);
  } catch (_error) {
    return "";
  }
});
