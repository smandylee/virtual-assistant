"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeTools = void 0;
const express_1 = __importDefault(require("express"));
const tools_1 = require("../tools");
exports.routeTools = express_1.default.Router();
exports.routeTools.post("/:name", async (req, res) => {
    const name = req.params.name;
    const t = tools_1.tools[name];
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