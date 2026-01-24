"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatWithOllama = chatWithOllama;
const node_fetch_1 = __importDefault(require("node-fetch"));
const db_js_1 = require("../memory/db.js");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
async function chatWithOllama(system, user) {
    // 학습된 컨텍스트 가져오기
    const userPreferences = (0, db_js_1.getUserPreference)("communication_style") || "formal";
    const recentContext = (0, db_js_1.getLearningContext)("conversation", 3);
    const conversationPatterns = (0, db_js_1.getConversationPatterns)(user);
    const recentInteractions = (0, db_js_1.getRecentInteractions)(3);
    // 학습된 정보를 시스템 프롬프트에 추가
    let enhancedSystem = system;
    if (userPreferences) {
        enhancedSystem += `\n\n사용자 선호도: ${userPreferences}`;
    }
    if (recentContext.length > 0) {
        enhancedSystem += `\n\n최근 학습된 컨텍스트: ${recentContext.map(c => c.context_data).join(", ")}`;
    }
    if (conversationPatterns.length > 0) {
        enhancedSystem += `\n\n학습된 대화 패턴: ${conversationPatterns.map(p => p.preferred_response).join(", ")}`;
    }
    // 최근 대화 기록을 컨텍스트로 추가
    const contextMessages = recentInteractions.map(interaction => [
        { role: "user", content: interaction.user_text },
        { role: "assistant", content: interaction.model_text }
    ]).flat();
    // OpenAI API 사용
    if (!OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.");
    }
    const r = await (0, node_fetch_1.default)("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
                { role: "system", content: enhancedSystem },
                ...contextMessages,
                { role: "user", content: user }
            ],
            temperature: 0.1,
            max_tokens: 500,
            top_p: 0.7
        })
    });
    if (!r.ok) {
        const errorText = await r.text();
        throw new Error(`OpenAI API 오류 (${r.status}): ${errorText}`);
    }
    const j = await r.json();
    console.log("OpenAI response:", j);
    const response = j?.choices?.[0]?.message?.content ?? "(no content)";
    // 학습 데이터 저장
    (0, db_js_1.saveLearningContext)("conversation", `사용자: ${user} | AI: ${response}`, 1);
    (0, db_js_1.learnConversationPattern)(user, response);
    return response;
}
//# sourceMappingURL=ollama.js.map