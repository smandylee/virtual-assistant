import { z } from "zod";
export declare const tools: {
    readonly search_files: {
        readonly schema: z.ZodObject<{
            query: z.ZodString;
            dir: z.ZodDefault<z.ZodString>;
            maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        }, z.core.$strip>;
        readonly execute: ({ query, dir, maxResults, recursive }: {
            query: string;
            dir: string;
            maxResults?: number;
            recursive?: boolean;
        }) => Promise<string[]>;
    };
    readonly read_file: {
        readonly schema: z.ZodObject<{
            path: z.ZodString;
        }, z.core.$strip>;
        readonly execute: ({ path: p }: {
            path: string;
        }) => Promise<string>;
    };
    readonly execute_command: {
        readonly schema: z.ZodObject<{
            command: z.ZodString;
            timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        }, z.core.$strip>;
        readonly execute: ({ command, timeout }: {
            command: string;
            timeout: number;
        }) => Promise<{
            command: string;
            success: boolean;
            output: string;
            error: string;
            exitCode: number;
            timestamp: string;
        }>;
    };
    readonly list_commands: {
        readonly schema: z.ZodObject<{}, z.core.$strip>;
        readonly execute: () => Promise<{
            allowed: string[];
            dangerous: string[];
            total: number;
        }>;
    };
    readonly system_info: {
        readonly schema: z.ZodObject<{}, z.core.$strip>;
        readonly execute: () => Promise<any[]>;
    };
    readonly search_documents: {
        readonly schema: z.ZodObject<{
            query: z.ZodString;
            limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        }, z.core.$strip>;
        readonly execute: ({ query, limit }: {
            query: string;
            limit: number;
        }) => Promise<any[]>;
    };
    readonly update_policy_score: {
        readonly schema: z.ZodObject<{
            tool: z.ZodString;
            intent: z.ZodString;
            success: z.ZodBoolean;
        }, z.core.$strip>;
        readonly execute: ({ tool, intent, success }: {
            tool: string;
            intent: string;
            success: boolean;
        }) => Promise<{
            tool: string;
            intent: string;
            score: number;
            timestamp: string;
        }>;
    };
    readonly open_folder: {
        readonly schema: z.ZodObject<{
            path: z.ZodString;
        }, z.core.$strip>;
        readonly execute: ({ path: folderPath }: {
            path: string;
        }) => Promise<{
            folder: string;
            success: any;
            message: string;
            error: any;
        }>;
    };
    readonly open_file: {
        readonly schema: z.ZodObject<{
            path: z.ZodString;
        }, z.core.$strip>;
        readonly execute: ({ path: filePath }: {
            path: string;
        }) => Promise<{
            file: string;
            success: any;
            message: string;
            error: any;
        }>;
    };
    readonly open_with: {
        readonly schema: z.ZodObject<{
            filePath: z.ZodString;
            program: z.ZodString;
        }, z.core.$strip>;
        readonly execute: ({ filePath, program }: {
            filePath: string;
            program: string;
        }) => Promise<{
            file: string;
            program: string;
            success: boolean;
            message: string;
            error: string;
        }>;
    };
    readonly web_search: {
        readonly schema: z.ZodObject<{
            query: z.ZodString;
            maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        }, z.core.$strip>;
        readonly execute: ({ query, maxResults }: {
            query: string;
            maxResults: number;
        }) => Promise<{
            query: string;
            results: any[];
            total: number;
            source: string;
            success: boolean;
            error?: undefined;
        } | {
            query: string;
            results: any[];
            total: number;
            error: any;
            source: string;
            success: boolean;
        }>;
    };
    readonly news_search: {
        readonly schema: z.ZodObject<{
            query: z.ZodString;
            maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        }, z.core.$strip>;
        readonly execute: ({ query, maxResults }: {
            query: string;
            maxResults: number;
        }) => Promise<{
            query: string;
            results: any[];
            total: number;
            source: string;
            success: boolean;
            error?: undefined;
        } | {
            query: string;
            results: any[];
            total: number;
            error: any;
            source: string;
            success: boolean;
        }>;
    };
    readonly add_schedule: {
        readonly schema: z.ZodObject<{
            title: z.ZodString;
            date: z.ZodString;
            time: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly execute: ({ title, date, time, description }: {
            title: string;
            date: string;
            time: string;
            description?: string;
        }) => Promise<{
            success: boolean;
            schedule: {
                id: string;
                title: string;
                date: string;
                time: string;
                description: string;
                createdAt: string;
            };
            message: string;
            error?: undefined;
        } | {
            success: boolean;
            error: string;
            schedule?: undefined;
            message?: undefined;
        }>;
    };
    readonly get_schedules: {
        readonly schema: z.ZodObject<{
            date: z.ZodOptional<z.ZodString>;
            upcoming: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        }, z.core.$strip>;
        readonly execute: ({ date, upcoming }: {
            date?: string;
            upcoming?: boolean;
        }) => Promise<{
            schedules: any[];
            total: number;
            message: string;
            error?: undefined;
        } | {
            schedules: any[];
            total: number;
            error: string;
            message?: undefined;
        }>;
    };
    readonly delete_schedule: {
        readonly schema: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
        readonly execute: ({ id }: {
            id: string;
        }) => Promise<{
            success: boolean;
            error: string;
            message?: undefined;
        } | {
            success: boolean;
            message: string;
            error?: undefined;
        }>;
    };
    readonly check_reminders: {
        readonly schema: z.ZodObject<{}, z.core.$strip>;
        readonly execute: () => Promise<{
            reminders: any[];
            expired: any[];
            message: string;
            error?: undefined;
        } | {
            reminders: any[];
            expired: number;
            message: string;
            error?: undefined;
        } | {
            reminders: any[];
            expired: number;
            error: string;
            message?: undefined;
        }>;
    };
    readonly cleanup_expired_schedules: {
        readonly schema: z.ZodObject<{}, z.core.$strip>;
        readonly execute: () => Promise<{
            success: boolean;
            deleted: number;
            message: string;
            error?: undefined;
        } | {
            success: boolean;
            error: string;
            deleted?: undefined;
            message?: undefined;
        }>;
    };
    readonly launch_steam_game: {
        readonly schema: z.ZodObject<{
            gameId: z.ZodOptional<z.ZodString>;
            gameName: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly execute: ({ gameId, gameName }: {
            gameId?: string;
            gameName?: string;
        }) => Promise<{
            success: boolean;
            gameId: string;
            message: string;
            error: string;
            gameName?: undefined;
            note?: undefined;
        } | {
            success: boolean;
            gameId: string;
            gameName: string;
            message: string;
            error: string;
            note?: undefined;
        } | {
            success: boolean;
            gameName: string;
            message: string;
            note: string;
            gameId?: undefined;
            error?: undefined;
        } | {
            success: boolean;
            gameName: string;
            message: string;
            error: string;
            gameId?: undefined;
            note?: undefined;
        } | {
            success: boolean;
            error: string;
            gameId?: undefined;
            message?: undefined;
            gameName?: undefined;
            note?: undefined;
        }>;
    };
    readonly youtube_search: {
        readonly schema: z.ZodObject<{
            query: z.ZodString;
            maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        }, z.core.$strip>;
        readonly execute: ({ query, maxResults }: {
            query: string;
            maxResults: number;
        }) => Promise<{
            success: boolean;
            error: string;
            query?: undefined;
            results?: undefined;
            total?: undefined;
            message?: undefined;
        } | {
            success: boolean;
            query: string;
            results: any;
            total: any;
            message: string;
            error?: undefined;
        } | {
            success: boolean;
            query: string;
            results: any[];
            error: any;
            total?: undefined;
            message?: undefined;
        }>;
    };
    readonly youtube_play: {
        readonly schema: z.ZodObject<{
            query: z.ZodOptional<z.ZodString>;
            videoId: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly execute: ({ query, videoId, url }: {
            query?: string;
            videoId?: string;
            url?: string;
        }) => Promise<{
            success: boolean;
            url: string;
            title: string;
            message: string;
            error: string;
        } | {
            success: boolean;
            error: any;
            url?: undefined;
            title?: undefined;
            message?: undefined;
        }>;
    };
    readonly youtube_trending: {
        readonly schema: z.ZodObject<{
            regionCode: z.ZodDefault<z.ZodOptional<z.ZodString>>;
            maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            category: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly execute: ({ regionCode, maxResults, category }: {
            regionCode: string;
            maxResults: number;
            category?: string;
        }) => Promise<{
            success: boolean;
            region: string;
            category: string;
            results: any;
            total: any;
            message: string;
            error?: undefined;
        } | {
            success: boolean;
            error: any;
            region?: undefined;
            category?: undefined;
            results?: undefined;
            total?: undefined;
            message?: undefined;
        }>;
    };
    readonly youtube_channel_videos: {
        readonly schema: z.ZodObject<{
            channelName: z.ZodOptional<z.ZodString>;
            channelId: z.ZodOptional<z.ZodString>;
            maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        }, z.core.$strip>;
        readonly execute: ({ channelName, channelId, maxResults }: {
            channelName?: string;
            channelId?: string;
            maxResults: number;
        }) => Promise<{
            success: boolean;
            channelName: string;
            error: string;
            channel?: undefined;
            videos?: undefined;
            total?: undefined;
            message?: undefined;
        } | {
            success: boolean;
            channel: {
                id: string;
                name: any;
                thumbnail: any;
            };
            videos: any;
            total: any;
            message: string;
            channelName?: undefined;
            error?: undefined;
        } | {
            success: boolean;
            error: any;
            channelName?: undefined;
            channel?: undefined;
            videos?: undefined;
            total?: undefined;
            message?: undefined;
        }>;
    };
    readonly youtube_video_info: {
        readonly schema: z.ZodObject<{
            videoId: z.ZodString;
        }, z.core.$strip>;
        readonly execute: ({ videoId }: {
            videoId: string;
        }) => Promise<{
            success: boolean;
            video: {
                videoId: any;
                title: any;
                channel: any;
                channelId: any;
                description: any;
                publishedAt: any;
                duration: string;
                views: string;
                likes: string;
                comments: string;
                thumbnail: any;
                url: string;
                tags: any;
            };
            error?: undefined;
        } | {
            success: boolean;
            error: any;
            video?: undefined;
        }>;
    };
    readonly launch_program: {
        readonly schema: z.ZodObject<{
            programName: z.ZodString;
        }, z.core.$strip>;
        readonly execute: ({ programName }: {
            programName: string;
        }) => Promise<{
            success: boolean;
            programName: string;
            path?: string;
            message: string;
        } | {
            success: boolean;
            programName: string;
            path: string;
            message: string;
            error: any;
            details: {
                originalError: any;
                fallbackError: any;
            };
            note?: undefined;
        } | {
            success: boolean;
            programName: string;
            message: string;
            note: string;
            path?: undefined;
            error?: undefined;
            details?: undefined;
        } | {
            success: boolean;
            error: string;
            programName?: undefined;
            path?: undefined;
            message?: undefined;
            details?: undefined;
            note?: undefined;
        }>;
    };
};
