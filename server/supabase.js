import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

// Load .env.local from the project root
dotenv.config({ path: path.resolve(process.cwd(), "../.env.local") });

// Use service role key since this is a backend service
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("⚠️ Supabase credentials not found. Room persistence will be disabled.");
}

export const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;
