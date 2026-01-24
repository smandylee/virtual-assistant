import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH || "./data/db/assistant.sqlite";
let db: Database.Database;

export function initDb() {
  fs.mkdirSync("./data/db", { recursive: true });
  db = new Database(DB_PATH);
  
  // WAL 모드 활성화: 동시 접근 성능 및 안정성 향상
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON'); // 외래 키 제약 활성화
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY,
      user_text TEXT, model_text TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    
    CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY,
      key TEXT UNIQUE,
      value TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    
    CREATE TABLE IF NOT EXISTS learning_context (
      id INTEGER PRIMARY KEY,
      context_type TEXT,
      context_data TEXT,
      importance INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    
    CREATE TABLE IF NOT EXISTS conversation_patterns (
      id INTEGER PRIMARY KEY,
      user_pattern TEXT,
      preferred_response TEXT,
      frequency INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    
    CREATE TABLE IF NOT EXISTS feedback_logs (
      id INTEGER PRIMARY KEY,
      interaction_id INTEGER,
      feedback_type TEXT, -- 'thumbs_up', 'thumbs_down', 'correction'
      feedback_tags TEXT, -- JSON array of tags
      corrected_text TEXT,
      user_rating INTEGER, -- 1-5 scale
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (interaction_id) REFERENCES interactions(id)
    );
    
    CREATE TABLE IF NOT EXISTS tool_policy_scores (
      id INTEGER PRIMARY KEY,
      tool_name TEXT,
      intent TEXT,
      score INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      last_updated DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    
    CREATE TABLE IF NOT EXISTS knowledge_cards (
      id INTEGER PRIMARY KEY,
      question TEXT,
      answer TEXT,
      context TEXT,
      tags TEXT, -- JSON array
      usage_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS opened_items (
      path TEXT PRIMARY KEY,
      kind TEXT, -- 'file' | 'folder'
      open_count INTEGER DEFAULT 0,
      last_opened DATETIME DEFAULT (datetime('now', 'localtime'))
    );
  `);
}

export function logInteraction(user_text: string, model_text: string) {
  const stmt = db.prepare(
    `INSERT INTO interactions(user_text, model_text) VALUES (?, ?)`
  );
  const info = stmt.run(user_text, model_text);
  return info.lastInsertRowid as number;
}

// 사용자 선호도 저장
export function saveUserPreference(key: string, value: string) {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO user_preferences(key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))`
  );
  stmt.run(key, value);
}

// 사용자 선호도 조회
export function getUserPreference(key: string): string | null {
  const stmt = db.prepare(`SELECT value FROM user_preferences WHERE key = ?`);
  const result = stmt.get(key) as { value: string } | undefined;
  return result?.value || null;
}

// 학습 컨텍스트 저장
export function saveLearningContext(type: string, data: string, importance: number = 1) {
  const stmt = db.prepare(
    `INSERT INTO learning_context(context_type, context_data, importance) VALUES (?, ?, ?)`
  );
  stmt.run(type, data, importance);
}

// 학습 컨텍스트 조회
export function getLearningContext(type?: string, limit: number = 10) {
  let query = `SELECT * FROM learning_context`;
  const params: any[] = [];
  
  if (type) {
    query += ` WHERE context_type = ?`;
    params.push(type);
  }
  
  query += ` ORDER BY importance DESC, created_at DESC LIMIT ?`;
  params.push(limit);
  
  const stmt = db.prepare(query);
  return stmt.all(...params);
}

// 대화 패턴 학습
export function learnConversationPattern(userPattern: string, preferredResponse: string) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO conversation_patterns(user_pattern, preferred_response) VALUES (?, ?)`
  );
  stmt.run(userPattern, preferredResponse);
  
  // 빈도 업데이트
  const updateStmt = db.prepare(
    `UPDATE conversation_patterns SET frequency = frequency + 1 WHERE user_pattern = ? AND preferred_response = ?`
  );
  updateStmt.run(userPattern, preferredResponse);
}

// 대화 패턴 조회
export function getConversationPatterns(userPattern: string) {
  const stmt = db.prepare(
    `SELECT preferred_response, frequency FROM conversation_patterns 
     WHERE user_pattern LIKE ? ORDER BY frequency DESC LIMIT 5`
  );
  return stmt.all(`%${userPattern}%`);
}

// 최근 대화 기록 조회
export function getRecentInteractions(limit: number = 5) {
  const stmt = db.prepare(
    `SELECT user_text, model_text FROM interactions 
     ORDER BY created_at DESC LIMIT ?`
  );
  return stmt.all(limit);
}

// ==================== 백업 기능 ====================

// 데이터베이스 백업
export function backupDatabase(backupPath?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultBackupPath = `./data/backups/assistant_backup_${timestamp}.sqlite`;
  const finalBackupPath = backupPath || defaultBackupPath;
  
  // 백업 디렉토리 생성
  const backupDir = path.dirname(finalBackupPath);
  fs.mkdirSync(backupDir, { recursive: true });
  
  // 데이터베이스 파일 복사
  fs.copyFileSync(DB_PATH, finalBackupPath);
  
  console.log(`데이터베이스 백업 완료: ${finalBackupPath}`);
  return finalBackupPath;
}

// 백업에서 복원
export function restoreDatabase(backupPath: string): boolean {
  try {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`백업 파일을 찾을 수 없습니다: ${backupPath}`);
    }
    
    // 현재 데이터베이스 백업
    const currentBackup = backupDatabase();
    
    // 백업 파일로 복원
    fs.copyFileSync(backupPath, DB_PATH);
    
    // 데이터베이스 재연결
    if (db) {
      db.close();
    }
    initDb();
    
    console.log(`데이터베이스 복원 완료: ${backupPath}`);
    console.log(`현재 데이터베이스는 ${currentBackup}에 백업되었습니다.`);
    return true;
  } catch (error) {
    console.error('데이터베이스 복원 실패:', error);
    return false;
  }
}

// 백업 목록 조회
export function getBackupList(): string[] {
  const backupDir = './data/backups';
  if (!fs.existsSync(backupDir)) {
    return [];
  }
  
  return fs.readdirSync(backupDir)
    .filter(file => file.endsWith('.sqlite'))
    .map(file => path.join(backupDir, file))
    .sort((a, b) => {
      const statA = fs.statSync(a);
      const statB = fs.statSync(b);
      return statB.mtime.getTime() - statA.mtime.getTime();
    });
}

// ==================== 기억 관리 기능 ====================

// 오래된 대화 기록 삭제 (30일 이상)
export function cleanupOldInteractions(daysToKeep: number = 30): number {
  // SQL 인젝션 방지: 파라미터 바인딩 사용
  const stmt = db.prepare(
    `DELETE FROM interactions 
     WHERE created_at < datetime('now', 'localtime', ?)`
  );
  const result = stmt.run(`-${daysToKeep} days`);
  console.log(`${result.changes}개의 오래된 대화 기록이 삭제되었습니다.`);
  return result.changes;
}

// 중요도가 낮은 학습 컨텍스트 삭제
export function cleanupLowImportanceContext(importanceThreshold: number = 1): number {
  // SQL 인젝션 방지: 파라미터 바인딩 사용
  const stmt = db.prepare(
    `DELETE FROM learning_context 
     WHERE importance < ? AND created_at < datetime('now', 'localtime', '-7 days')`
  );
  const result = stmt.run(importanceThreshold);
  console.log(`${result.changes}개의 낮은 중요도 컨텍스트가 삭제되었습니다.`);
  return result.changes;
}

// 중복된 대화 패턴 정리 (최적화된 버전)
export function cleanupDuplicatePatterns(): number {
  // ROW_NUMBER() 사용하여 한 번의 쿼리로 중복 삭제
  // 각 user_pattern, preferred_response 조합 중 frequency가 높고 최신인 것만 남김
  const stmt = db.prepare(`
    DELETE FROM conversation_patterns 
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY user_pattern, preferred_response 
                 ORDER BY frequency DESC, created_at DESC
               ) as rn
        FROM conversation_patterns
      )
      WHERE rn > 1
    )
  `);
  
  const result = stmt.run();
  console.log(`${result.changes}개의 중복 패턴이 정리되었습니다.`);
  return result.changes;
}

// 데이터베이스 통계 조회
export function getDatabaseStats() {
  const stats = {
    interactions: db.prepare('SELECT COUNT(*) as count FROM interactions').get() as { count: number },
    preferences: db.prepare('SELECT COUNT(*) as count FROM user_preferences').get() as { count: number },
    learningContext: db.prepare('SELECT COUNT(*) as count FROM learning_context').get() as { count: number },
    patterns: db.prepare('SELECT COUNT(*) as count FROM conversation_patterns').get() as { count: number },
    databaseSize: fs.statSync(DB_PATH).size
  };
  
  return {
    ...stats,
    databaseSizeMB: (stats.databaseSize / 1024 / 1024).toFixed(2)
  };
}

// 자동 정리 (모든 정리 작업을 한 번에)
export function autoCleanup(): { interactions: number, context: number, patterns: number } {
  console.log('자동 정리 시작...');
  
  const interactions = cleanupOldInteractions(30);
  const context = cleanupLowImportanceContext(1);
  const patterns = cleanupDuplicatePatterns();
  
  console.log('자동 정리 완료');
  return { interactions, context, patterns };
}

// ==================== 피드백 시스템 ====================

// 피드백 저장
export function saveFeedback(
  interactionId: number, 
  feedbackType: 'thumbs_up' | 'thumbs_down' | 'correction',
  feedbackTags: string[] = [],
  correctedText?: string,
  userRating?: number
) {
  const stmt = db.prepare(`
    INSERT INTO feedback_logs(interaction_id, feedback_type, feedback_tags, corrected_text, user_rating)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(interactionId, feedbackType, JSON.stringify(feedbackTags), correctedText, userRating);
}

