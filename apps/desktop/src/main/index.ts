import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV === "development";

let avatarWindow: BrowserWindow | null = null;
let chatWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// 플로팅 아바타 창 생성
function createAvatarWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  avatarWindow = new BrowserWindow({
    width: 400,
    height: 300,
    x: width - 420,  // 오른쪽 하단
    y: height - 320,
    transparent: true,        // 투명 배경
    frame: false,             // 프레임 없음
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,        // 항상 위에
    skipTaskbar: true,        // 작업표시줄에 안 보임
    focusable: true,
    fullscreenable: false,
    type: 'toolbar',          // 다른 창 위에 표시
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
    if (!avatarWindow) return;
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
    } else {
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
    show: false,  // 처음엔 숨김
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
        } else {
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
        } else {
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
      } else {
        avatarWindow.show();
      }
    }
  });
}

app.whenReady().then(() => {
  createAvatarWindow();  // 플로팅 아바타 창으로 시작
  // createTray();       // 트레이 아이콘 (선택사항)
});

app.on("window-all-closed", () => { 
  if (process.platform !== "darwin") app.quit(); 
});

app.on("activate", () => { 
  if (BrowserWindow.getAllWindows().length === 0) {
    createAvatarWindow();
  }
});
