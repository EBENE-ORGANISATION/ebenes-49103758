import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "echo",
  title: "Echo",
  description: "Renvoie le texte fourni tel quel. Utile pour vérifier la connectivité au serveur MCP.",
  inputSchema: { text: z.string().min(1).describe("Texte à renvoyer.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ text }) => ({ content: [{ type: "text", text }] }),
});