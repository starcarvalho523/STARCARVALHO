const disabled = () => Response.json(
  { error: "Pix Automático está temporariamente desativado." },
  { status: 404, headers: { "cache-control": "no-store" } },
);

export async function GET() {
  return disabled();
}

export async function POST() {
  return disabled();
}
