import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CompteurOnglet } from "./CompteurOnglet";

afterEach(cleanup);
it("affiche le nombre et un libellé lisible par les lecteurs d’écran", () => {
  render(<CompteurOnglet nombre={2} libelle="2 fins de mission à valider" />);
  expect(screen.getByText("2")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByText("2 fins de mission à valider")).toHaveClass("sr-only");
});
it("n’affiche rien à zéro", () => {
  const { container } = render(<CompteurOnglet nombre={0} libelle="aucune" />);
  expect(container).toBeEmptyDOMElement();
});
