/**
 * AndroidUpdateChecker
 * --------------------
 * Vérifie si une nouvelle version est disponible sur GitHub Releases
 * et affiche une bannière de téléchargement sur Android uniquement.
 *
 * - Vérifie au démarrage (après 5s) et toutes les 6h.
 * - Compare la version GitHub avec la version embarquée dans package.json.
 * - Le bouton ouvre l'APK signé dans le navigateur externe → le gestionnaire
 *   de téléchargement Android récupère le fichier puis propose l'installation.
 * - Entièrement silencieux en cas d'erreur réseau.
 */
import { useEffect, useState, useCallback } from "react";
import { isAndroid } from "@/lib/platform";
import APP_VERSION from "@/lib/appVersion";

const GITHUB_OWNER = "EBENE-ORGANISATION";
const GITHUB_REPO  = "ebenes-49103758";
const API_URL      = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 heures

interface ReleaseInfo {
  version: string;
  apkUrl:  string;
}

function semverGt(a: string, b: string): boolean {
  const parse = (s: string) =>
    s.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const [aM, am, ap] = parse(a);
  const [bM, bm, bp] = parse(b);
  if (aM !== bM) return aM > bM;
  if (am !== bm) return am > bm;
  return ap > bp;
}

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      tag_name?: string;
      assets?: Array<{ name: string; browser_download_url: string }>;
    };
    const version = data.tag_name?.replace(/^v/, "") ?? "";
    const apkAsset = data.assets?.find(
      (a) => a.name.toLowerCase().endsWith(".apk")
    );
    if (!version || !apkAsset) return null;
    return { version, apkUrl: apkAsset.browser_download_url };
  } catch {
    return null;
  }
}

export function AndroidUpdateChecker() {
  const [update, setUpdate] = useState<ReleaseInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    if (!isAndroid()) return;
    const release = await fetchLatestRelease();
    if (!release) return;
    if (semverGt(release.version, APP_VERSION)) {
      setUpdate(release);
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(check, 5_000);
    const i = setInterval(check, CHECK_INTERVAL_MS);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [check]);

  const handleDownload = () => {
    if (!update) return;
    // Ouvre l'URL directe de l'APK dans le navigateur externe : sous Capacitor
    // Android, un lien target="_blank" est délégué au navigateur système, qui
    // télécharge le .apk via le gestionnaire de téléchargement (puis Android
    // propose l'installation). Évite la feuille de partage de Share.share().
    try {
      const a = document.createElement("a");
      a.href = update.apkUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // Repli : navigation directe
      window.open(update.apkUrl, "_blank");
    }
  };

  if (!update || dismissed) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9998,
        backgroundColor: "#3D0000",
        color: "#fff",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        boxShadow: "0 -2px 12px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ fontSize: 14, lineHeight: 1.4 }}>
        <strong>Mise à jour disponible</strong>
        <br />
        <span style={{ opacity: 0.85 }}>Version {update.version} disponible</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleDownload}
          style={{
            backgroundColor: "#fff",
            color: "#3D0000",
            border: "none",
            borderRadius: 6,
            padding: "8px 14px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Télécharger
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            backgroundColor: "transparent",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.4)",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
