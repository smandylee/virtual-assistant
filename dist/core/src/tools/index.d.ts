import { z } from "zod";
export declare const tools: {
    readonly search_files: {
        readonly schema: z.ZodObject<{
            query: z.ZodString;
            dir: z.ZodDefault<z.ZodString>;
        }, z.core.$strip>;
        readonly execute: ({ query, dir }: {
            query: string;
            dir: string;
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
};
