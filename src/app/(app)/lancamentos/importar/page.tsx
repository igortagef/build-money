import { redirect } from "next/navigation";

/**
 * A importação de extrato/fatura passou a ser feita SEMPRE pela conciliação:
 * as linhas do arquivo entram numa área de espera e viram lançamento só depois
 * de conferidas contra o app — nunca criadas às cegas. Esta rota antiga (que
 * gravava direto) agora leva à conciliação, onde se escolhe a conta.
 */
export default function ImportarRedirect() {
  redirect("/conciliacao");
}
