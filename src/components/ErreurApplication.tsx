/**
 * Filet de sécurité : une erreur d'affichage n'efface plus toute l'application
 * (écran blanc). Un écran propose de revenir à l'accueil ou de recharger.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { lienAccueil } from "@/hooks/useTenant";

/** Accueil de la société en cours (le ?sid= de l'adresse), sinon accueil général. */
const hashAccueil = () => {
  const m = window.location.hash.match(/[?&]sid=([^&]+)/);
  return "#" + lienAccueil(m ? decodeURIComponent(m[1]) : null);
};

interface Props {
  children: ReactNode;
}

interface State {
  erreur: Error | null;
}

export class ErreurApplication extends Component<Props, State> {
  state: State = { erreur: null };

  static getDerivedStateFromError(erreur: Error): State {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    console.error("[ErreurApplication]", erreur, info.componentStack);
  }

  private accueil = () => {
    window.location.hash = hashAccueil();
    this.setState({ erreur: null });
  };

  private recharger = () => {
    window.location.hash = hashAccueil();
    window.location.reload();
  };

  render() {
    const { erreur } = this.state;
    if (!erreur) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border-2 bg-card p-6 text-center space-y-4 shadow-lg">
          <h1 className="text-lg font-bold">Un problème est survenu</h1>
          <p className="text-sm text-muted-foreground">
            Cet écran n'a pas pu s'afficher. Vos données enregistrées ne sont pas touchées.
          </p>
          <p className="text-xs text-muted-foreground break-words">{erreur.message}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={this.accueil}
              className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Revenir à l'accueil
            </button>
            <button
              type="button"
              onClick={this.recharger}
              className="h-10 rounded-md border px-4 text-sm font-semibold"
            >
              Recharger l'application
            </button>
          </div>
        </div>
      </div>
    );
  }
}
