import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { v4 as uuidv4 } from "uuid";

// Fork a template into a new room
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
    const { templateId } = await request.json();

    if (!templateId) {
      return NextResponse.json(
        { error: "templateId is required" },
        { status: 400 }
      );
    }

    // Get the template
    const { data: template, error: templateError } = await supabase
      .from("templates")
      .select("*, rooms!source_room_id(state_vector, name)")
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Get the source room's state vector
    const sourceRoom = template.rooms;
    const stateVector = sourceRoom?.state_vector || null;

    // Create a new room with the forked state
    const newRoomId = `room-${uuidv4().substring(0, 8)}`;
    const { error: roomError } = await supabase.from("rooms").insert({
      id: newRoomId,
      created_by: user.id,
      name: `Fork of ${template.title}`,
      state_vector: stateVector,
    });

    if (roomError) {
      return NextResponse.json(
        { error: "Failed to create room" },
        { status: 500 }
      );
    }

    // Increment the fork count
    await supabase
      .from("templates")
      .update({ fork_count: (template.fork_count || 0) + 1 })
      .eq("id", templateId);

    return NextResponse.json({ roomId: newRoomId });
  } catch (error) {
    console.error("Error forking template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
