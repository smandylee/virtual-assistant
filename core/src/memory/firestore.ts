/**
 * Firestore 통합 모듈 (중앙 DB + 벡터 기억)
 * - 벡터 검색: 장기 기억 (의미 기반 검색)
 * - 문서 DB: 유저 프로필, 일정, 시스템 프롬프트, 지식 카드
 * - GCP 서비스 계정 (gcp-key.json)으로 인증
 * - 24시간 클라우드 접근 가능
 */

import { Firestore, FieldValue, Filter } from "@google-cloud/firestore";
import path from "path";

// ==================== 타입 정의 ====================

export type MemoryType = "conversation" | "fact" | "preference" | "event";

export interface MemoryEntry {
  id: string;
  text: string;
  type: MemoryType;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface MemorySearchResult extends MemoryEntry {
  score: number;
}

export interface UserProfile {
  name?: string;
  preferences?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Schedule {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  description?: string;
  createdAt?: string;
}

export interface KnowledgeCard {
  id?: string;
  question: string;
  answer: string;
  context?: string;
  tags?: string[];
  usageCount?: number;
  createdAt?: string;
}

// ==================== Firestore 클라이언트 ====================

const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID || "alphavertex-486307";
const KEY_FILE_PATH = path.join(process.cwd(), "gcp-key.json");

let db: Firestore | null = null;
const DEFAULT_USER_ID = "default";

/**
 * Firestore 초기화
 */
export async function initFirestore(): Promise<boolean> {
  try {
    db = new Firestore({
      projectId: PROJECT_ID,
      keyFilename: KEY_FILE_PATH,
      preferRest: true, // gRPC 대신 REST 사용 (Windows 호환성)
    });

    // 연결 테스트 (읽기만 시도)
    await db.listCollections();

    console.log(`✅ Firestore 초기화 완료 (프로젝트: ${PROJECT_ID})`);
    return true;
  } catch (error: any) {
    console.error("❌ Firestore 초기화 실패:", error.message);
    console.error("   서비스 계정:", KEY_FILE_PATH);
    console.error("   프로젝트:", PROJECT_ID);
    console.error("   해결 방법: GCP Console > IAM > sky-431 서비스 계정에 'Cloud Datastore User' 역할 추가");
    db = null;
    return false;
  }
}

function ensureDB(): Firestore {
  if (!db) {
    throw new Error("Firestore가 초기화되지 않았습니다.");
  }
  return db;
}

export function isConnected(): boolean {
  return db !== null;
}

// ==================== 벡터 기억 (ChromaDB 대체) ====================

/**
 * 기억 추가 (벡터 임베딩과 함께 저장)
 */
export async function addMemory(
  text: string,
  type: MemoryType,
  embedding: number[],
  metadata?: Record<string, any>
): Promise<string> {
  const firestore = ensureDB();
  const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = new Date().toISOString();

  await firestore.collection("memories").doc(id).set({
    text,
    type,
    embedding: FieldValue.vector(embedding),
    timestamp,
    ...metadata,
  });

  console.log(`💾 Firestore 기억 저장: [${type}] ${text.substring(0, 50)}...`);
  return id;
}

/**
 * 벡터 유사도 검색 (Firestore findNearest)
 */
export async function searchMemory(
  queryEmbedding: number[],
  topK: number = 5,
  typeFilter?: MemoryType
): Promise<MemorySearchResult[]> {
  try {
    const firestore = ensureDB();
    let collectionRef: FirebaseFirestore.Query = firestore.collection("memories");

    if (typeFilter) {
      collectionRef = collectionRef.where("type", "==", typeFilter);
    }

    // Firestore 벡터 검색 (findNearest)
    const vectorQuery = collectionRef.findNearest("embedding", FieldValue.vector(queryEmbedding), {
      limit: topK,
      distanceMeasure: "COSINE",
    });

    const snapshot = await vectorQuery.get();

    const results: MemorySearchResult[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Firestore COSINE distance: 0 = 동일, 2 = 정반대
      // similarity = 1 - (distance / 2) 로 변환
      const distance = (data as any)._distance ?? 0;
      const score = 1 - distance / 2;

      if (score >= 0.5) {
        results.push({
          id: doc.id,
          text: data.text || "",
          type: data.type || "conversation",
          timestamp: data.timestamp || "",
          metadata: data.metadata,
          score,
        });
      }
    });

    return results;
  } catch (error: any) {
    // 벡터 인덱스가 없으면 안내 메시지
    if (error.message?.includes("index")) {
      console.error("⚠️ Firestore 벡터 인덱스가 필요합니다. 아래 명령으로 생성하세요:");
      console.error("   gcloud firestore indexes composite create --collection-group=memories --field-config=vector-config='{\"dimension\":768,\"flat\":{}}',field-path=embedding");
    }
    console.error("Firestore 검색 오류:", error.message);
    return [];
  }
}

/**
 * 특정 타입의 기억 조회
 */
export async function getMemoriesByType(
  type: MemoryType,
  limit: number = 20
): Promise<MemoryEntry[]> {
  try {
    const firestore = ensureDB();
    const snapshot = await firestore
      .collection("memories")
      .where("type", "==", type)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        text: data.text || "",
        type: data.type || type,
        timestamp: data.timestamp || "",
        metadata: data.metadata,
      };
    });
  } catch (error: any) {
    console.error("Firestore 타입별 조회 오류:", error.message);
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
  try {
    const firestore = ensureDB();
    const byType: Record<string, number> = {
      conversation: 0,
      fact: 0,
      preference: 0,
      event: 0,
    };

    // 각 타입별 카운트
    for (const type of Object.keys(byType)) {
      const snapshot = await firestore
        .collection("memories")
        .where("type", "==", type)
        .count()
        .get();
      byType[type] = snapshot.data().count;
    }

    const total = Object.values(byType).reduce((a, b) => a + b, 0);
    return { total, byType };
  } catch (error: any) {
    console.error("Firestore 통계 오류:", error.message);
    return {
      total: 0,
      byType: { conversation: 0, fact: 0, preference: 0, event: 0 },
    };
  }
}

