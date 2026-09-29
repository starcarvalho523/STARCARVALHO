# Star Carvalhos — publicação social (rascunho)

Os dois workflows em `workflows/` foram adaptados ao esquema da Star e importados **inativos** no n8n dedicado. O agendador consulta somente `social_content_items` com `status=scheduled`, `approved_at` presente, `content_type=image` e `scheduled_for` vencido. A reserva condicional muda o status para `publishing` antes de chamar o publicador; os resultados vão para `social_publication_logs` com `unit_id`.

- Publicador: `6NVhhcO2WKjT004y` (27 nós, Facebook/Instagram para imagem).
- Agendador: `ufehYBPezWjBP53e` (9 nós, execução a cada minuto somente depois da ativação).
- URL no agendador aponta para o projeto de produção Star `badqfmtfasrvqyelvfyc`; não utilizar o projeto QA `hqdaqijgloeiqrljulqx` para publicação real.
- Os nós REST precisam de uma credencial n8n Custom Auth exclusiva da Star. Para uma chave nova `sb_secret_*`, envie somente o cabeçalho `apikey` com essa chave; não envie `Authorization: Bearer sb_secret_*` (não é JWT). Nenhum segredo é exportado nestes JSON.
- Os nós Meta não contêm credenciais. Configure e valide a identidade da página e do Instagram da Star antes de qualquer publicação.
- O fluxo aceita apenas imagem. Vídeos, Story e TikTok não estão homologados. Nenhum conteúdo social está agendado no banco no momento desta preparação.
- Falha abrupta após a reserva pode deixar `publishing`; reconcilie externamente antes de reenviar para evitar postagem duplicada.

Não ativar por apenas constar `connected` em `social_connections`: essa tabela guarda metadados, não prova que o OAuth do n8n funciona.

A instância n8n da Star usa `127.0.0.1:5680` e ainda não tem URL pública HTTPS para retorno OAuth. Ajustar o callback e validar o app Meta antes de conectar os nós Facebook/Instagram. O fluxo existente contém URLs Facebook Graph `v18.0`; revisar a versão suportada e a identidade da página antes da homologação.
