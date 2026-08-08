# Segurança

Somente URL e publishable key chegam ao navegador. Autorização usa user_unit_roles, nunca user_metadata. Tabelas públicas usam RLS e grants explícitos. Funções SECURITY DEFINER ficam fora do schema exposto, usam search_path fixo e têm EXECUTE revogado de PUBLIC.

