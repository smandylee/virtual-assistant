@echo off
echo 🎭 가상 아바타 오버레이 통합 실행
echo.

echo 📁 1단계: 아바타 이미지 복사
cd avatar-overlay
python copy_images.py
if errorlevel 1 (
    echo ❌ 이미지 복사 실패
    pause
    exit /b 1
    
)

echo.
echo 🐍 2단계: Python OpenCV 아바타 시작
start "Avatar Overlay" python start_avatar.py

echo.
echo ⏳ 3초 대기 중...
timeout /t 3 /nobreak > nul

echo.
echo 🚀 3단계: Node.js API 서버 시작
cd ..
start "API Server" npm run dev

echo.
echo ⏳ 3초 대기 중...
timeout /t 3 /nobreak > nul

echo.
echo 🖥️ 4단계: Electron 데스크톱 앱 시작
start "Desktop App" npm run dev:desktop:win

echo.
echo ✅ 모든 서비스가 시작되었습니다!
echo.
echo 📋 실행 중인 서비스:
echo    - Python OpenCV 아바타 (포트 5001)
echo    - Node.js API 서버 (포트 3030)  
echo    - Electron 데스크톱 앱
echo.
echo ⌨️  종료하려면 각 창을 닫거나 Ctrl+C를 누르세요.
pause
