import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import listMySocietesTool from "./tools/list-my-societes";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "ebene-services-mcp",
  title: "EBENE SERVICES MCP",
  version: "0.1.0",
  instructions:
    "Outils MCP pour l'application EBENE SERVICES. Utilisez `echo` pour tester la connectivité et `list_my_societes` pour lister les sociétés de l'utilisateur connecté.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, listMySocietesTool],
});