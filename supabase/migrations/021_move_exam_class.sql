-- Attempts belong to the class in which they started, independently of the
-- current class of the editable exam. Do not rewrite immutable snapshots.
alter table public.attempts add column class_id uuid references public.classes;
update public.attempts a set class_id=coalesce(
 (select c.id from private.attempt_snapshots s join public.classes c on c.id=(s.exam->>'class_id')::uuid where s.attempt_id=a.id),
 (select e.class_id from public.exams e where e.id=a.exam_id));
alter table public.attempts alter column class_id set not null;
create index attempts_class_idx on public.attempts(class_id);
drop index public.one_active_attempt;
create unique index one_active_attempt on public.attempts(exam_id,user_id,mode,class_id) where status='in_progress';
create function private.attempt_class() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then select class_id into new.class_id from public.exams where id=new.exam_id;
 elsif new.class_id is distinct from old.class_id then raise exception 'Không đổi lớp gốc của lượt làm';end if;
 return new;
end;$$;
create trigger attempt_class_insert before insert on public.attempts for each row execute function private.attempt_class();
create trigger attempt_class_immutable before update of class_id on public.attempts for each row execute function private.attempt_class();
drop policy attempt_read on public.attempts;
create policy attempt_read on public.attempts for select to authenticated using(public.is_admin() or (user_id=auth.uid() and public.is_member(class_id)));

create or replace function private.check_attempt(p_id uuid) returns public.attempts language plpgsql security definer set search_path='' as $$
declare a public.attempts;begin
 select * into a from public.attempts where id=p_id for update;
 if a.id is null or not(public.is_admin() or (a.user_id=auth.uid() and public.is_member(a.class_id))) then raise exception 'Không có quyền xem lượt làm';end if;
 if a.status='in_progress' and a.deadline is not null and now()>=a.deadline then perform private.finish_attempt(a.id);select * into a from public.attempts where id=p_id;end if;
 return a;end;$$;

alter function public.save_exam(jsonb,jsonb,uuid) rename to save_exam_before_class_move;
alter function public.save_exam_before_class_move(jsonb,jsonb,uuid) set schema private;
create function public.save_exam(p_exam jsonb,p_questions jsonb,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.exams;dest uuid:=(p_exam->>'class_id')::uuid;key uuid:=nullif(p_exam->>'request_id','')::uuid;eid uuid;begin
 if not public.is_admin() then raise exception 'Không có quyền quản trị';end if;
 if p_id is null then return private.save_exam_before_class_move(p_exam,p_questions,p_id);end if;
 select * into e from public.exams where id=p_id for update;if e.id is null then raise exception 'Không tìm thấy đề';end if;
 if key is not null and exists(select 1 from private.exam_edits where exam_id=p_id and request_id=key) then return p_id;end if;
 if dest is null then raise exception 'Lớp nhận đề không hợp lệ';end if;
 if dest<>e.class_id and not exists(select 1 from public.classes where id=dest and not archived) then raise exception 'Lớp nhận đề không tồn tại hoặc đã lưu trữ';end if;
 -- The versioning core still sees the source class; only after all its
 -- validation/schedule/idempotency work succeeds do we move the same exam ID.
 eid:=private.save_exam_before_class_move(jsonb_set(p_exam,'{class_id}',to_jsonb(e.class_id)),p_questions,p_id);
 if dest<>e.class_id then update public.exams set class_id=dest where id=eid;end if;
 return eid;
end;$$;

alter function public.get_attempt(uuid) rename to get_attempt_before_class_move;
alter function public.get_attempt_before_class_move(uuid) set schema private;
create function public.get_attempt(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin r:=private.get_attempt_before_class_move(p_id);
 return r||jsonb_build_object('can_open_exam',(select public.is_admin() or (e.status='published' and public.is_member(e.class_id)) from public.exams e where e.id=(r->>'exam_id')::uuid));end;$$;

alter function public.attempt_result(uuid) rename to attempt_result_before_class_move;
alter function public.attempt_result_before_class_move(uuid) set schema private;
create function public.attempt_result(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin r:=private.attempt_result_before_class_move(p_id);
 return r||jsonb_build_object('class_id',(select class_id from public.attempts where id=p_id),'can_open_exam',(select public.is_admin() or (e.status='published' and public.is_member(e.class_id)) from public.exams e where e.id=(r->>'exam_id')::uuid));end;$$;

-- Update precisely the existing authenticated query bodies, not their release
-- rules, scores or question payloads. These assertions fail closed on drift.
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('public.start_mode_attempt(uuid,text)'::regprocedure);
 if position('and mode=p_mode' in body)=0 then raise exception 'Unexpected start definition';end if;
 execute replace(body,'and mode=p_mode','and mode=p_mode and class_id=e.class_id');
 body:=pg_get_functiondef('public.can_read_classroom_image(text)'::regprocedure);
 if position('a.user_id=auth.uid() and public.is_member(e.class_id)' in body)=0 then raise exception 'Unexpected image permission definition';end if;
 execute replace(body,'a.user_id=auth.uid() and public.is_member(e.class_id)','a.user_id=auth.uid() and public.is_member(a.class_id)');
 body:=pg_get_functiondef('private.report_rows(jsonb,boolean)'::regprocedure);
 if position('e.class_id' in body)=0 then raise exception 'Unexpected report row definition';end if;
 execute replace(body,'e.class_id','a.class_id');
 body:=pg_get_functiondef('private.result_report_page_data(jsonb,integer,integer)'::regprocedure);
 if position('a.user_id=auth.uid() and public.is_member(e.class_id)' in body)=0 then raise exception 'Unexpected report expiration definition';end if;
 body:=replace(body,'a.user_id=auth.uid() and public.is_member(e.class_id)','a.user_id=auth.uid() and public.is_member(a.class_id)');
 body:=replace(body,'e.class_id=(p_scope->>''class_id'')::uuid','a.class_id=(p_scope->>''class_id'')::uuid');
 body:=replace(body,'partition by user_id,exam_id order by','partition by user_id,exam_id,class_id order by');
 body:=replace(body,'return result;','if v_admin and nullif(p_scope->>''class_id'','''') is null and nullif(p_scope->>''exam_id'','''') is not null and exists(select 1 from public.attempts where exam_id=(p_scope->>''exam_id'')::uuid and class_id<>cid) then result:=result-''memberCount'';end if; return result;');
 execute body;
end;$migration$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.save_exam(jsonb,jsonb,uuid),public.get_attempt(uuid),public.attempt_result(uuid) from public,anon;
grant execute on function public.save_exam(jsonb,jsonb,uuid),public.get_attempt(uuid),public.attempt_result(uuid) to authenticated;
