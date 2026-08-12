-- ============================================================
-- 20260718300000_exclude_not_coming_from_assigned.sql
-- Update get_operator_stats RPC to exclude 'Not Coming' status
-- from the total_assigned count.
-- ============================================================

CREATE OR REPLACE FUNCTION get_operator_stats(p_operator_id UUID)
RETURNS TABLE (
    total_assigned   BIGINT,
    total_pending    BIGINT,
    total_coming     BIGINT,
    total_not_coming BIGINT,
    total_callback   BIGINT,
    -- Legacy fields
    total_completed  BIGINT,
    total_called     BIGINT,
    total_confirmed  BIGINT,
    call_success_pct NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        -- Assigned count includes only active assignments (Pending, Coming, Callback)
        COUNT(*) FILTER (WHERE ca.is_active = TRUE)                      AS total_assigned,
        COUNT(*) FILTER (WHERE ca.status = 'Pending' AND ca.is_active = TRUE) AS total_pending,
        COUNT(*) FILTER (WHERE ca.status = 'Coming' AND ca.is_active = TRUE)  AS total_coming,
        -- Not Coming count includes all (inactive) Not Coming assignments
        COUNT(*) FILTER (WHERE ca.status = 'Not Coming')                AS total_not_coming,
        COUNT(*) FILTER (WHERE ca.status = 'Callback Required' AND ca.is_active = TRUE) AS total_callback,
        
        -- Legacy completed = Coming
        COUNT(*) FILTER (WHERE ca.status = 'Coming' AND ca.is_active = TRUE)  AS total_completed,
        -- Legacy called = anything not Pending (including Not Coming)
        COUNT(*) FILTER (WHERE ca.status <> 'Pending')                  AS total_called,
        -- Legacy confirmed = Coming
        COUNT(*) FILTER (WHERE ca.status = 'Coming' AND ca.is_active = TRUE)  AS total_confirmed,
        
        -- Success rate = Coming / (Coming + Pending + Callback + Not Coming)
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(
                COUNT(*) FILTER (WHERE ca.status = 'Coming' AND ca.is_active = TRUE)::NUMERIC
                / COUNT(*)::NUMERIC * 100, 1
            )
        END                                                              AS call_success_pct
    FROM contact_assignments ca
    WHERE ca.operator_id = p_operator_id
      AND (ca.is_active = TRUE OR ca.status = 'Not Coming');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
