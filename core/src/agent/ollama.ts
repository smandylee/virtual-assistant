import fetch from "node-fetch";

const OLLAMA = process.env.OLLAMA_BASEURL || "http://127.0.0.1:11434";
const MODEL = process.env.LLM_MODEL || "llama3.1:8b";

export async function chatWithOllama(system: string, user: string) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1000
      }
    })
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  const j = await r.json();
  console.log("Ollama response:", j);
  // @ts-ignore
  return j?.message?.content ?? j?.response ?? "(no content)";
}