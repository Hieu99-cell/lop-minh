alter table public.questions add column response_mode text not null default 'numeric' check(response_mode in ('numeric','text'));
create or replace function public.save_exam(p_exam jsonb,p_questions jsonb,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid;item jsonb;qid uuid;opt jsonb;correct jsonb;n int:=0;request_key uuid:=nullif(p_exam->>'request_id','')::uuid;import_key text;
begin
 if not public.is_admin() then raise exception 'Không có quyền quản trị';end if;
 if jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions) not between 1 and 200 then raise exception 'Đề cần từ 1 đến 200 câu';end if;
 if p_id is null and request_key is not null then
 perform pg_advisory_xact_lock(hashtextextended('exam:'||request_key::text,0));
 select id into eid from public.exams where creation_key=request_key;
 if eid is not null then return eid;end if;
 end if;
 if p_id is not null then
 perform 1 from public.exams where id=p_id for update;
 if exists(select 1 from public.attempts where exam_id=p_id) then raise exception 'Đề đã có lượt làm. Hãy sao chép đề để tạo phiên bản mới.';end if;
 update public.exams set title=p_exam->>'title',description=coalesce(p_exam->>'description',''),instructions=coalesce(p_exam->>'instructions',''),status=p_exam->>'status',duration_minutes=(p_exam->>'duration_minutes')::int,opens_at=(p_exam->>'opens_at')::timestamptz,closes_at=(p_exam->>'closes_at')::timestamptz,max_attempts=(p_exam->>'max_attempts')::int,score_method=p_exam->>'score_method',shuffle_questions=(p_exam->>'shuffle_questions')::boolean,shuffle_options=(p_exam->>'shuffle_options')::boolean,score_release=p_exam->>'score_release',answer_release=p_exam->>'answer_release' where id=p_id returning id into eid;
 if eid is null then raise exception 'Không tìm thấy đề';end if;
 delete from public.questions where exam_id=eid;
 else
 insert into public.exams(class_id,title,description,instructions,status,duration_minutes,opens_at,closes_at,max_attempts,score_method,shuffle_questions,shuffle_options,score_release,answer_release,creation_key)
 values((p_exam->>'class_id')::uuid,p_exam->>'title',coalesce(p_exam->>'description',''),coalesce(p_exam->>'instructions',''),p_exam->>'status',(p_exam->>'duration_minutes')::int,(p_exam->>'opens_at')::timestamptz,(p_exam->>'closes_at')::timestamptz,(p_exam->>'max_attempts')::int,p_exam->>'score_method',(p_exam->>'shuffle_questions')::boolean,(p_exam->>'shuffle_options')::boolean,p_exam->>'score_release',p_exam->>'answer_release',request_key) returning id into eid;
 end if;
 for item in select * from jsonb_array_elements(p_questions) loop
 n:=n+1;opt:=coalesce(item->'options','[]');correct:=coalesce(item->'correct_ids','[]');
 if jsonb_typeof(opt)<>'array' or jsonb_typeof(correct)<>'array' or jsonb_array_length(opt)>8 or jsonb_array_length(correct)>8 or length(coalesce(item->>'content',''))>10000 then raise exception 'Câu % không hợp lệ',n;end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(opt) x)<>jsonb_array_length(opt) or exists(select 1 from jsonb_array_elements(opt) x where coalesce(x->>'id','')='' or x->>'id' like '%:%') then raise exception 'ID lựa chọn không hợp lệ';end if;
 if (select count(distinct x) from jsonb_array_elements_text(correct) x)<>jsonb_array_length(correct) then raise exception 'Đáp án trùng';end if;
 insert into public.questions(exam_id,position,kind,content,image_path,options,points,section,scoring_mode,attachments,response_mode)
 values(eid,n,item->>'kind',coalesce(item->>'content',''),nullif(item->>'image_path',''),opt,(item->>'points')::numeric,coalesce((item->>'section')::int,case when item->>'kind'='short' then 3 when item->>'kind'='boolean_group' then 2 else 1 end),coalesce(item->>'scoring_mode','per_statement'),coalesce(item->'attachments','[]'),coalesce(item->'short_answer'->>'mode','numeric')) returning id into qid;
 insert into private.answer_keys(question_id,correct_ids,explanation,short_answer) values(qid,correct,coalesce(item->>'explanation',''),nullif(item->'short_answer','null'::jsonb));
 import_key:=nullif(item->>'import_key','');
 if import_key is not null and not private.import_key_valid(import_key) then raise exception 'Câu nhập ảnh chưa được giáo viên xác nhận';end if;
 if import_key is not null or jsonb_array_length(coalesce(item->'source_refs','[]'))>0 then
 insert into private.question_sources(question_id,import_key,source_refs) values(qid,import_key,coalesce(item->'source_refs','[]'));
 end if;
 if p_exam->>'status'='published' and not private.question_ready(qid) then raise exception 'Câu % thiếu nội dung, lựa chọn hoặc đáp án. Hãy lưu nháp để bổ sung.',n;end if;
 end loop;return eid;
