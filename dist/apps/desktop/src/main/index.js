import { app, BrowserWindow } from "electron";
import path from "path";
const isDev = process.env.NODE_ENV === "development";
function createWindow() {
    const win = new BrowserWindow({
        width: 980, height: 720,
        webPreferences: { preload: path.join(__dirname, "preload.js") }
    });
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
    if (isDev)
        win.webContents.openDevTools({ mode: "detach" });
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin")
    app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0)
    createWindow(); });
//# sourceMappingURL=index.js.map