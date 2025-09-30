import fetch from "node-fetch";
const OLLAMA = process.env.OLLAMA_BASEURL || "http://127.0.0.1:11434";
const MODEL = process.env.LLM_MODEL || "llama3.1:8b";
export async function chatWithOllama(system, user) {
    const r = await fetch(`${OLLAMA}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user }
            ],
            stream: false
        })
    });
    if (!r.ok)
        throw new Error(`ollama ${r.status}`);
    const j = await r.json();
    // @ts-ignore
    return j?.message?.content ?? "(no content)";
}
//# sourceMappingURL=ollama.js.map