end; $$;
create or replace function public.author_exam(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 return (select to_jsonb(e)||jsonb_build_object('locked',exists(select 1 from public.attempts where exam_id=e.id),'questions',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('correct_ids',k.correct_ids,'explanation',k.explanation,'short_answer',k.short_answer,'source_refs',coalesce(s.source_refs,'[]'),'import_key',s.import_key) order by q.section,q.position) from public.questions q join private.answer_keys k on k.question_id=q.id left join private.question_sources s on s.question_id=q.id where q.exam_id=e.id),'[]')) from public.exams e where id=p_id);
end; $$;
create or replace function public.exam_action(p_id uuid,p_action text) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid;q record;qid uuid;e public.exams;
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 select * into e from public.exams where id=p_id for update;
 if e.id is null then raise exception 'Không tìm thấy đề';end if;
 if p_action='published' and (not exists(select 1 from public.questions where exam_id=p_id) or exists(select 1 from public.questions where exam_id=p_id and not private.question_ready(id))) then raise exception 'Đề còn thiếu nội dung hoặc đáp án, chưa thể công bố';end if;
 if p_action in ('published','archived') then update public.exams set status=p_action where id=p_id;return p_id;end if;
 if p_action<>'copy' then raise exception 'Thao tác không hợp lệ';end if;
 eid:=gen_random_uuid();e.id:=eid;e.title:=e.title||' (bản sao)';e.status:='draft';e.source_id:=p_id;e.version:=e.version+1;e.created_at:=now();e.creation_key:=null;
 insert into public.exams select e.*;
 for q in select * from public.questions where exam_id=p_id loop
 qid:=gen_random_uuid();
 insert into public.questions(id,exam_id,position,kind,content,image_path,options,points,section,scoring_mode,attachments,response_mode) values(qid,eid,q.position,q.kind,q.content,q.image_path,q.options,q.points,q.section,q.scoring_mode,q.attachments,q.response_mode);
 insert into private.answer_keys select qid,correct_ids,explanation,short_answer from private.answer_keys where question_id=q.id;
 insert into private.question_sources(question_id,source_refs) select qid,source_refs from private.question_sources where question_id=q.id;
 end loop;return eid;
end; $$;
-- Chỉ sắp thứ tự khi vừa tạo lượt. Lượt cũ giữ nguyên snapshot đã lưu.
alter function public.start_attempt(uuid) rename to start_attempt_base;
alter function public.start_attempt_base(uuid) set schema private;
create function public.start_attempt(p_exam uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare previous uuid;aid uuid;ordered jsonb;q record;
begin
 select id into previous from public.attempts where exam_id=p_exam and user_id=auth.uid() and status='in_progress';
 aid:=private.start_attempt_base(p_exam);
 if aid is distinct from previous then
 select jsonb_agg(o.value order by qs.section,o.n) into ordered from public.attempts a,jsonb_array_elements(a.question_order) with ordinality o(value,n) join public.questions qs on qs.id=(o.value#>>'{}')::uuid where a.id=aid;
 update public.attempts set question_order=ordered where id=aid;
 for q in select * from public.questions where exam_id=p_exam and kind='boolean_group' loop
 update public.attempts set option_order=jsonb_set(option_order,array[q.id::text],(select jsonb_agg(o->>'id') from jsonb_array_elements(q.options) o)) where id=aid;
 end loop;
 end if;return aid;
end; $$;
revoke all on function public.start_attempt(uuid) from public,anon;
grant execute on function public.start_attempt(uuid) to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
