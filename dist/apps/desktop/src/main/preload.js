import { contextBridge } from "electron";
contextBridge.exposeInMainWorld("env", { API: "http://localhost:3030" });
//# sourceMappingURL=preload.js.map