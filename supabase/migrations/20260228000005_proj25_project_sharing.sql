-- PROJ-25: Project Sharing (within tenant)
-- Creates the project_shares table, RLS policies, and indexes.

CREATE TABLE IF NOT EXISTS public.project_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  shared_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- RLS
ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;

-- Policy: Owner of the project can do everything on shares
CREATE POLICY "Project owner can manage shares"
  ON public.project_shares
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_shares.project_id
        AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_shares.project_id
        AND p.owner_id = auth.uid()
    )
  );

-- Policy: Shared user can see their own share records
CREATE POLICY "User can view own shares"
  ON public.project_shares
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Shared user can delete their own share (leave project)
CREATE POLICY "User can leave shared project"
  ON public.project_shares
  FOR DELETE
  USING (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_project_shares_project ON public.project_shares(project_id);
CREATE INDEX idx_project_shares_user ON public.project_shares(user_id);

-- Extend projects RLS: allow shared users to SELECT projects they have access to
CREATE POLICY "Shared user can view project"
  ON public.projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_shares ps
      WHERE ps.project_id = projects.id
        AND ps.user_id = auth.uid()
    )
  );

-- Extend projects RLS: allow shared users with 'edit' permission to UPDATE
CREATE POLICY "Shared user with edit can update project"
  ON public.projects
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_shares ps
      WHERE ps.project_id = projects.id
        AND ps.user_id = auth.uid()
        AND ps.permission = 'edit'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_shares ps
      WHERE ps.project_id = projects.id
        AND ps.user_id = auth.uid()
        AND ps.permission = 'edit'
    )
  );
