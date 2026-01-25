import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, Notification } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV === "development";
const API_URL = process.env.API_URL || "http://localhost:3030";
let avatarWindow = null;
let chatWindow = null;
let tray = null;
let reminderConnection = null;
// ==================== 리마인더 SSE 연결 ====================
// 시스템 알림 표시
function showReminderNotification(title, body) {
    if (Notification.isSupported()) {
        const notification = new Notification({
            title: `🔔 ${title}`,
            body: body,
            silent: false,
            urgency: 'critical',
            timeoutType: 'default'
        });
        notification.on('click', () => {
            // 알림 클릭 시 채팅 창 열기
            if (chatWindow) {
                chatWindow.show();
                chatWindow.focus();
            }
            else {
                createChatWindow();
            }
        });
        notification.show();
        console.log(`📢 시스템 알림 표시: ${title}`);
    }
    else {
        console.log(`⚠️ 시스템 알림이 지원되지 않음: ${title} - ${body}`);
    }
}
// SSE로 리마인더 스트림 연결
function connectReminderStream() {
    try {
        const url = new URL(`${API_URL}/reminders/stream`);
        const options = {
            hostname: url.hostname,
            port: url.port || 3030,
            path: url.pathname,
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache'
            }
        };
        const req = http.request(options, (res) => {
            console.log('🔗 리마인더 스트림 연결됨');
            let buffer = '';
            res.on('data', (chunk) => {
                buffer += chunk.toString();
                // SSE 메시지 파싱
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || ''; // 마지막 불완전한 메시지는 버퍼에 유지
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.type === 'reminder') {
                                console.log(`📅 리마인더 수신: ${data.title} (${data.minutesUntil}분 후)`);
                                showReminderNotification(data.title, data.message || `${data.minutesUntil}분 후에 일정이 있습니다.`);
                                // 아바타 창에도 알림 전송
                                if (avatarWindow && !avatarWindow.isDestroyed()) {
                                    avatarWindow.webContents.send('reminder', data);
                                }
                                if (chatWindow && !chatWindow.isDestroyed()) {
                                    chatWindow.webContents.send('reminder', data);
                                }
                            }
                            else if (data.type === 'connected') {
                                console.log('✅ 리마인더 스트림 연결 확인됨');
                            }
                        }
                        catch (e) {
                            // JSON 파싱 실패 무시
                        }
                    }
                }
            });
            res.on('end', () => {
                console.log('🔌 리마인더 스트림 연결 종료, 5초 후 재연결...');
                setTimeout(connectReminderStream, 5000);
            });
            res.on('error', (err) => {
                console.error('리마인더 스트림 오류:', err.message);
                setTimeout(connectReminderStream, 5000);
            });
        });
        req.on('error', (err) => {
            console.error('리마인더 연결 실패:', err.message, '- 5초 후 재시도...');
            setTimeout(connectReminderStream, 5000);
        });
        req.end();
        reminderConnection = req;
    }
    catch (error) {
        console.error('리마인더 스트림 연결 오류:', error.message);
        setTimeout(connectReminderStream, 5000);
    }
}
// 플로팅 아바타 창 생성
function createAvatarWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    avatarWindow = new BrowserWindow({
        width: 400,
        height: 300,
        x: width - 420, // 오른쪽 하단
        y: height - 320,
        transparent: true, // 투명 배경
        frame: false, // 프레임 없음
        resizable: false,
        hasShadow: false,
        alwaysOnTop: true, // 항상 위에
        skipTaskbar: true, // 작업표시줄에 안 보임
        focusable: true,
        fullscreenable: false,
        type: 'toolbar', // 다른 창 위에 표시
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false
        }
    });
    avatarWindow.loadFile(path.join(__dirname, "../renderer/avatar.html"));
    avatarWindow.webContents.setZoomFactor(1);
    // 창 이동 IPC 핸들러
    ipcMain.on('overlay:move-by', (_event, payload) => {
        if (!avatarWindow)
            return;
        const { dx, dy } = payload;
        const [cx, cy] = avatarWindow.getPosition();
        avatarWindow.setPosition(cx + Math.round(dx), cy + Math.round(dy), true);
    });
    // 아바타 창 닫기 핸들러
    ipcMain.on('overlay:close', () => {
        if (avatarWindow) {
            avatarWindow.hide();
        }
    });
    // 채팅 창 열기 핸들러
    ipcMain.on('open-chat', () => {
        if (chatWindow) {
            chatWindow.show();
            chatWindow.focus();
        }
        else {
            createChatWindow();
        }
    });
    avatarWindow.on('closed', () => {
        avatarWindow = null;
    });
    // 개발 모드에서 DevTools 열기
    if (isDev) {
        avatarWindow.webContents.openDevTools({ mode: 'detach' });
    }
}
// 채팅 창 생성 (전체 기능)
function createChatWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    chatWindow = new BrowserWindow({
        width: 400,
        height: 600,
        x: Math.floor((width - 400) / 2),
        y: Math.floor((height - 600) / 2),
        transparent: false,
        frame: true,
        resizable: true,
        minWidth: 350,
        minHeight: 400,
        hasShadow: true,
        alwaysOnTop: false,
        skipTaskbar: false,
        focusable: true,
        fullscreenable: false,
        backgroundColor: '#1a1a1a',
        show: false, // 처음엔 숨김
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false
        }
    });
    chatWindow.loadFile(path.join(__dirname, "../renderer/chat.html"));
    chatWindow.webContents.setZoomFactor(1);
    chatWindow.on('closed', () => {
        chatWindow = null;
    });
    chatWindow.on('ready-to-show', () => {
        chatWindow?.show();
    });
}
// 트레이 아이콘 생성
function createTray() {
    // 간단한 아이콘 (실제 아이콘 파일이 없으면 빈 이미지 사용)
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '아바타 보이기',
            click: () => {
                if (avatarWindow) {
                    avatarWindow.show();
                }
                else {
                    createAvatarWindow();
                }
            }
        },
        {
            label: '채팅 창 열기',
            click: () => {
                if (chatWindow) {
                    chatWindow.show();
                    chatWindow.focus();
                }
                else {
                    createChatWindow();
                }
            }
        },
        { type: 'separator' },
        {
            label: '종료',
            click: () => {
                app.quit();
            }
        }
    ]);
    tray.setToolTip('Alpha - AI 비서');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
        if (avatarWindow) {
            if (avatarWindow.isVisible()) {
                avatarWindow.hide();
            }
            else {
                avatarWindow.show();
            }
        }
    });
}
app.whenReady().then(() => {
    createAvatarWindow(); // 플로팅 아바타 창으로 시작
    // createTray();       // 트레이 아이콘 (선택사항)
    // 리마인더 SSE 스트림 연결 (3초 후 시작 - 서버 준비 대기)
    setTimeout(() => {
        console.log('⏰ 리마인더 알림 시스템 시작...');
        connectReminderStream();
    }, 3000);
});
app.on("window-all-closed", () => {
    // SSE 연결 정리
    if (reminderConnection) {
        reminderConnection.destroy();
        reminderConnection = null;
    }
    if (process.platform !== "darwin")
        app.quit();
});
app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createAvatarWindow();
    }
});
//# sourceMappingURL=index.js.map