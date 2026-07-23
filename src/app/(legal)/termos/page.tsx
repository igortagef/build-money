import { Secao, Lista, Preencher } from "@/components/legal";

export const metadata = { title: "Termos de Uso · Build Money" };

export default function TermosPage() {
  return (
    <article className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Termos de Uso — Ambiente de Testes (Beta)
        </h1>
        <p className="text-sm text-muted-foreground">
          Versão beta · Última atualização: <Preencher>[DATA]</Preencher>
        </p>
      </div>

      <div className="rounded-lg border border-warning/25 bg-xp-subtle px-4 py-3 text-sm text-warning">
        <strong>Rascunho.</strong> Base para o teste fechado do Build Money. Por tratar de dados
        financeiros, recomenda-se revisão jurídica antes do uso em produção. Trechos em destaque
        precisam ser preenchidos.
      </div>

      <Secao titulo="1. Aceitação">
        <p>
          Ao criar uma conta e usar o Build Money (&ldquo;aplicativo&rdquo;), você concorda com
          estes Termos e com a Política de Privacidade. Se não concordar, não utilize o
          aplicativo. O serviço é operado por{" "}
          <Preencher>[RAZÃO SOCIAL DA AG&F]</Preencher> (&ldquo;nós&rdquo;).
        </p>
      </Secao>

      <Secao titulo="2. O que é o Build Money">
        <p>
          É um aplicativo de gestão de finanças pessoais, disponibilizado em{" "}
          <strong>versão beta</strong> para um grupo restrito de pessoas convidadas, com o objetivo
          de testar funcionalidades e coletar feedback.
        </p>
      </Secao>

      <Secao titulo="3. Natureza de teste — sem garantias">
        <Lista
          itens={[
            "O aplicativo é fornecido “no estado em que se encontra”, sem garantias de disponibilidade, exatidão ou adequação a um fim específico.",
            "Não há SLA (nível de serviço garantido). Pode haver instabilidade, indisponibilidade e manutenção sem aviso.",
            "Durante o beta, dados podem ser reiniciados, migrados ou perdidos. Mantenha seus próprios registros — não use o app como fonte única.",
            "O aplicativo é uma ferramenta de organização; não substitui contador, consultor financeiro nem constitui registro fiscal ou contábil oficial.",
            "O app não presta aconselhamento de investimento nem recomendação financeira personalizada.",
          ]}
        />
      </Secao>

      <Secao titulo="4. Conta e convite">
        <Lista
          itens={[
            "O acesso é por convite pessoal e intransferível.",
            "Você é responsável por manter a senha em sigilo e por toda atividade na sua conta.",
            "Avise-nos imediatamente sobre qualquer uso não autorizado.",
          ]}
        />
      </Secao>

      <Secao titulo="5. Uso aceitável">
        <p>Você concorda em não:</p>
        <Lista
          itens={[
            "Tentar burlar mecanismos de segurança ou acessar dados de outras pessoas.",
            "Usar o aplicativo para qualquer finalidade ilícita.",
            "Sobrecarregar, automatizar em excesso ou interromper o funcionamento do serviço.",
            "Realizar engenharia reversa ou copiar o aplicativo sem autorização.",
          ]}
        />
      </Secao>

      <Secao titulo="6. Seus dados">
        <p>
          Os dados financeiros que você insere são seus. O tratamento segue a{" "}
          <a href="/privacidade" className="text-primary-text underline">
            Política de Privacidade
          </a>
          . Você pode exportar ou excluir seus dados a qualquer momento em &ldquo;Minha
          conta&rdquo;.
        </p>
      </Secao>

      <Secao titulo="7. Confidencialidade do beta">
        <p>
          Por se tratar de uma versão de testes, pedimos que não divulgue publicamente telas,
          funcionalidades não lançadas ou credenciais de acesso sem autorização prévia.
        </p>
      </Secao>

      <Secao titulo="8. Propriedade intelectual">
        <p>
          O aplicativo, a marca &ldquo;Build Money&rdquo; e seu conteúdo pertencem a{" "}
          <Preencher>[RAZÃO SOCIAL DA AG&F]</Preencher>. Estes Termos não transferem nenhum
          direito de propriedade intelectual a você.
        </p>
      </Secao>

      <Secao titulo="9. Limitação de responsabilidade">
        <p>
          Na máxima extensão permitida pela lei, não nos responsabilizamos por perdas de dados,
          lucros cessantes ou por decisões financeiras tomadas com base no aplicativo,
          especialmente durante a fase de testes, em que a exatidão não é garantida.
        </p>
      </Secao>

      <Secao titulo="10. Encerramento">
        <p>
          Podemos suspender ou encerrar o acesso ao teste a qualquer momento. Você pode encerrar
          sua participação excluindo a conta em &ldquo;Minha conta&rdquo;.
        </p>
      </Secao>

      <Secao titulo="11. Lei aplicável e foro">
        <p>
          Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro da comarca de{" "}
          <Preencher>[CIDADE/UF]</Preencher> para dirimir controvérsias, salvo disposição legal em
          contrário.
        </p>
      </Secao>

      <Secao titulo="12. Contato">
        <p>
          Dúvidas sobre estes Termos: <Preencher>[E-MAIL DE CONTATO]</Preencher>.
        </p>
      </Secao>
    </article>
  );
}
