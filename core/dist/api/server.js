"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const genai_1 = require("@google/genai");
const db_1 = require("../memory/db");
const gemini_1 = require("../agent/gemini");
const tools_route_1 = require("./tools-route");
const index_1 = require("../tools/index");
// Gemini API 클라이언트 (채팅 + STT)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyBfP5MTl0LvryqvuGsvZd9M1Tj08dUHPDM";
const ai = new genai_1.GoogleGenAI({ apiKey: GEMINI_API_KEY });
// ElevenLabs API 키 (TTS용)
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "sk_5229b050180c3757be791ca1c2954834d44cbbcf7dd533f2";
// OpenCV 아바타 통신 함수들 (주석 처리 - 아바타 미사용)
// async function sendToAvatar(endpoint: string, data: any = {}) {
//   try {
//     const response = await fetch(`http://localhost:5001/avatar/${endpoint}`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(data)
//     });
//     return await response.json();
//   } catch (error) {
//     console.log(`OpenCV 아바타 통신 실패: ${endpoint}`, error);
//     return null;
//   }
// }
// async function changeAvatarExpression(emotion: string) {
//   return await sendToAvatar('expression', { expression: emotion });
// }
// async function startAvatarTalking() {
//   return await sendToAvatar('talk', {});
// }
// async function stopAvatarTalking() {
//   return await sendToAvatar('stop', {});
// }
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "5mb" }));
// 파일 업로드를 위한 multer 설정
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB 제한 (Whisper API 제한)
    fileFilter: (_req, file, cb) => {
        // 오디오 파일 형식만 허용
        const allowedMimes = [
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm',
            'audio/m4a', 'audio/ogg', 'audio/flac', 'audio/x-m4a'
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('지원하지 않는 오디오 형식입니다. MP3, WAV, WebM, M4A, OGG, FLAC 형식을 사용해주세요.'));
        }
    }
});
// DB 초기화 (서버 시작 시 1회)
(0, db_1.initDb)();
// 간단 헬스체크
app.get("/health", (_req, res) => res.json({ ok: true }));
// 공통 시스템 프롬프트 도구 목록
const AVAILABLE_TOOLS_PROMPT = `
**사용 가능한 도구 목록 (이 목록에 없는 도구는 절대 사용하지 마세요!):**
- open_folder: 폴더 열기
- open_file: 파일 열기
- execute_command: 명령어 실행
- search_files: 파일 검색
- web_search: 웹 검색
- add_schedule: 일정 추가
- get_schedules: 일정 조회
- delete_schedule: 일정 삭제
- check_reminders: 리마인더 체크
- cleanup_expired_schedules: 지난 일정 정리
- launch_steam_game: 스팀 게임 실행
- launch_program: 프로그램 실행 (계산기, 크롬, 디스코드 등 모든 프로그램)

**절대 금지:**
- open_calculator, open_notepad 같은 존재하지 않는 도구는 절대 만들지 마세요!
- 프로그램 실행은 반드시 launch_program 도구를 사용하세요!
`;
app.post("/chat", async (req, res) => {
    const { message, tts = false, ttsVoice = 'sage', ttsModel = 'gpt-4o-mini-tts', ttsSpeed = 1.0 } = req.body ?? {};
    console.log('채팅 요청 받음:', { message: message?.substring(0, 50), tts, ttsVoice, ttsModel });
    if (!message)
        return res.status(400).json({ error: "message required" });
    try {
        // 툴 사용 최소화 - 명확한 요청만 처리
        const hasFolderKeyword = message.includes('폴더') || message.includes('디렉토리') || message.includes('탐색기');
        const hasFileKeyword = message.includes('파일');
        const hasCommandKeyword = (message.includes('명령') || message.includes('명령어')) && !hasFileKeyword && !hasFolderKeyword;
        const hasSteamKeyword = message.includes('스팀') || (message.includes('게임') && (message.includes('켜') || message.includes('실행') || message.includes('열')));
        const hasProgramKeyword = message.includes('프로그램') || message.includes('앱') || message.includes('켜줘') || message.includes('실행해줘');
        const hasRunKeyword = message.includes('실행') || message.includes('켜') || message.includes('열어') || message.includes('켜줘') || message.includes('띄워') || message.includes('열');
        const hasYoutubeKeyword = message.includes('유튜브') || message.includes('youtube') || message.includes('영상');
        const hasYoutubeChannelKeyword = hasYoutubeKeyword && (message.includes('채널') || message.includes('최신'));
        const hasYoutubePlayKeyword = hasYoutubeKeyword && (message.includes('틀어') || message.includes('재생') || message.includes('보여') || message.includes('켜'));
        const isFolderRequest = hasFolderKeyword;
        const isFileRequest = !isFolderRequest && hasFileKeyword;
        const isCommandRequest = !isFolderRequest && !isFileRequest && hasCommandKeyword;
        const isSteamRequest = hasSteamKeyword && !isFolderRequest && !isFileRequest && !hasProgramKeyword;
        const isProgramRequest = (hasProgramKeyword || hasRunKeyword) && !isFolderRequest && !isFileRequest && !isSteamRequest && !hasYoutubeKeyword;
        const isYoutubeRequest = hasYoutubeKeyword && !isFolderRequest && !isFileRequest && !isSteamRequest;
        // 🔥 실시간 날짜/시간 정보 생성
        const now = new Date();
        const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
        const timeInfo = `[현재 시각] ${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${days[now.getDay()]} ${now.getHours()}시 ${now.getMinutes()}분\n`;
        // 시스템 프롬프트 - 워더링하이츠 버틀러 파우스트 스타일
        const BASE_SYSTEM = `당신은 '파우스트'라는 이름의 버틀러입니다. 워더링하이츠 저택의 격식 있는 버틀러처럼 말하세요.

**말투 규칙:**
- 격식 있고 점잖은 경어체 사용: '~하시죠', '~드리겠습니다', '~하시기를', '~입니다'
- 차분하고 절제된 어조, 감정을 드러내지 않음
- 주인을 모시는 충실한 버틀러처럼 정중하게
- 이모지 절대 사용 금지
- 1-2문장으로 간결하게 답변
- 답변마다 인사말 없이 바로 답변

**말투 예시:**
- "부르신다면 언제든." 
- "간단합니다."
- "불편하신 점이라도."
- "즉시 처리해드리겠습니다."
- "말씀하신 대로 준비하겠습니다."
- "그리 하시죠."
- "아직 미숙한 부분이 있을 줄은..."
- "모쪼록, 이해해주시기를."

**절대 금지:**
- '~해요', '~예요' 같은 친근한 말투 금지
- 이모지, 감탄사('와!', '오!') 금지
- 자기소개 금지

**기타:**
- 한국어 맞춤법/문법 100% 정확
- 사용자가 영어로 말해도 한국어로 답변
- 날짜/시간 질문 시 [현재 시각] 정보 참고
`;
        let system = timeInfo + BASE_SYSTEM;
        // YouTube 관련 요청 처리
        if (isYoutubeRequest) {
            if (hasYoutubeChannelKeyword) {
                system += "**YouTube 채널 영상 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
                system += '{"tool": "youtube_channel", "input": "채널이름"}\n';
                system += "\n**중요**: input에는 채널 이름만 넣어주세요. (예: '팔차선', '침착맨', 'BTS')\n";
                system += "최신 영상을 틀어달라고 하면 자동으로 첫 번째 영상이 재생됩니다.\n";
            }
            else if (hasYoutubePlayKeyword) {
                system += "**YouTube 영상 재생 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
                system += '{"tool": "youtube_play", "input": "검색어 또는 영상 제목"}\n';
                system += "\n**중요**: input에는 검색하고 싶은 영상/노래 이름을 넣어주세요.\n";
            }
            else {
                system += "**YouTube 검색 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
                system += '{"tool": "youtube_search", "input": "검색어"}\n';
            }
        }
        else if (isFolderRequest) {
            system += "**폴더 열기 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
            system += '{"tool": "open_folder", "input": "C:\\\\Users\\\\User\\\\Desktop\\\\승무의 프로젝트"}\n';
            system += "\n**중요**: input에는 폴더명만 넣어주세요. 시스템이 자동으로 경로를 찾습니다.\n";
        }
        else if (isFileRequest) {
            system += "**파일 실행 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
            system += '{"tool": "open_file", "input": "example.txt"}\n';
            system += "\n**중요**: \n";
            system += "1. input에는 사용자가 언급한 파일명만 넣어주세요 (예: test.txt, 문서.docx)\n";
            system += "2. 전체 경로를 모르면 파일명만 입력하세요. 시스템이 자동으로 찾습니다.\n";
            system += "3. '파일경로' 같은 placeholder는 절대 사용하지 마세요!\n";
        }
        else if (isSteamRequest) {
            system += "**스팀 게임 실행 요청입니다! 반드시 다음 JSON 형식으로만 응답하세요:**\n";
            system += '```json\n{"tool": "launch_steam_game", "input": "{\\"gameName\\": \\"게임이름\\"}"}\n```\n';
            system += "\n**매우 중요**: \n";
            system += "1. 사용자가 언급한 게임 이름을 그대로 추출하세요 (예: '이터널 리턴', '카운터 스트라이크', '리그 오브 레전드')\n";
            system += "2. 게임 ID를 모르면 gameName만 사용하세요\n";
            system += "3. input은 JSON 문자열이므로 이중 이스케이프 필요: {\\\"gameName\\\": \\\"정확한게임이름\\\"}\n";
            system += "4. 반드시 ```json 코드 블록으로 감싸서 응답하세요!\n";
        }
        else if (isProgramRequest) {
            system += "**프로그램 실행 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
            system += '{"tool": "launch_program", "input": "카카오톡"}\n';
            system += "\n**중요**: input에는 사용자가 말한 프로그램 이름 그대로 넣어주세요. (예: '카카오톡', '크롬', '디스코드')\n";
        }
        else if (isCommandRequest) {
            system += "**명령어 실행 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
            system += '{"tool": "execute_command", "input": "dir"}\n';
        }
        else if (message.includes('검색') || message.includes('찾아') || message.includes('알려') || message.includes('뉴스') || message.includes('날씨') || message.includes('온도') || message.includes('몇 도') || message.includes('몇도') || message.includes('기온')) {
            system += "**웹 검색 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
            system += '{"tool": "web_search", "input": "검색어"}\n';
            system += "\n**중요**: input에는 검색하고 싶은 키워드만 넣어주세요. 날씨/온도 질문은 '지역명 날씨' 형태로 검색하세요.\n";
        }
        else if (message.includes('일정') || message.includes('스케줄') || message.includes('약속') || message.includes('회의') || message.includes('미팅')) {
            // 일정 추가인지 조회인지 판단
            if (message.includes('추가') || message.includes('등록') || message.includes('저장') ||
                message.match(/\d{1,2}월\s*\d{1,2}일/) || message.match(/\d{4}-\d{2}-\d{2}/) ||
                message.includes('시') || message.includes('분')) {
                system += "**일정 추가 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
                system += '{"tool": "add_schedule", "title": "일정 제목", "date": "2024-01-01", "time": "14:00", "description": "설명"}\n';
                system += "\n**중요**: 사용자 메시지에서 날짜와 시간을 추출해서 정확한 형식으로 변환하세요.\n";
                system += "- 날짜: YYYY-MM-DD 형식 (예: 2024-12-25)\n";
                system += "- 시간: HH:MM 형식 (예: 14:30)\n";
            }
            else if (message.includes('리마인더') || message.includes('알림') || message.includes('체크')) {
                system += "**리마인더 체크 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
                system += '{"tool": "check_reminders"}\n';
                system += "\n**중요**: 1시간 전 일정들을 체크해서 알려주세요.\n";
            }
            else {
                system += "**일정 조회 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
                system += '{"tool": "get_schedules", "date": "2024-01-01"}\n';
                system += "\n**중요**: 특정 날짜가 언급되면 해당 날짜만, 아니면 전체 일정을 조회하세요.\n";
            }
        }
        system += "\n**중요: 도구를 사용할 때는 반드시 다음 형식으로만 응답하세요:**\n";
        system += "```json\n{\"tool\": \"도구명\", \"input\": \"입력값\"}\n```\n";
        system += AVAILABLE_TOOLS_PROMPT;
        system += "\n잘못된 맞춤법이나 문법 오류는 절대 허용하지 않습니다.";
        let reply = await (0, gemini_1.chatWithGemini)(system, message);
        let toolError = null;
        let toolSuccess = false;
        let toolResult = null;
        // JSON 도구 호출 파싱 및 실행
        try {
            let toolCall = null;
            // 1. 코드펜스 JSON 블록 찾기 (```json ... ```)
            const codeFenceMatch = reply.match(/```json\s*(\{[\s\S]*?\})\s*```/);
            if (codeFenceMatch) {
                console.log('코드펜스 JSON 발견:', codeFenceMatch[1]);
                toolCall = JSON.parse(codeFenceMatch[1]);
            }
            else {
                // 2. 전체 응답이 JSON인지 확인
                try {
                    toolCall = JSON.parse(reply.trim());
                    console.log('전체 응답이 JSON:', toolCall);
                }
                catch {
                    // 3. JSON 블록 찾기 (개선된 정규식)
                    const jsonMatch = reply.match(/\{[^{}]*"tool"[^{}]*\}/);
                    if (jsonMatch) {
                        console.log('JSON 블록 발견:', jsonMatch[0]);
                        toolCall = JSON.parse(jsonMatch[0]);
                    }
                }
            }
            if (toolCall && toolCall.tool) {
                console.log('도구 호출 감지:', toolCall);
                // 경로 정리 (open_folder, open_file에서만)
                if (toolCall.input && (toolCall.tool === 'open_folder' || toolCall.tool === 'open_file')) {
                    // 이상한 문자들을 정리
                    let cleanPath = toolCall.input
                        .replace(/WW/g, '\\')
                        .replace(/₩₩/g, '\\')
                        .replace(/₩/g, '\\');
                    // Node.js path.normalize로 정규화
                    const path = await Promise.resolve().then(() => __importStar(require('path')));
                    toolCall.input = path.normalize(cleanPath);
                    console.log('경로 정리됨:', toolCall.input);
                }
                switch (toolCall.tool) {
                    case 'open_folder':
                        // 🔥 강화: 퍼지 검색으로 폴더 찾기
                        let folderPath = toolCall.input;
                        if (!folderPath || folderPath === '' || folderPath.includes('WW') || folderPath.includes('₩')) {
                            console.log('경로가 이상함, 퍼지 검색 시도:', folderPath);
                            try {
                                // 데스크톱에서 폴더 목록 가져오기
                                const searchResult = await index_1.tools.search_files.execute({
                                    query: '',
                                    dir: "C:\\Users\\User\\Desktop",
                                    maxResults: 50
                                });
                                if (searchResult.length > 0) {
                                    // 🔥 Gemini 퍼지 매칭으로 가장 유사한 폴더 찾기
                                    const fuzzyResult = await (0, gemini_1.fuzzyMatchFile)(message, searchResult);
                                    if (fuzzyResult) {
                                        folderPath = fuzzyResult;
                                        console.log('퍼지 검색으로 찾은 폴더:', folderPath);
                                    }
                                    else {
                                        // 퍼지 매칭 실패 시 일반 검색
                                        const directSearch = await index_1.tools.search_files.execute({
                                            query: message.replace(/[^\w\s가-힣]/g, '').trim(),
                                            dir: "C:\\Users\\User\\Desktop"
                                        });
                                        folderPath = directSearch.length > 0 ? directSearch[0] : "C:\\Users\\User\\Desktop";
                                    }
                                }
                                else {
                                    folderPath = "C:\\Users\\User\\Desktop";
                                }
                            }
                            catch (error) {
                                console.log('검색 실패, 기본 데스크톱 사용:', error);
                                folderPath = "C:\\Users\\User\\Desktop";
                            }
                        }
                        console.log('폴더 열기 시도:', folderPath);
                        toolResult = await index_1.tools.open_folder.execute({ path: folderPath });
                        toolSuccess = true;
                        break;
                    case 'open_file':
                        // 경로가 비어있거나 placeholder면 메시지에서 파일명 추출
                        let filePath = toolCall.input;
                        // 경로가 이상하거나 placeholder인 경우
                        if (!filePath || filePath === '' || filePath === '파일경로' ||
                            filePath.includes('WW') || filePath.includes('₩') || !filePath.includes('\\')) {
                            console.log('파일 경로가 이상함, 메시지에서 추출:', filePath);
                            // 메시지에서 파일명 추출 (엄격한 패턴)
                            // 1. 따옴표로 감싸진 파일명 우선
                            // 2. 확장자는 1~5자 (txt, docx, xlsx 등)
                            // 3. 파일명은 한글/영문/숫자/언더스코어/하이픈만 허용
                            const fileNameMatch = message.match(/["']([^"']+\.[a-zA-Z0-9]{1,5})["']/) ||
                                message.match(/([가-힣a-zA-Z0-9_\-]+\.[a-zA-Z0-9]{1,5})(?:\s|$|열|실행|해)/);
                            if (fileNameMatch) {
                                const fileName = fileNameMatch[1];
                                console.log('메시지에서 추출한 파일명:', fileName);
                                // 기본 검색 디렉토리들 (우선순위 순)
                                const searchDirs = [
                                    "C:\\Users\\User\\Desktop",
                                    "C:\\Users\\User\\Documents",
                                    "C:\\Users\\User\\Downloads"
                                ];
                                // 각 디렉토리에서 파일 검색
                                let foundPath = null;
                                for (const searchDir of searchDirs) {
                                    try {
                                        const searchResult = await index_1.tools.search_files.execute({
                                            query: fileName,
                                            dir: searchDir,
                                            maxResults: 20,
                                            recursive: false
                                        });
                                        if (searchResult.length > 0) {
                                            // 정확히 일치하는 파일 찾기
                                            const exactMatch = searchResult.find(p => p.toLowerCase().endsWith(fileName.toLowerCase()));
                                            foundPath = exactMatch || searchResult[0];
                                            console.log(`검색으로 찾은 파일 (${searchDir}):`, foundPath);
                                            break; // 찾으면 중단
                                        }
                                    }
                                    catch (error) {
                                        console.log(`${searchDir}에서 검색 실패, 다음 디렉토리 시도`);
                                        // 다음 디렉토리 계속 검색
                                    }
                                }
                                if (foundPath) {
                                    filePath = foundPath;
                                }
                                else {
                                    throw new Error(`파일을 찾을 수 없습니다: ${fileName}`);
                                }
                            }
                            else {
                                // 파일명도 추출 못하면 에러
                                throw new Error('파일명을 특정할 수 없습니다. 파일명을 명확하게 알려주세요.');
                            }
                        }
                        console.log('파일 실행 시도:', filePath);
                        toolResult = await index_1.tools.open_file.execute({ path: filePath });
                        toolSuccess = true;
                        break;
                    case 'execute_command':
                        toolResult = await index_1.tools.execute_command.execute({ command: toolCall.input, timeout: 30000 });
                        toolSuccess = true;
                        break;
                    case 'search_files':
                        toolResult = await index_1.tools.search_files.execute({
                            query: toolCall.input,
                            dir: process.env.ALLOW_DIR || "C:\\Users\\User\\Desktop",
                            maxResults: 50
                        });
                        toolSuccess = true;
                        break;
                    case 'web_search':
                        // 🔥 강화: 검색 결과 요약
                        try {
                            const searchResult = await index_1.tools.web_search.execute({
                                query: toolCall.input,
                                maxResults: 5
                            });
                            if (searchResult.results && searchResult.results.length > 0) {
                                const summary = await (0, gemini_1.summarizeSearchResults)(toolCall.input, searchResult.results);
                                toolResult = { ...searchResult, summary };
                            }
                            else {
                                toolResult = searchResult;
                            }
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = "웹 검색에 실패했습니다";
                        }
                        break;
                    case 'news_search':
                        // 🔥 강화: 뉴스 결과 요약
                        try {
                            const newsResult = await index_1.tools.news_search.execute({
                                query: toolCall.input,
                                maxResults: 3
                            });
                            if (newsResult.results && newsResult.results.length > 0) {
                                const summary = await (0, gemini_1.summarizeSearchResults)(toolCall.input + " 뉴스", newsResult.results);
                                toolResult = { ...newsResult, summary };
                            }
                            else {
                                toolResult = newsResult;
                            }
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = "뉴스 검색에 실패했습니다";
                        }
                        break;
                    case 'add_schedule':
                        // 🔥 강화: 자연어 파싱으로 일정 추가
                        try {
                            let scheduleData;
                            // 먼저 JSON 파싱 시도
                            try {
                                scheduleData = JSON.parse(toolCall.input);
                            }
                            catch {
                                // JSON 파싱 실패 시 자연어 파싱 시도
                                console.log('자연어 일정 파싱 시도:', toolCall.input || message);
                                scheduleData = await (0, gemini_1.parseScheduleFromText)(toolCall.input || message);
                            }
                            if (scheduleData && scheduleData.title && scheduleData.date) {
                                toolResult = await index_1.tools.add_schedule.execute({
                                    title: scheduleData.title,
                                    date: scheduleData.date,
                                    time: scheduleData.time || "12:00",
                                    description: scheduleData.description || ""
                                });
                                toolSuccess = true;
                            }
                            else {
                                toolError = "일정 정보를 파악할 수 없습니다. 날짜와 제목을 알려주세요.";
                            }
                        }
                        catch (error) {
                            toolError = "일정 추가에 실패했습니다";
                        }
                        break;
                    case 'get_schedules':
                        // JSON 파싱해서 스케줄 조회
                        try {
                            const queryData = JSON.parse(toolCall.input);
                            toolResult = await index_1.tools.get_schedules.execute({
                                date: queryData.date,
                                upcoming: queryData.upcoming || false
                            });
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = "조회 조건 형식이 올바르지 않습니다";
                        }
                        break;
                    case 'delete_schedule':
                        // JSON 파싱해서 스케줄 삭제
                        try {
                            const deleteData = JSON.parse(toolCall.input);
                            toolResult = await index_1.tools.delete_schedule.execute({
                                id: deleteData.id
                            });
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = "삭제할 일정 ID가 올바르지 않습니다";
                        }
                        break;
                    case 'check_reminders':
                        // 리마인더 체크
                        toolResult = await index_1.tools.check_reminders.execute();
                        toolSuccess = true;
                        break;
                    case 'cleanup_expired_schedules':
                        // 지난 일정 자동 정리
                        toolResult = await index_1.tools.cleanup_expired_schedules.execute();
                        toolSuccess = true;
                        break;
                    case 'launch_steam_game':
                        // 스팀 게임 실행
                        try {
                            console.log('스팀 게임 실행 요청:', toolCall.input);
                            const gameData = JSON.parse(toolCall.input);
                            console.log('파싱된 게임 데이터:', gameData);
                            toolResult = await index_1.tools.launch_steam_game.execute({
                                gameId: gameData.gameId,
                                gameName: gameData.gameName
                            });
                            toolSuccess = true;
                            console.log('스팀 게임 실행 결과:', toolResult);
                        }
                        catch (error) {
                            console.error('스팀 게임 실행 오류:', error);
                            toolError = `게임 실행 실패: ${error.message}`;
                        }
                        break;
                    case 'launch_program':
                        // 프로그램 실행
                        try {
                            console.log('프로그램 실행 요청:', toolCall.input);
                            const programName = String(toolCall.input || '').trim();
                            if (!programName) {
                                throw new Error('프로그램 이름이 비어 있습니다');
                            }
                            console.log('프로그램 이름:', programName);
                            toolResult = await index_1.tools.launch_program.execute({
                                programName
                            });
                            toolSuccess = true;
                            console.log('프로그램 실행 결과:', toolResult);
                        }
                        catch (error) {
                            console.error('프로그램 실행 오류:', error);
                            toolError = `프로그램 실행 실패: ${error.message}`;
                        }
                        break;
                    case 'youtube_search':
                        try {
                            const ytSearchQuery = String(toolCall.input || '').trim();
                            toolResult = await index_1.tools.youtube_search.execute({ query: ytSearchQuery, maxResults: 5 });
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = `YouTube 검색 실패: ${error.message}`;
                        }
                        break;
                    case 'youtube_play':
                        try {
                            const ytPlayData = typeof toolCall.input === 'string' ?
                                (toolCall.input.startsWith('{') ? JSON.parse(toolCall.input) : { query: toolCall.input }) : toolCall.input;
                            toolResult = await index_1.tools.youtube_play.execute({
                                query: ytPlayData.query,
                                videoId: ytPlayData.videoId,
                                url: ytPlayData.url
                            });
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = `YouTube 재생 실패: ${error.message}`;
                        }
                        break;
                    case 'youtube_channel':
                    case 'youtube_channel_videos':
                        try {
                            const ytChData = typeof toolCall.input === 'string' ?
                                (toolCall.input.startsWith('{') ? JSON.parse(toolCall.input) : { channelName: toolCall.input }) : toolCall.input;
                            const searchName = ytChData.channelName || ytChData.name || toolCall.input;
                            console.log('YouTube 검색 시작:', searchName);
                            // 🔥 YouTube API 시도, 실패시 브라우저로 직접 열기
                            const searchResult = await index_1.tools.youtube_search.execute({
                                query: searchName,
                                maxResults: 5
                            });
                            console.log('YouTube 영상 검색 결과:', JSON.stringify(searchResult, null, 2));
                            if (searchResult.success && searchResult.results?.length > 0) {
                                toolResult = {
                                    success: true,
                                    videos: searchResult.results,
                                    message: `"${searchName}" 영상을 찾았어요!`
                                };
                                // 영상 재생 요청이면 첫 번째 영상 재생
                                if (message.includes('틀어') || message.includes('재생') || message.includes('보여')) {
                                    const latestVideo = toolResult.videos[0];
                                    const videoId = latestVideo.videoId || latestVideo.id;
                                    console.log('영상 재생 시도:', latestVideo.title, videoId);
                                    const playResult = await index_1.tools.youtube_play.execute({ videoId });
                                    console.log('영상 재생 결과:', playResult);
                                    toolResult.playedVideo = latestVideo;
                                }
                            }
                            else {
                                // API 실패시 YouTube 검색 페이지를 브라우저에서 직접 열기
                                console.log('API 실패, 브라우저로 YouTube 검색 열기:', searchName);
                                const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchName)}`;
                                const { spawn } = await Promise.resolve().then(() => __importStar(require('child_process')));
                                spawn('cmd', ['/c', 'start', '""', youtubeUrl], { shell: true, detached: true, stdio: 'ignore' }).unref();
                                toolResult = {
                                    success: true,
                                    message: `YouTube에서 "${searchName}" 검색 페이지를 열었어요! 🎬`,
                                    url: youtubeUrl,
                                    browserOpened: true
                                };
                            }
                            toolSuccess = true;
                        }
                        catch (error) {
                            console.error('YouTube 검색 오류:', error);
                            // 오류 발생시에도 브라우저로 열기
                            const searchName = toolCall.input || '';
                            const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchName)}`;
                            const { spawn } = await Promise.resolve().then(() => __importStar(require('child_process')));
                            spawn('cmd', ['/c', 'start', '""', youtubeUrl], { shell: true, detached: true, stdio: 'ignore' }).unref();
                            toolResult = {
                                success: true,
                                message: `YouTube에서 "${searchName}" 검색 페이지를 열었어요! 🎬`,
                                url: youtubeUrl,
                                browserOpened: true
                            };
                            toolSuccess = true;
                        }
                        break;
                    case 'youtube_trending':
                        try {
                            const ytTrendData = typeof toolCall.input === 'string' ?
                                (toolCall.input.startsWith('{') ? JSON.parse(toolCall.input) : {}) : toolCall.input;
                            toolResult = await index_1.tools.youtube_trending.execute({
                                regionCode: ytTrendData.regionCode || 'KR',
                                maxResults: ytTrendData.maxResults || 10,
                                category: ytTrendData.category
                            });
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = `YouTube 인기 영상 조회 실패: ${error.message}`;
                        }
                        break;
                    default:
                        // 알 수 없는 도구인 경우, open_* 패턴이면 launch_program으로 변환 시도
                        if (toolCall.tool.startsWith('open_')) {
                            console.log(`알 수 없는 도구 '${toolCall.tool}' 감지, launch_program으로 변환 시도`);
                            try {
                                // open_calculator -> 계산기, open_notepad -> 메모장 등 변환
                                const programNameMap = {
                                    'open_calculator': '계산기',
                                    'open_notepad': '메모장',
                                    'open_paint': '그림판',
                                    'open_cmd': '명령 프롬프트',
                                    'open_powershell': 'PowerShell'
                                };
                                const programName = programNameMap[toolCall.tool] ||
                                    toolCall.tool.replace('open_', '').replace(/_/g, ' ');
                                console.log(`프로그램 이름 변환: ${toolCall.tool} -> ${programName}`);
                                toolResult = await index_1.tools.launch_program.execute({
                                    programName: programName
                                });
                                toolSuccess = true;
                                console.log('프로그램 실행 결과:', toolResult);
                            }
                            catch (error) {
                                console.error('프로그램 실행 오류:', error);
                                toolError = `알 수 없는 도구: ${toolCall.tool}. 사용 가능한 도구만 사용해주세요.`;
                            }
                        }
                        else {
                            toolError = `알 수 없는 도구: ${toolCall.tool}. 사용 가능한 도구만 사용해주세요.`;
                        }
                        toolError = `알 수 없는 도구: ${toolCall.tool}`;
                }
            }
        }
        catch (error) {
            console.error('도구 실행 오류:', error);
            toolError = error.message;
        }
        // 🔥 도구 실행 성공시 자연스러운 응답으로 변환
        if (toolSuccess && toolResult) {
            reply = generateNaturalResponse(toolResult, message);
        }
        else if (toolError) {
            reply = `죄송합니다. ${toolError}. 다시 시도해주시겠습니까.`;
        }
        const id = (0, db_1.logInteraction)(message, reply);
        // 감정 분석
        const emotion = analyzeEmotion(reply);
        // API 응답 구성 (reply와 error 구분) - TTS 제거, 텍스트만 먼저 응답
        const response = {
            reply,
            emotion,
            interactionId: id
        };
        if (toolSuccess) {
            response.toolExecuted = true;
            response.toolResult = toolResult;
        }
        if (toolError) {
            response.error = toolError;
        }
        // TTS는 제거 - 프론트에서 /text-to-speech를 별도로 호출하도록 변경
        // 이렇게 하면 텍스트 응답이 즉시 전송되어 체감 속도가 크게 개선됩니다.
        // 응답을 먼저 보내기
        res.json(response);
        // 아바타 제어는 fire-and-forget으로 응답 후 비동기 처리 (주석 처리 - 아바타 미사용)
        // (async () => {
        //   try {
        //     await changeAvatarExpression(emotion);
        //     await startAvatarTalking();
        //     
        //     // 3초 후 말하기 중지
        //     setTimeout(async () => {
        //       await stopAvatarTalking();
        //     }, 3000);
        //   } catch (error) {
        //     console.log('OpenCV 아바타 제어 실패:', error);
        //   }
        // })();
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ==================== 음성 인식 기능 ====================
// Gemini API를 사용한 음성-텍스트 변환 함수 (멀티모달) - 최적화 버전
async function speechToText(audioBuffer, filename) {
    try {
        const startTime = Date.now();
        console.log('Gemini STT API 호출:', { filename, size: audioBuffer.length });
        // 파일 크기 체크 (10MB 제한)
        if (audioBuffer.length > 10 * 1024 * 1024) {
            throw new Error('오디오 파일이 너무 큽니다 (최대 10MB)');
        }
        // 파일 확장자에서 MIME 타입 추정
        const ext = filename.split('.').pop()?.toLowerCase();
        let mimeType = 'audio/mpeg';
        if (ext === 'wav')
            mimeType = 'audio/wav';
        else if (ext === 'webm')
            mimeType = 'audio/webm';
        else if (ext === 'm4a')
            mimeType = 'audio/mp4';
        else if (ext === 'ogg')
            mimeType = 'audio/ogg';
        else if (ext === 'flac')
            mimeType = 'audio/flac';
        // 오디오를 base64로 인코딩
        const audioBase64 = audioBuffer.toString('base64');
        // Gemini API REST 엔드포인트
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;
        const requestBody = {
            contents: [{
                    role: "user",
                    parts: [
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: audioBase64
                            }
                        },
                        {
                            text: "Transcribe this audio in Korean. Output ONLY the transcription, nothing else."
                        }
                    ]
                }],
            generationConfig: {
                maxOutputTokens: 500,
                temperature: 0.1
            }
        };
        // 🔥 타임아웃 추가 (15초)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API 오류: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        console.log(`STT 완료: ${Date.now() - startTime}ms`);
        // 텍스트 추출
        if (data.candidates && data.candidates[0]?.content?.parts) {
            const textPart = data.candidates[0].content.parts.find((p) => p.text);
            if (textPart) {
                console.log('Gemini STT 결과:', textPart.text);
                return textPart.text.trim();
            }
        }
        throw new Error('음성을 인식할 수 없습니다');
    }
    catch (error) {
        console.error('Gemini STT 오류:', error);
        throw new Error(`음성 인식 실패: ${error.message}`);
    }
}
// ElevenLabs TTS API를 사용한 텍스트-음성 변환 함수
// 🔥 강화: 감정 인식 적용
async function textToSpeech(text, voiceId = 'rUSWM861uoIpt6gT6Vpt', // 사용자 커스텀 음성
model = 'eleven_multilingual_v2', // 다국어 모델 (한국어 지원)
stability = 0.5, similarityBoost = 0.75) {
    try {
        // 🔥 강화: 감정 분석으로 음성 스타일 조절
        const emotionResult = await (0, gemini_1.analyzeEmotionForTTS)(text);
        console.log('감정 분석 결과:', emotionResult);
        // 감정에 따른 음성 설정 조절
        let adjustedStability = stability;
        let adjustedSimilarity = similarityBoost;
        switch (emotionResult.emotion) {
            case 'happy':
            case 'excited':
                adjustedStability = 0.3; // 더 활기찬 느낌
                adjustedSimilarity = 0.8;
                break;
            case 'sad':
                adjustedStability = 0.7; // 차분한 느낌
                adjustedSimilarity = 0.6;
                break;
            case 'surprised':
                adjustedStability = 0.25; // 놀란 느낌
                adjustedSimilarity = 0.85;
                break;
            default:
                break;
        }
        console.log('ElevenLabs TTS API 호출:', { model, voiceId, textLength: text.length, emotion: emotionResult.emotion });
        // ElevenLabs API 엔드포인트
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
        const requestBody = {
            text: text,
            model_id: model,
            voice_settings: {
                stability: adjustedStability,
                similarity_boost: adjustedSimilarity,
                style: 0.5,
                use_speaker_boost: true
            }
        };
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY
            },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ElevenLabs API 오류: ${response.status} - ${errorText}`);
        }
        // 오디오 데이터를 Buffer로 변환
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log('ElevenLabs TTS Buffer 생성 완료, 크기:', buffer.length, 'bytes');
        return buffer;
    }
    catch (error) {
        console.error('ElevenLabs TTS 오류:', error);
        throw new Error(`TTS 실패: ${error.message}`);
    }
}
// 음성 파일을 텍스트로 변환하는 엔드포인트
app.post("/speech-to-text", upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "오디오 파일이 필요합니다. 'audio' 필드로 파일을 업로드해주세요." });
        }
        const text = await speechToText(req.file.buffer, req.file.originalname);
        res.json({ text });
    }
    catch (error) {
        console.error('음성 인식 처리 오류:', error);
        res.status(500).json({ error: error.message });
    }
});
// 텍스트를 음성으로 변환하는 엔드포인트 (ElevenLabs TTS)
app.post("/text-to-speech", async (req, res) => {
    try {
        const { text, voice = 'rUSWM861uoIpt6gT6Vpt', // 사용자 커스텀 음성
        model = 'eleven_multilingual_v2', // 다국어 모델
        stability = 0.5, similarityBoost = 0.75 } = req.body;
        if (!text) {
            return res.status(400).json({ error: "텍스트가 필요합니다." });
        }
        // ElevenLabs 음성 ID 맵핑 (이름으로도 선택 가능)
        const voiceMap = {
            'rachel': '21m00Tcm4TlvDq8ikWAM',
            'adam': 'pNInz6obpgDQGcFmaJgB',
            'josh': 'TxGEqnHWrfWFTfGW9XjX',
            'bella': 'EXAVITQu4vr4xnSDxMaL',
            'elli': 'MF3mGyEYCl7XYWbV9V6O',
            'sam': 'yoZ06aMxZJJ28mfd3POQ'
        };
        // 음성 이름 또는 ID 처리
        const voiceId = voiceMap[voice.toLowerCase()] || voice;
        const audioBuffer = await textToSpeech(text, voiceId, model, stability, similarityBoost);
        // MP3 오디오 파일로 응답
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="tts-${Date.now()}.mp3"`);
        res.send(audioBuffer);
    }
    catch (error) {
        console.error('TTS 처리 오류:', error);
        res.status(500).json({ error: error.message });
    }
});
// 음성 파일을 받아서 텍스트로 변환하고 채팅까지 처리하는 통합 엔드포인트
app.post("/chat/voice", upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "오디오 파일이 필요합니다. 'audio' 필드로 파일을 업로드해주세요." });
        }
        // 1. 음성을 텍스트로 변환
        const message = await speechToText(req.file.buffer, req.file.originalname);
        console.log('음성 인식 결과:', message);
        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: "음성에서 텍스트를 인식할 수 없습니다." });
        }
        // 2. 변환된 텍스트로 채팅 처리 (기존 /chat 로직 재사용)
        const { message: _ignored, ...chatBody } = req.body;
        // 기존 /chat 엔드포인트의 로직을 재사용하기 위해 내부 함수로 추출하거나
        // 직접 처리 로직을 여기에 구현
        // 여기서는 간단하게 기존 로직을 복사하여 사용
        // 툴 사용 최소화 - 명확한 요청만 처리
        const hasFolderKeyword = message.includes('폴더') || message.includes('디렉토리') || message.includes('탐색기');
        const hasFileKeyword = message.includes('파일');
        const hasCommandKeyword = (message.includes('명령') || message.includes('명령어')) && !hasFileKeyword && !hasFolderKeyword;
        const hasSteamKeyword = message.includes('스팀') || (message.includes('게임') && (message.includes('켜') || message.includes('실행') || message.includes('열')));
        const hasProgramKeyword = message.includes('프로그램') || message.includes('앱') || message.includes('켜줘') || message.includes('실행해줘');
        const hasRunKeyword = message.includes('실행') || message.includes('켜') || message.includes('열어') || message.includes('켜줘') || message.includes('띄워') || message.includes('열');
        const hasYoutubeKeyword2 = message.includes('유튜브') || message.includes('youtube') || message.includes('영상');
        const hasYoutubeChannelKeyword2 = hasYoutubeKeyword2 && (message.includes('채널') || message.includes('최신'));
        const hasYoutubePlayKeyword2 = hasYoutubeKeyword2 && (message.includes('틀어') || message.includes('재생') || message.includes('보여') || message.includes('켜'));
        const isFolderRequest = hasFolderKeyword;
        const isFileRequest = !isFolderRequest && hasFileKeyword;
        const isCommandRequest = !isFolderRequest && !isFileRequest && hasCommandKeyword;
        const isSteamRequest = hasSteamKeyword && !isFolderRequest && !isFileRequest && !hasProgramKeyword;
        const isProgramRequest = (hasProgramKeyword || hasRunKeyword) && !isFolderRequest && !isFileRequest && !isSteamRequest && !hasYoutubeKeyword2;
        const isYoutubeRequest2 = hasYoutubeKeyword2 && !isFolderRequest && !isFileRequest && !isSteamRequest;
        // 🔥 실시간 날짜/시간 정보 생성
        const now2 = new Date();
        const days2 = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
        const timeInfo2 = `[현재 시각] ${now2.getFullYear()}년 ${now2.getMonth() + 1}월 ${now2.getDate()}일 ${days2[now2.getDay()]} ${now2.getHours()}시 ${now2.getMinutes()}분\n`;
        let system = timeInfo2 + `당신은 '파우스트'라는 이름의 버틀러입니다. 워더링하이츠 저택의 격식 있는 버틀러처럼 말하세요.

**말투 규칙:**
- 격식 있고 점잖은 경어체 사용: '~하시죠', '~드리겠습니다', '~하시기를', '~입니다'
- 차분하고 절제된 어조, 감정을 드러내지 않음
- 주인을 모시는 충실한 버틀러처럼 정중하게
- 이모지 절대 사용 금지
- 1-2문장으로 간결하게 답변

**말투 예시:**
- "부르신다면 언제든." 
- "간단합니다."
- "불편하신 점이라도."
- "즉시 처리해드리겠습니다."
- "말씀하신 대로 준비하겠습니다."
- "그리 하시죠."
- "아직 미숙한 부분이 있을 줄은..."
- "모쪼록, 이해해주시기를."

**절대 금지:**
- '~해요', '~예요' 같은 친근한 말투 금지
- 이모지, 감탄사('와!', '오!') 금지
- 자기소개 금지

**기타:**
- 한국어 맞춤법/문법 100% 정확
- 사용자가 영어로 말해도 한국어로 답변
- 날짜/시간 질문 시 [현재 시각] 정보 참고

`;
        // YouTube 관련 요청 처리
        if (isYoutubeRequest2) {
            if (hasYoutubeChannelKeyword2) {
                system += "**YouTube 채널 영상 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
                system += '{"tool": "youtube_channel", "input": "채널이름"}\n';
                system += "\n**중요**: input에는 채널 이름만 넣어주세요. (예: '팔차선', '침착맨', 'BTS')\n";
                system += "최신 영상을 틀어달라고 하면 자동으로 첫 번째 영상이 재생됩니다.\n";
            }
            else if (hasYoutubePlayKeyword2) {
                system += "**YouTube 영상 재생 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
                system += '{"tool": "youtube_play", "input": "검색어 또는 영상 제목"}\n';
                system += "\n**중요**: input에는 검색하고 싶은 영상/노래 이름을 넣어주세요.\n";
            }
            else {
                system += "**YouTube 검색 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
                system += '{"tool": "youtube_search", "input": "검색어"}\n';
            }
        }
        else if (isFolderRequest) {
            system += "**폴더 열기 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
            system += '{"tool": "open_folder", "input": "C:\\\\Users\\\\User\\\\Desktop\\\\승무의 프로젝트"}\n';
            system += "\n**중요**: input에는 폴더명만 넣어주세요. 시스템이 자동으로 경로를 찾습니다.\n";
        }
        else if (isFileRequest) {
            system += "**파일 실행 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
            system += '{"tool": "open_file", "input": "example.txt"}\n';
            system += "\n**중요**: \n";
            system += "1. input에는 사용자가 언급한 파일명만 넣어주세요 (예: test.txt, 문서.docx)\n";
            system += "2. 전체 경로를 모르면 파일명만 입력하세요. 시스템이 자동으로 찾습니다.\n";
            system += "3. '파일경로' 같은 placeholder는 절대 사용하지 마세요!\n";
        }
        else if (isSteamRequest) {
            system += "**스팀 게임 실행 요청입니다! 반드시 다음 JSON 형식으로만 응답하세요:**\n";
            system += '```json\n{"tool": "launch_steam_game", "input": "{\\"gameName\\": \\"게임이름\\"}"}\n```\n';
            system += "\n**매우 중요**: \n";
            system += "1. 사용자가 언급한 게임 이름을 그대로 추출하세요 (예: '이터널 리턴', '카운터 스트라이크', '리그 오브 레전드')\n";
            system += "2. 게임 ID를 모르면 gameName만 사용하세요\n";
            system += "3. input은 JSON 문자열이므로 이중 이스케이프 필요: {\\\"gameName\\\": \\\"정확한게임이름\\\"}\n";
            system += "4. 반드시 ```json 코드 블록으로 감싸서 응답하세요!\n";
        }
        else if (isProgramRequest) {
            system += "**프로그램 실행 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
            system += '{"tool": "launch_program", "input": "카카오톡"}\n';
            system += "\n**중요**: input에는 사용자가 말한 프로그램 이름 그대로 넣어주세요. (예: '카카오톡', '크롬', '디스코드')\n";
        }
        else if (isCommandRequest) {
            system += "**명령어 실행 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
            system += '{"tool": "execute_command", "input": "dir"}\n';
        }
        else if (message.includes('검색') || message.includes('찾아') || message.includes('알려') || message.includes('뉴스') || message.includes('날씨') || message.includes('온도') || message.includes('몇 도') || message.includes('몇도') || message.includes('기온')) {
            system += "**웹 검색 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
            system += '{"tool": "web_search", "input": "검색어"}\n';
            system += "\n**중요**: input에는 검색하고 싶은 키워드만 넣어주세요. 날씨/온도 질문은 '지역명 날씨' 형태로 검색하세요.\n";
        }
        else if (message.includes('일정') || message.includes('스케줄') || message.includes('약속') || message.includes('회의') || message.includes('미팅')) {
            if (message.includes('추가') || message.includes('등록') || message.includes('저장') ||
                message.match(/\d{1,2}월\s*\d{1,2}일/) || message.match(/\d{4}-\d{2}-\d{2}/) ||
                message.includes('시') || message.includes('분')) {
                system += "**일정 추가 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
                system += '{"tool": "add_schedule", "title": "일정 제목", "date": "2024-01-01", "time": "14:00", "description": "설명"}\n';
                system += "\n**중요**: 사용자 메시지에서 날짜와 시간을 추출해서 정확한 형식으로 변환하세요.\n";
                system += "- 날짜: YYYY-MM-DD 형식 (예: 2024-12-25)\n";
                system += "- 시간: HH:MM 형식 (예: 14:30)\n";
            }
            else if (message.includes('리마인더') || message.includes('알림') || message.includes('체크')) {
                system += "**리마인더 체크 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
                system += '{"tool": "check_reminders"}\n';
                system += "\n**중요**: 1시간 전 일정들을 체크해서 알려주세요.\n";
            }
            else {
                system += "**일정 조회 요청입니다! 다음 JSON 형식으로 도구를 호출하세요:**\n";
                system += '{"tool": "get_schedules", "date": "2024-01-01"}\n';
                system += "\n**중요**: 특정 날짜가 언급되면 해당 날짜만, 아니면 전체 일정을 조회하세요.\n";
            }
        }
        system += "\n**중요: 도구를 사용할 때는 반드시 다음 형식으로만 응답하세요:**\n";
        system += "```json\n{\"tool\": \"도구명\", \"input\": \"입력값\"}\n```\n";
        system += AVAILABLE_TOOLS_PROMPT;
        system += "\n잘못된 맞춤법이나 문법 오류는 절대 허용하지 않습니다.";
        let reply = await (0, gemini_1.chatWithGemini)(system, message);
        let toolError = null;
        let toolSuccess = false;
        let toolResult = null;
        // JSON 도구 호출 파싱 및 실행 (기존 로직과 동일)
        try {
            let toolCall = null;
            const codeFenceMatch = reply.match(/```json\s*(\{[\s\S]*?\})\s*```/);
            if (codeFenceMatch) {
                console.log('코드펜스 JSON 발견:', codeFenceMatch[1]);
                toolCall = JSON.parse(codeFenceMatch[1]);
            }
            else {
                try {
                    toolCall = JSON.parse(reply.trim());
                    console.log('전체 응답이 JSON:', toolCall);
                }
                catch {
                    const jsonMatch = reply.match(/\{[^{}]*"tool"[^{}]*\}/);
                    if (jsonMatch) {
                        console.log('JSON 블록 발견:', jsonMatch[0]);
                        toolCall = JSON.parse(jsonMatch[0]);
                    }
                }
            }
            if (toolCall && toolCall.tool) {
                console.log('도구 호출 감지:', toolCall);
                if (toolCall.input && (toolCall.tool === 'open_folder' || toolCall.tool === 'open_file')) {
                    let cleanPath = toolCall.input
                        .replace(/WW/g, '\\')
                        .replace(/₩₩/g, '\\')
                        .replace(/₩/g, '\\');
                    const path = await Promise.resolve().then(() => __importStar(require('path')));
                    toolCall.input = path.normalize(cleanPath);
                    console.log('경로 정리됨:', toolCall.input);
                }
                switch (toolCall.tool) {
                    case 'open_folder':
                        // 🔥 강화: 퍼지 검색으로 폴더 찾기
                        let folderPath2 = toolCall.input;
                        if (!folderPath2 || folderPath2 === '' || folderPath2.includes('WW') || folderPath2.includes('₩')) {
                            try {
                                const searchResult3 = await index_1.tools.search_files.execute({
                                    query: '',
                                    dir: "C:\\Users\\User\\Desktop",
                                    maxResults: 50
                                });
                                if (searchResult3.length > 0) {
                                    const fuzzyResult2 = await (0, gemini_1.fuzzyMatchFile)(message, searchResult3);
                                    if (fuzzyResult2) {
                                        folderPath2 = fuzzyResult2;
                                        console.log('퍼지 검색으로 찾은 폴더:', folderPath2);
                                    }
                                    else {
                                        const directSearch2 = await index_1.tools.search_files.execute({
                                            query: message.replace(/[^\w\s가-힣]/g, '').trim(),
                                            dir: "C:\\Users\\User\\Desktop"
                                        });
                                        folderPath2 = directSearch2.length > 0 ? directSearch2[0] : "C:\\Users\\User\\Desktop";
                                    }
                                }
                                else {
                                    folderPath2 = "C:\\Users\\User\\Desktop";
                                }
                            }
                            catch (error) {
                                folderPath2 = "C:\\Users\\User\\Desktop";
                            }
                        }
                        toolResult = await index_1.tools.open_folder.execute({ path: folderPath2 });
                        toolSuccess = true;
                        break;
                    case 'open_file':
                        let filePath = toolCall.input;
                        if (!filePath || filePath === '' || filePath === '파일경로' ||
                            filePath.includes('WW') || filePath.includes('₩') || !filePath.includes('\\')) {
                            const fileNameMatch = message.match(/["']([^"']+\.[a-zA-Z0-9]{1,5})["']/) ||
                                message.match(/([가-힣a-zA-Z0-9_\-]+\.[a-zA-Z0-9]{1,5})(?:\s|$|열|실행|해)/);
                            if (fileNameMatch) {
                                const fileName = fileNameMatch[1];
                                const searchDirs = [
                                    "C:\\Users\\User\\Desktop",
                                    "C:\\Users\\User\\Documents",
                                    "C:\\Users\\User\\Downloads"
                                ];
                                let foundPath = null;
                                for (const searchDir of searchDirs) {
                                    try {
                                        const searchResult = await index_1.tools.search_files.execute({
                                            query: fileName,
                                            dir: searchDir,
                                            maxResults: 20,
                                            recursive: false
                                        });
                                        if (searchResult.length > 0) {
                                            const exactMatch = searchResult.find(p => p.toLowerCase().endsWith(fileName.toLowerCase()));
                                            foundPath = exactMatch || searchResult[0];
                                            break;
                                        }
                                    }
                                    catch (error) {
                                        // 다음 디렉토리 계속 검색
                                    }
                                }
                                if (foundPath) {
                                    filePath = foundPath;
                                }
                                else {
                                    throw new Error(`파일을 찾을 수 없습니다: ${fileName}`);
                                }
                            }
                            else {
                                throw new Error('파일명을 특정할 수 없습니다. 파일명을 명확하게 알려주세요.');
                            }
                        }
                        toolResult = await index_1.tools.open_file.execute({ path: filePath });
                        toolSuccess = true;
                        break;
                    case 'execute_command':
                        toolResult = await index_1.tools.execute_command.execute({ command: toolCall.input, timeout: 30000 });
                        toolSuccess = true;
                        break;
                    case 'search_files':
                        toolResult = await index_1.tools.search_files.execute({
                            query: toolCall.input,
                            dir: process.env.ALLOW_DIR || "C:\\Users\\User\\Desktop",
                            maxResults: 50
                        });
                        toolSuccess = true;
                        break;
                    case 'web_search':
                        // 🔥 강화: 검색 결과 요약
                        try {
                            const searchResult2 = await index_1.tools.web_search.execute({
                                query: toolCall.input,
                                maxResults: 5
                            });
                            if (searchResult2.results && searchResult2.results.length > 0) {
                                const summary2 = await (0, gemini_1.summarizeSearchResults)(toolCall.input, searchResult2.results);
                                toolResult = { ...searchResult2, summary: summary2 };
                            }
                            else {
                                toolResult = searchResult2;
                            }
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = "웹 검색에 실패했습니다";
                        }
                        break;
                    case 'news_search':
                        // 🔥 강화: 뉴스 결과 요약
                        try {
                            const newsResult2 = await index_1.tools.news_search.execute({
                                query: toolCall.input,
                                maxResults: 3
                            });
                            if (newsResult2.results && newsResult2.results.length > 0) {
                                const newsSummary = await (0, gemini_1.summarizeSearchResults)(toolCall.input + " 뉴스", newsResult2.results);
                                toolResult = { ...newsResult2, summary: newsSummary };
                            }
                            else {
                                toolResult = newsResult2;
                            }
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = "뉴스 검색에 실패했습니다";
                        }
                        break;
                    case 'add_schedule':
                        // 🔥 강화: 자연어 파싱으로 일정 추가
                        try {
                            let scheduleData;
                            try {
                                scheduleData = JSON.parse(toolCall.input);
                            }
                            catch {
                                console.log('자연어 일정 파싱 시도:', toolCall.input || message);
                                scheduleData = await (0, gemini_1.parseScheduleFromText)(toolCall.input || message);
                            }
                            if (scheduleData && scheduleData.title && scheduleData.date) {
                                toolResult = await index_1.tools.add_schedule.execute({
                                    title: scheduleData.title,
                                    date: scheduleData.date,
                                    time: scheduleData.time || "12:00",
                                    description: scheduleData.description || ""
                                });
                                toolSuccess = true;
                            }
                            else {
                                toolError = "일정 정보를 파악할 수 없습니다.";
                            }
                        }
                        catch (error) {
                            toolError = "일정 추가에 실패했습니다";
                        }
                        break;
                    case 'get_schedules':
                        try {
                            const queryData = JSON.parse(toolCall.input);
                            toolResult = await index_1.tools.get_schedules.execute({
                                date: queryData.date,
                                upcoming: queryData.upcoming || false
                            });
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = "조회 조건 형식이 올바르지 않습니다";
                        }
                        break;
                    case 'delete_schedule':
                        try {
                            const deleteData = JSON.parse(toolCall.input);
                            toolResult = await index_1.tools.delete_schedule.execute({
                                id: deleteData.id
                            });
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = "삭제할 일정 ID가 올바르지 않습니다";
                        }
                        break;
                    case 'check_reminders':
                        toolResult = await index_1.tools.check_reminders.execute();
                        toolSuccess = true;
                        break;
                    case 'cleanup_expired_schedules':
                        toolResult = await index_1.tools.cleanup_expired_schedules.execute();
                        toolSuccess = true;
                        break;
                    case 'launch_steam_game':
                        // 스팀 게임 실행
                        try {
                            console.log('스팀 게임 실행 요청:', toolCall.input);
                            const gameData = JSON.parse(toolCall.input);
                            console.log('파싱된 게임 데이터:', gameData);
                            toolResult = await index_1.tools.launch_steam_game.execute({
                                gameId: gameData.gameId,
                                gameName: gameData.gameName
                            });
                            toolSuccess = true;
                            console.log('스팀 게임 실행 결과:', toolResult);
                        }
                        catch (error) {
                            console.error('스팀 게임 실행 오류:', error);
                            toolError = `게임 실행 실패: ${error.message}`;
                        }
                        break;
                    case 'launch_program':
                        // 프로그램 실행
                        try {
                            console.log('프로그램 실행 요청:', toolCall.input);
                            const programName = String(toolCall.input || '').trim();
                            if (!programName) {
                                throw new Error('프로그램 이름이 비어 있습니다');
                            }
                            console.log('프로그램 이름:', programName);
                            toolResult = await index_1.tools.launch_program.execute({
                                programName
                            });
                            toolSuccess = true;
                            console.log('프로그램 실행 결과:', toolResult);
                        }
                        catch (error) {
                            console.error('프로그램 실행 오류:', error);
                            toolError = `프로그램 실행 실패: ${error.message}`;
                        }
                        break;
                    case 'youtube_search':
                        try {
                            const ytSearchQ = String(toolCall.input || '').trim();
                            toolResult = await index_1.tools.youtube_search.execute({ query: ytSearchQ, maxResults: 5 });
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = `YouTube 검색 실패: ${error.message}`;
                        }
                        break;
                    case 'youtube_play':
                        try {
                            const ytPlayInfo = typeof toolCall.input === 'string' ?
                                (toolCall.input.startsWith('{') ? JSON.parse(toolCall.input) : { query: toolCall.input }) : toolCall.input;
                            toolResult = await index_1.tools.youtube_play.execute({
                                query: ytPlayInfo.query,
                                videoId: ytPlayInfo.videoId,
                                url: ytPlayInfo.url
                            });
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = `YouTube 재생 실패: ${error.message}`;
                        }
                        break;
                    case 'youtube_channel':
                    case 'youtube_channel_videos':
                        try {
                            const ytChInfo = typeof toolCall.input === 'string' ?
                                (toolCall.input.startsWith('{') ? JSON.parse(toolCall.input) : { channelName: toolCall.input }) : toolCall.input;
                            const searchName2 = ytChInfo.channelName || ytChInfo.name || toolCall.input;
                            console.log('YouTube 검색 시작 (voice):', searchName2);
                            // 🔥 YouTube API 시도, 실패시 브라우저로 직접 열기
                            const searchRes = await index_1.tools.youtube_search.execute({
                                query: searchName2,
                                maxResults: 5
                            });
                            console.log('YouTube 영상 검색 결과 (voice):', JSON.stringify(searchRes, null, 2));
                            if (searchRes.success && searchRes.results?.length > 0) {
                                toolResult = {
                                    success: true,
                                    videos: searchRes.results,
                                    message: `"${searchName2}" 영상을 찾았어요!`
                                };
                                // 영상 재생 요청이면 첫 번째 영상 재생
                                if (message.includes('틀어') || message.includes('재생') || message.includes('보여')) {
                                    const latestVid = toolResult.videos[0];
                                    const vidId = latestVid.videoId || latestVid.id;
                                    console.log('영상 재생 시도 (voice):', latestVid.title, vidId);
                                    const playRes = await index_1.tools.youtube_play.execute({ videoId: vidId });
                                    console.log('영상 재생 결과 (voice):', playRes);
                                    toolResult.playedVideo = latestVid;
                                }
                            }
                            else {
                                // API 실패시 YouTube 검색 페이지를 브라우저에서 직접 열기
                                console.log('API 실패 (voice), 브라우저로 YouTube 검색 열기:', searchName2);
                                const youtubeUrl2 = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchName2)}`;
                                const { spawn } = await Promise.resolve().then(() => __importStar(require('child_process')));
                                spawn('cmd', ['/c', 'start', '""', youtubeUrl2], { shell: true, detached: true, stdio: 'ignore' }).unref();
                                toolResult = {
                                    success: true,
                                    message: `YouTube에서 "${searchName2}" 검색 페이지를 열었어요! 🎬`,
                                    url: youtubeUrl2,
                                    browserOpened: true
                                };
                            }
                            toolSuccess = true;
                        }
                        catch (error) {
                            console.error('YouTube 검색 오류 (voice):', error);
                            // 오류 발생시에도 브라우저로 열기
                            const searchName2 = toolCall.input || '';
                            const youtubeUrl2 = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchName2)}`;
                            const { spawn } = await Promise.resolve().then(() => __importStar(require('child_process')));
                            spawn('cmd', ['/c', 'start', '""', youtubeUrl2], { shell: true, detached: true, stdio: 'ignore' }).unref();
                            toolResult = {
                                success: true,
                                message: `YouTube에서 "${searchName2}" 검색 페이지를 열었어요! 🎬`,
                                url: youtubeUrl2,
                                browserOpened: true
                            };
                            toolSuccess = true;
                        }
                        break;
                    case 'youtube_trending':
                        try {
                            const ytTrendInfo = typeof toolCall.input === 'string' ?
                                (toolCall.input.startsWith('{') ? JSON.parse(toolCall.input) : {}) : toolCall.input;
                            toolResult = await index_1.tools.youtube_trending.execute({
                                regionCode: ytTrendInfo.regionCode || 'KR',
                                maxResults: ytTrendInfo.maxResults || 10,
                                category: ytTrendInfo.category
                            });
                            toolSuccess = true;
                        }
                        catch (error) {
                            toolError = `YouTube 인기 영상 조회 실패: ${error.message}`;
                        }
                        break;
                    default:
                        // 알 수 없는 도구인 경우, open_* 패턴이면 launch_program으로 변환 시도
                        if (toolCall.tool.startsWith('open_')) {
                            console.log(`알 수 없는 도구 '${toolCall.tool}' 감지, launch_program으로 변환 시도`);
                            try {
                                // open_calculator -> 계산기, open_notepad -> 메모장 등 변환
                                const programNameMap = {
                                    'open_calculator': '계산기',
                                    'open_notepad': '메모장',
                                    'open_paint': '그림판',
                                    'open_cmd': '명령 프롬프트',
                                    'open_powershell': 'PowerShell'
                                };
                                const programName = programNameMap[toolCall.tool] ||
                                    toolCall.tool.replace('open_', '').replace(/_/g, ' ');
                                console.log(`프로그램 이름 변환: ${toolCall.tool} -> ${programName}`);
                                toolResult = await index_1.tools.launch_program.execute({
                                    programName: programName
                                });
                                toolSuccess = true;
                                console.log('프로그램 실행 결과:', toolResult);
                            }
                            catch (error) {
                                console.error('프로그램 실행 오류:', error);
                                toolError = `알 수 없는 도구: ${toolCall.tool}. 사용 가능한 도구만 사용해주세요.`;
                            }
                        }
                        else {
                            toolError = `알 수 없는 도구: ${toolCall.tool}. 사용 가능한 도구만 사용해주세요.`;
                        }
                }
            }
        }
        catch (error) {
            console.error('도구 실행 오류:', error);
            toolError = error.message;
        }
        // 🔥 도구 실행 성공시 자연스러운 응답으로 변환
        if (toolSuccess && toolResult) {
            reply = generateNaturalResponse(toolResult, message);
        }
        else if (toolError) {
            reply = `죄송합니다. ${toolError}. 다시 시도해주시겠습니까.`;
        }
        const id = (0, db_1.logInteraction)(message, reply);
        // 감정 분석
        const emotion = analyzeEmotion(reply);
        // API 응답 구성 - TTS 제거, 텍스트만 먼저 응답
        const response = {
            text: message, // 인식된 텍스트
            reply,
            emotion,
            interactionId: id
        };
        if (toolSuccess) {
            response.toolExecuted = true;
            response.toolResult = toolResult;
        }
        if (toolError) {
            response.error = toolError;
        }
        // TTS는 제거 - 프론트에서 /text-to-speech를 별도로 호출하도록 변경
        // 응답을 먼저 보내기
        res.json(response);
        // 아바타 제어는 fire-and-forget으로 응답 후 비동기 처리 (주석 처리 - 아바타 미사용)
        // (async () => {
        //   try {
        //     await changeAvatarExpression(emotion);
        //     await startAvatarTalking();
        //     
        //     setTimeout(async () => {
        //       await stopAvatarTalking();
        //     }, 3000);
        //   } catch (error) {
        //     console.log('OpenCV 아바타 제어 실패:', error);
        //   }
        // })();
    }
    catch (error) {
        console.error('음성 채팅 처리 오류:', error);
        res.status(500).json({ error: error.message });
    }
});
app.use("/tools", tools_route_1.routeTools);
// ==================== 스트리밍 최적화 ====================
// 스트리밍 채팅 엔드포인트 (Gemini 스트리밍)
app.get("/stream", async (req, res) => {
    const { message, system: customSystem } = req.query;
    if (!message) {
        return res.status(400).json({ error: "message required" });
    }
    // SSE 헤더 설정 (버퍼링 방지)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx 프록시 버퍼링 금지
    res.flushHeaders?.();
    // 🔥 실시간 날짜/시간 정보 생성
    const now3 = new Date();
    const days3 = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const timeInfo3 = `[현재 시각] ${now3.getFullYear()}년 ${now3.getMonth() + 1}월 ${now3.getDate()}일 ${days3[now3.getDay()]} ${now3.getHours()}시 ${now3.getMinutes()}분\n`;
    const system = customSystem || (timeInfo3 + "당신은 '알파'라는 이름의 전문 비서입니다. 반드시 다음 규칙을 엄격히 지켜주세요:\n\n1. 이름: 항상 '알파'라고 자신을 소개하세요\n2. 말투: 전문적인 비서처럼 정중하고 도움이 되는 말투를 사용하세요\n3. 맞춤법: 한국어 맞춤법과 문법을 100% 정확하게 지켜주세요\n4. 존댓말: 반드시 존댓말을 사용하세요\n5. 답변: 간결하고 명확하게 답변하세요\n6. 역할: 사용자의 업무를 도와주는 전문 비서 역할을 하세요\n7. 언어: 사용자가 영어로 질문해도 한국어로 답변하세요. 영어를 한글로 번역하지 마세요.\n8. 날짜/시간 질문 시 위의 [현재 시각] 정보를 참고해서 정확하게 답변\n\n");
    try {
        const t0 = Date.now();
        // 새로운 @google/genai SDK로 스트리밍 요청
        const response = await ai.models.generateContentStream({
            model: "gemini-3-flash-preview",
            contents: `${String(system).substring(0, 800)}\n\n사용자: ${String(message).substring(0, 400)}`
        });
        let firstToken = false;
        for await (const chunk of response) {
            const text = chunk.text;
            if (text) {
                if (!firstToken) {
                    firstToken = true;
                    console.log('TTFB(Gemini):', Date.now() - t0, 'ms');
                }
                res.write(`data:${JSON.stringify({ delta: text })}\n\n`);
            }
        }
        res.write(`data:${JSON.stringify({ done: true, ttfb: Date.now() - t0 })}\n\n`);
        res.end();
    }
    catch (error) {
        console.error('스트리밍 오류:', error);
        res.write(`data:${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});
// ==================== 백업 및 기억 관리 API ====================
// 데이터베이스 백업
app.post("/backup", (req, res) => {
    try {
        const { customPath } = req.body;
        const backupPath = (0, db_1.backupDatabase)(customPath);
        res.json({ success: true, backupPath });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 백업 목록 조회
app.get("/backups", (req, res) => {
    try {
        const backups = (0, db_1.getBackupList)();
        res.json({ backups });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 백업에서 복원
app.post("/restore", (req, res) => {
    try {
        const { backupPath } = req.body;
        if (!backupPath) {
            return res.status(400).json({ error: "backupPath is required" });
        }
        const success = (0, db_1.restoreDatabase)(backupPath);
        if (success) {
            res.json({ success: true, message: "데이터베이스가 복원되었습니다." });
        }
        else {
            res.status(500).json({ error: "복원에 실패했습니다." });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 데이터베이스 통계
app.get("/stats", (req, res) => {
    try {
        const stats = (0, db_1.getDatabaseStats)();
        res.json(stats);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 자동 정리
app.post("/cleanup", (req, res) => {
    try {
        const result = (0, db_1.autoCleanup)();
        res.json({ success: true, result });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 개별 정리 기능들
app.post("/cleanup/interactions", (req, res) => {
    try {
        const { daysToKeep = 30 } = req.body;
        const deleted = (0, db_1.cleanupOldInteractions)(daysToKeep);
        res.json({ success: true, deleted });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/cleanup/context", (req, res) => {
    try {
        const { importanceThreshold = 1 } = req.body;
        const deleted = (0, db_1.cleanupLowImportanceContext)(importanceThreshold);
        res.json({ success: true, deleted });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/cleanup/patterns", (req, res) => {
    try {
        const deleted = (0, db_1.cleanupDuplicatePatterns)();
        res.json({ success: true, deleted });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 🔥 도구 실행 결과를 자연스러운 응답으로 변환하는 함수 (버틀러 파우스트 스타일)
function generateNaturalResponse(toolResult, message) {
    // YouTube 관련
    if (toolResult.browserOpened || toolResult.url?.includes('youtube')) {
        return toolResult.message || `YouTube를 열어드렸습니다.`;
    }
    if (toolResult.playedVideo) {
        const video = toolResult.playedVideo;
        return `"${video.title}" 영상을 재생해드리겠습니다.`;
    }
    if (toolResult.videos?.length > 0) {
        const video = toolResult.videos[0];
        return `"${video.title}" 영상을 찾았습니다.`;
    }
    // 폴더/파일 관련
    if (toolResult.folder) {
        return toolResult.success
            ? `폴더를 열어드렸습니다.`
            : `죄송합니다. 폴더를 여는 데 문제가 있었습니다.`;
    }
    if (toolResult.file) {
        return toolResult.success
            ? `파일을 실행해드렸습니다.`
            : `죄송합니다. 파일을 여는 데 문제가 있었습니다.`;
    }
    // 프로그램/게임 관련
    if (toolResult.programName) {
        return toolResult.success
            ? `${toolResult.programName} 프로그램을 실행해드렸습니다.`
            : `죄송합니다. ${toolResult.programName}을(를) 찾을 수 없었습니다.`;
    }
    if (toolResult.gameName) {
        return toolResult.success
            ? `${toolResult.gameName} 게임을 실행해드렸습니다.`
            : `죄송합니다. ${toolResult.gameName} 게임을 찾을 수 없었습니다.`;
    }
    // 일정 관련
    if (toolResult.schedule) {
        return `일정을 등록해드렸습니다. ${toolResult.schedule.title}, ${toolResult.schedule.date} ${toolResult.schedule.time}입니다.`;
    }
    if (toolResult.schedules) {
        if (toolResult.schedules.length === 0) {
            return `등록된 일정이 없습니다.`;
        }
        const count = toolResult.schedules.length;
        const scheduleList = toolResult.schedules.slice(0, 3).map((s) => `• ${s.title} (${s.date} ${s.time})`).join('\n');
        return `${count}건의 일정이 있습니다.\n${scheduleList}`;
    }
    // 🔥 검색 관련 - AI가 분석한 요약 답변 사용
    if (toolResult.summary) {
        // Gemini가 분석한 요약 답변이 있으면 그걸 사용
        return toolResult.summary;
    }
    if (toolResult.results?.length > 0) {
        const firstResult = toolResult.results[0];
        const content = firstResult.content || firstResult.snippet || '';
        // 검색 결과 요약
        if (content) {
            const summary = content.length > 200 ? content.substring(0, 200) + '...' : content;
            return `조사 결과를 말씀드리겠습니다. ${summary}`;
        }
        if (firstResult.title) {
            return `조사 결과입니다. ${firstResult.title}`;
        }
    }
    // 기본 메시지
    if (toolResult.message) {
        return toolResult.message;
    }
    if (toolResult.success) {
        return `말씀하신 대로 처리해드렸습니다.`;
    }
    return `처리를 완료했습니다.`;
}
// 감정 분석 함수
function analyzeEmotion(text) {
    const lowerText = text.toLowerCase();
    // 기쁨 키워드 (귀여운 표현 포함)
    if (lowerText.includes('좋아') || lowerText.includes('기쁘') ||
        lowerText.includes('성공') || lowerText.includes('완료') ||
        lowerText.includes('축하') || lowerText.includes('대단') ||
        lowerText.includes('훌륭') || lowerText.includes('멋져') ||
        lowerText.includes('와!') || lowerText.includes('오!') ||
        lowerText.includes('헉!') || lowerText.includes('대박') ||
        lowerText.includes('신나') || lowerText.includes('재밌')) {
        return 'happy';
    }
    // 슬픔 키워드 (귀여운 표현 포함)
    if (lowerText.includes('슬프') || lowerText.includes('아쉽') ||
        lowerText.includes('실패') || lowerText.includes('미안') ||
        lowerText.includes('죄송') || lowerText.includes('힘들') ||
        lowerText.includes('어려워') || lowerText.includes('안타까워') ||
        lowerText.includes('미안해요') || lowerText.includes('아이고') ||
        lowerText.includes('어쩌지') || lowerText.includes('망했어')) {
        return 'sad';
    }
    // 놀람 키워드 (귀여운 표현 포함)
    if (lowerText.includes('놀라') || lowerText.includes('어?') ||
        lowerText.includes('오!') || lowerText.includes('와!') ||
        lowerText.includes('대단') || lowerText.includes('신기') ||
        lowerText.includes('예상') || lowerText.includes('깜짝') ||
        lowerText.includes('헉!') || lowerText.includes('어머') ||
        lowerText.includes('어?') || lowerText.includes('뭐야')) {
        return 'surprised';
    }
    // 생각 키워드 (귀여운 표현 포함)
    if (lowerText.includes('생각') || lowerText.includes('잠깐') ||
        lowerText.includes('음...') || lowerText.includes('어떻게') ||
        lowerText.includes('고민') || lowerText.includes('검토') ||
        lowerText.includes('분석') || lowerText.includes('고려') ||
        lowerText.includes('음...') || lowerText.includes('어떡하지') ||
        lowerText.includes('어쩌지') || lowerText.includes('흠...')) {
        return 'thinking';
    }
    // 화남 키워드 (귀여운 표현 포함)
    if (lowerText.includes('화나') || lowerText.includes('짜증') ||
        lowerText.includes('싫어') || lowerText.includes('미워') ||
        lowerText.includes('열받') || lowerText.includes('빡쳐') ||
        lowerText.includes('어이없') || lowerText.includes('답답해')) {
        return 'angry';
    }
    return 'normal';
}
// ==================== YouTube API 엔드포인트 ====================
// YouTube 영상 검색
app.get("/youtube/search", async (req, res) => {
    try {
        const query = req.query.q;
        const maxResults = parseInt(req.query.maxResults) || 5;
        if (!query) {
            return res.status(400).json({ error: "검색어(q)가 필요합니다" });
        }
        const result = await index_1.tools.youtube_search.execute({ query, maxResults });
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// YouTube 영상 재생
app.post("/youtube/play", async (req, res) => {
    try {
        const { query, videoId, url } = req.body;
        if (!query && !videoId && !url) {
            return res.status(400).json({ error: "query, videoId, 또는 url 중 하나가 필요합니다" });
        }
        const result = await index_1.tools.youtube_play.execute({ query, videoId, url });
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// YouTube 인기 영상
app.get("/youtube/trending", async (req, res) => {
    try {
        const regionCode = req.query.region || 'KR';
        const maxResults = parseInt(req.query.maxResults) || 10;
        const category = req.query.category;
        const result = await index_1.tools.youtube_trending.execute({ regionCode, maxResults, category });
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// YouTube 채널 최신 영상
app.get("/youtube/channel", async (req, res) => {
    try {
        const channelName = req.query.name;
        const channelId = req.query.id;
        const maxResults = parseInt(req.query.maxResults) || 5;
        if (!channelName && !channelId) {
            return res.status(400).json({ error: "채널 이름(name) 또는 채널 ID(id)가 필요합니다" });
        }
        const result = await index_1.tools.youtube_channel_videos.execute({ channelName, channelId, maxResults });
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// YouTube 영상 정보
app.get("/youtube/video/:videoId", async (req, res) => {
    try {
        const { videoId } = req.params;
        if (!videoId) {
            return res.status(400).json({ error: "videoId가 필요합니다" });
        }
        const result = await index_1.tools.youtube_video_info.execute({ videoId });
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 음성 명령으로 YouTube 재생 (예: "BTS 노래 틀어줘")
app.post("/youtube/voice-play", upload.single('audio'), async (req, res) => {
    try {
        let query = req.body.query;
        // 음성 파일이 있으면 STT 처리
        if (req.file) {
            query = await speechToText(req.file.buffer, req.file.originalname);
            console.log('YouTube 음성 명령:', query);
        }
        if (!query) {
            return res.status(400).json({ error: "검색어 또는 음성이 필요합니다" });
        }
        // "틀어", "재생해", "들려줘" 같은 명령어 제거하고 검색
        const cleanQuery = query
            .replace(/(틀어|재생해|들려줘|켜줘|보여줘|찾아줘|검색해|유튜브|youtube)/gi, '')
            .trim();
        const result = await index_1.tools.youtube_play.execute({ query: cleanQuery });
        res.json({
            ...result,
            recognizedText: query,
            searchQuery: cleanQuery
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
const port = Number(process.env.PORT || 3030);
app.listen(port, () => console.log("API listening on", port));
// ==================== 자동 리마인더 백그라운드 작업 ====================
// 5분마다 리마인더 체크
setInterval(async () => {
    try {
        const result = await index_1.tools.check_reminders.execute();
        if (result.reminders && result.reminders.length > 0) {
            console.log(`🔔 리마인더: ${result.reminders.length}개의 일정이 곧 시작됩니다`);
            result.reminders.forEach(reminder => {
                console.log(`- ${reminder.title} (${reminder.minutesUntil}분 후)`);
            });
        }
        if (result.expired && typeof result.expired === 'number' && result.expired > 0) {
            console.log(`🗑️ 자동 정리: ${result.expired}개의 지난 일정이 삭제되었습니다`);
        }
    }
    catch (error) {
        console.error("리마인더 백그라운드 작업 오류:", error);
    }
}, 5 * 60 * 1000); // 5분마다 실행
console.log("⏰ 자동 리마인더가 시작되었습니다 (5분마다 체크)");
//# sourceMappingURL=server.js.map