import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Generate an embedding vector for text using OpenAI text-embedding-3-small.
 * Returns a float array of dimension 1536.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  // Chunk text to first 2000 tokens (~8000 chars) to save costs
  const truncated = text.slice(0, 8000);

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: truncated,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error: ${err}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

/**
 * Upsert a file embedding into Supabase.
 */
export async function upsertFileEmbedding(
  roomId: string,
  filePath: string,
  content: string
): Promise<void> {
  // Skip empty or minified files
  if (!content.trim() || content.length < 20) return;

  const embedding = await generateEmbedding(content);

  const { error } = await supabase.from("file_embeddings").upsert(
    {
      room_id: roomId,
      file_path: filePath,
      content: content.slice(0, 8000),
      embedding,
    },
    { onConflict: "room_id,file_path" }
  );

  if (error) throw error;
}

/**
 * Delete embeddings for all files in a room.
 */
export async function deleteRoomEmbeddings(roomId: string): Promise<void> {
  const { error } = await supabase
    .from("file_embeddings")
    .delete()
    .eq("room_id", roomId);
  if (error) throw error;
}

/**
 * Find the most relevant files for a query using cosine similarity.
 */
export async function searchRelevantFiles(
  roomId: string,
  query: string,
  topK = 3
): Promise<Array<{ file_path: string; content: string; similarity: number }>> {
  const queryEmbedding = await generateEmbedding(query);

  const { data, error } = await supabase.rpc("match_file_embeddings", {
    p_room_id: roomId,
    p_query_embedding: queryEmbedding,
    p_match_count: topK,
  });

  if (error) throw error;
  return data || [];
}
