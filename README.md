# Virtual Assistant - 파우스트

AI 가상 어시스턴트 - Electron + Gemini + ElevenLabs TTS를 사용한 데스크톱 애플리케이션

워더링하이츠 저택의 버틀러 '파우스트'가 당신을 모십니다.

## 기능

- 🎩 **버틀러 파우스트**: 격식 있고 점잖은 말투의 AI 비서
- 🗣️ **음성 대화**: ElevenLabs TTS + Gemini STT로 자연스러운 음성 대화
- 🔍 **웹 검색**: 날씨, 뉴스, 정보 검색 기능
- 📂 **파일/폴더 관리**: 파일 열기, 폴더 탐색
- 🎮 **프로그램 실행**: Steam 게임, 앱 실행
- 📅 **일정 관리**: 일정 추가/조회/삭제
- 🎬 **YouTube**: 영상 검색 및 재생
- 💾 **메모리**: SQLite 기반 대화 기록 저장

## 기술 스택

- **Frontend**: Electron + HTML/CSS/JavaScript
- **Backend**: Node.js + Express + TypeScript
- **AI**: Google Gemini 3 Flash Preview
- **TTS**: ElevenLabs (커스텀 음성 지원)
- **STT**: Gemini Speech-to-Text
- **Database**: SQLite (better-sqlite3)

## 설치 및 실행

### 1. 필수 요구사항

- Node.js 20+
- Windows/macOS/Linux

### 2. API 키 설정

`.env` 파일에 API 키를 설정하세요:

```bash
GEMINI_API_KEY=your_gemini_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

### 3. 프로젝트 설정

```bash
# 의존성 설치
npm install

# TypeScript 컴파일
npm run build:core
npm run build:desktop
```

### 4. 실행

```bash
# Windows - 간단 실행
start_simple.bat

# 또는 npm 스크립트
npm run dev:win      # Windows
npm run dev          # macOS/Linux

# 개별 실행
npm run dev:core     # API 서버 (포트 3030)
```

## 프로젝트 구조

```
virtual-assistant/
├── apps/desktop/          # Electron 데스크톱 앱
│   ├── src/main/         # 메인 프로세스
│   ├── src/renderer/     # 렌더러 (avatar.html, chat.html)
│   └── dist/             # 컴파일된 파일
├── core/                  # 백엔드 API 서버
│   ├── src/api/          # Express 서버
│   ├── src/agent/        # Gemini AI 에이전트
│   ├── src/memory/       # SQLite 데이터베이스
│   └── src/tools/        # 도구들 (파일, 검색, 일정 등)
├── avatar-overlay/        # Python 아바타 오버레이 (선택)
├── start_simple.bat       # Windows 간단 실행
└── start_with_avatar.bat  # 아바타와 함께 실행
```

## API 엔드포인트

| 엔드포인트 | 메소드 | 설명 |
|-----------|--------|------|
| `/health` | GET | 서버 상태 확인 |
| `/chat` | POST | AI 채팅 요청 |
| `/chat/voice` | POST | 음성 채팅 (STT + 채팅) |
| `/text-to-speech` | POST | ElevenLabs TTS |
| `/speech-to-text` | POST | Gemini STT |
| `/tools` | GET | 사용 가능한 도구 목록 |

## 사용 가능한 도구

- `open_folder` - 폴더 열기
- `open_file` - 파일 실행
- `execute_command` - 명령어 실행
- `web_search` - 웹 검색
- `news_search` - 뉴스 검색
- `add_schedule` - 일정 추가
- `get_schedules` - 일정 조회
- `delete_schedule` - 일정 삭제
- `launch_program` - 프로그램 실행
- `launch_steam_game` - Steam 게임 실행
- `youtube_search` - YouTube 검색
- `youtube_play` - YouTube 재생

## 환경 변수

```bash
GEMINI_API_KEY=           # Google Gemini API 키
ELEVENLABS_API_KEY=       # ElevenLabs API 키
ALLOW_DIR=C:\Users\User   # 파일 검색 허용 디렉토리
```

## 개발

```bash
# 개발 모드 실행
npm run dev:win          # Windows
npm run dev              # macOS/Linux

# 빌드
npm run build:core       # 코어 빌드
npm run build:desktop    # 데스크톱 빌드
```

## 말투 커스터마이징

`core/src/api/server.ts`의 시스템 프롬프트를 수정하여 AI의 말투를 변경할 수 있습니다.

현재 설정: **워더링하이츠 버틀러 파우스트** 스타일
- 격식 있고 점잖은 경어체
- '~하시죠', '~드리겠습니다', '~하시기를'
- 이모지 사용 안 함

## 라이선스

MIT License

## 기여

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
