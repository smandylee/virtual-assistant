/**
 * Vertex AI 통합 모듈
 * - Gemini Pro/Flash (대화 생성)
 * - Google Search Grounding (웹 검색)
 * - Embeddings (텍스트 → 벡터)
 * - Vector Search (장기 기억)
 */
interface MemoryEntry {
    id: string;
    text: string;
    embedding: number[];
    timestamp: Date;
    type: "conversation" | "fact" | "preference" | "event";
    metadata?: Record<string, any>;
}
/**
 * Vertex AI 초기화
 */
export declare function initVertexAI(): Promise<boolean>;
/**
 * Gemini로 대화 생성 (Vertex AI 버전)
 */
export declare function chatWithVertexGemini(message: string, context?: string, systemPrompt?: string): Promise<string>;
/**
 * 텍스트를 벡터로 변환 (Embedding)
 */
export declare function getEmbedding(text: string): Promise<number[]>;
/**
 * 기억 추가
 */
export declare function addMemory(text: string, type: MemoryEntry["type"], metadata?: Record<string, any>): Promise<string>;
/**
 * 유사한 기억 검색
 */
export declare function searchMemory(query: string, topK?: number, typeFilter?: MemoryEntry["type"]): Promise<MemoryEntry[]>;
/**
 * 특정 타입의 기억 조회
 */
export declare function getMemoriesByType(type: MemoryEntry["type"]): MemoryEntry[];
/**
 * 기억 저장 (파일로)
 */
export declare function saveMemory(): Promise<void>;
/**
 * 기억 로드 (파일에서)
 */
export declare function loadMemory(): Promise<void>;
/**
 * 중요한 정보 추출 및 저장 (대화에서 자동 추출)
 */
export declare function extractAndSaveImportantInfo(conversation: string): Promise<string[]>;
/**
 * 기억 통계
 */
export declare function getMemoryStats(): {
    total: number;
    byType: Record<string, number>;
    oldest?: Date;
    newest?: Date;
};
/**
 * 오래된 기억 정리
 */
export declare function cleanupOldMemories(maxAge?: number): Promise<number>;
/**
 * 🔍 Vertex AI 웹 검색 (Google Search Grounding)
 * Google Custom Search API 대신 Vertex AI의 Grounding 기능 사용
 */
export declare function searchWithVertex(query: string, options?: {
    maxResults?: number;
    language?: string;
}): Promise<{
    success: boolean;
    query: string;
    answer: string;
    sources?: Array<{
        title: string;
        url: string;
        snippet: string;
    }>;
    error?: string;
}>;
/**
 * 🔍 뉴스 검색 (Vertex AI)
 */
export declare function searchNewsWithVertex(query: string, maxResults?: number): Promise<{
    success: boolean;
    query: string;
    answer: string;
    error?: string;
}>;
declare const _default: {
    initVertexAI: typeof initVertexAI;
    chatWithVertexGemini: typeof chatWithVertexGemini;
    getEmbedding: typeof getEmbedding;
    addMemory: typeof addMemory;
    searchMemory: typeof searchMemory;
    getMemoriesByType: typeof getMemoriesByType;
    saveMemory: typeof saveMemory;
    loadMemory: typeof loadMemory;
    extractAndSaveImportantInfo: typeof extractAndSaveImportantInfo;
    getMemoryStats: typeof getMemoryStats;
    cleanupOldMemories: typeof cleanupOldMemories;
    searchWithVertex: typeof searchWithVertex;
    searchNewsWithVertex: typeof searchNewsWithVertex;
};
export default _default;
