"use client";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const salir = async () => {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };
  return <button className="btn btn-ghost" onClick={salir}>Salir</button>;
}
