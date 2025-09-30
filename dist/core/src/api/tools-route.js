import express from "express";
import { tools } from "../tools";
export const routeTools = express.Router();
routeTools.post("/:name", async (req, res) => {
    const name = req.params.name;
    const t = tools[name];
    if (!t)
        return res.status(404).json({ error: "unknown tool" });
    try {
        // @ts-ignore
        const args = t.schema.parse(req.body || {});
        const out = await t.execute(args);
        res.json({ ok: true, out });
    }
    catch (e) {
        res.status(400).json({ ok: false, error: e.message });
    }
});
//# sourceMappingURL=tools-route.js.map