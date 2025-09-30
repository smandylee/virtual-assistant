# Virtual Assistant

AI 가상 어시스턴트 - Electron + Ollama + Llama 3.1을 사용한 데스크톱 애플리케이션

## 기능

- 🤖 **AI 채팅**: Llama 3.1 8B 모델을 사용한 자연어 대화
- 🖥️ **데스크톱 앱**: Electron 기반 크로스 플랫폼 GUI
- 🧠 **로컬 AI**: Ollama를 통한 완전 로컬 AI 실행
- 💾 **메모리**: SQLite 기반 대화 기록 저장

## 기술 스택

- **Frontend**: Electron + HTML/CSS/JavaScript
- **Backend**: Node.js + Express + TypeScript
- **AI**: Ollama + Llama 3.1 8B
- **Database**: SQLite
- **Build**: TypeScript + tsx

## 설치 및 실행

### 1. 필수 요구사항

- Node.js 20.19.4+
- Ollama
- macOS/Windows/Linux

### 2. Ollama 설치 및 모델 다운로드

```bash
# Ollama 설치 (macOS)
brew install ollama

# Ollama 서버 시작
ollama serve

# Llama 3.1 8B 모델 다운로드
ollama pull llama3.1:8b
```

### 3. 프로젝트 설정

```bash
# 의존성 설치
npm install

# TypeScript 컴파일
npm run build:desktop
npm run build:core
```

### 4. 실행

```bash
# 모든 서비스 동시 실행
npm run dev

# 또는 개별 실행
npm run dev:core      # API 서버 (포트 3030)
npm run dev:desktop   # Electron 앱
```

## 프로젝트 구조

```
virtual-assistant/
├── apps/desktop/          # Electron 데스크톱 앱
│   ├── src/main/         # 메인 프로세스
│   ├── src/renderer/     # 렌더러 프로세스
│   └── dist/             # 컴파일된 파일
├── core/                  # 백엔드 API 서버
│   ├── src/api/          # Express 서버
│   ├── src/agent/        # AI 에이전트
│   ├── src/memory/       # 데이터베이스
│   └── src/tools/        # 도구들
└── package.json          # 프로젝트 설정
```

## API 엔드포인트

- `GET /health` - 서버 상태 확인
- `POST /chat` - AI 채팅 요청
- `GET /tools` - 사용 가능한 도구 목록

## 환경 변수

```bash
OLLAMA_BASEURL=http://127.0.0.1:11434  # Ollama 서버 URL
LLM_MODEL=llama3.1:8b                  # 사용할 AI 모델
```

## 개발

```bash
# 개발 모드 실행
npm run dev

# 빌드
npm run build:core
npm run build:desktop

# 타입 체크
npx tsc --noEmit
```

## 라이선스

MIT License

## 기여

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request