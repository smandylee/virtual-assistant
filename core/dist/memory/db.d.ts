export declare function initDb(): void;
export declare function logInteraction(user_text: string, model_text: string): number;
export declare function saveUserPreference(key: string, value: string): void;
export declare function getUserPreference(key: string): string | null;
export declare function saveLearningContext(type: string, data: string, importance?: number): void;
export declare function getLearningContext(type?: string, limit?: number): any;
export declare function learnConversationPattern(userPattern: string, preferredResponse: string): void;
export declare function getConversationPatterns(userPattern: string): any;
export declare function getRecentInteractions(limit?: number): any;
export declare function backupDatabase(backupPath?: string): string;
export declare function restoreDatabase(backupPath: string): boolean;
export declare function getBackupList(): string[];
export declare function cleanupOldInteractions(daysToKeep?: number): number;
export declare function cleanupLowImportanceContext(importanceThreshold?: number): number;
export declare function cleanupDuplicatePatterns(): number;
export declare function getDatabaseStats(): {
    databaseSizeMB: string;
    interactions: {
        count: number;
    };
    preferences: {
        count: number;
    };
    learningContext: {
        count: number;
    };
    patterns: {
        count: number;
    };
    databaseSize: number;
};
export declare function autoCleanup(): {
    interactions: number;
    context: number;
    patterns: number;
};
export declare function saveFeedback(interactionId: number, feedbackType: 'thumbs_up' | 'thumbs_down' | 'correction', feedbackTags?: string[], correctedText?: string, userRating?: number): void;
export declare function updatePolicyScore(toolName: string, intent: string, success: boolean): void;
export declare function getPolicyScores(intent?: string): any;
export declare function saveKnowledgeCard(question: string, answer: string, context: string, tags?: string[]): void;
export declare function searchKnowledgeCards(query: string, limit?: number): any;
export declare function incrementKnowledgeCardUsage(cardId: number): void;
export declare function getFeedbackStats(): {
    totalFeedback: {
        count: number;
    };
    thumbsUp: {
        count: number;
    };
    thumbsDown: {
        count: number;
    };
    corrections: {
        count: number;
    };
    averageRating: {
        avg: number;
    };
};
export declare function markOpened(pathStr: string, kind: 'file' | 'folder'): void;
export declare function isRecentlyOpened(pathStr: string, withinMinutes?: number): boolean;
