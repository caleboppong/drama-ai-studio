
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function getUser(request, supabase) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

function jsonError(message, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request) {
  try {
    const supabase = getSupabase();
    const user = await getUser(request, supabase);
    if (!user) return jsonError("Please sign in to load your characters.", 401);

    const { data, error } = await supabase
      .from("drama_characters")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ characters: data || [] });
  } catch (error) {
    return jsonError(error.message);
  }
}

export async function POST(request) {
  let uploadedPath = null;

  try {
    const supabase = getSupabase();
    const user = await getUser(request, supabase);
    if (!user) return jsonError("Please sign in to save a character.", 401);

    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    const voice = String(form.get("voice") || "coral").trim();
    const seriesId = String(form.get("series_id") || "").trim();
    const mode = String(form.get("mode") || "upload");
    const file = form.get("file");

    if (!name || name.length > 100) {
      return jsonError("Character name must contain 1–100 characters.", 400);
    }

    if (mode !== "upload") {
      return jsonError("AI portrait generation is not connected yet. Select Upload Portrait.", 400);
    }

    if (!(file instanceof File) || file.size === 0) {
      return jsonError("Please select a portrait image.", 400);
    }

    const allowedTypes = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };

    const extension = allowedTypes[file.type];

    if (!extension) {
      return jsonError("Only JPG, PNG and WebP images are supported.", 400);
    }

    if (file.size > 10 * 1024 * 1024) {
      return jsonError("The image must be smaller than 10 MB.", 400);
    }

    if (seriesId) {
      const { data: ownedSeries, error: seriesError } = await supabase
        .from("series")
        .select("id")
        .eq("id", seriesId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (seriesError) throw seriesError;
      if (!ownedSeries) {
        return jsonError("The selected series does not belong to your account.", 403);
      }
    }

    const bucket = "episode-media";
    const characterId = crypto.randomUUID();
    uploadedPath = `characters/${user.id}/${characterId}.${extension}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(uploadedPath, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(uploadedPath);

    const { data: character, error: insertError } = await supabase
      .from("drama_characters")
      .insert({
        id: characterId,
        user_id: user.id,
        series_id: seriesId || null,
        name,
        description,
        voice,
        portrait_url: publicUrlData.publicUrl,
        portrait_path: uploadedPath,
        portrait_source: "uploaded"
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ character }, { status: 201 });
  } catch (error) {
    if (uploadedPath) {
      try {
        getSupabase().storage
          .from("episode-media")
          .remove([uploadedPath]);
      } catch {}
    }

    return jsonError(error.message);
  }
}
