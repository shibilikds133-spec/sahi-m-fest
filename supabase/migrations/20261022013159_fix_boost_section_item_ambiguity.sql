BEGIN;

-- The section validator is called by the points_config write trigger, including
-- when both boost lists are empty. Keep loop variables distinct from SQL columns.
CREATE OR REPLACE FUNCTION scoring_private.validate_boost_sections(p jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE family text; sections jsonb; section jsonb; sid text; seen_ids text[]; seen_items text[];
  v_item text; point_map jsonb; bracket jsonb; point_values jsonb; idx integer; point_family text; bracket_rows jsonb; BEGIN
  FOREACH family IN ARRAY ARRAY['grade_boost_sections','rank_boost_sections'] LOOP
    sections:=p->family;
    IF jsonb_typeof(sections) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid boost sections.'; END IF;
    seen_ids:='{}'; seen_items:='{}'; idx:=0;
    FOR section IN SELECT value FROM jsonb_array_elements(sections) LOOP
      idx:=idx+1; sid:=section->>'id';
      IF sid IS NULL OR sid='' OR sid=ANY(seen_ids) THEN RAISE EXCEPTION 'Boost section IDs must be unique.'; END IF;
      seen_ids:=array_append(seen_ids,sid);
      IF jsonb_typeof(section->'item_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid competition list in Section %.',idx; END IF;
      FOR v_item IN SELECT jsonb_array_elements_text(section->'item_ids') LOOP
        IF v_item=ANY(seen_items) THEN RAISE EXCEPTION 'A competition can belong to only one % section.',CASE WHEN family='grade_boost_sections' THEN 'Grade Boost' ELSE 'Rank Boost' END; END IF;
        PERFORM v_item::uuid; seen_items:=array_append(seen_items,v_item);
      END LOOP;
      IF family='rank_boost_sections' AND cardinality(ARRAY(SELECT jsonb_array_elements_text(section->'item_ids')))>0 THEN
        point_values:=section->'points';
        IF jsonb_typeof(point_values) IS DISTINCT FROM 'array' OR jsonb_array_length(point_values)<>3 THEN RAISE EXCEPTION 'Complete Rank Boost points in Section %.',idx; END IF;
        FOR bracket IN SELECT value FROM jsonb_array_elements(point_values) LOOP PERFORM scoring_private.whole(bracket); END LOOP;
      ELSIF family='grade_boost_sections' AND cardinality(ARRAY(SELECT jsonb_array_elements_text(section->'item_ids')))>0 THEN
        FOREACH point_family IN ARRAY ARRAY['points','group_points'] LOOP
          IF point_family='group_points' AND NOT (p->>'separate_group_brackets')::boolean THEN CONTINUE; END IF;
          point_map:=section->point_family;
          IF point_map IS NULL OR jsonb_typeof(point_map) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Complete Grade Boost points in Section %.',idx; END IF;
          bracket_rows:=CASE WHEN point_family='group_points' THEN p->'group_point_brackets' ELSE p->'point_brackets' END;
          FOR bracket IN SELECT value FROM jsonb_array_elements(bracket_rows) LOOP
            IF COALESCE((bracket->>'enabled')::boolean,true) THEN
              point_values:=point_map->(bracket->>'key');
              IF jsonb_typeof(point_values) IS DISTINCT FROM 'array' OR jsonb_array_length(point_values)<>4 THEN RAISE EXCEPTION 'Complete Grade Boost points in Section % for bracket %.',idx,bracket->>'key'; END IF;
              FOR v_item IN SELECT jsonb_array_elements_text(point_values) LOOP PERFORM scoring_private.whole(to_jsonb(v_item::numeric)); END LOOP;
            END IF;
          END LOOP;
        END LOOP;
      END IF;
    END LOOP;
    IF family='grade_boost_sections' THEN
      IF COALESCE((SELECT array_agg(DISTINCT value ORDER BY value) FROM jsonb_array_elements_text(p->'grade_boost_item_ids') value),'{}'::text[])
        IS DISTINCT FROM COALESCE((SELECT array_agg(DISTINCT section_items.item_id ORDER BY section_items.item_id)
          FROM jsonb_array_elements(p->family) AS section_rows(section_data)
          CROSS JOIN LATERAL jsonb_array_elements_text(section_rows.section_data->'item_ids') AS section_items(item_id)),'{}'::text[])
        THEN RAISE EXCEPTION 'Grade Boost competition list does not match its sections.'; END IF;
    ELSE
      IF COALESCE((SELECT array_agg(DISTINCT value ORDER BY value) FROM jsonb_array_elements_text(p->'rank_boost_item_ids') value),'{}'::text[])
        IS DISTINCT FROM COALESCE((SELECT array_agg(DISTINCT section_items.item_id ORDER BY section_items.item_id)
          FROM jsonb_array_elements(p->family) AS section_rows(section_data)
          CROSS JOIN LATERAL jsonb_array_elements_text(section_rows.section_data->'item_ids') AS section_items(item_id)),'{}'::text[])
        THEN RAISE EXCEPTION 'Rank Boost competition list does not match its sections.'; END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
