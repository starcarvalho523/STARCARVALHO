# CEO Units + Monthly Revenue patch

Escopo funcional:
- CRUD administrativo de unidades no CEO (criar, editar, ativar/desativar).
- Capacidade, area aproximada, custo fixo mensal e timezone editaveis.
- Receita de mensalidades e MRR destacados no painel e detalhe da unidade.
- Cartoes legados, credito e debito agregados corretamente no resumo do CEO.

Compatibilidade com hardening:
- A policy `units_read_authorized` usa `private.customer_has_unit_session(uuid)`.
- O hardening removeu EXECUTE dessa funcao para `authenticated`, o que pode fazer a leitura de `parking_units` falhar inclusive para owner/manager.
- A migration incluida restaura apenas USAGE do schema privado ja necessario e EXECUTE dessa funcao especifica. Nao amplia grants para outras funcoes privadas.