// 정책 점수 업데이트
export function updatePolicyScore(toolName: string, intent: string, success: boolean) {
  const score = success ? 1 : -1;
  
  // 기존 점수 조회
  const existing = db.prepare(
    `SELECT * FROM tool_policy_scores WHERE tool_name = ? AND intent = ?`
  ).get(toolName, intent) as any;
  
  if (existing) {
    // 기존 점수 업데이트
    const newScore = existing.score + score;
    const newSuccessCount = success ? existing.success_count + 1 : existing.success_count;
    const newFailureCount = !success ? existing.failure_count + 1 : existing.failure_count;
    
    const updateStmt = db.prepare(`
      UPDATE tool_policy_scores 
      SET score = ?, success_count = ?, failure_count = ?, last_updated = datetime('now', 'localtime')
      WHERE tool_name = ? AND intent = ?
    `);
    updateStmt.run(newScore, newSuccessCount, newFailureCount, toolName, intent);
  } else {
    // 새로운 점수 생성
    const insertStmt = db.prepare(`
      INSERT INTO tool_policy_scores(tool_name, intent, score, success_count, failure_count)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertStmt.run(toolName, intent, score, success ? 1 : 0, !success ? 1 : 0);
  }
}

// 정책 점수 조회
export function getPolicyScores(intent?: string) {
  let query = `SELECT * FROM tool_policy_scores`;
  const params: any[] = [];
  
  if (intent) {
    query += ` WHERE intent = ?`;
    params.push(intent);
  }
  
  query += ` ORDER BY score DESC`;
  
  const stmt = db.prepare(query);
  return stmt.all(...params);
}

// 지식 카드 저장
export function saveKnowledgeCard(question: string, answer: string, context: string, tags: string[] = []) {
  const stmt = db.prepare(`
    INSERT INTO knowledge_cards(question, answer, context, tags)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(question, answer, context, JSON.stringify(tags));
}

// 지식 카드 검색
export function searchKnowledgeCards(query: string, limit: number = 5) {
  const stmt = db.prepare(`
    SELECT * FROM knowledge_cards 
    WHERE question LIKE ? OR answer LIKE ? OR context LIKE ?
    ORDER BY usage_count DESC, created_at DESC
    LIMIT ?
  `);
  return stmt.all(`%${query}%`, `%${query}%`, `%${query}%`, limit);
}

// 지식 카드 사용 횟수 증가
export function incrementKnowledgeCardUsage(cardId: number) {
  const stmt = db.prepare(`
    UPDATE knowledge_cards 
    SET usage_count = usage_count + 1 
    WHERE id = ?
  `);
  stmt.run(cardId);
}

// 피드백 통계
export function getFeedbackStats() {
  const stats = {
    totalFeedback: db.prepare('SELECT COUNT(*) as count FROM feedback_logs').get() as { count: number },
    thumbsUp: db.prepare('SELECT COUNT(*) as count FROM feedback_logs WHERE feedback_type = "thumbs_up"').get() as { count: number },
    thumbsDown: db.prepare('SELECT COUNT(*) as count FROM feedback_logs WHERE feedback_type = "thumbs_down"').get() as { count: number },
    corrections: db.prepare('SELECT COUNT(*) as count FROM feedback_logs WHERE feedback_type = "correction"').get() as { count: number },
    averageRating: db.prepare('SELECT AVG(user_rating) as avg FROM feedback_logs WHERE user_rating IS NOT NULL').get() as { avg: number }
  };
  
  return stats;
}

// ==================== 열림 상태 추적 ====================

// 경로 정규화 헬퍼 함수
function normalizePath(pathStr: string): string {
  // Windows/Linux 경로 차이 및 대소문자 문제 해결
  return path.normalize(pathStr).toLowerCase().replace(/\\/g, '/');
}

export function markOpened(pathStr: string, kind: 'file' | 'folder') {
  // 경로 정규화: 대소문자 통일, 슬래시 정규화
  const normalized = normalizePath(pathStr);
  
  const upsert = db.prepare(`
    INSERT INTO opened_items(path, kind, open_count)
    VALUES (?, ?, 1)
    ON CONFLICT(path) DO UPDATE SET 
      open_count = open_count + 1,
      last_opened = datetime('now', 'localtime')
  `);
  upsert.run(normalized, kind);
}

export function isRecentlyOpened(pathStr: string, withinMinutes: number = 5): boolean {
  // 경로 정규화: 대소문자 통일, 슬래시 정규화
  const normalized = normalizePath(pathStr);
  
  const row = db.prepare(
    `SELECT last_opened FROM opened_items WHERE path = ?`
  ).get(normalized) as { last_opened?: string } | undefined;
  if (!row?.last_opened) return false;
  const last = new Date(row.last_opened).getTime();
  const now = Date.now();
  return (now - last) <= withinMinutes * 60 * 1000;
}