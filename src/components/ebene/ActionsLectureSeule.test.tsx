import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { TAUX_DEFAUT, type Article, type MoisData } from "@/types/ebene";
import { Comptabilite } from "./Comptabilite";
import { Stock } from "./Stock";

vi.mock("@/hooks/useTenant", () => ({ useTenant: () => ({ currentSociete: null }) }));
vi.mock("@/hooks/data/useActivites", () => ({ useActivites: () => ({ activitesActives: [] }) }));
vi.mock("@/hooks/useActiviteFilter", () => ({ useActiviteFilter: () => ({ currentActiviteId: null }) }));
vi.mock("@/hooks/usePeutValider", () => ({ usePeutValider: () => () => false, MESSAGE_QUATRE_YEUX: "" }));

beforeAll(async () => { await i18n.changeLanguage("fr"); });
afterEach(cleanup);

const donnees: MoisData = { transactions: [], factures: [], primes: {} };
const article: Article = {
  id: 1, reference: "ART-001", designation: "Article consultable", unite: "pièce",
  prixAchat: 100, prixVente: 150, stock: 5, seuilAlerte: 1,
};

describe("Actions de saisie selon les callbacks autorisés", () => {
  it.each([false, true])("Comptabilité : droit de saisie %s", (autorise) => {
    render(<Comptabilite data={donnees} annee={2026} mois={1} employes={[]} taux={TAUX_DEFAUT}
      onAdd={autorise ? vi.fn() : undefined} />);
    for (const nom of ["Ajouter Transaction", "Facture fournisseur par photo"]) {
      const bouton = screen.queryByRole("button", { name: nom });
      if (autorise) expect(bouton).toBeInTheDocument();
      else expect(bouton).not.toBeInTheDocument();
    }
    expect(screen.getByText("Solde (Mois)")).toBeInTheDocument();
  });

  it.each([false, true])("Comptabilité : onglet de saisie autorisé %s", (autorise) => {
    render(<Comptabilite data={donnees} annee={2026} mois={1} employes={[]} taux={TAUX_DEFAUT}
      onAddEcriture={autorise ? vi.fn() : undefined} />);
    const onglet = screen.queryByRole("tab", { name: /Saisie/ });
    if (autorise) expect(onglet).toBeInTheDocument();
    else expect(onglet).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Journal/ })).toBeInTheDocument();
  });

  it("Comptabilité : ferme la saisie si le callback est retiré", () => {
    const proprietes = { data: donnees, annee: 2026, mois: 1, employes: [], taux: TAUX_DEFAUT };
    const vue = render(<Comptabilite {...proprietes} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter Transaction" }));
    expect(screen.getByText("Nouvelle Transaction")).toBeInTheDocument();
    vue.rerender(<Comptabilite {...proprietes} />);
    expect(screen.queryByText("Nouvelle Transaction")).not.toBeInTheDocument();
  });

  it.each([false, true])("Stock : droit de saisie %s", (autorise) => {
    render(<Stock data={donnees} annee={2026} mois={1} articles={[]} fournisseurs={[]} categories={[]}
      onAddArticle={autorise ? vi.fn() : undefined} onAddMouvement={autorise ? vi.fn() : undefined} />);
    for (const nom of ["Nouvel article", "Faire un inventaire"]) {
      const bouton = screen.queryByRole("button", { name: nom });
      if (autorise) expect(bouton).toBeInTheDocument();
      else expect(bouton).not.toBeInTheDocument();
    }
    expect(screen.getByText("Valeur stock (PMP)")).toBeInTheDocument();
  });

  it("Stock : conserve les articles sans afficher les actions de modification et suppression", () => {
    const proprietes = { data: donnees, annee: 2026, mois: 1, articles: [article], fournisseurs: [], categories: [], isChefCompta: true };
    const vue = render(<Stock {...proprietes} onUpdateArticle={vi.fn()} onRemoveArticle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Modifier Article consultable" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Supprimer Article consultable" })).toBeInTheDocument();
    vue.rerender(<Stock {...proprietes} />);
    expect(screen.getByText("Article consultable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier Article consultable" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer Article consultable" })).not.toBeInTheDocument();
  });
});
