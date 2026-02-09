/**
 * Vertex AI 통합 모듈
 * - Gemini 3.0 Flash (대화 생성)
 * - Google Search Grounding (웹 검색)
 * - Embeddings (텍스트 → 벡터)
 * - Firestore 통합 (장기 기억 + 중앙 DB)
 */

import { VertexAI, GenerativeModel, GoogleSearchRetrieval, Tool } from "@google-cloud/vertexai";
import { PredictionServiceClient } from "@google-cloud/aiplatform";
import path from "path";
import fs from "fs/promises";

// Firestore 통합 (벡터 기억 + 중앙 DB)
import {
  initFirestore,
  isConnected as isFirestoreConnected,
  addMemory as firestoreAddMemory,
  searchMemory as firestoreSearchMemory,
  getMemoriesByType as firestoreGetMemoriesByType,
  getMemoryStats as firestoreGetMemoryStats,
  cleanupOldMemories as firestoreCleanupOldMemories,
  type MemoryType,
  type MemoryEntry,
  type MemorySearchResult,
} from "../memory/firestore.js";

import { unifiedSearch, formatForContext } from "../memory/router.js";

// GCP 설정
const PROJECT_ID = "alphavertex-486307";
const LOCATION = "us-central1";
const KEY_FILE_PATH = path.join(process.cwd(), "gcp-key.json");

// 환경변수 설정 (GCP 인증용)
process.env.GOOGLE_APPLICATION_CREDENTIALS = KEY_FILE_PATH;

// Vertex AI 클라이언트
let vertexAI: VertexAI | null = null;
let geminiModel: GenerativeModel | null = null;
let geminiModelWithSearch: GenerativeModel | null = null;
let embeddingClient: PredictionServiceClient | null = null;

// Firestore 사용 가능 여부 (폴백: JSON 메모리)
let useFirestore = false;

// JSON 폴백용 메모리 저장소
interface LegacyMemoryEntry {
  id: string;
  text: string;
  embedding: number[];
  timestamp: Date;
  type: "conversation" | "fact" | "preference" | "event";
  metadata?: Record<string, any>;
}

let legacyMemoryStore: LegacyMemoryEntry[] = [];
const MEMORY_FILE = path.join(process.cwd(), "data", "vector_memory.json");

/**
 * Vertex AI + Firestore 통합 초기화
 */
export async function initVertexAI(): Promise<boolean> {
  try {
    // 키 파일 존재 확인
    await fs.access(KEY_FILE_PATH);

    // Vertex AI 초기화
    vertexAI = new VertexAI({
      project: PROJECT_ID,
      location: LOCATION,
    });

    // Gemini 모델 초기화 (일반 대화용)
    geminiModel = vertexAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
    });

    // Gemini 모델 초기화 (Google Search Grounding 포함)
    geminiModelWithSearch = vertexAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      tools: [
        {
          googleSearchRetrieval: {
            disableAttribution: false,
          },
        } as Tool,
      ],
    });

    // Embedding 클라이언트 초기화
    embeddingClient = new PredictionServiceClient({
      keyFilename: KEY_FILE_PATH,
    });

    console.log("✅ Vertex AI 초기화 완료");
    console.log(`   - Project: ${PROJECT_ID}`);
    console.log(`   - Location: ${LOCATION}`);

    // Firestore 초기화 시도
    useFirestore = await initFirestore();
    if (useFirestore) {
      console.log("✅ Firestore 통합 메모리 활성화");
    } else {
      console.log("⚠️ Firestore 미연결 → JSON 폴백 메모리 사용");
      await loadLegacyMemory();
      console.log(`   - JSON 메모리: ${legacyMemoryStore.length}개`);
    }

    return true;
  } catch (error: any) {
    console.error("❌ Vertex AI 초기화 실패:", error.message);
    return false;
  }
}

/**
 * Gemini로 대화 생성 (메모리 라우터 통합)
 */
