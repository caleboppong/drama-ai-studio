"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import { createClient } from "@/lib/supabase/client";

export default function AdminPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [allowed, setAllowed] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function verify() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) {
          router.replace("/login");
          return;
        }

        const response = await fetch("/api/admin/access", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        const result = await response.json();
        if (!active) return;

        if (!response.ok || !result.isAdmin) {
          setAllowed(false);
          setMessage("This account does not have administrator access.");
          return;
        }

        setAllowed(true);
      } catch {
        if (active) {
          setAllowed(false);
          setMessage("Unable to verify administrator access.");
        }
      }
    }

    verify();
    return () => {
      active = false;
    };
  }, [router, supabase]);

  if (allowed === null) {
    return <div className="admin-gate">Checking administrator access...</div>;
  }

  if (!allowed) {
    return (
      <div className="admin-gate">
        <h1>Access denied</h1>
        <p>{message}</p>
        <button type="button" onClick={() => router.replace("/")}>
          Return to DramaAI Studio
        </button>
      </div>
    );
  }

  return <AdminDashboard supabase={supabase} onClose={() => router.push("/")} />;
}
