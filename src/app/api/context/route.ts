import { NextRequest, NextResponse } from "next/server";
import { searchRelevantFiles } from "@/lib/embeddings";

export async function POST(req: NextRequest) {
  try {
    const { roomId, prompt } = await req.json();

    if (!roomId || !prompt) {
      return NextResponse.json(
        { error: "Missing roomId or prompt" },
        { status: 400 }
      );
    }

    const files = await searchRelevantFiles(roomId, prompt, 3);

    return NextResponse.json({ files });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
