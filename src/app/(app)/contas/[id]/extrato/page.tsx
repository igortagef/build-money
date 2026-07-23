import { redirect } from "next/navigation";

/**
 * O extrato/conciliação da conta mudou de casa: agora vive na seção
 * Conciliação, com os dias segmentados e o saldo lançado × conferido. Este
 * caminho fica só como redirecionamento, para links antigos não quebrarem.
 */
export default async function ExtratoRedirect(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  redirect(`/conciliacao/${id}`);
}
