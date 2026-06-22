-- 1. Create a table for Encrypted API Keys
CREATE TABLE public.user_api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'openai', 'anthropic', 'google'
    encrypted_key TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can insert their own api keys" ON public.user_api_keys
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own api keys" ON public.user_api_keys
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own api keys" ON public.user_api_keys
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own api keys" ON public.user_api_keys
    FOR DELETE USING (auth.uid() = user_id);

-- 2. Create a table for persistent Room State (Yjs snapshots)
CREATE TABLE public.rooms (
    id TEXT PRIMARY KEY,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT,
    state_vector BYTEA,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Everyone can read rooms for now (collaborative)
CREATE POLICY "Anyone can view rooms" ON public.rooms
    FOR SELECT USING (true);

-- Anyone can insert a room (if authenticated)
CREATE POLICY "Authenticated users can create rooms" ON public.rooms
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Service role needs bypass for updates (Node.js WebSocket server will update this)
CREATE POLICY "Service role can update rooms" ON public.rooms
    FOR UPDATE USING (true);

-- 3. Workspaces (Team Collaboration)
CREATE TABLE public.workspaces (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    avatar_url TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view public workspaces" ON public.workspaces
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create workspaces" ON public.workspaces
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = created_by);

CREATE POLICY "Owners can update workspaces" ON public.workspaces
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = id AND user_id = auth.uid() AND role = 'owner'
        )
    );

CREATE POLICY "Owners can delete workspaces" ON public.workspaces
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = id AND user_id = auth.uid() AND role = 'owner'
        )
    );

-- 4. Workspace Members (RBAC)
CREATE TABLE public.workspace_members (
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
    invited_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view workspace members" ON public.workspace_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = workspace_members.workspace_id AND wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners can manage members" ON public.workspace_members
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = workspace_members.workspace_id AND user_id = auth.uid() AND role = 'owner'
        )
    );

CREATE POLICY "Owners can update members" ON public.workspace_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = workspace_members.workspace_id AND user_id = auth.uid() AND role = 'owner'
        )
    );

CREATE POLICY "Owners can remove members" ON public.workspace_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = workspace_members.workspace_id AND user_id = auth.uid() AND role = 'owner'
        )
    );

-- 5. Templates (Public Forks)
CREATE TABLE public.templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_room_id TEXT REFERENCES public.rooms(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT,
    language TEXT DEFAULT 'javascript',
    fork_count INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT true,
    preview_image_url TEXT,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view public templates" ON public.templates
    FOR SELECT USING (is_public = true);

CREATE POLICY "Authenticated users can create templates" ON public.templates
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id);

CREATE POLICY "Authors can update their templates" ON public.templates
    FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete their templates" ON public.templates
    FOR DELETE USING (auth.uid() = author_id);

-- 6. GitHub Connections (Encrypted tokens)
CREATE TABLE public.github_connections (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    github_username TEXT NOT NULL,
    github_user_id INTEGER,
    encrypted_token TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own github connection" ON public.github_connections
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own github connection" ON public.github_connections
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own github connection" ON public.github_connections
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own github connection" ON public.github_connections
    FOR DELETE USING (auth.uid() = user_id);

-- 7. Add workspace_id to rooms (optional assignment)
ALTER TABLE public.rooms ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- 8. Enable pgvector extension for RAG
CREATE EXTENSION IF NOT EXISTS vector;

-- 9. File Embeddings (Codebase RAG)
CREATE TABLE public.file_embeddings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(room_id, file_path)
);

ALTER TABLE public.file_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view file embeddings" ON public.file_embeddings
    FOR SELECT USING (true);

CREATE POLICY "Service role can manage embeddings" ON public.file_embeddings
    FOR ALL USING (true);

-- Vector similarity search index
CREATE INDEX ON public.file_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Match function for RAG
CREATE OR REPLACE FUNCTION match_file_embeddings(
  p_room_id TEXT,
  p_query_embedding vector(1536),
  p_match_count INT DEFAULT 3
)
RETURNS TABLE (
  file_path TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fe.file_path,
    fe.content,
    1 - (fe.embedding <=> p_query_embedding) AS similarity
  FROM public.file_embeddings fe
  WHERE fe.room_id = p_room_id
  ORDER BY fe.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;