/**
 * 오래된 대화 기억 정리 (fact, preference, event는 유지)
 */
export async function cleanupOldMemories(
  maxAgeMs: number = 30 * 24 * 60 * 60 * 1000
): Promise<number> {
  try {
    const firestore = ensureDB();
    const cutoffDate = new Date(Date.now() - maxAgeMs).toISOString();

    const snapshot = await firestore
      .collection("memories")
      .where("type", "==", "conversation")
      .where("timestamp", "<", cutoffDate)
      .get();

    if (snapshot.empty) return 0;

    // 배치 삭제 (Firestore 배치 최대 500개)
    const batch = firestore.batch();
    let count = 0;

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      count++;
    });

    await batch.commit();
    console.log(`🧹 Firestore 오래된 기억 정리: ${count}개 삭제`);
    return count;
  } catch (error: any) {
    console.error("Firestore 정리 오류:", error.message);
    return 0;
  }
}

// ==================== 유저 프로필 ====================

export async function getUserProfile(
  userId: string = DEFAULT_USER_ID
): Promise<UserProfile | null> {
  try {
    const doc = await ensureDB().collection("users").doc(userId).get();
    return doc.exists ? (doc.data() as UserProfile) : null;
  } catch (error: any) {
    console.error("유저 프로필 조회 오류:", error.message);
    return null;
  }
}

export async function saveUserProfile(
  profile: Partial<UserProfile>,
  userId: string = DEFAULT_USER_ID
): Promise<void> {
  try {
    await ensureDB()
      .collection("users")
      .doc(userId)
      .set({ ...profile, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (error: any) {
    console.error("유저 프로필 저장 오류:", error.message);
  }
}

// ==================== 일정 관리 ====================

export async function addSchedule(
  schedule: Omit<Schedule, "id" | "createdAt">
): Promise<string> {
  try {
    const docRef = ensureDB().collection("schedules").doc();
    const newSchedule: Schedule = {
      id: docRef.id,
      ...schedule,
      createdAt: new Date().toISOString(),
    };
    await docRef.set(newSchedule);
    console.log(`📅 Firestore 일정 추가: ${schedule.title}`);
    return docRef.id;
  } catch (error: any) {
    console.error("일정 추가 오류:", error.message);
    throw error;
  }
}

export async function getSchedules(date?: string): Promise<Schedule[]> {
  try {
    let query: FirebaseFirestore.Query = ensureDB()
      .collection("schedules")
      .orderBy("date")
      .orderBy("time");

    if (date) {
      query = query.where("date", "==", date);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data() as Schedule);
  } catch (error: any) {
    console.error("일정 조회 오류:", error.message);
    return [];
  }
}

export async function getUpcomingSchedules(limit: number = 10): Promise<Schedule[]> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const snapshot = await ensureDB()
      .collection("schedules")
      .where("date", ">=", today)
      .orderBy("date")
      .orderBy("time")
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => doc.data() as Schedule);
  } catch (error: any) {
    console.error("다가오는 일정 조회 오류:", error.message);
    return [];
  }
}

