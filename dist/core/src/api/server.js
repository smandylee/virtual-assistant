import "dotenv/config";
import express from "express";
import cors from "cors";
import { initDb, logInteraction } from "../memory/db";
import { chatWithOllama } from "../agent/ollama";
import { routeTools } from "./tools-route";
const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
initDb();
// 간단 헬스체크
app.get("/health", (_req, res) => res.json({ ok: true }));
app.post("/chat", async (req, res) => {
    const { message } = req.body ?? {};
    if (!message)
        return res.status(400).json({ error: "message required" });
    try {
        const system = "You are a helpful desktop assistant. Keep answers concise (3-5 lines).";
        const reply = await chatWithOllama(system, message);
        const id = logInteraction(message, reply);
        res.json({ reply, interactionId: id });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.use("/tools", routeTools);
const port = Number(process.env.PORT || 3030);
app.listen(port, () => console.log("API listening on", port));
//# sourceMappingURL=server.js.map