-- Confirmation provenance remains stored, but never gates saving/publishing.
create or replace function private.question_ready(qid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.question_ready_before_json(qid) and exists(select 1 from public.questions where id=qid and (kind<>'boolean_group' or jsonb_array_length(options)=4));
$$;
create table private.exam_edits(
 exam_id uuid references public.exams on delete cascade, request_id uuid not null,
 version integer not null, created_at timestamptz not null default now(),primary key(exam_id,request_id)
);
revoke all on private.exam_edits from public,anon,authenticated;
create function public.preview_exam_schedule(p_id uuid,p_duration integer,p_opens timestamptz,p_closes timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 if not exists(select 1 from public.exams where id=p_id) then raise exception 'Không tìm thấy đề';end if;
 if p_duration is not null and p_duration not between 1 and 360 or p_opens is not null and p_closes is not null and p_closes<=p_opens then raise exception 'Lịch không hợp lệ';end if;
 return (select jsonb_build_object('server_now',now(),'active_count',count(*),
 'expire_now',count(*) filter(where private.attempt_deadline(started_at,p_duration,p_closes)<=now()),
 'unlimited_count',count(*) filter(where private.attempt_deadline(started_at,p_duration,p_closes) is null),
 'earliest_deadline',min(private.attempt_deadline(started_at,p_duration,p_closes)))
 from public.attempts where exam_id=p_id and status='in_progress' and (deadline is null or deadline>now()));
end;$$;

create or replace function public.save_exam(p_exam jsonb,p_questions jsonb,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid;e public.exams;item jsonb;oldq jsonb;previous jsonb:='[]';source jsonb;qid uuid;opt jsonb;correct jsonb;n integer:=0;
 request_key uuid:=nullif(p_exam->>'request_id','')::uuid;scope text:=coalesce(p_exam->>'schedule_scope','future');a public.attempts;new_deadline timestamptz;t jsonb;r jsonb;refkey text;
begin
 if not public.is_admin() then raise exception 'Không có quyền quản trị';end if;
 if p_questions is null or jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions) not between 1 and 200 then raise exception 'Đề cần từ 1 đến 200 câu';end if;
 if scope not in ('future','active') then raise exception 'Phạm vi áp dụng lịch không hợp lệ';end if;
 if p_id is null and request_key is not null then
 perform pg_advisory_xact_lock(hashtextextended('exam:'||request_key::text,0));
 select id into eid from public.exams where creation_key=request_key;if eid is not null then return eid;end if;end if;
 if p_id is not null then
 select * into e from public.exams where id=p_id for update;if e.id is null then raise exception 'Không tìm thấy đề';end if;
 if request_key is not null and exists(select 1 from private.exam_edits where exam_id=p_id and request_id=request_key) then return p_id;end if;
 if p_exam ? 'base_version' and (p_exam->>'base_version')::integer<>e.version then raise exception 'Đề đã có bản sửa mới. Tải lại trước khi lưu';end if;
 if (p_exam->>'class_id')::uuid<>e.class_id then raise exception 'Không thể chuyển lớp của đề hiện có';end if;
 previous:=private.snapshot_questions(p_id);
 update public.exams set title=p_exam->>'title',description=coalesce(p_exam->>'description',''),instructions=coalesce(p_exam->>'instructions',''),status=p_exam->>'status',
 duration_minutes=(p_exam->>'duration_minutes')::integer,opens_at=(p_exam->>'opens_at')::timestamptz,closes_at=(p_exam->>'closes_at')::timestamptz,
 max_attempts=(p_exam->>'max_attempts')::integer,score_method=p_exam->>'score_method',shuffle_questions=(p_exam->>'shuffle_questions')::boolean,shuffle_options=(p_exam->>'shuffle_options')::boolean,
 score_release=p_exam->>'score_release',answer_release=p_exam->>'answer_release',version=version+1 where id=p_id returning id into eid;
 delete from public.questions where exam_id=eid;
 else
 insert into public.exams(class_id,title,description,instructions,status,duration_minutes,opens_at,closes_at,max_attempts,score_method,shuffle_questions,shuffle_options,score_release,answer_release,creation_key)
 values((p_exam->>'class_id')::uuid,p_exam->>'title',coalesce(p_exam->>'description',''),coalesce(p_exam->>'instructions',''),p_exam->>'status',(p_exam->>'duration_minutes')::integer,
 (p_exam->>'opens_at')::timestamptz,(p_exam->>'closes_at')::timestamptz,(p_exam->>'max_attempts')::integer,p_exam->>'score_method',(p_exam->>'shuffle_questions')::boolean,
 (p_exam->>'shuffle_options')::boolean,p_exam->>'score_release',p_exam->>'answer_release',request_key) returning id into eid;end if;
 for item in select * from jsonb_array_elements(p_questions) loop
 n:=n+1;opt:=coalesce(item->'options','[]');correct:=coalesce(item->'correct_ids','[]');
 if jsonb_typeof(opt)<>'array' or jsonb_typeof(correct)<>'array' or jsonb_array_length(opt)>8 or jsonb_array_length(correct)>8 or length(coalesce(item->>'content',''))>10000 then raise exception 'Câu %: cấu trúc không hợp lệ',n;end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(opt) x)<>jsonb_array_length(opt) or exists(select 1 from jsonb_array_elements(opt) x where coalesce(x->>'id','')='' or x->>'id' like '%:%') then raise exception 'Câu %: ID lựa chọn trùng/không hợp lệ',n;end if;
 if (select count(distinct x) from jsonb_array_elements_text(correct) x)<>jsonb_array_length(correct) then raise exception 'Câu %: đáp án trùng',n;end if;
 if jsonb_typeof(coalesce(item->'tables','[]'))<>'array' or jsonb_array_length(coalesce(item->'tables','[]'))>8 then raise exception 'Câu %: bảng không hợp lệ',n;end if;
 for t in select * from jsonb_array_elements(coalesce(item->'tables','[]')) loop
 if jsonb_typeof(t->'headers') is distinct from 'array' or jsonb_typeof(t->'rows') is distinct from 'array' then raise exception 'Câu %: thiếu cột/hàng',n;end if;
 if jsonb_array_length(t->'headers') not between 1 and 12 or jsonb_array_length(t->'rows') not between 1 and 100 then raise exception 'Câu %: bảng vượt giới hạn',n;end if;
 for r in select * from jsonb_array_elements(t->'rows') loop if jsonb_typeof(r)<>'array' or jsonb_array_length(r)<>jsonb_array_length(t->'headers') then raise exception 'Câu %: bảng lệch cột',n;end if;end loop;end loop;
 insert into public.questions(exam_id,position,kind,content,image_path,options,points,section,scoring_mode,attachments,response_mode,tables)
 values(eid,n,item->>'kind',coalesce(item->>'content',''),nullif(item->>'image_path',''),opt,(item->>'points')::numeric,
 coalesce((item->>'section')::integer,case when item->>'kind'='short' then 3 when item->>'kind'='boolean_group' then 2 else 1 end),coalesce(item->>'scoring_mode','per_statement'),coalesce(item->'attachments','[]'),coalesce(item->'short_answer'->>'mode','numeric'),coalesce(item->'tables','[]')) returning id into qid;
 insert into private.answer_keys(question_id,correct_ids,explanation,short_answer) values(qid,correct,coalesce(item->>'explanation',''),nullif(item->'short_answer','null'::jsonb));
 select value into oldq from jsonb_array_elements(previous) where value->>'id'=item->>'id';
 refkey:=coalesce(nullif(item->>'import_key',''),nullif(oldq->>'import_key',''));
 if refkey is not null and not private.import_key_valid(refkey) then raise exception 'Câu %: nguồn ảnh không thuộc lô nhập hợp lệ',n;end if;
 if refkey is not null or jsonb_array_length(coalesce(item->'source_refs',oldq->'source_refs','[]'))>0 then
 insert into private.question_sources(question_id,import_key,source_refs) values(qid,refkey,coalesce(item->'source_refs',oldq->'source_refs','[]'));end if;
 -- Existing provenance is historical metadata, never reset by editing content.
 source:=coalesce(nullif(oldq->'json_source','null'::jsonb),nullif(item->'json_source','null'::jsonb));
 if source is not null then
 if coalesce(source->>'question_id','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' or source->>'package_id' is null or source->>'answer_origin' is null or source->>'confirmed' is null then raise exception 'Câu %: nguồn JSON không hợp lệ',n;end if;
 insert into private.json_question_sources(question_id,package_id,external_id,answer_origin,confirmed) values(qid,(source->>'package_id')::uuid,source->>'question_id',source->>'answer_origin',(source->>'confirmed')::boolean);end if;
 if p_exam->>'status'='published' and not private.question_ready(qid) then raise exception 'Câu % (Phần %): thiếu nội dung, lựa chọn hoặc đáp án hợp lệ',n,coalesce(item->>'section','1');end if;
 end loop;
 if exists(select 1 from private.json_question_sources s join public.questions q on q.id=s.question_id where q.exam_id=eid group by s.package_id,s.external_id having count(*)>1) then raise exception 'ID câu JSON bị trùng';end if;
 if p_id is not null and scope='active' then
 for a in select * from public.attempts where exam_id=eid and status='in_progress' order by id for update loop
 -- A previously expired deadline cannot be revived merely because cron is late.
 if a.deadline is not null and a.deadline<=now() then perform private.finish_attempt(a.id);continue;end if;
 new_deadline:=private.attempt_deadline(a.started_at,(p_exam->>'duration_minutes')::integer,(p_exam->>'closes_at')::timestamptz);
 update public.attempts set deadline=new_deadline,timing_revision=timing_revision+1 where id=a.id;
 if new_deadline is not null and new_deadline<=now() then perform private.finish_attempt(a.id);end if;end loop;end if;
 if request_key is not null then insert into private.exam_edits(exam_id,request_id,version) select eid,request_key,version from public.exams where id=eid;end if;
 return eid;
end;$$;

alter function public.author_exam(uuid) rename to author_exam_before_versions;
alter function public.author_exam_before_versions(uuid) set schema private;
create function public.author_exam(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin if not public.is_admin() then raise exception 'Không có quyền';end if;
 result:=private.author_exam_before_versions(p_id);
 return result||jsonb_build_object('locked',false,'active_attempts',(select count(*) from public.attempts where exam_id=p_id and status='in_progress' and (deadline is null or deadline>now())));end;$$;
alter function public.exam_action(uuid,text) rename to exam_action_before_versions;
alter function public.exam_action_before_versions(uuid,text) set schema private;
create function public.exam_action(p_id uuid,p_action text) returns uuid language plpgsql security definer set search_path='' as $$
declare q record;begin if not public.is_admin() then raise exception 'Không có quyền';end if;
 perform 1 from public.exams where id=p_id for update;if not found then raise exception 'Không tìm thấy đề';end if;
 if p_action='published' then
 if not exists(select 1 from public.questions where exam_id=p_id) then raise exception 'Đề chưa có câu hỏi';end if;
 for q in select position,section from public.questions where exam_id=p_id and not private.question_ready(id) order by section,position loop raise exception 'Câu % (Phần %): thiếu nội dung hoặc đáp án hợp lệ',q.position,q.section;end loop;
 update public.exams set status='published' where id=p_id;return p_id;end if;
 return private.exam_action_before_versions(p_id,p_action);end;$$;

-- Report rows also hide counts/section scores until both release policies allow.
create or replace function private.report_rows(p_scope jsonb,p_admin boolean)
returns table(id uuid,exam_id uuid,user_id uuid,started_at timestamptz,deadline timestamptz,submitted_at timestamptz,status text,exam_title text,class_id uuid,student_name text,class_name text,score_method text,score jsonb)
language sql stable set search_path='' as $$
 select a.id,a.exam_id,a.user_id,a.started_at,a.deadline,a.submitted_at,a.status,coalesce(snap.exam->>'title',e.title),e.class_id,p.full_name,c.name,e.score_method,
 case when a.status<>'in_progress' and (p_admin or private.released(e.score_release,e.closes_at)) then
 case when p_admin or private.released(e.answer_release,e.closes_at) then to_jsonb(s) else to_jsonb(s)-'correct'-'wrong'-'unanswered'-'sections' end else null end
 from public.attempts a join public.exams e on e.id=a.exam_id join public.classes c on c.id=e.class_id join public.profiles p on p.id=a.user_id
 left join private.scores s on s.attempt_id=a.id left join private.attempt_snapshots snap on snap.attempt_id=a.id
 where (p_admin or (a.user_id=auth.uid() and public.is_member(e.class_id)))
 and (nullif(p_scope->>'class_id','') is null or e.class_id=(p_scope->>'class_id')::uuid)
 and (nullif(p_scope->>'exam_id','') is null or e.id=(p_scope->>'exam_id')::uuid)
 and (nullif(p_scope->>'student','') is null or a.user_id=(p_scope->>'student')::uuid);
$$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.author_exam(uuid),public.exam_action(uuid,text),public.preview_exam_schedule(uuid,integer,timestamptz,timestamptz) from public,anon;
grant execute on function public.author_exam(uuid),public.exam_action(uuid,text),public.preview_exam_schedule(uuid,integer,timestamptz,timestamptz) to authenticated;
