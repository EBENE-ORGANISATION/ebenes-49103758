import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** Bouton qui demande confirmation dans la page ; window.confirm peut être bloqué (application Windows, dialogues coupés). */
export function BoutonConfirme({ children, message, onConfirmer, ...bouton }: Omit<ComponentProps<typeof Button>, "onClick"> & {
  children: ReactNode; message: string; onConfirmer: () => void;
}) {
  const { t } = useTranslation();
  return <AlertDialog>
    <AlertDialogTrigger asChild><Button {...bouton}>{children}</Button></AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{children}</AlertDialogTitle>
        <AlertDialogDescription>{message}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirmer}>{children}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
