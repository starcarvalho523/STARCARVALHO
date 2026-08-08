function required(name: string, value: string | undefined): string {
  if (!value) throw new Error("Variável de ambiente obrigatória ausente: " + name);
  return value;
}
export function getSupabaseEnvironment() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  };
}

