import { Employe, MOIS_NOMS } from "@/types/ebene";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { formatMontant } from "@/lib/ebene-utils";
import { useSocieteActive } from "@/hooks/useSocieteContext";

interface Props {
  employe: Employe;
  onClose: () => void;
}

export const ContratGenerator = ({ employe, onClose }: Props) => {
  const societe = useSocieteActive();
  const nomSoc = societe?.nom || "EBENE SERVICES";
  const nifSoc = societe?.nif || "1 002 088 759";
  const repr = societe?.representant || "BITHO SIMBAYA";
  const fctRepr = societe?.fonctionRepresentant || "Directeur";
  const today = new Date();
  const dateStr = `${today.getDate()} ${MOIS_NOMS[today.getMonth()]} ${today.getFullYear()}`;

  const typeLabel: Record<string, string> = {
    cdi: "Contrat à durée indéterminée (CDI)",
    cdd: "Contrat à durée déterminée (CDD)",
    essai: "Contrat à période d'essai",
    stage: "Contrat de stage",
    interim: "Contrat d'intérim",
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box w-full max-w-3xl">
        <div className="flex items-center justify-between mb-4 no-print">
          <h2 className="text-xl font-bold">Contrat de travail</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
              <Printer className="size-4" /> Imprimer
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}><X className="size-4" /></Button>
          </div>
        </div>

        <div id="print-area" className="bg-white text-foreground p-8 border-2 border-border rounded-lg space-y-4 text-sm leading-relaxed">
          {societe?.logoUrl && (
            <div className="flex justify-center mb-2">
              <img src={societe.logoUrl} alt={nomSoc} className="h-16 object-contain" />
            </div>
          )}
          <div className="text-center border-b-2 border-foreground pb-3 mb-4">
            <p className="font-bold text-base">RÉPUBLIQUE TOGOLAISE</p>
            <p className="text-xs">Travail – Liberté – Patrie</p>
            <h3 className="text-lg font-bold mt-3 uppercase">
              {typeLabel[employe.typeContrat || "cdi"]}
            </h3>
          </div>

          <p><strong>ENTRE LES SOUSSIGNÉS :</strong></p>
          <p>
            <strong>{nomSoc}</strong>
            {nifSoc && `, NIF ${nifSoc}`}
            {societe?.rccm && `, RCCM ${societe.rccm}`}
            {societe?.adresse && `, sise à ${societe.adresse}`}
            , représentée par {repr}{fctRepr ? ` (${fctRepr})` : ""},
            ci-après dénommée « <strong>l'Employeur</strong> »,
          </p>
          <p className="text-center">D'UNE PART,</p>
          <p><strong>ET</strong></p>
          <p>
            <strong>{employe.nom}</strong>
            {employe.dateNaissance && `, né(e) le ${employe.dateNaissance}`}
            {employe.lieuNaissance && ` à ${employe.lieuNaissance}`}
            {employe.nationalite && `, de nationalité ${employe.nationalite}`}
            {employe.cni && `, titulaire de la pièce d'identité n° ${employe.cni}`}
            {employe.adresse && `, demeurant à ${employe.adresse}`}
            , ci-après dénommé(e) « <strong>le Travailleur</strong> »,
          </p>
          <p className="text-center">D'AUTRE PART,</p>

          <p className="font-bold mt-4">IL A ÉTÉ CONVENU CE QUI SUIT :</p>

          <p><strong>Article 1 — Engagement</strong></p>
          <p>
            L'Employeur engage le Travailleur en qualité de <strong>{employe.poste}</strong>
            {employe.qualification && ` (${employe.qualification})`}, classé(e) en
            <strong> catégorie {employe.categorie || "E1"}, échelon {employe.echelon || 1}</strong>
            de la classification professionnelle de la Convention collective interprofessionnelle du Togo.
          </p>

          <p><strong>Article 2 — Durée</strong></p>
          <p>
            Le présent contrat prend effet le <strong>{employe.dateEmbauche || "..."}</strong>
            {employe.typeContrat === "cdd" && employe.dateFinContrat
              ? ` et prendra fin le ${employe.dateFinContrat}.`
              : employe.typeContrat === "essai"
              ? ", pour une durée d'essai conforme aux dispositions du Code du travail."
              : " pour une durée indéterminée."}
          </p>

          <p><strong>Article 3 — Rémunération</strong></p>
          <p>
            En contrepartie de son travail, le Travailleur perçoit un salaire mensuel de base de
            <strong> {formatMontant(employe.salaire)}</strong>
            {(employe.sursalaire || 0) > 0 && `, augmenté d'un sursalaire de ${formatMontant(employe.sursalaire!)}`}
            . S'y ajoutent les primes et indemnités légales et conventionnelles, notamment :
          </p>
          <ul className="list-disc pl-6">
            {(employe.indemniteTransport || 0) > 0 && <li>Indemnité de transport : {formatMontant(employe.indemniteTransport!)}</li>}
            {(employe.indemniteLogement || 0) > 0 && <li>Indemnité de logement : {formatMontant(employe.indemniteLogement!)}</li>}
            {(employe.indemniteFonction || 0) > 0 && <li>Indemnité de fonction : {formatMontant(employe.indemniteFonction!)}</li>}
            <li>Prime d'ancienneté conformément à l'article 36 de la Convention</li>
          </ul>

          <p><strong>Article 4 — Durée du travail</strong></p>
          <p>
            La durée hebdomadaire de travail est fixée à 40 heures conformément à la législation
            togolaise. Les heures supplémentaires sont rémunérées selon les majorations prévues
            (20% de la 41<sup>e</sup> à la 48<sup>e</sup> heure ; 40% au-delà ; 65% les dimanches et jours fériés ; 65% la nuit ; 100% la nuit les dim/fériés).
          </p>

          <p><strong>Article 5 — Congés</strong></p>
          <p>
            Le Travailleur bénéficie de congés payés à raison de <strong>2,5 jours ouvrables par mois</strong>
            de service effectif, ainsi que des permissions exceptionnelles prévues à l'article 45 de la Convention.
          </p>

          <p><strong>Article 6 — Sécurité sociale</strong></p>
          <p>
            Le Travailleur est affilié à la CNSS sous le N° <strong>{employe.numCnss || "à attribuer"}</strong>.
            Les cotisations sont retenues conformément à la loi (CNSS 4% salarié / 17,5% employeur, AMU 5% / 5%).
          </p>

          <p><strong>Article 7 — Dispositions générales</strong></p>
          <p>
            Pour tout ce qui n'est pas prévu au présent contrat, les parties s'en remettent aux dispositions
            du Code du travail togolais et de la Convention collective interprofessionnelle.
          </p>

          <p className="mt-6">Fait à Lomé, le {dateStr}, en deux exemplaires originaux.</p>

          <div className="grid grid-cols-2 gap-8 mt-12">
            <div className="text-center">
              <p className="border-t border-foreground pt-2">L'Employeur</p>
              <p className="text-xs italic">BITHO SIMBAYA</p>
            </div>
            <div className="text-center">
              <p className="border-t border-foreground pt-2">Le Travailleur</p>
              <p className="text-xs italic">{employe.nom}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};