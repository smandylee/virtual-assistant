/**
 * Vertex AI 통합 모듈
 * - Gemini Pro/Flash (대화 생성)
 * - Google Search Grounding (웹 검색)
 * - Embeddings (텍스트 → 벡터)
 * - Vector Search (장기 기억)
 */

import { VertexAI, GenerativeModel, GoogleSearchRetrieval, Tool } from "@google-cloud/vertexai";
import { PredictionServiceClient } from "@google-cloud/aiplatform";
import path from "path";
import fs from "fs/promises";

// GCP 설정
const PROJECT_ID = "alphavertex-486307";
const LOCATION = "us-central1";
const KEY_FILE_PATH = path.join(process.cwd(), "gcp-key.json");

// 환경변수 설정 (GCP 인증용)
process.env.GOOGLE_APPLICATION_CREDENTIALS = KEY_FILE_PATH;

// Vertex AI 클라이언트 초기화
let vertexAI: VertexAI | null = null;
let geminiModel: GenerativeModel | null = null;
let geminiModelWithSearch: GenerativeModel | null = null; // 🔍 검색 기능 포함 모델
let embeddingClient: PredictionServiceClient | null = null;

// 장기 기억 저장소 (로컬 벡터 스토어)
interface MemoryEntry {
  id: string;
  text: string;
  embedding: number[];
  timestamp: Date;
  type: "conversation" | "fact" | "preference" | "event";
  metadata?: Record<string, any>;
}

let memoryStore: MemoryEntry[] = [];
const MEMORY_FILE = path.join(process.cwd(), "data", "vector_memory.json");

/**
 * Vertex AI 초기화
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
    
    // Gemini 모델 초기화 (일반 대화용) - Gemini 3.0 Flash Preview
    geminiModel = vertexAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
    });
    
    // 🔍 Gemini 모델 초기화 (Google Search Grounding 포함)
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
    
    // 저장된 메모리 로드
    await loadMemory();
    
    console.log("✅ Vertex AI 초기화 완료");
    console.log(`   - Project: ${PROJECT_ID}`);
    console.log(`   - Location: ${LOCATION}`);
    console.log(`   - 저장된 메모리: ${memoryStore.length}개`);
    
    return true;
  } catch (error: any) {
    console.error("❌ Vertex AI 초기화 실패:", error.message);
    return false;
  }
}

/**
 * Gemini로 대화 생성 (Vertex AI 버전)
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
    // 관련 기억 검색
    const relevantMemories = await searchMemory(message, 5);
    
    // 컨텍스트 구성
    let fullContext = systemPrompt || "당신은 친절하고 유능한 AI 비서입니다.";
    
    if (relevantMemories.length > 0) {
      fullContext += "\n\n📚 관련 기억:\n";
      relevantMemories.forEach((mem, i) => {
        fullContext += `${i + 1}. [${mem.type}] ${mem.text}\n`;
      });
    }
    
    if (context) {
      fullContext += `\n\n추가 컨텍스트: ${context}`;
    }
    
    // Gemini 호출
    const result = await geminiModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: `${fullContext}\n\n사용자: ${message}` }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      }
    });
    
    const response = result.response;
    const reply = response.candidates?.[0]?.content?.parts?.[0]?.text || "응답을 생성할 수 없습니다.";
    
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
    // 폴백: 간단한 해시 기반 임베딩 (테스트용)
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
  // 정규화
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / (magnitude || 1));
}

/**
 * 코사인 유사도 계산
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

/**
 * 기억 추가
 */
