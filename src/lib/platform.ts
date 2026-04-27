/**
 * Helpers de détection de plateforme.
 *
 * Permet de switcher entre les APIs navigateur et les APIs natives Capacitor
 * (Filesystem, Share, Network…) sans dupliquer le code métier.
 *
 * En mode web (PWA / navigateur classique), `Capacitor` n'est pas chargé,
 * et on retombe sur les implémentations standard.
 */
import { Capacitor } from "@capacitor/core";

/** Vrai si l'app tourne dans un conteneur natif Capacitor (Android, iOS). */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Vrai si l'app tourne sur Android (natif uniquement). */
export function isAndroid(): boolean {
  try {
    return Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

/** Vrai si l'app tourne sur iOS (natif uniquement). */
export function isIOS(): boolean {
  try {
    return Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

/** Vrai si l'app tourne dans un navigateur web (PWA, desktop, mobile web). */
export function isWeb(): boolean {
  try {
    return Capacitor.getPlatform() === "web";
  } catch {
    return true;
  }
}

/** Plateforme courante : "web" | "android" | "ios". */
export function platform(): "web" | "android" | "ios" {
  try {
    const p = Capacitor.getPlatform();
    if (p === "android" || p === "ios") return p;
    return "web";
  } catch {
    return "web";
  }
}