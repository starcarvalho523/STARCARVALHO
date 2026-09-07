# Loader global adaptativo

Escopo exclusivamente de interface.

- Ativo no layout raiz: CEO, Cliente e Frentista.
- Navegações, filtros, formulários e requisições de dados exibem o overlay.
- Operações rápidas mantêm uma animação mínima curta para evitar piscadas.
- Operações longas desaceleram progressivamente perto de 94% enquanto aguardam resposta.
- Quando a operação realmente termina, o círculo conclui em 100% e só então o overlay desaparece.
- Mudanças apenas de query string também são detectadas.
- O fallback `loading.tsx` mantém a mesma identidade visual no carregamento inicial de rotas.
- Nenhuma alteração de autenticação, RLS, banco ou pagamentos.
