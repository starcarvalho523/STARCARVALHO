# Auditoria de seguranca e pentest controlado — QA

## Estado e escopo

- Base remota atualizada: `f47ebfd76ac48865d7b2c04ff947d083b99a8158`.
- Branch de trabalho: `codex/audit-pentest-current`.
- QA: `hqdaqijgloeiqrljulqx`. Nenhuma alteracao de dados/configuracao em Production nesta etapa.
- Testes sem pagamentos, sem envio de e-mails, sem criacao de sessoes de login e sem teste de carga.
- Contas, unidades, tarifas, veiculos e estadias sinteticos foram criados dentro de transacoes com ROLLBACK, conforme autorizacao. Nenhum registro preexistente foi alterado.
- Esta e uma auditoria parcial com evidencias, nao certificacao de ausencia de vulnerabilidades em toda a plataforma. O merge geral permanece bloqueado ate fechar a cobertura abaixo.

## Achado confirmado: acesso de funcionario desativado

Severidade estimada: alta (confidencialidade). Um gerente/proprietario com JWT ainda valido, perfil global desativado e vinculo de unidade ainda ativo podia consultar `get_ceo_customer_directory` e `get_ceo_customer_detail` diretamente. A interface valida o perfil ativo, mas as duas RPCs SECURITY DEFINER nao faziam a mesma verificacao. Os dados retornados incluem informacoes pessoais e operacionais de clientes da unidade.

Reproducao no QA com dois usuarios e duas unidades sinteticos:

1. Cliente A enxerga sua estadia e nao enxerga perfil, veiculo ou estadia de B.
2. Gerente A enxerga seu cliente e nao enxerga o cliente da unidade B.
3. Desativar apenas o perfil sintetico A e manter seu vinculo ativo.
4. Antes da correcao: as duas RPCs ainda retornavam dados (`disabled_staff_detail_leak=true`, `disabled_staff_directory_leak=true`). Nenhum dado pessoal real foi emitido.
5. Depois da correcao: detalhe retorna NULL e diretorio retorna array vazio. Gerente ativo continua funcionando; vinculo desativado tambem permanece bloqueado.

Correcao: adicionar verificacao do perfil ativo do ator nos tres escopos de autorizacao dessas duas funcoes. Demais filtros, formatos de retorno, regras financeiras e funcoes permanecem iguais. EXECUTE publico/anonimo explicitamente revogado; acesso authenticated preservado.

Migracao `20260907014449_enforce_active_ceo_customer_access.sql` aplicada e retestada no QA. O identificador do arquivo acompanha o registrado pelo Supabase QA. Production foi consultada apenas para confirmar que ainda nao possui a nova guarda; a correcao **nao esta publicada la**.

## Evidencias e cobertura

| Superficie | Evidencia desta auditoria | Limite |
| --- | --- | --- |
| Isolamento cliente/cliente | Proprio perfil e estadia visiveis; perfil, veiculo, unidade e estadia de outro cliente ocultos | SQL com role authenticated e claims sinteticas; nao login E2E |
| Isolamento unidade/unidade | Diretorio/detalhe CEO limitado a unidade do gerente | Duas unidades sinteticas, nao todos os papeis e RPCs |
| Escalada de privilegios | Cliente sem UPDATE direto em payments e sem INSERT em user_unit_roles | Nao equivale a testar toda operacao privilegiada |
| IDOR em operacoes | Apropriacao de veiculo ja vinculado e inicio de saida de outra unidade negados | Sem cobranca nem liberacao de saida |
| Revogacao de acesso | Perfil desativado e vinculo desativado bloqueiam ambas as consultas apos correcao | Sessao Auth/MFA/recuperacao ainda nao testada ponta a ponta |
| RLS e privilegios | Catalogos/politicas revisados; advisor QA sem ERROR | 62 avisos de RPC SECURITY DEFINER exigem revisao individual; nao sao 62 exploits comprovados |
| Dependencias | npm audit --omit=dev --audit-level=high: zero vulnerabilidades conhecidas | Nao prova ausencia de falhas desconhecidas |
| API/webhooks | Testes existentes de limites de corpo, autenticacao interna, formato, gates de ambiente e redacao | Testes unitarios/contrato, nao pentest da VPS/mTLS |
| Limpeza | Consulta apos rollback: contas=0, unidades=0, veiculos sinteticos=0 | Nenhum DELETE de dados preexistentes |

## Verificacoes de codigo

- 176 testes existentes passaram: seguranca 8; pagamentos 119; demais grupos 49.
- Lint: zero erros, sete warnings preexistentes (imports/variavel sem uso e imagem).
- Lint, typecheck e build passaram novamente na base atual `f47ebfd`, preservando o loader publicado durante a auditoria.
- O teste SQL adicional esta em `supabase/tests/security_isolation_qa.sql`. Ele foi executado explicitamente no QA; nao e executado pelo job npm de CI e nao deve ser anunciado como cobertura automatica do GitHub.

## Pendencias para uma conclusao ampla

1. Protecao contra senhas vazadas continua desativada no QA. Verificar disponibilidade/plano, habilitar com teste de cadastro/recuperacao e definir politica antes de promover. [Orientacao oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
2. Confirmar MFA dos administradores, recuperacao de acesso, expiracao/revogacao de sessoes e contas de emergencia. Exige participacao dos titulares; nao alterar fatores sem recuperacao preparada.
3. Completar matriz autenticada por papel/RPC, incluindo mensalidades, B2B, arquivos, APIs HTTP e Server Actions. Passar nos testes acima nao cobre todos esses caminhos.
4. Validar WAF/rate limiting, cabecalhos confiaveis de proxy, regras e limites de terceiros sem provocar indisponibilidade ou bloqueio dos webhooks.
5. Auditar VPS, Nginx/mTLS, rotacao de segredos, acesso SSH e entrega de webhooks com acesso administrativo autorizado e instrumentacao segura. Nao executado nesta etapa.
6. Testar restauracao de backup em ambiente isolado; inventariar retencao, logs e alertas. Nao restaurar por cima de QA ou Production.
7. Revisar a divergencia historica de IDs de migracoes anteriores antes de qualquer db push global. Esta PR nao reaplica migracoes antigas.

## Gate de publicacao

Nao atribuir porcentagem de protecao nem declarar ausencia global de brechas. A correcao demonstrada esta pronta para revisao e validada no QA; a autorizacao de merge dada pelo usuario e condicional a conclusao da auditoria/pentest. Enquanto a cobertura acima estiver aberta, nao fazer merge ou promover a correcao para Production automaticamente.