export async function chatWithVertexGemini(
  message: string,
  context?: string,
  systemPrompt?: string
): Promise<string> {
  if (!geminiModel) {
    await initVertexAI();
    if (!geminiModel) {
      throw new Error("Vertex AI가 초기화되지 않았습니다.");
    }
  }

  try {
    // 메모리 라우터로 통합 검색
    const searchResult = await unifiedSearch(message, { topK: 5 });
    const contextFromMemory = formatForContext(searchResult);

    // 컨텍스트 구성
    let fullContext = systemPrompt || "당신은 친절하고 유능한 AI 비서입니다.";

    if (contextFromMemory) {
      fullContext += `\n\n${contextFromMemory}`;
    }

    if (context) {
      fullContext += `\n\n추가 컨텍스트: ${context}`;
    }

    // Gemini 호출
    const result = await geminiModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: `${fullContext}\n\n사용자: ${message}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    const response = result.response;
    const reply =
      response.candidates?.[0]?.content?.parts?.[0]?.text ||
      "응답을 생성할 수 없습니다.";

    // 대화 기억 저장
    await addMemory(message, "conversation", { role: "user" });
    await addMemory(reply, "conversation", { role: "assistant" });

    return reply;
  } catch (error: any) {
    console.error("Vertex Gemini 오류:", error);
    throw error;
  }
}

/**
 * 텍스트를 벡터로 변환 (Embedding)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  if (!embeddingClient) {
    await initVertexAI();
    if (!embeddingClient) {
      throw new Error("Embedding 클라이언트가 초기화되지 않았습니다.");
    }
  }

  try {
    const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/text-embedding-004`;

    const [response] = await embeddingClient.predict({
      endpoint,
      instances: [{ content: text }] as any,
    });

    const embedding = (response.predictions?.[0] as any)?.embeddings?.values;

    if (!embedding) {
      throw new Error("임베딩 생성 실패");
    }

    return embedding;
  } catch (error: any) {
    console.error("Embedding 오류:", error);
    return simpleHash(text);
  }
}

/**
 * 간단한 해시 기반 임베딩 (Vertex AI 실패 시 폴백)
 */
function simpleHash(text: string): number[] {
  const embedding = new Array(768).fill(0);
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    embedding[i % 768] += charCode / 1000;
  }
  const magnitude = Math.sqrt(
    embedding.reduce((sum: number, val: number) => sum + val * val, 0)
  );
  return embedding.map((val: number) => val / (magnitude || 1));
}

/**
 * 코사인 유사도 계산 (JSON 폴백용)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// ==================== 메모리 함수 (Firestore 우선, JSON 폴백) ====================

/**
 * 기억 추가
 */
