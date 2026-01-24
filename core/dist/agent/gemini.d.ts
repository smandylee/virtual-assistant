export declare function chatWithGemini(system: string, user: string): Promise<string>;
export declare function parseScheduleFromText(text: string): Promise<{
    title: string;
    date: string;
    time: string;
    description?: string;
} | null>;
export declare function summarizeSearchResults(query: string, results: any[]): Promise<string>;
export declare function fuzzyMatchFile(query: string, fileList: string[]): Promise<string | null>;
export declare function analyzeEmotionForTTS(text: string): Promise<{
    emotion: 'happy' | 'sad' | 'excited' | 'calm' | 'surprised' | 'neutral';
    intensity: number;
}>;
export declare function detectIntent(text: string): Promise<{
    intent: 'chat' | 'schedule' | 'search' | 'file' | 'program' | 'game' | 'command';
    confidence: number;
    extracted?: any;
}>;
