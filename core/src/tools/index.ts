import { z } from "zod";
import fs from "fs/promises";
import path from "path";

const ALLOW_DIR = (process.env.ALLOW_DIR || "").replace(/\\/g,"/");

function inAllow(p: string) {
  const norm = path.resolve(p).replace(/\\/g,"/");
  return ALLOW_DIR && norm.startsWith(path.resolve(ALLOW_DIR).replace(/\\/g,"/"));
}

export const tools = {
  search_files: {
    schema: z.object({ query: z.string(), dir: z.string().default(ALLOW_DIR) }),
    async execute({ query, dir }: { query: string; dir: string }) {
      if (!inAllow(dir)) throw new Error("forbidden dir");
      const entries = await fs.readdir(dir);
      return entries
        .filter(n => n.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 50)
        .map(n => path.join(dir, n));
    }
  },
  read_file: {
    schema: z.object({ path: z.string() }),
    async execute({ path: p }: { path: string }) {
      if (!inAllow(p)) throw new Error("forbidden path");
      return await fs.readFile(p, "utf-8");
    }
  }
} as const;