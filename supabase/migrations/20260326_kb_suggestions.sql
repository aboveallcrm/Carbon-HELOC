-- ============================================
-- KB SUGGESTIONS: Ezra learning pipeline
-- Captures AI fallback responses as KB candidates
-- for admin review and approval
-- ============================================

-- 1. Table
CREATE TABLE IF NOT EXISTS kb_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_question TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    suggested_category TEXT NOT NULL DEFAULT 'general',
    suggested_title TEXT NOT NULL DEFAULT '',
    suggested_content TEXT NOT NULL DEFAULT '',
    confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    intent TEXT,
    model_used TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_suggestions_status ON kb_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_kb_suggestions_created ON kb_suggestions(created_at DESC);

-- 2. RLS
ALTER TABLE kb_suggestions ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can insert (capture pipeline runs in user's browser)
DROP POLICY IF EXISTS kb_suggestions_insert ON kb_suggestions;
CREATE POLICY kb_suggestions_insert ON kb_suggestions
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only admin/super_admin can read
DROP POLICY IF EXISTS kb_suggestions_select ON kb_suggestions;
CREATE POLICY kb_suggestions_select ON kb_suggestions
    FOR SELECT USING (
        auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    );

-- Only admin/super_admin can update (approve/reject)
DROP POLICY IF EXISTS kb_suggestions_update ON kb_suggestions;
CREATE POLICY kb_suggestions_update ON kb_suggestions
    FOR UPDATE USING (
        auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    );

-- 3. Allow admin/super_admin to INSERT into ezra_knowledge_base (approve flow)
DROP POLICY IF EXISTS ezra_kb_admin_insert ON ezra_knowledge_base;
CREATE POLICY ezra_kb_admin_insert ON ezra_knowledge_base
    FOR INSERT WITH CHECK (
        auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    );

-- ============================================
-- 4. RPC: get_pending_kb_suggestions
-- ============================================
CREATE OR REPLACE FUNCTION get_pending_kb_suggestions()
RETURNS SETOF kb_suggestions
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    caller_role TEXT;
BEGIN
    SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
    IF caller_role NOT IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
        SELECT * FROM kb_suggestions
        WHERE status = 'pending'
        ORDER BY created_at DESC;
END;
$$;

-- ============================================
-- 5. RPC: approve_kb_suggestion
-- Inserts into ezra_knowledge_base + marks approved
-- ============================================
CREATE OR REPLACE FUNCTION approve_kb_suggestion(
    p_id UUID,
    p_category TEXT,
    p_title TEXT,
    p_content TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    caller_role TEXT;
BEGIN
    SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
    IF caller_role NOT IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Insert into the live KB
    INSERT INTO ezra_knowledge_base (category, title, content, metadata, is_active)
    VALUES (
        p_category,
        p_title,
        p_content,
        jsonb_build_object('source', 'kb_suggestion', 'suggestion_id', p_id, 'approved_by', auth.uid()),
        true
    );

    -- Mark suggestion as approved
    UPDATE kb_suggestions
    SET status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        suggested_category = p_category,
        suggested_title = p_title,
        suggested_content = p_content
    WHERE id = p_id;
END;
$$;

-- ============================================
-- 6. RPC: reject_kb_suggestion
-- ============================================
CREATE OR REPLACE FUNCTION reject_kb_suggestion(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    caller_role TEXT;
BEGIN
    SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
    IF caller_role NOT IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    UPDATE kb_suggestions
    SET status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = NOW()
    WHERE id = p_id;
END;
$$;
