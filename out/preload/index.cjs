"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  openDirectory: () => electron.ipcRenderer.invoke("dialog:openDirectory"),
  openFile: () => electron.ipcRenderer.invoke("dialog:openFile"),
  scanFolder: (folderPath) => electron.ipcRenderer.invoke("fs:scanFolder", folderPath),
  onOpenCvReady: (callback) => {
    electron.ipcRenderer.on("opencv-ready", callback);
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
