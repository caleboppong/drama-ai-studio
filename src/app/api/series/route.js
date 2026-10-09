import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

    if (!token) {
      return NextResponse.json({ error: "Please sign in to load your series." }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth?.user) {
      return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("series")
      .select("id,title,description,genre,platform,status,created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ series: data || [] });
  } catch (error) {
    console.error("DramaAI series API error:", error);
    return NextResponse.json({ error: "Unable to load series." }, { status: 500 });
  }
}
