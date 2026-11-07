-- Explicit NULL must not turn LIMIT into an unbounded query through Data API.
-- 013 has already been applied; keep its implementation and add this guard.
alter function public.result_report_page(jsonb,integer,integer) set schema private;
alter function private.result_report_page(jsonb,integer,integer) rename to result_report_page_data;
revoke all on function private.result_report_page_data(jsonb,integer,integer) from public,anon,authenticated;
create function public.result_report_page(p_scope jsonb default '{}',p_page integer default 1,p_size integer default 10)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Vui lòng đăng nhập';end if;
 if p_scope is null or jsonb_typeof(p_scope)<>'object'
 or p_page is null or p_size is null or p_page<1 or p_page>1000000 or p_size<1 or p_size>500
 then raise exception 'Phân trang không hợp lệ';end if;
 return private.result_report_page_data(p_scope,p_page,p_size);
end;$$;
revoke all on function public.result_report_page(jsonb,integer,integer) from public,anon;
grant execute on function public.result_report_page(jsonb,integer,integer) to authenticated;
