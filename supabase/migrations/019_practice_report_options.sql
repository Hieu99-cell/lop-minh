-- Report selectors must use the selected mode, including classes with only
-- practice attempts. Keep official scoring/ranking restricted to exam rows.
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('private.result_report_page_data(jsonb,integer,integer)'::regprocedure);
 if position('private.report_rows(''{}'',v_admin)' in body)=0 then raise exception 'Unexpected report definition';end if;
 execute replace(body,'private.report_rows(''{}'',v_admin)',
 'private.report_rows(jsonb_build_object(''mode'',coalesce(p_scope->>''mode'',''exam'')),v_admin)');
end;
$migration$;
revoke all on function private.result_report_page_data(jsonb,integer,integer) from public,anon,authenticated;
