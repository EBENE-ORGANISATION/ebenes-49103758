import { defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";

export default defineMcp({
  name: "ebene-services-mcp",
  title: "EBENE SERVICES MCP",
  version: "0.1.0",
  instructions:
    "Outils MCP pour l'application EBENE SERVICES. Utilisez `echo` pour vérifier la connectivité.",
  tools: [echoTool],
});