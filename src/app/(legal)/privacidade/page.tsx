import { Secao, Lista, Preencher } from "@/components/legal";

export const metadata = { title: "Política de Privacidade · Build Money" };

export default function PrivacidadePage() {
  return (
    <article className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Política de Privacidade
        </h1>
        <p className="text-sm text-muted-foreground">
          Versão beta · Última atualização: <Preencher>[DATA]</Preencher>
        </p>
      </div>

      <div className="rounded-lg border border-warning/25 bg-xp-subtle px-4 py-3 text-sm text-warning">
        <strong>Rascunho.</strong> Este texto é uma base para o teste fechado do Build Money.
        Como o aplicativo trata dados financeiros, recomenda-se revisão por um advogado antes
        do uso em produção. Trechos em destaque precisam ser preenchidos com dados reais.
      </div>

      <Secao titulo="1. Quem é o controlador dos dados">
        <p>
          O Build Money é operado por <Preencher>[RAZÃO SOCIAL DA AG&F]</Preencher>, inscrita no
          CNPJ <Preencher>[CNPJ]</Preencher>, com sede em <Preencher>[ENDEREÇO]</Preencher>
          (&ldquo;nós&rdquo;). Para dúvidas sobre esta política ou sobre seus dados, o contato do
          encarregado (DPO) é <Preencher>[E-MAIL DE CONTATO]</Preencher>.
        </p>
      </Secao>

      <Secao titulo="2. Quais dados coletamos">
        <Lista
          itens={[
            <>
              <strong>Cadastro:</strong> nome, e-mail e senha. A senha é guardada apenas como
              hash (mão única) — nunca em texto claro.
            </>,
            <>
              <strong>Dados financeiros que você insere:</strong> contas, lançamentos, categorias,
              orçamentos, metas, patrimônio e afins. São fornecidos por você e usados só para
              operar o app.
            </>,
            <>
              <strong>Dados técnicos e de segurança:</strong> endereço IP, identificação do
              navegador (user agent), datas de acesso e registros de auditoria de ações sensíveis
              (login, troca de senha, exclusões).
            </>,
            <>
              <strong>Cookies:</strong> um único cookie de sessão, essencial para manter você
              autenticado. Não usamos cookies de rastreamento ou publicidade.
            </>,
          ]}
        />
      </Secao>

      <Secao titulo="3. Para que usamos os dados">
        <Lista
          itens={[
            "Fornecer e manter o funcionamento do aplicativo (execução do contrato).",
            "Proteger as contas contra acesso indevido — trava de tentativas, auditoria (legítimo interesse e segurança).",
            "Prestar suporte e melhorar o produto durante o teste.",
            "Cumprir obrigações legais quando aplicável.",
          ]}
        />
        <p>
          <strong>Não vendemos seus dados</strong> e não os usamos para publicidade. Seus dados
          financeiros não são compartilhados para fins de marketing.
        </p>
      </Secao>

      <Secao titulo="4. Com quem compartilhamos">
        <p>
          Para operar o serviço, usamos fornecedores que processam dados em nosso nome
          (operadores), limitados ao necessário:
        </p>
        <Lista
          itens={[
            <>
              <strong>Banco de dados:</strong> <Preencher>[PROVEDOR DO BANCO — ex.: Neon/PostgreSQL]</Preencher>,
              que armazena os dados com cifragem em repouso.
            </>,
            <>
              <strong>Hospedagem:</strong> servidor da <Preencher>[AG&F / provedor de hospedagem]</Preencher>.
            </>,
            <>
              <strong>E-mail transacional</strong> (quando ativado): <Preencher>[PROVEDOR DE E-MAIL]</Preencher>,
              para recuperação de senha e avisos de segurança.
            </>,
          ]}
        />
        <p>Não há transferência dos seus dados para terceiros fora dessas finalidades.</p>
      </Secao>

      <Secao titulo="5. Segurança">
        <p>Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo:</p>
        <Lista
          itens={[
            "Conexão criptografada (HTTPS) e política de segurança de conteúdo.",
            "Senhas guardadas como hash; sessões que podem ser revogadas.",
            "Cadastro fechado por convite e trava contra tentativas de login em excesso.",
            "Registro de auditoria das ações sensíveis e cifragem dos dados em repouso pelo provedor de banco.",
          ]}
        />
      </Secao>

      <Secao titulo="6. Por quanto tempo guardamos">
        <p>
          Mantemos seus dados enquanto sua conta existir. Ao excluir a conta (em
          &ldquo;Minha conta&rdquo;), apagamos seus dados dos espaços que você possui. Alguns
          registros mínimos de segurança podem ser retidos pelo tempo exigido por lei.
        </p>
      </Secao>

      <Secao titulo="7. Seus direitos (LGPD)">
        <p>Você pode, a qualquer momento:</p>
        <Lista
          itens={[
            "Acessar e confirmar quais dados temos.",
            "Corrigir dados desatualizados (editando no próprio app).",
            "Exportar todos os seus dados em arquivo (portabilidade), na tela “Minha conta”.",
            "Excluir sua conta e seus dados, também em “Minha conta”.",
          ]}
        />
        <p>
          Para outras solicitações, escreva para <Preencher>[E-MAIL DE CONTATO]</Preencher>.
        </p>
      </Secao>

      <Secao titulo="8. Aviso sobre a versão beta">
        <p>
          O Build Money está em <strong>versão beta (teste)</strong>. Durante esta fase, os dados
          podem ser reiniciados, migrados ou perdidos, e recursos podem mudar. Não utilize o app
          como seu <strong>único</strong> registro financeiro.
        </p>
      </Secao>

      <Secao titulo="9. Alterações e contato">
        <p>
          Podemos atualizar esta política; mudanças relevantes serão comunicadas pelos canais do
          teste. Dúvidas: <Preencher>[E-MAIL DE CONTATO]</Preencher>.
        </p>
      </Secao>
    </article>
  );
}
