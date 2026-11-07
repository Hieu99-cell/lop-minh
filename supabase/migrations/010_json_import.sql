-- Chỉ thêm nguồn JSON riêng tư; không thay câu hỏi, khóa đáp án và điểm đã có.
create table private.json_question_sources(
 question_id uuid primary key references public.questions on delete cascade,
 package_id uuid not null,external_id text not null check(external_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
 answer_origin text not null check(answer_origin in ('document','ai','teacher','unconfirmed')),
 confirmed boolean not null default false
);
create table private.json_imports(
 created_by uuid not null references public.profiles,package_id uuid not null,
 exam_id uuid not null references public.exams on delete cascade,created_at timestamptz not null default now(),
 primary key(created_by,package_id)
);
revoke all on private.json_question_sources,private.json_imports from public,anon,authenticated;
alter function private.question_ready(uuid) rename to question_ready_before_json;
create function private.question_ready(qid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.question_ready_before_json(qid) and not exists(select 1 from private.json_question_sources s where s.question_id=qid and (not s.confirmed or s.answer_origin='unconfirmed'));
$$;
revoke all on function private.question_ready(uuid) from public,anon,authenticated;
alter function public.save_exam(jsonb,jsonb,uuid) rename to save_exam_before_json;
alter function public.save_exam_before_json(jsonb,jsonb,uuid) set schema private;
revoke all on function private.save_exam_before_json(jsonb,jsonb,uuid),private.question_ready_before_json(uuid) from public,anon,authenticated;
create function public.save_exam(p_exam jsonb,p_questions jsonb,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid;item jsonb;s jsonb;n integer:=0;question uuid;
begin
 if not public.is_admin() then raise exception 'Không có quyền quản trị';end if;
 if exists(select 1 from jsonb_array_elements(p_questions) q where q->'json_source' is not null and q->'json_source'<>'null'::jsonb group by q->'json_source'->>'package_id',q->'json_source'->>'question_id' having count(*)>1) then raise exception 'ID câu JSON bị trùng';end if;
 if p_id is null and nullif(p_exam->>'request_id','') is not null then
 perform pg_advisory_xact_lock(hashtextextended('exam:'||(p_exam->>'request_id')::uuid::text,0));
 select id into eid from public.exams where creation_key=(p_exam->>'request_id')::uuid;
 if eid is not null then return eid;end if;
 end if;
 -- Hàm cũ giữ khóa chống tạo trùng và khóa đề đã có lượt; chỉ công bố sau khi lưu provenance.
 eid:=private.save_exam_before_json(p_exam||jsonb_build_object('status','draft'),p_questions,p_id);
 for item in select * from jsonb_array_elements(p_questions) loop
 n:=n+1;s:=item->'json_source';
 if s is not null and s<>'null'::jsonb then
 if coalesce(s->>'question_id','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' or s->>'package_id' is null or s->>'answer_origin' is null or s->>'confirmed' is null then raise exception 'Câu %: nguồn JSON không hợp lệ',n;end if;
 select id into question from public.questions where exam_id=eid and position=n;
 insert into private.json_question_sources(question_id,package_id,external_id,answer_origin,confirmed)
 values(question,(s->>'package_id')::uuid,s->>'question_id',s->>'answer_origin',(s->>'confirmed')::boolean)
 on conflict(question_id) do nothing;
 end if;end loop;
 if p_exam->>'status'='published' and exists(select 1 from public.questions where exam_id=eid and not private.question_ready(id)) then raise exception 'Đề còn thiếu nội dung, đáp án hoặc xác nhận giáo viên';end if;
 update public.exams set status=p_exam->>'status' where id=eid;
 return eid;
end; $$;
alter function public.author_exam(uuid) rename to author_exam_before_json;
alter function public.author_exam_before_json(uuid) set schema private;
revoke all on function private.author_exam_before_json(uuid) from public,anon,authenticated;
create function public.author_exam(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;questions jsonb;
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 result:=private.author_exam_before_json(p_id);
 select jsonb_agg(q.value||case when s.question_id is null then '{}'::jsonb else jsonb_build_object('json_source',jsonb_build_object('package_id',s.package_id,'question_id',s.external_id,'answer_origin',s.answer_origin,'confirmed',s.confirmed)) end order by q.n) into questions
 from jsonb_array_elements(result->'questions') with ordinality q(value,n) left join private.json_question_sources s on s.question_id=(q.value->>'id')::uuid;
 return result||jsonb_build_object('questions',coalesce(questions,'[]'));
end; $$;
-- Giữ nguồn và xác nhận khi sao chép; UUID database đổi, external_id không đổi.
alter function public.exam_action(uuid,text) rename to exam_action_before_json;
alter function public.exam_action_before_json(uuid,text) set schema private;
revoke all on function private.exam_action_before_json(uuid,text) from public,anon,authenticated;
create function public.exam_action(p_id uuid,p_action text) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 if p_action='published' and exists(select 1 from public.questions where exam_id=p_id and not private.question_ready(id)) then raise exception 'Đề thiếu đáp án hoặc xác nhận giáo viên';end if;
 eid:=private.exam_action_before_json(p_id,p_action);
 if p_action='copy' then
 insert into private.json_question_sources(question_id,package_id,external_id,answer_origin,confirmed)
 select fresh.id,s.package_id,s.external_id,s.answer_origin,s.confirmed from public.questions old join private.json_question_sources s on s.question_id=old.id join public.questions fresh on fresh.exam_id=eid and fresh.position=old.position where old.exam_id=p_id;
 end if;return eid;
end; $$;
create function public.save_json_import(p_package uuid,p_exam jsonb,p_questions jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 if p_package is null then raise exception 'Thiếu package_id';end if;
 perform pg_advisory_xact_lock(hashtextextended('json-import:'||auth.uid()::text||p_package::text,0));
 select exam_id into eid from private.json_imports where created_by=auth.uid() and package_id=p_package;
 if eid is not null then return eid;end if;
 if exists(select 1 from jsonb_array_elements(p_questions) q where q->'json_source'->>'package_id' is distinct from p_package::text) or
 (select count(distinct q->'json_source'->>'question_id') from jsonb_array_elements(p_questions) q)<>jsonb_array_length(p_questions) then raise exception 'ID câu hoặc gói JSON không hợp lệ';end if;
 if (select count(*) from private.json_imports where created_by=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Tối đa 20 đề JSON mỗi giờ';end if;
 eid:=public.save_exam((p_exam-'request_id')||jsonb_build_object('status','draft'),p_questions,null);
 insert into private.json_imports(created_by,package_id,exam_id) values(auth.uid(),p_package,eid);return eid;
end; $$;
revoke all on function public.save_exam(jsonb,jsonb,uuid),public.author_exam(uuid),public.exam_action(uuid,text),public.save_json_import(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_exam(jsonb,jsonb,uuid),public.author_exam(uuid),public.exam_action(uuid,text),public.save_json_import(uuid,jsonb,jsonb) to authenticated;
