"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatWithGemini = chatWithGemini;
exports.parseScheduleFromText = parseScheduleFromText;
exports.summarizeSearchResults = summarizeSearchResults;
exports.fuzzyMatchFile = fuzzyMatchFile;
exports.analyzeEmotionForTTS = analyzeEmotionForTTS;
exports.detectIntent = detectIntent;
const genai_1 = require("@google/genai");
const db_js_1 = require("../memory/db.js");
// Gemini API 키 설정 (환경변수에서 가져옴)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ai = new genai_1.GoogleGenAI({ apiKey: GEMINI_API_KEY });
// 컨텍스트 최적화 함수
const clip = (s, n = 300) => s.length > n ? s.slice(0, n) + '…' : s;
// ==================== 새로운 주제 감지 ====================
function isNewTopic(currentMsg, previousMsgs) {
    if (previousMsgs.length === 0)
        return true;
    // 명시적인 새 질문 패턴
    const newTopicPatterns = [
        /레시피/i, /만드는\s*(방법|법)/i, /요리/i,
        /날씨/i, /환율/i, /주가/i, /뉴스/i,
        /^(뭐야|뭔가|무엇)/i, /^(어떻게|어떤)/i, /^(왜|언제|어디)/i,
        /알려줘$/, /해줘$/, /틀어줘$/, /열어줘$/, /켜줘$/, /꺼줘$/
    ];
    // "자세하게", "더" 같은 이어가는 표현이 있지만, 주제가 완전히 다르면 새 주제
    const continuePatterns = /^(자세하게|더|그거|그게|아까)/i;
    // 이전 대화에서 현재 주제 관련 키워드가 있는지 확인
    const lastInteraction = previousMsgs[0] || '';
    // 현재 메시지의 핵심 키워드 추출 (간단히)
    const currentKeywords = currentMsg.replace(/[를을이가은는에서로]/g, ' ').split(/\s+/).filter(w => w.length > 1);
    // 이전 대화에 현재 키워드가 전혀 없으면 새 주제
    const hasOverlap = currentKeywords.some(kw => lastInteraction.includes(kw) && kw.length > 2);
    // "자세하게" 같은 표현이 있어도 주제가 다르면 새 주제로 판단
    if (!hasOverlap && currentKeywords.length > 0) {
        // 주제 전환 키워드 체크
        for (const pattern of newTopicPatterns) {
            if (pattern.test(currentMsg)) {
                return true;
            }
        }
    }
    return false;
}
// ==================== 메인 채팅 함수 (맥락 강화) ====================
async function chatWithGemini(system, user) {
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY가 설정되지 않았습니다. .env 파일에 GEMINI_API_KEY를 추가하세요.");
    }
    // 최근 대화 가져오기
    const recentInteractions = (0, db_js_1.getRecentInteractions)(3);
    const previousMsgs = recentInteractions.map(i => i.user_text + ' ' + i.model_text);
    // 🔥 새로운 주제인지 확인 - 새 주제면 히스토리 무시
    const newTopic = isNewTopic(user, previousMsgs);
    let historyText = '';
    if (!newTopic && recentInteractions.length > 0) {
        // 이전 대화 연속인 경우에만 히스토리 포함 (최근 2턴만)
        historyText = recentInteractions.slice(0, 2).map(interaction => `사용자: ${clip(interaction.user_text, 300)}\n알파: ${clip(interaction.model_text, 300)}`).join('\n\n');
    }
    // 시스템 프롬프트 강화: 현재 질문에 집중하라고 명시
    const enhancedSystem = `${system}

중요: 사용자의 현재 질문에만 집중해서 답변하세요. 이전 대화와 관련 없는 새로운 주제라면 이전 대화는 무시하세요.`;
    const fullPrompt = `${enhancedSystem}\n\n${historyText ? `[참고: 이전 대화]\n${historyText}\n\n` : ''}[현재 질문] 사용자: ${clip(user, 500)}`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: fullPrompt,
            config: {
                maxOutputTokens: 800,
                temperature: 0.7,
            }
        });
        const reply = response.text || "(응답을 생성할 수 없습니다)";
        // 학습 데이터 저장 (백그라운드)
        setImmediate(() => {
            try {
                (0, db_js_1.saveLearningContext)("conversation", `사용자: ${user} | AI: ${reply}`, 1);
                (0, db_js_1.learnConversationPattern)(user, reply);
            }
            catch (error) {
                console.error("백그라운드 학습 저장 오류:", error);
            }
        });
        return reply;
    }
    catch (error) {
        console.error("Gemini API 호출 오류:", error);
        throw new Error(`Gemini API 호출 실패: ${error.message}`);
    }
}
// ==================== 일정 자연어 파싱 (강화) ====================
async function parseScheduleFromText(text) {
    const today = new Date();
    const prompt = `오늘은 ${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일입니다.
다음 텍스트에서 일정 정보를 추출해서 JSON으로 반환해주세요.

텍스트: "${text}"

반드시 다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{"title": "일정 제목", "date": "YYYY-MM-DD", "time": "HH:MM", "description": "설명(선택)"}

예시:
- "내일 오후 3시 회의" → {"title": "회의", "date": "내일 날짜", "time": "15:00", "description": ""}
- "다음주 월요일 점심 약속" → {"title": "점심 약속", "date": "해당 날짜", "time": "12:00", "description": ""}
- "12월 25일 크리스마스 파티" → {"title": "크리스마스 파티", "date": "2024-12-25", "time": "18:00", "description": ""}

일정 정보가 없으면 null을 반환하세요.`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt
        });
        const responseText = (response.text || '').trim();
        // JSON 파싱 시도
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.title && parsed.date && parsed.time) {
                return parsed;
            }
        }
        return null;
    }
    catch (error) {
        console.error("일정 파싱 오류:", error);
        return null;
    }
}
// ==================== 웹 검색 결과 요약 (강화) ====================
async function summarizeSearchResults(query, results) {
    if (!results || results.length === 0) {
        return "조사 결과, 해당 정보를 찾을 수 없었습니다.";
    }
    const resultsText = results.map((r, i) => `${i + 1}. ${r.title || '제목 없음'}: ${r.content || r.text || ''}`).join('\n');
    const prompt = `사용자 질문: "${query}"

검색 결과:
${resultsText}

위 검색 결과를 바탕으로 사용자 질문에 대해 답변해주세요.

**말투 규칙 (매우 중요!):**
- 워더링하이츠 저택의 격식 있는 버틀러 "파우스트"처럼 말하세요
- 격식 있고 점잖은 경어체: '~입니다', '~하시죠', '~드리겠습니다'
- 차분하고 절제된 어조
- 이모지 절대 사용 금지
- 핵심 정보만 1-2문장으로 간결하게

**말투 예시:**
- "조사 결과를 말씀드리겠습니다. 현재 홍콩의 기온은 18도입니다."
- "확인 결과, 해당 정보는 다음과 같습니다."
- "말씀하신 내용에 대해 조사해보았습니다."`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt
        });
        return response.text || "조사 결과를 정리하는 데 문제가 있었습니다.";
    }
    catch (error) {
        console.error("검색 결과 요약 오류:", error);
        return "죄송합니다. 조사 중 문제가 발생했습니다.";
    }
}
// ==================== 파일/폴더 퍼지 검색 (강화) ====================
async function fuzzyMatchFile(query, fileList) {
    if (!fileList || fileList.length === 0) {
        return null;
    }
    const prompt = `사용자가 "${query}"라고 요청했습니다.

아래 파일/폴더 목록에서 가장 일치하는 항목을 찾아주세요:
${fileList.slice(0, 30).join('\n')}

가장 일치하는 파일/폴더의 전체 경로만 반환해주세요.
일치하는 항목이 없으면 "없음"이라고 답해주세요.
다른 설명 없이 경로만 반환하세요.`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt
        });
        const responseText = (response.text || '').trim();
        if (responseText === "없음" || responseText.length < 3) {
            return null;
        }
        // 응답에서 유효한 경로 찾기
        const matchedPath = fileList.find(f => f.toLowerCase().includes(responseText.toLowerCase()) ||
            responseText.toLowerCase().includes(f.toLowerCase().split('\\').pop() || ''));
        return matchedPath || responseText;
    }
    catch (error) {
        console.error("퍼지 매칭 오류:", error);
        return null;
    }
}
// ==================== 감정 분석 (TTS용 강화) ====================
async function analyzeEmotionForTTS(text) {
    const prompt = `다음 텍스트의 감정을 분석해주세요:
"${text}"

다음 JSON 형식으로만 응답하세요:
{"emotion": "happy|sad|excited|calm|surprised|neutral", "intensity": 1-10}

예시:
- "정말 기뻐요!" → {"emotion": "happy", "intensity": 8}
- "아쉽네요..." → {"emotion": "sad", "intensity": 5}
- "와! 대박!" → {"emotion": "excited", "intensity": 9}`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt
        });
        const responseText = (response.text || '').trim();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                emotion: parsed.emotion || 'neutral',
                intensity: Math.min(10, Math.max(1, parsed.intensity || 5))
            };
        }
    }
    catch (error) {
        console.error("감정 분석 오류:", error);
    }
    return { emotion: 'neutral', intensity: 5 };
}
// ==================== 의도 파악 (명령 자동 실행용) ====================
async function detectIntent(text) {
    const prompt = `다음 사용자 메시지의 의도를 분석해주세요:
"${text}"

의도 종류:
- chat: 일반 대화
- schedule: 일정 관련 (추가/조회/삭제)
- search: 웹 검색, 정보 찾기
- file: 파일/폴더 열기
- program: 프로그램 실행
- game: 게임 실행
- command: 시스템 명령

다음 JSON 형식으로만 응답하세요:
{"intent": "종류", "confidence": 0.0-1.0, "extracted": "추출된 핵심 정보"}

예시:
- "내일 회의 일정 추가해줘" → {"intent": "schedule", "confidence": 0.95, "extracted": "내일 회의"}
- "오늘 날씨 어때?" → {"intent": "search", "confidence": 0.9, "extracted": "오늘 날씨"}
- "카카오톡 켜줘" → {"intent": "program", "confidence": 0.95, "extracted": "카카오톡"}`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt
        });
        const responseText = (response.text || '').trim();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                intent: parsed.intent || 'chat',
                confidence: parsed.confidence || 0.5,
                extracted: parsed.extracted
            };
        }
    }
    catch (error) {
        console.error("의도 파악 오류:", error);
    }
    return { intent: 'chat', confidence: 0.5 };
}
//# sourceMappingURL=gemini.js.map