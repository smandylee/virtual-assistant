/**
 * 메모리 라우팅 모듈
 * - 질문의 성격에 따라 적절한 데이터 소스로 라우팅
 * - Firestore 벡터 검색 (개인 기억) / Vertex AI Search (웹 검색)
 */

import {
  searchMemory as firestoreSearch,
  type MemorySearchResult,
} from "./firestore.js";
import { searchWithVertex, getEmbedding } from "../vertex/index.js";

// ==================== 타입 정의 ====================

export type QueryCategory = "personal" | "web_search" | "knowledge" | "hybrid";

export interface RouteDecision {
  category: QueryCategory;
  confidence: number;
  reason: string;
}

export interface UnifiedSearchResult {
  // 개인 기억 (Firestore 벡터 검색)
  memories: MemorySearchResult[];
  // 웹 검색 (Vertex AI Search Grounding)
  searchAnswer?: string;
  searchSources?: Array<{ title: string; url: string; snippet: string }>;
  // 메타
  route: RouteDecision;
}

// ==================== 라우팅 키워드 ====================

const PERSONAL_KEYWORDS = [
  "아까", "전에", "지난번", "저번", "예전", "이전",
  "내 이름", "내 나이", "내 직업", "내 취미", "내가 좋아",
  "내가 싫어", "내 선호", "내 생일",
  "기억", "알고 있", "말했었", "얘기했", "대화했",
  "좋아하는", "싫어하는", "자주 ", "항상 ", "보통 ",
];

const WEB_SEARCH_KEYWORDS = [
  "오늘", "현재", "지금", "최근", "최신", "실시간",
  "검색", "찾아", "알려줘", "뭐야", "무엇",
  "뉴스", "날씨", "환율", "주가", "가격",
  "어떻게", "어디서", "언제", "누가", "왜",
  "맛집", "추천", "리뷰", "비교",
];

const KNOWLEDGE_KEYWORDS = [
  "설정", "파우스트", "규칙", "프롬프트", "설명서",
  "매뉴얼", "가이드", "문서",
];

// ==================== 라우팅 로직 ====================

/**
 * 질문의 카테고리를 결정하는 규칙 기반 라우터
 */
export function classifyQuery(query: string): RouteDecision {
  const queryLower = query.toLowerCase();

  let personalScore = 0;
  let webScore = 0;
  let knowledgeScore = 0;

  for (const kw of PERSONAL_KEYWORDS) {
    if (queryLower.includes(kw)) personalScore += 2;
  }

  for (const kw of WEB_SEARCH_KEYWORDS) {
    if (queryLower.includes(kw)) webScore += 2;
  }

  for (const kw of KNOWLEDGE_KEYWORDS) {
    if (queryLower.includes(kw)) knowledgeScore += 2;
  }

  if (/내[가\s]/.test(queryLower) || queryLower.startsWith("내 ")) {
    personalScore += 3;
  }

  if (query.length < 10) {
    personalScore += 1;
  }

  const totalScore = personalScore + webScore + knowledgeScore;

  if (totalScore === 0) {
    return {
      category: "hybrid",
      confidence: 0.5,
      reason: "키워드 매치 없음, 양쪽 모두 검색",
    };
  }

  const scores = [
    { category: "personal" as QueryCategory, score: personalScore },
    { category: "web_search" as QueryCategory, score: webScore },
    { category: "knowledge" as QueryCategory, score: knowledgeScore },
  ].sort((a, b) => b.score - a.score);

  const topScore = scores[0];
  const secondScore = scores[1];

  if (topScore.score - secondScore.score <= 2 && secondScore.score > 0) {
    return {
      category: "hybrid",
      confidence: 0.6,
      reason: `${topScore.category}(${topScore.score}) vs ${secondScore.category}(${secondScore.score}) - 점수 차이 적음`,
    };
  }

  const confidence = Math.min(0.95, topScore.score / (totalScore || 1));

  return {
    category: topScore.category,
    confidence,
    reason: `${topScore.category} 키워드 매치 (점수: ${topScore.score})`,
  };
}

/**
 * 통합 검색 실행
 */
export async function unifiedSearch(
  query: string,
  options?: {
    topK?: number;
    forceRoute?: QueryCategory;
  }
): Promise<UnifiedSearchResult> {
  const topK = options?.topK || 5;
  const route = options?.forceRoute
    ? { category: options.forceRoute, confidence: 1.0, reason: "강제 라우팅" }
    : classifyQuery(query);

  const result: UnifiedSearchResult = {
    memories: [],
    route,
  };

  try {
    switch (route.category) {
      case "personal": {
        // Firestore 벡터 검색
        const queryEmbedding = await getEmbedding(query);
        result.memories = await firestoreSearch(queryEmbedding, topK);
        break;
      }

      case "web_search":
      case "knowledge": {
        // Vertex AI Search (Google Search Grounding)
        const searchResult = await searchWithVertex(query);
        if (searchResult.success) {
          result.searchAnswer = searchResult.answer;
          result.searchSources = searchResult.sources;
        }
        break;
      }

      case "hybrid": {
        // 양쪽 모두 검색 (병렬)
        const queryEmbedding = await getEmbedding(query);
        const [memories, searchResult] = await Promise.all([
          firestoreSearch(queryEmbedding, topK),
          searchWithVertex(query),
        ]);

        result.memories = memories;
        if (searchResult.success) {
          result.searchAnswer = searchResult.answer;
          result.searchSources = searchResult.sources;
        }
        break;
      }
    }
  } catch (error: any) {
    console.error("통합 검색 오류:", error.message);
  }

  return result;
}

/**
 * 검색 결과를 LLM 컨텍스트 문자열로 변환
 */
export function formatForContext(result: UnifiedSearchResult): string {
  const parts: string[] = [];

  if (result.memories.length > 0) {
    parts.push("📚 관련 기억:");
    result.memories.forEach((mem, i) => {
      parts.push(`  ${i + 1}. [${mem.type}] ${mem.text}`);
    });
  }

  if (result.searchAnswer) {
    parts.push("\n🔍 검색 결과:");
    parts.push(`  ${result.searchAnswer}`);

    if (result.searchSources && result.searchSources.length > 0) {
      parts.push("  출처:");
      result.searchSources.forEach((src) => {
        parts.push(`  - ${src.title}: ${src.url}`);
      });
    }
  }

  return parts.join("\n");
}

export default {
  classifyQuery,
  unifiedSearch,
  formatForContext,
};