export async function addMemory(
  text: string,
  type: MemoryType,
  metadata?: Record<string, any>
): Promise<string> {
  if (useFirestore) {
    const embedding = await getEmbedding(text);
    return firestoreAddMemory(text, type, embedding, metadata);
  }

  // JSON 폴백
  try {
    const embedding = await getEmbedding(text);
    const id = `mem_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const entry: LegacyMemoryEntry = {
      id,
      text,
      embedding,
      timestamp: new Date(),
      type,
      metadata,
    };

    legacyMemoryStore.push(entry);

    if (legacyMemoryStore.length % 100 === 0) {
      await saveLegacyMemory();
    }

    console.log(`💾 기억 저장 (JSON): [${type}] ${text.substring(0, 50)}...`);
    return id;
  } catch (error: any) {
    console.error("기억 추가 오류:", error);
    throw error;
  }
}

/**
 * 유사한 기억 검색
 */
export async function searchMemory(
  query: string,
  topK: number = 5,
  typeFilter?: MemoryType
): Promise<MemoryEntry[]> {
  if (useFirestore) {
    const queryEmbedding = await getEmbedding(query);
    return firestoreSearchMemory(queryEmbedding, topK, typeFilter);
  }

  // JSON 폴백
  try {
    const queryEmbedding = await getEmbedding(query);

    let candidates = legacyMemoryStore;
    if (typeFilter) {
      candidates = legacyMemoryStore.filter((m) => m.type === typeFilter);
    }

    const scored = candidates.map((mem) => ({
      id: mem.id,
      text: mem.text,
      type: mem.type as MemoryType,
      timestamp: new Date(mem.timestamp).toISOString(),
      metadata: mem.metadata,
      score: cosineSimilarity(queryEmbedding, mem.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored
      .filter((m) => m.score > 0.5)
      .slice(0, topK)
      .map(({ score, ...rest }) => rest);
  } catch (error: any) {
    console.error("기억 검색 오류:", error);
    return [];
  }
}

/**
 * 특정 타입의 기억 조회
 */
export async function getMemoriesByType(
  type: MemoryType
): Promise<MemoryEntry[]> {
  if (useFirestore) {
    return firestoreGetMemoriesByType(type);
  }
  return legacyMemoryStore
    .filter((m) => m.type === type)
    .map((m) => ({
      id: m.id,
      text: m.text,
      type: m.type as MemoryType,
      timestamp: new Date(m.timestamp).toISOString(),
      metadata: m.metadata,
    }));
}

/**
 * 기억 저장
 */
export async function saveMemory(): Promise<void> {
  if (useFirestore) {
    // Firestore는 자동 영속 → 별도 저장 불필요
    return;
  }
  await saveLegacyMemory();
}

async function saveLegacyMemory(): Promise<void> {
  try {
    await fs.mkdir(path.dirname(MEMORY_FILE), { recursive: true });
    await fs.writeFile(
      MEMORY_FILE,
      JSON.stringify(legacyMemoryStore, null, 2)
    );
    console.log(`💾 JSON 메모리 저장 완료: ${legacyMemoryStore.length}개`);
  } catch (error: any) {
    console.error("메모리 저장 오류:", error);
  }
}

async function loadLegacyMemory(): Promise<void> {
  try {
    const data = await fs.readFile(MEMORY_FILE, "utf-8");
    legacyMemoryStore = JSON.parse(data);
    console.log(`📂 JSON 메모리 로드 완료: ${legacyMemoryStore.length}개`);
  } catch (error: any) {
    legacyMemoryStore = [];
    console.log("📂 새 메모리 스토어 시작");
  }
}

/**
 * JSON → Firestore 마이그레이션
 */
export async function migrateMemoryToFirestore(): Promise<number> {
  if (!useFirestore) {
    throw new Error("Firestore가 연결되어 있지 않습니다.");
  }

  try {
    const data = await fs.readFile(MEMORY_FILE, "utf-8");
    const jsonMemories: LegacyMemoryEntry[] = JSON.parse(data);
    if (jsonMemories.length === 0) return 0;

    let migrated = 0;
    for (const mem of jsonMemories) {
      await firestoreAddMemory(
        mem.text,
        mem.type as MemoryType,
        mem.embedding,
        mem.metadata
      );
      migrated++;

      if (migrated % 50 === 0) {
        console.log(`📦 마이그레이션 진행: ${migrated}/${jsonMemories.length}`);
      }
    }

    console.log(`✅ JSON → Firestore 마이그레이션 완료: ${migrated}개`);
    return migrated;
  } catch {
    console.log("마이그레이션할 JSON 데이터가 없습니다.");
    return 0;
  }
}

/**
 * 중요한 정보 추출 및 저장
 */
export async function extractAndSaveImportantInfo(
  conversation: string
): Promise<string[]> {
  if (!geminiModel) {
    await initVertexAI();
  }

  try {
    const result = await geminiModel!.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `다음 대화에서 장기적으로 기억해야 할 중요한 정보를 추출해주세요.
각 정보는 다음 카테고리 중 하나로 분류해주세요:
- fact: 사실 정보 (이름, 직업, 관심사 등)
- preference: 선호도 (좋아하는 것, 싫어하는 것)
- event: 이벤트/일정 (약속, 기념일 등)

JSON 배열 형식으로 응답해주세요:
[{"type": "fact", "text": "사용자의 이름은 ..."}, ...]

대화:
${conversation}

중요한 정보만 추출하고, 없으면 빈 배열 []을 반환하세요.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
      },
    });

    const responseText =
      result.response.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const extracted = JSON.parse(jsonMatch[0]) as Array<{
      type: string;
      text: string;
    }>;
    const savedIds: string[] = [];

    for (const item of extracted) {
      const type = item.type as MemoryType;
      if (["fact", "preference", "event"].includes(type)) {
        const id = await addMemory(item.text, type);
        savedIds.push(id);
      }
    }

    return savedIds;
  } catch (error: any) {
    console.error("정보 추출 오류:", error);
    return [];
  }
}

