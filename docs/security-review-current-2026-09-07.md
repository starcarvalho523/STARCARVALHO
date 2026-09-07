# Revisão de segurança da versão atual — 7 de setembro de 2026

## Escopo e publicação

Base remota: `78208fd0644deca7be2c3732a1f980d2fec33bab` (main). PR: #98, branch `codex/security-current-2026-09-07`. Não foi reutilizada a árvore antiga. Esta entrega é somente PR/Preview; não autoriza merge ou promoção para produção.

Revisão estática de autenticação, uso de cliente administrativo, operações de equipe/unidades, entradas HTTP e webhooks; consultas de catálogo somente leitura em QA e produção; configuração/alertas do GitHub; testes automatizados e verificações HTTP não financeiras em Preview. Não houve alteração de dados, configuração remota ou pagamento nesta ampliação.

## Correções da PR

- Login/cadastro/callback não sobrescrevem perfis existentes e tratam falha no provisionamento. Removida reativação automática do cliente.
- Corpo real de notificações de cartão limitado a 8192 bytes, independente de Content-Length declarado.
- As 13 rotas que usavam Request.json agora leem JSON por um leitor com limite real: 64 KiB nas APIs e 1 MiB no webhook Asaas. Limites anteriores de Pix permanecem. Payload excessivo é rejeitado antes do processamento; as APIs preservam seus caminhos de erro existentes. O webhook Asaas retorna 413 para excesso e 400 para JSON malformado.
- Webhook Asaas mantém autenticação antes do parsing; nomes de eventos são limitados ao formato de identificador e logs deixam de incluir mensagens arbitrárias de exceção. Erros não reconhecidos são registrados por código genérico, sem payload.
- Oito testes de regressão de segurança cobrem bytes reais, headers ausentes/falsos, multipart, JSON inválido, cancelamento do stream, preservação do perfil e contratos de limites/logs.
- Preservados headers/CSP, dependências, gates de ambiente, autorização e regras financeiras da main atual. Não foram feitas cobranças de teste.

## Evidências de proteção

| Área | Evidência obtida | Limite da conclusão |
|---|---|---|
| Banco/RLS | Nenhuma tabela pública sem RLS nos dois projetos | Políticas precisam de testes de acesso por papel, não só presença |
| Views | Nenhuma view pública acessível consultada sem security_invoker | Não substitui revisão de toda lógica SQL |
| Storage | Nenhum bucket público retornado | Uploads e políticas privadas não testados ponta a ponta |
| Funções privilegiadas | Nenhuma SECURITY DEFINER pública/privada executável por anon retornada | Permanecem avisos para funções autenticadas |
| Identidade em políticas | Nenhuma política pública consultada usa user_metadata; nenhuma política de escrita com predicado literal true | Busca é uma triagem, não prova formal |
| Processamento financeiro | RPCs de processamento de webhook/cron consultadas não estão liberadas para authenticated | Fluxo financeiro real não executado |
| Administração | Ações de equipe e edição de unidades inspecionadas verificam papel e unidade antes de service_role | Combinações multiunidade não exercitadas com contas reais |
| Secrets | Secret scanning e push protection habilitados; consulta retornou zero alertas abertos | Não significa ausência de secrets em toda a história |
| Arquivos de ambiente | .env.production rastreado contém somente nomes de configuração pública/publishable | Chave publishable não é chave administrativa; RLS permanece essencial |
| Preview | Login respondeu; Cliente/CEO/Frentista sem sessão chegaram ao login; headers defensivos presentes | Não houve login autenticado de regressão nesta revisão |
| Dependências | Instalação exata do lockfile reportou zero vulnerabilidades conhecidas | Não cobre zero-days nem falhas da aplicação |

A proteção de ativação no banco aplicada anteriormente foi reconfirmada habilitada em QA e produção. Nesta ampliação ela não foi modificada nem reaplicada.

## Validação de código

Lint e build PASS (7 warnings preexistentes de lint); typecheck PASS. Testes de pagamentos: 119 PASS. Testes específicos de segurança: 8 PASS. Os oito grupos complementares existentes somam 49 testes e são novamente executados pela CI da PR; total esperado da CI: 176. Consultar os checks do HEAD final da PR para a confirmação remota, não os checks do commit anterior.

## Pendências importantes

1. **Proteção de main:** endpoint de branch protection retornou 404 e lista de rulesets retornou vazia. Preparar regra que exija PR, CI e revisão, bloqueie force push/deleção e preserve um procedimento administrativo de emergência. Não foi ativada remotamente porque esta entrega deve ficar em Preview.
2. **Dependabot:** alertas e security updates desativados segundo API. O arquivo de atualizações semanais e npm audit na CI já existem, mas não substituem alertas de vulnerabilidade contínuos. Ativação depende da configuração do repositório/permissão administrativa; não foi alterada nesta entrega.
3. **Supabase Auth:** advisor aponta proteção contra senhas vazadas desabilitada. Verificar disponibilidade do plano e testar impacto em QA antes de habilitar. [Orientação oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
4. **Permissões SQL:** permanecem avisos de SECURITY DEFINER para authenticated, RLS sem política em tabelas privadas e extensão em public na produção. Não revogar em massa: são necessários testes por função e papel. [Orientação oficial](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
5. **MFA e contas administrativas:** adesão/enforcement nos painéis GitHub, Vercel e Supabase não foi verificada; credenciais QA não devem ser reutilizadas fora do teste.
6. **Abuso, DDoS e automação:** limite de corpo não é rate limit. Limites por usuário/IP, proteção contra bots e regras WAF ainda precisam de validação sem bloquear callbacks legítimos.
7. **Operação:** restauração de backup, rotação de credenciais, retenção/redação integral de logs, alertas de incidentes e configuração VPS/mTLS não foram testados nesta revisão.
8. **Escopo financeiro:** a versão atual possui um fluxo que recebe dados de cartão no servidor. Esta revisão não certifica conformidade PCI nem testa pagamentos reais.
9. **Histórico de migrations:** a proteção de ativação já aplicada possui timestamps diferentes em QA/produção e arquivo local antigo. Reconciliar histórico antes de futuro db push; não reaplicar a migration antiga cegamente. Esta PR não contém migration nova.

## Nota de segurança

Não é tecnicamente defensável atribuir “X% protegido” a partir desta revisão. Os resultados medem verificações específicas, não probabilidade de invasão. Estado: **reforços de aplicação testados e preparados em Preview, com lacunas administrativas/operacionais ainda abertas**. Não é um pentest completo, garantia de ausência de vazamento ou certificação de segurança absoluta.
