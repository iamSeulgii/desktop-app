const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopTimer", {
  close: () => ipcRenderer.send("window:close"),
  pinBottom: () => ipcRenderer.send("window:pin-bottom"),
  dragBy: (deltaX, deltaY) => ipcRenderer.send("window:drag-by", { deltaX, deltaY }),
  setExpanded: (expanded) => ipcRenderer.send("window:set-expanded", expanded),
  setView: (view) => ipcRenderer.send("window:set-view", view),
  ask: (prompt, requestId) => ipcRenderer.invoke("chat:ask", { prompt, requestId }),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (next) => ipcRenderer.invoke("settings:save", next),
  openExternal: (url) => ipcRenderer.send("shell:open-external", url),
  onChatChunk: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("chat:chunk", listener);
    return () => ipcRenderer.removeListener("chat:chunk", listener);
  },
  onChatDone: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("chat:done", listener);
    return () => ipcRenderer.removeListener("chat:done", listener);
  },
  onChatError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("chat:error", listener);
    return () => ipcRenderer.removeListener("chat:error", listener);
  }
});