/**
 * 기억 통계
 */
export async function getMemoryStats(): Promise<{
  total: number;
  byType: Record<string, number>;
}> {
  if (useFirestore) {
    return firestoreGetMemoryStats();
  }

  const byType: Record<string, number> = {
    conversation: 0,
    fact: 0,
    preference: 0,
    event: 0,
  };

  for (const mem of legacyMemoryStore) {
    byType[mem.type] = (byType[mem.type] || 0) + 1;
  }

  return { total: legacyMemoryStore.length, byType };
}

/**
 * 오래된 기억 정리
 */
export async function cleanupOldMemories(
  maxAge: number = 30 * 24 * 60 * 60 * 1000
): Promise<number> {
  if (useFirestore) {
    return firestoreCleanupOldMemories(maxAge);
  }

  const cutoff = Date.now() - maxAge;
  const before = legacyMemoryStore.length;

  legacyMemoryStore = legacyMemoryStore.filter(
    (m) =>
      m.type !== "conversation" ||
      new Date(m.timestamp).getTime() > cutoff
  );

  const removed = before - legacyMemoryStore.length;

  if (removed > 0) {
    await saveLegacyMemory();
    console.log(`🧹 오래된 기억 정리: ${removed}개 삭제`);
  }

  return removed;
}

/**
 * Vertex AI 웹 검색 (Google Search Grounding)
 */
export async function searchWithVertex(
  query: string,
  options?: {
    maxResults?: number;
    language?: string;
  }
): Promise<{
  success: boolean;
  query: string;
  answer: string;
  sources?: Array<{ title: string; url: string; snippet: string }>;
  error?: string;
}> {
  if (!geminiModelWithSearch) {
    await initVertexAI();
    if (!geminiModelWithSearch) {
      return {
        success: false,
        query,
        answer: "",
        error: "Vertex AI가 초기화되지 않았습니다.",
      };
    }
  }

  try {
    console.log(`🔍 Vertex AI 검색: ${query}`);

    const result = await geminiModelWithSearch.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `다음 질문에 대해 최신 정보를 검색하여 정확하게 답변해주세요.

질문: ${query}

답변 형식:
1. 핵심 답변을 먼저 제공
2. 관련 세부 정보 추가
3. 출처가 있다면 언급

한국어로 답변해주세요.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });

    const response = result.response;
    const answer =
      response.candidates?.[0]?.content?.parts?.[0]?.text ||
      "검색 결과를 찾을 수 없습니다.";

    const groundingMetadata = (response.candidates?.[0] as any)
      ?.groundingMetadata;
    const sources: Array<{ title: string; url: string; snippet: string }> = [];

    if (groundingMetadata?.webSearchQueries) {
      console.log("검색 쿼리:", groundingMetadata.webSearchQueries);
    }

    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web) {
          sources.push({
            title: chunk.web.title || "출처",
            url: chunk.web.uri || "",
            snippet: "",
          });
        }
      }
    }

    console.log(`✅ Vertex AI 검색 완료, 출처 ${sources.length}개`);

    return {
      success: true,
      query,
      answer,
      sources: sources.length > 0 ? sources : undefined,
    };
  } catch (error: any) {
    console.error("Vertex AI 검색 오류:", error);
    return {
      success: false,
      query,
      answer: "",
      error: error.message || "검색 중 오류가 발생했습니다.",
    };
  }
}

/**
 * 뉴스 검색 (Vertex AI)
 */
export async function searchNewsWithVertex(
  query: string,
  maxResults: number = 5
): Promise<{
  success: boolean;
  query: string;
  answer: string;
  error?: string;
}> {
  return searchWithVertex(`${query} 최신 뉴스`, { maxResults });
}

// Re-export 타입
export type { MemoryType, MemoryEntry, MemorySearchResult };

// 기본 export
export default {
  initVertexAI,
  chatWithVertexGemini,
  getEmbedding,
  addMemory,
  searchMemory,
  getMemoriesByType,
  saveMemory,
  extractAndSaveImportantInfo,
  getMemoryStats,
  cleanupOldMemories,
  searchWithVertex,
  searchNewsWithVertex,
  migrateMemoryToFirestore,
};
