const { app, BrowserWindow, ipcMain, screen } = require("electron");
const { spawn } = require("child_process");
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

function loadConfig() {
  const defaults = {
    modelFile: "dori.gguf",
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

let mainWindow;
let currentView = "idle";
let hasManualPosition = false;
const chatMessages = [{ role: "system", content: config.systemPrompt }];

function getWindowSize(view = currentView) {
  if (view === "chat") return { width: EXPANDED_WIDTH, height: EXPANDED_HEIGHT };
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
  const nextView = ["idle", "menu", "chat"].includes(view) ? view : "idle";
  setViewBounds(nextView, true);
});

function getResourceRoot() {
  return app.isPackaged ? process.resourcesPath : __dirname;
}

function getLlamaBinaryPath() {
  const binaryName = process.platform === "win32" ? "llama-cli.exe" : "llama-cli";
  const platformDir = process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
  return path.join(getResourceRoot(), "resources", "llama", platformDir, binaryName);
}

function getModelPath() {
  const modelFile = process.env.DORI_MODEL || config.modelFile;
  if (path.isAbsolute(modelFile)) return modelFile;
  return path.join(getResourceRoot(), "resources", "models", modelFile);
}

function buildPrompt(userPrompt) {
  const history = chatMessages
    .slice(1)
    .map((message) => `${message.role === "user" ? "사용자" : "도리"}: ${message.content}`)
    .join("\n");

  return [
    config.systemPrompt,
    history ? `이전 대화:\n${history}` : "",
    `사용자: ${userPrompt}`,
    "도리:"
  ]
    .filter(Boolean)
    .join("\n\n");
}

function rememberExchange(prompt, answer) {
  if (!answer) return;

  chatMessages.push({ role: "user", content: prompt }, { role: "assistant", content: answer });
  if (chatMessages.length > 17) {
    chatMessages.splice(1, chatMessages.length - 17);
  }
}

function createLocalResponse(prompt, requestId, webContents) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let finalText = "";
    const binaryPath = getLlamaBinaryPath();
    const modelPath = getModelPath();

    function fail(error) {
      if (settled) return;
      settled = true;
      webContents.send("chat:error", { requestId, message: error.message });
      reject(error);
    }

    function finish() {
      if (settled) return;
      settled = true;
      const answer = finalText.trim();
      rememberExchange(prompt, answer);
      webContents.send("chat:done", { requestId, text: answer });
      resolve(answer);
    }

    if (!fs.existsSync(binaryPath)) {
      fail(new Error(`내장 LLM 실행파일을 찾을 수 없습니다: ${binaryPath}`));
      return;
    }

    if (!fs.existsSync(modelPath)) {
      fail(new Error(`내장 모델 파일을 찾을 수 없습니다: ${modelPath}`));
      return;
    }

    const args = [
      "-m",
      modelPath,
      "-p",
      buildPrompt(prompt),
      "-n",
      String(config.maxTokens || 512),
      "--temp",
      String(config.temperature ?? 0.7),
      "--no-display-prompt",
      "--simple-io"
    ];

    const child = spawn(binaryPath, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (!chunk || settled) return;
      finalText += chunk;
      webContents.send("chat:chunk", { requestId, chunk });
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      if (process.env.DORI_DEBUG_LLM) console.error(chunk);
    });

    child.on("error", () => {
      fail(new Error("내장 LLM을 실행하지 못했습니다."));
    });

    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0 && !finalText.trim()) {
        fail(new Error(`내장 LLM 실행이 실패했습니다. 종료 코드: ${code}`));
        return;
      }
      finish();
    });
  });
}

ipcMain.handle("chat:ask", async (event, payload) => {
  const trimmed = String(payload?.prompt || "").trim();
  const requestId = String(payload?.requestId || Date.now());

  if (!trimmed) {
    throw new Error("질문을 입력해주세요.");
  }

  try {
    return await createLocalResponse(trimmed, requestId, event.sender);
  } catch (_error) {
    return "";
  }
});
