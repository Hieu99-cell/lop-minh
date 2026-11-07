-- Nội dung bảng là JSON văn bản. Cột mới không đổi câu/điểm/lịch sử cũ.
alter table public.questions add column tables jsonb not null default '[]' check(jsonb_typeof(tables)='array' and jsonb_array_length(tables)<=8);
alter function public.save_exam(jsonb,jsonb,uuid) rename to save_exam_before_tables;
alter function public.save_exam_before_tables(jsonb,jsonb,uuid) set schema private;
revoke all on function private.save_exam_before_tables(jsonb,jsonb,uuid) from public,anon,authenticated;
create function public.save_exam(p_exam jsonb,p_questions jsonb,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid;item jsonb;t jsonb;r jsonb;n integer:=0;
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 if p_id is null and nullif(p_exam->>'request_id','') is not null then
 perform pg_advisory_xact_lock(hashtextextended('exam:'||(p_exam->>'request_id')::uuid::text,0));
 select id into eid from public.exams where creation_key=(p_exam->>'request_id')::uuid;
 if eid is not null then return eid;end if;end if;
 for item in select * from jsonb_array_elements(p_questions) loop
 if jsonb_typeof(coalesce(item->'tables','[]'))<>'array' or jsonb_array_length(coalesce(item->'tables','[]'))>8 then raise exception 'Bảng không hợp lệ';end if;
 for t in select * from jsonb_array_elements(coalesce(item->'tables','[]')) loop
 if jsonb_typeof(t->'headers') is distinct from 'array' or jsonb_typeof(t->'rows') is distinct from 'array' then raise exception 'Thiếu cột/hàng của bảng';end if;
 if jsonb_array_length(t->'headers') not between 1 and 12 or jsonb_array_length(t->'rows') not between 1 and 100 then raise exception 'Bảng vượt giới hạn';end if;
 for r in select * from jsonb_array_elements(t->'rows') loop
 if jsonb_typeof(r)<>'array' or jsonb_array_length(r)<>jsonb_array_length(t->'headers') then raise exception 'Số ô không khớp số cột';end if;end loop;
 end loop;end loop;
 eid:=private.save_exam_before_tables(p_exam,p_questions,p_id);
 for item in select * from jsonb_array_elements(p_questions) loop
 n:=n+1;update public.questions set tables=coalesce(item->'tables','[]') where exam_id=eid and position=n;
 end loop;return eid;
end; $$;
alter function public.exam_action(uuid,text) rename to exam_action_before_tables;
alter function public.exam_action_before_tables(uuid,text) set schema private;
revoke all on function private.exam_action_before_tables(uuid,text) from public,anon,authenticated;
create function public.exam_action(p_id uuid,p_action text) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 eid:=private.exam_action_before_tables(p_id,p_action);
 if p_action='copy' then update public.questions fresh set tables=old.tables from public.questions old where old.exam_id=p_id and fresh.exam_id=eid and fresh.position=old.position;end if;
 return eid;
end; $$;
revoke all on function public.save_exam(jsonb,jsonb,uuid),public.exam_action(uuid,text) from public,anon;
grant execute on function public.save_exam(jsonb,jsonb,uuid),public.exam_action(uuid,text) to authenticated;