export async function deleteSchedule(scheduleId: string): Promise<boolean> {
  try {
    await ensureDB().collection("schedules").doc(scheduleId).delete();
    console.log(`🗑️ Firestore 일정 삭제: ${scheduleId}`);
    return true;
  } catch (error: any) {
    console.error("일정 삭제 오류:", error.message);
    return false;
  }
}

export async function checkReminders(): Promise<Schedule[]> {
  try {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    const today = now.toISOString().split("T")[0];
    const currentTime = now.toTimeString().substring(0, 5);
    const futureTime = oneHourLater.toTimeString().substring(0, 5);

    const snapshot = await ensureDB()
      .collection("schedules")
      .where("date", "==", today)
      .get();

    return snapshot.docs
      .map((doc) => doc.data() as Schedule)
      .filter((s) => s.time >= currentTime && s.time <= futureTime);
  } catch (error: any) {
    console.error("리마인더 체크 오류:", error.message);
    return [];
  }
}

// ==================== 시스템 프롬프트 ====================

export async function getSystemPrompt(promptId: string = "default"): Promise<string | null> {
  try {
    const doc = await ensureDB().collection("prompts").doc(promptId).get();
    return doc.exists ? (doc.data()?.content as string) : null;
  } catch (error: any) {
    console.error("시스템 프롬프트 조회 오류:", error.message);
    return null;
  }
}

export async function saveSystemPrompt(content: string, promptId: string = "default"): Promise<void> {
  try {
    await ensureDB()
      .collection("prompts")
      .doc(promptId)
      .set({ content, updatedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error("시스템 프롬프트 저장 오류:", error.message);
  }
}

// ==================== 지식 카드 ====================

export async function addKnowledgeCard(
  card: Omit<KnowledgeCard, "id" | "createdAt" | "usageCount">
): Promise<string> {
  try {
    const docRef = ensureDB().collection("knowledge").doc();
    await docRef.set({
      id: docRef.id,
      ...card,
      usageCount: 0,
      createdAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error: any) {
    console.error("지식 카드 추가 오류:", error.message);
    throw error;
  }
}

export async function searchKnowledgeCards(query: string, limit: number = 5): Promise<KnowledgeCard[]> {
  try {
    const snapshot = await ensureDB()
      .collection("knowledge")
      .orderBy("usageCount", "desc")
      .limit(limit * 3)
      .get();

    const cards = snapshot.docs.map((doc) => doc.data() as KnowledgeCard);
    const queryLower = query.toLowerCase();

    return cards
      .filter(
        (c) =>
          c.question?.toLowerCase().includes(queryLower) ||
          c.answer?.toLowerCase().includes(queryLower) ||
          c.tags?.some((t) => t.toLowerCase().includes(queryLower))
      )
      .slice(0, limit);
  } catch (error: any) {
    console.error("지식 카드 검색 오류:", error.message);
    return [];
  }
}

export async function incrementCardUsage(cardId: string): Promise<void> {
  try {
    await ensureDB()
      .collection("knowledge")
      .doc(cardId)
      .update({ usageCount: FieldValue.increment(1) });
  } catch (error: any) {
    console.error("지식 카드 사용 횟수 업데이트 오류:", error.message);
  }
}

// ==================== 대화 저장 ====================

export async function saveConversation(
  userText: string,
  modelText: string,
  metadata?: Record<string, any>
): Promise<string> {
  try {
    const docRef = ensureDB().collection("conversations").doc();
    await docRef.set({
      id: docRef.id,
      userText,
      modelText,
      ...metadata,
      createdAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error: any) {
    console.error("대화 저장 오류:", error.message);
    throw error;
  }
}

export default {
  initFirestore,
  isConnected,
  // 벡터 기억
  addMemory,
  searchMemory,
  getMemoriesByType,
  getMemoryStats,
  cleanupOldMemories,
  // 유저
  getUserProfile,
  saveUserProfile,
  // 일정
  addSchedule,
  getSchedules,
  getUpcomingSchedules,
  deleteSchedule,
  checkReminders,
  // 프롬프트
  getSystemPrompt,
  saveSystemPrompt,
  // 지식
  addKnowledgeCard,
  searchKnowledgeCards,
  incrementCardUsage,
  // 대화
  saveConversation,
};
