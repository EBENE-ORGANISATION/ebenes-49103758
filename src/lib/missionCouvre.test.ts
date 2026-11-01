import { expect, it } from "vitest";
import { missionCouvre, missionsCabinet } from "./missionCabinet";
it("reproduit les 25 comparaisons de l’ordre partiel SQL", () => {
  const couvertures = {
    tenue_complete: missionsCabinet,
    compta_fiscalite: ["compta_fiscalite", "declarations", "lecture"],
    declarations: ["declarations", "lecture"],
    lecture: ["lecture"],
    paie_social: ["paie_social"],
  };
  for (const haute of missionsCabinet) for (const basse of missionsCabinet) {
    expect(missionCouvre(haute, basse), haute + " / " + basse).toBe(couvertures[haute].includes(basse));
  }
});
