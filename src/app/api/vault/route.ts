import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { encrypt } from "@/lib/encryption";

// Get user's API key status (whether they have a key set for a provider)
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");

  if (provider) {
    // Check specific provider
    const { data, error } = await supabase
      .from("user_api_keys")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .single();

    if (error && error.code !== "PGRST116") { // PGRST116 = not found
      return NextResponse.json({ error: "Failed to fetch key status" }, { status: 500 });
    }

    return NextResponse.json({ hasKey: !!data });
  } else {
    // Get all configured providers
    const { data, error } = await supabase
      .from("user_api_keys")
      .select("provider")
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
    }

    const configuredProviders = data.map((row) => row.provider);
    return NextResponse.json({ configuredProviders });
  }
}

// Save a new API key for the user
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { provider, apiKey } = await request.json();

    if (!provider || !apiKey) {
      return NextResponse.json({ error: "Provider and API key are required" }, { status: 400 });
    }

    // Encrypt the key
    const { encrypted, iv, authTag } = encrypt(apiKey);

    // Upsert into database
    const { error } = await supabase
      .from("user_api_keys")
      .upsert(
        {
          user_id: user.id,
          provider,
          encrypted_key: encrypted,
          iv,
          auth_tag: authTag,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" }
      );

    if (error) {
      console.error("Database error saving API key:", error);
      return NextResponse.json({ error: "Failed to save API key" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error encrypting/saving API key:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Delete an API key
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");

  if (!provider) {
    return NextResponse.json({ error: "Provider is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_api_keys")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", provider);

  if (error) {
    return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
