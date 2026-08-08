import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const access = await getAccess();
  redirect(access ? `/${access.area}` : "/login");
}
