// ============================================================================
// ocr-facture — Extraction structurée de factures via l'API Anthropic (Claude)
// ----------------------------------------------------------------------------
// Remplace l'ancien appel au gateway IA Lovable. Appelle directement
// l'API Messages d'Anthropic (vision + tool use) pour extraire les champs.
// Contrat inchangé : entrée { imageBase64, mimeType } → sortie { data: {...} }.
// Secret requis : ANTHROPIC_API_KEY.
// ============================================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface OCRResult {
  fournisseur: string | null;
  date: string | null;
  montantHT: number | null;
  tva: number | null;
  montantTTC: number | null;
}

// Modèle Claude. Opus 4.8 par défaut (le plus capable). Pour réduire les coûts
// d'OCR, on peut basculer sur "claude-haiku-4-5" ou "claude-sonnet-4-6".
const ANTHROPIC_MODEL = "claude-opus-4-8";

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Authentification utilisateur ──────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid session" }, 401);
    }

    // ── Clé API Anthropic ─────────────────────────────────────────────────
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return json({ error: "ANTHROPIC_API_KEY non configurée" }, 500);
    }

    // ── Entrée ────────────────────────────────────────────────────────────
    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return json({ error: "imageBase64 manquant" }, 400);
    }

    // Normaliser : extraire le base64 brut + le type MIME (gère les data URL)
    let rawBase64 = imageBase64;
    let mediaType = mimeType || "image/jpeg";
    const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,(.*)$/s);
    if (dataUrlMatch) {
      mediaType = dataUrlMatch[1];
      rawBase64 = dataUrlMatch[2];
    }

    // Bloc de contenu : image OU document PDF
    let mediaBlock: Record<string, unknown>;
    if (mediaType === "application/pdf") {
      mediaBlock = {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: rawBase64 },
      };
    } else {
      if (!SUPPORTED_IMAGE_TYPES.includes(mediaType)) mediaType = "image/jpeg";
      mediaBlock = {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: rawBase64 },
      };
    }

    // ── Appel API Anthropic (vision + tool use forcé) ─────────────────────
    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system:
          "Tu es un expert en extraction de données de factures. Utilise UNIQUEMENT l'outil extract_facture pour répondre. Si une valeur n'est pas lisible, mets null. Les montants sont en FCFA : renvoie des nombres uniquement, sans séparateur de milliers ni symbole. La date doit être au format ISO YYYY-MM-DD.",
        tools: [
          {
            name: "extract_facture",
            description: "Retourne les informations structurées d'une facture.",
            strict: true,
            input_schema: {
              type: "object",
              properties: {
                fournisseur: { type: ["string", "null"], description: "Nom du fournisseur/émetteur" },
                date: { type: ["string", "null"], description: "Date de la facture, ISO YYYY-MM-DD" },
                montantHT: { type: ["number", "null"], description: "Montant hors taxes en FCFA" },
                tva: { type: ["number", "null"], description: "Montant de la TVA en FCFA" },
                montantTTC: { type: ["number", "null"], description: "Montant toutes taxes comprises en FCFA" },
              },
              required: ["fournisseur", "date", "montantHT", "tva", "montantTTC"],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: { type: "tool", name: "extract_facture" },
        messages: [
          {
            role: "user",
            content: [
              mediaBlock,
              { type: "text", text: "Extrais les informations de cette facture." },
            ],
          },
        ],
      }),
    });

    if (!anthropicResp.ok) {
      const status = anthropicResp.status;
      const body = await anthropicResp.text();
      console.error("Anthropic API error", status, body.slice(0, 500));
      if (status === 429) {
        return json({ error: "Trop de requêtes, réessayez dans un instant." }, 429);
      }
      if (status === 401) {
        return json({ error: "Clé API Anthropic invalide." }, 500);
      }
      if (status === 400 && body.includes("credit")) {
        return json({ error: "Crédits IA épuisés. Rechargez votre compte Anthropic." }, 402);
      }
      return json({ error: "Erreur du service d'extraction IA." }, 500);
    }

    const ai = await anthropicResp.json();
    // Trouver le bloc tool_use produit par le modèle
    const toolUse = Array.isArray(ai?.content)
      ? ai.content.find((b: { type?: string; name?: string }) => b.type === "tool_use" && b.name === "extract_facture")
      : null;
    const parsed: OCRResult | null = toolUse?.input ?? null;

    return json({ data: parsed });
  } catch (e) {
    console.error("ocr-facture error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
