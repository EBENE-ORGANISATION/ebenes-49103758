// ============================================================================
// ocr-facture — Extraction structurée de factures via Google Gemini
// ----------------------------------------------------------------------------
// Remplace l'ancien gateway IA Lovable. Appelle directement l'API Google
// Generative Language (Gemini, vision + sortie JSON structurée) pour extraire
// les champs. Contrat inchangé : { imageBase64, mimeType } → { data: {...} }.
// Secret requis : GEMINI_API_KEY (clé Google AI Studio, facturation activée
// pour la confidentialité des données — Google n'entraîne alors pas dessus).
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

// Modèle Gemini. Flash = rapide et très bon marché, excellent pour l'extraction.
const GEMINI_MODEL = "gemini-2.5-flash";

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

    // ── Clé API Gemini ────────────────────────────────────────────────────
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return json({ error: "GEMINI_API_KEY non configurée" }, 500);
    }

    // ── Entrée ────────────────────────────────────────────────────────────
    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return json({ error: "imageBase64 manquant" }, 400);
    }

    // Normaliser : base64 brut + type MIME (gère les data URL)
    let rawBase64 = imageBase64;
    let mediaType = mimeType || "image/jpeg";
    const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,(.*)$/s);
    if (dataUrlMatch) {
      mediaType = dataUrlMatch[1];
      rawBase64 = dataUrlMatch[2];
    }
    if (mediaType !== "application/pdf" && !SUPPORTED_IMAGE_TYPES.includes(mediaType)) {
      mediaType = "image/jpeg";
    }

    // ── Appel API Gemini (vision + sortie JSON structurée) ────────────────
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text:
              "Tu es un expert en extraction de données de factures. Si une valeur n'est pas lisible, mets null. Les montants sont en FCFA : renvoie des nombres uniquement (sans séparateur de milliers ni symbole). La date doit être au format ISO YYYY-MM-DD.",
          }],
        },
        contents: [{
          role: "user",
          parts: [
            { inline_data: { mime_type: mediaType, data: rawBase64 } },
            { text: "Extrais les informations de cette facture." },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              fournisseur: { type: "STRING", nullable: true },
              date: { type: "STRING", nullable: true },
              montantHT: { type: "NUMBER", nullable: true },
              tva: { type: "NUMBER", nullable: true },
              montantTTC: { type: "NUMBER", nullable: true },
            },
            required: ["fournisseur", "date", "montantHT", "tva", "montantTTC"],
          },
        },
      }),
    });

    if (!resp.ok) {
      const status = resp.status;
      const body = await resp.text();
      console.error("Gemini API error", status, body.slice(0, 500));
      if (status === 429) {
        return json({ error: "Trop de requêtes, réessayez dans un instant." }, 429);
      }
      if (status === 400 && /API key|API_KEY_INVALID/i.test(body)) {
        return json({ error: "Clé API Gemini invalide." }, 500);
      }
      if (status === 403) {
        return json({ error: "Accès Gemini refusé (vérifiez la clé / la facturation)." }, 500);
      }
      return json({ error: "Erreur du service d'extraction IA." }, 500);
    }

    const ai = await resp.json();
    // Gemini renvoie le JSON dans candidates[0].content.parts[0].text
    const textPart = ai?.candidates?.[0]?.content?.parts?.[0]?.text;
    let parsed: OCRResult | null = null;
    if (textPart) {
      try {
        parsed = JSON.parse(textPart);
      } catch (e) {
        console.error("Parse Gemini JSON failed", e, String(textPart).slice(0, 200));
      }
    }

    return json({ data: parsed });
  } catch (e) {
    console.error("ocr-facture error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
