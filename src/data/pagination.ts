// Supabase (PostgREST) renvoie au plus 1 000 lignes par requête : au-delà, les
// lignes suivantes sont silencieusement absentes. Les chargements complets
// passent donc par des pages successives, triées sur une clé unique (id) pour
// qu'aucune ligne ne soit perdue ou lue deux fois d'une page à l'autre.
export const TAILLE_PAGE = 1000;

interface Page<T> { data: T[] | null; error: { code?: string; message: string } | null }

export const toutesLesPages = async <T, E extends Page<T>["error"]>(
  page: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: E }>,
): Promise<{ data: T[]; error: E | null }> => {
  const lignes: T[] = [];
  for (let de = 0; ; de += TAILLE_PAGE) {
    const { data, error } = await page(de, de + TAILLE_PAGE - 1);
    if (error) return { data: lignes, error };
    lignes.push(...(data ?? []));
    if (!data || data.length < TAILLE_PAGE) return { data: lignes, error: null };
  }
};
