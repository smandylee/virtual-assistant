import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("env", { API: "http://localhost:3030" });
// 플로팅 아바타 창 제어 브릿지
contextBridge.exposeInMainWorld("overlay", {
    // 창 이동 (상대 좌표)
    moveBy: (dx, dy) => ipcRenderer.send("overlay:move-by", { dx, dy }),
    // 창 닫기 (숨김)
    close: () => ipcRenderer.send("overlay:close"),
    // 채팅 창 열기
    openChat: () => ipcRenderer.send("open-chat"),
    // 기존 setBounds (호환성)
    setBounds: (payload) => ipcRenderer.send("overlay:set-bounds", payload)
});
// 리마인더 알림 브릿지
contextBridge.exposeInMainWorld("reminder", {
    // 리마인더 이벤트 수신
    onReminder: (callback) => {
        ipcRenderer.on("reminder", (_event, data) => callback(data));
    },
    // 리스너 제거
    removeListener: () => {
        ipcRenderer.removeAllListeners("reminder");
    }
});
//# sourceMappingURL=preload.js.map