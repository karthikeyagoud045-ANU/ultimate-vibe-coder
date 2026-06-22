import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Get public templates
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const search = searchParams.get("search") || "";
  const language = searchParams.get("language") || "";

  const offset = (page - 1) * limit;

  let query = supabase
    .from("templates")
    .select("*", { count: "exact" })
    .eq("is_public", true)
    .order("fork_count", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }

  if (language) {
    query = query.eq("language", language);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    templates: data,
    total: count,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0,
  });
}

// Create a template from a room
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roomId, title, description, language, tags } = await request.json();

    if (!roomId || !title) {
      return NextResponse.json(
        { error: "roomId and title are required" },
        { status: 400 }
      );
    }

    // Get the room's state vector
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, state_vector, name")
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Create the template
    const { data: template, error: templateError } = await supabase
      .from("templates")
      .insert({
        source_room_id: roomId,
        title,
        description: description || room.name || "",
        author_id: user.id,
        author_name: user.email?.split("@")[0] || "Anonymous",
        language: language || "javascript",
        tags: tags || [],
        is_public: true,
      })
      .select()
      .single();

    if (templateError) {
      return NextResponse.json(
        { error: "Failed to create template" },
        { status: 500 }
      );
    }

    // Update the room to reference the template
    await supabase
      .from("rooms")
      .update({ workspace_id: null })
      .eq("id", roomId);

    return NextResponse.json({ template });
  } catch (error) {
    console.error("Error creating template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