export async function addMemory(
  text: string,
  type: MemoryEntry["type"],
  metadata?: Record<string, any>
): Promise<string> {
  try {
    const embedding = await getEmbedding(text);
    const id = `mem_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const entry: MemoryEntry = {
      id,
      text,
      embedding,
      timestamp: new Date(),
      type,
      metadata
    };
    
    memoryStore.push(entry);
    
    // 주기적으로 저장 (100개마다)
    if (memoryStore.length % 100 === 0) {
      await saveMemory();
    }
    
    console.log(`💾 기억 저장: [${type}] ${text.substring(0, 50)}...`);
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
  typeFilter?: MemoryEntry["type"]
): Promise<MemoryEntry[]> {
  try {
    const queryEmbedding = await getEmbedding(query);
    
    // 필터링
    let candidates = memoryStore;
    if (typeFilter) {
      candidates = memoryStore.filter(m => m.type === typeFilter);
    }
    
    // 유사도 계산 및 정렬
    const scored = candidates.map(mem => ({
      ...mem,
      score: cosineSimilarity(queryEmbedding, mem.embedding)
    }));
    
    scored.sort((a, b) => b.score - a.score);
    
    // 상위 K개 반환 (유사도 0.5 이상만)
    return scored
      .filter(m => m.score > 0.5)
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
export function getMemoriesByType(type: MemoryEntry["type"]): MemoryEntry[] {
  return memoryStore.filter(m => m.type === type);
}

/**
 * 기억 저장 (파일로)
 */
export async function saveMemory(): Promise<void> {
  try {
    // data 디렉토리 생성
    await fs.mkdir(path.dirname(MEMORY_FILE), { recursive: true });
    
    // JSON으로 저장
    await fs.writeFile(MEMORY_FILE, JSON.stringify(memoryStore, null, 2));
    console.log(`💾 메모리 저장 완료: ${memoryStore.length}개`);
  } catch (error: any) {
    console.error("메모리 저장 오류:", error);
  }
}

/**
 * 기억 로드 (파일에서)
 */
export async function loadMemory(): Promise<void> {
  try {
    const data = await fs.readFile(MEMORY_FILE, "utf-8");
    memoryStore = JSON.parse(data);
    console.log(`📂 메모리 로드 완료: ${memoryStore.length}개`);
  } catch (error: any) {
    // 파일이 없으면 빈 배열로 시작
    memoryStore = [];
    console.log("📂 새 메모리 스토어 시작");
  }
}

/**
 * 중요한 정보 추출 및 저장 (대화에서 자동 추출)
 */
export async function extractAndSaveImportantInfo(
  conversation: string
): Promise<string[]> {
  if (!geminiModel) {
    await initVertexAI();
  }
  
  try {
    const result = await geminiModel!.generateContent({
      contents: [{
        role: "user",
        parts: [{
          text: `다음 대화에서 장기적으로 기억해야 할 중요한 정보를 추출해주세요.
각 정보는 다음 카테고리 중 하나로 분류해주세요:
- fact: 사실 정보 (이름, 직업, 관심사 등)
- preference: 선호도 (좋아하는 것, 싫어하는 것)
- event: 이벤트/일정 (약속, 기념일 등)

JSON 배열 형식으로 응답해주세요:
[{"type": "fact", "text": "사용자의 이름은 ..."}, ...]

대화:
${conversation}

중요한 정보만 추출하고, 없으면 빈 배열 []을 반환하세요.`
        }]
      }],
      generationConfig: {
        temperature: 0.3,
      }
    });
    
    const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    
    // JSON 추출
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    
    const extracted = JSON.parse(jsonMatch[0]) as Array<{ type: string; text: string }>;
    const savedIds: string[] = [];
    
    for (const item of extracted) {
      const type = item.type as MemoryEntry["type"];
      if (["fact", "preference", "event"].includes(type)) {
        const id = await addMemory(item.text, type);
        savedIds.push(id);
      }
    }
    
    // 변경사항 저장
    if (savedIds.length > 0) {
      await saveMemory();
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
export function getMemoryStats(): {
  total: number;
  byType: Record<string, number>;
  oldest?: Date;
  newest?: Date;
} {
  const byType: Record<string, number> = {
    conversation: 0,
    fact: 0,
    preference: 0,
    event: 0
  };
  
  for (const mem of memoryStore) {
    byType[mem.type] = (byType[mem.type] || 0) + 1;
  }
  
  const timestamps = memoryStore.map(m => new Date(m.timestamp).getTime());
  
  return {
    total: memoryStore.length,
    byType,
    oldest: timestamps.length > 0 ? new Date(Math.min(...timestamps)) : undefined,
    newest: timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined
  };
}

/**
 * 오래된 기억 정리
 */
export async function cleanupOldMemories(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = Date.now() - maxAge;
  const before = memoryStore.length;
  
  // conversation 타입만 정리 (fact, preference, event는 유지)
  memoryStore = memoryStore.filter(m => 
    m.type !== "conversation" || new Date(m.timestamp).getTime() > cutoff
  );
  
  const removed = before - memoryStore.length;
  
  if (removed > 0) {
    await saveMemory();
    console.log(`🧹 오래된 기억 정리: ${removed}개 삭제`);
  }
  
  return removed;
}

/**
 * 🔍 Vertex AI 웹 검색 (Google Search Grounding)
 * Google Custom Search API 대신 Vertex AI의 Grounding 기능 사용
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
        error: "Vertex AI가 초기화되지 않았습니다."
      };
    }
  }
  
  try {
    console.log(`🔍 Vertex AI 검색: ${query}`);
    
    const result = await geminiModelWithSearch.generateContent({
      contents: [{
        role: "user",
        parts: [{
          text: `다음 질문에 대해 최신 정보를 검색하여 정확하게 답변해주세요.

질문: ${query}

답변 형식:
1. 핵심 답변을 먼저 제공
2. 관련 세부 정보 추가
3. 출처가 있다면 언급

한국어로 답변해주세요.`
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      }
    });
    
    const response = result.response;
    const answer = response.candidates?.[0]?.content?.parts?.[0]?.text || "검색 결과를 찾을 수 없습니다.";
    
    // Grounding metadata에서 출처 추출 (있는 경우)
    const groundingMetadata = (response.candidates?.[0] as any)?.groundingMetadata;
    const sources: Array<{ title: string; url: string; snippet: string }> = [];
    
    if (groundingMetadata?.webSearchQueries) {
      console.log('검색 쿼리:', groundingMetadata.webSearchQueries);
    }
    
    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web) {
          sources.push({
            title: chunk.web.title || "출처",
            url: chunk.web.uri || "",
            snippet: ""
          });
        }
      }
    }
    
    console.log(`✅ Vertex AI 검색 완료, 출처 ${sources.length}개`);
    
    return {
      success: true,
      query,
      answer,
      sources: sources.length > 0 ? sources : undefined
    };
    
  } catch (error: any) {
    console.error("Vertex AI 검색 오류:", error);
    return {
      success: false,
      query,
      answer: "",
      error: error.message || "검색 중 오류가 발생했습니다."
    };
  }
}

/**
 * 🔍 뉴스 검색 (Vertex AI)
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

// 기본 export
export default {
  initVertexAI,
  chatWithVertexGemini,
  getEmbedding,
  addMemory,
  searchMemory,
  getMemoriesByType,
  saveMemory,
  loadMemory,
  extractAndSaveImportantInfo,
  getMemoryStats,
  cleanupOldMemories,
  searchWithVertex,
  searchNewsWithVertex
};
