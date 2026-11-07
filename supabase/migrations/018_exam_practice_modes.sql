-- Independent modes. Existing rows retain real-exam behavior.
alter table public.exams add column exam_enabled boolean not null default true;
alter table public.exams add column practice_enabled boolean not null default false;
alter table public.attempts add column mode text not null default 'exam' check(mode in ('exam','practice'));
alter table public.attempts add constraint practice_no_deadline check(mode<>'practice' or deadline is null);
drop index public.one_active_attempt;
create unique index one_active_attempt on public.attempts(exam_id,user_id,mode) where status='in_progress';

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
 score_release=p_exam->>'score_release',answer_release=p_exam->>'answer_release',exam_enabled=coalesce((p_exam->>'exam_enabled')::boolean,e.exam_enabled),practice_enabled=coalesce((p_exam->>'practice_enabled')::boolean,e.practice_enabled),version=version+1 where id=p_id returning id into eid;
 delete from public.questions where exam_id=eid;
 else
 insert into public.exams(class_id,title,description,instructions,status,duration_minutes,opens_at,closes_at,max_attempts,score_method,shuffle_questions,shuffle_options,score_release,answer_release,creation_key,exam_enabled,practice_enabled)
 values((p_exam->>'class_id')::uuid,p_exam->>'title',coalesce(p_exam->>'description',''),coalesce(p_exam->>'instructions',''),p_exam->>'status',(p_exam->>'duration_minutes')::integer,
 (p_exam->>'opens_at')::timestamptz,(p_exam->>'closes_at')::timestamptz,(p_exam->>'max_attempts')::integer,p_exam->>'score_method',(p_exam->>'shuffle_questions')::boolean,
 (p_exam->>'shuffle_options')::boolean,p_exam->>'score_release',p_exam->>'answer_release',request_key,coalesce((p_exam->>'exam_enabled')::boolean,true),coalesce((p_exam->>'practice_enabled')::boolean,false)) returning id into eid;end if;
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
 for a in select * from public.attempts where exam_id=eid and mode='exam' and status='in_progress' order by id for update loop
 -- A previously expired deadline cannot be revived merely because cron is late.
 if a.deadline is not null and a.deadline<=now() then perform private.finish_attempt(a.id);continue;end if;
 new_deadline:=private.attempt_deadline(a.started_at,(p_exam->>'duration_minutes')::integer,(p_exam->>'closes_at')::timestamptz);
 update public.attempts set deadline=new_deadline,timing_revision=timing_revision+1 where id=a.id;
 if new_deadline is not null and new_deadline<=now() then perform private.finish_attempt(a.id);end if;end loop;end if;
 if request_key is not null then insert into private.exam_edits(exam_id,request_id,version) select eid,request_key,version from public.exams where id=eid;end if;
 return eid;
end;$$;
create or replace function public.start_mode_attempt(p_exam uuid,p_mode text) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.exams;aid uuid;qo jsonb;oo jsonb;started timestamptz;
begin
 if p_mode is null or p_mode not in ('exam','practice') then raise exception 'Chế độ không hợp lệ';end if;
 if auth.uid() is null then raise exception 'Vui lòng đăng nhập';end if;
 -- Lock order: exam, then attempts. Editing schedules uses this same order.
 select * into e from public.exams where id=p_exam for update;
 if e.id is null or not public.is_member(e.class_id) or exists(select 1 from public.classes where id=e.class_id and archived) then raise exception 'Không được phép làm bài';end if;
 for aid in select id from public.attempts where exam_id=p_exam and user_id=auth.uid() and mode=p_mode and status='in_progress' and deadline is not null and deadline<=now() loop perform private.finish_attempt(aid);end loop;
 select id into aid from public.attempts where exam_id=p_exam and user_id=auth.uid() and mode=p_mode and status='in_progress';
 if aid is not null then return aid;end if;
 if p_mode='exam' and not e.exam_enabled or p_mode='practice' and not e.practice_enabled then raise exception 'Chế độ hiện chưa mở';end if;
 if e.status<>'published' or (e.opens_at is not null and now()<e.opens_at) or (e.closes_at is not null and now()>=e.closes_at) then raise exception 'Bài chưa mở hoặc đã đóng';end if;
 if p_mode='exam' and (select count(*) from public.attempts where exam_id=p_exam and user_id=auth.uid() and mode=p_mode)>=e.max_attempts then raise exception 'Đã hết số lượt làm';end if;
 if not exists(select 1 from public.questions where exam_id=p_exam) then raise exception 'Đề chưa có câu hỏi';end if;
 select jsonb_agg(id order by section,ord) into qo from(select id,section,case when e.shuffle_questions then random() else position::float end ord from public.questions where exam_id=p_exam) x;
 select jsonb_object_agg(q.id,(select jsonb_agg(o->>'id' order by case when e.shuffle_options and q.kind not in ('boolean_group','boolean') then random() else n::float end) from jsonb_array_elements(q.options) with ordinality x(o,n))) into oo from public.questions q where exam_id=p_exam;
 started:=now();
 insert into public.attempts(exam_id,user_id,started_at,deadline,question_order,option_order,exam_version,mode)
 values(p_exam,auth.uid(),started,case when p_mode='practice' then null else private.attempt_deadline(started,e.duration_minutes,e.closes_at) end,qo,oo,e.version,p_mode) returning id into aid;
 insert into private.attempt_snapshots(attempt_id,exam,questions) values(aid,to_jsonb(e),private.snapshot_questions(p_exam));return aid;
end;$$;
create or replace function public.start_attempt(p_exam uuid) returns uuid language sql security definer set search_path='' as $$ select public.start_mode_attempt(p_exam,'exam'); $$;

create table private.practice_checks(
 id bigint generated always as identity primary key,
 attempt_id uuid not null references public.attempts on delete cascade,
 question_id uuid not null, request_id uuid not null,
 selected jsonb not null, correct boolean not null, statement_correct integer not null,
 checked_at timestamptz not null default clock_timestamp(),
 unique(attempt_id,request_id)
);
create index practice_checks_question on private.practice_checks(attempt_id,question_id,id);
create table private.practice_state(
 attempt_id uuid references public.attempts on delete cascade,question_id uuid,
 latest_check bigint not null references private.practice_checks,
 reviewing boolean not null default true,primary key(attempt_id,question_id)
);
revoke all on private.practice_checks,private.practice_state from public,anon,authenticated;

create function private.practice_attempt(p_id uuid) returns public.attempts language plpgsql security definer set search_path='' as $$
declare a public.attempts;begin
 a:=private.check_attempt(p_id);
 if a.mode<>'practice' or (a.user_id<>auth.uid() and not public.is_admin()) then raise exception 'Không có quyền luyện tập';end if;
 return a;
end;$$;

-- Keep the existing validation and autosave implementation as the shared core.
alter function public.save_answer(uuid,uuid,jsonb,boolean) rename to save_answer_before_practice;
alter function public.save_answer_before_practice(uuid,uuid,jsonb,boolean) set schema private;
create function public.save_answer(p_id uuid,p_question uuid,p_selected jsonb,p_flagged boolean) returns text language plpgsql security definer set search_path='' as $$
declare a public.attempts;begin
 a:=private.check_attempt(p_id);
 if a.mode='practice' and p_selected is distinct from coalesce(a.answers->p_question::text,'[]') and exists(select 1 from private.practice_state where attempt_id=p_id and question_id=p_question and reviewing) then raise exception 'Chọn Làm lại câu này trước khi đổi câu trả lời';end if;
 return private.save_answer_before_practice(p_id,p_question,p_selected,p_flagged);
end;$$;

create function private.practice_feedback(p_id uuid,p_question uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare q jsonb;c private.practice_checks;begin
 select pc.* into c from private.practice_state ps join private.practice_checks pc on pc.id=ps.latest_check
 where ps.attempt_id=p_id and ps.question_id=p_question and ps.reviewing;
 if c.id is null then return null;end if;
 select value into q from private.attempt_snapshots s,jsonb_array_elements(s.questions) where s.attempt_id=p_id and value->>'id'=p_question::text;
 return jsonb_build_object('check_id',c.id,'selected',c.selected,'correct',c.correct,'statement_correct',c.statement_correct,'checked_at',c.checked_at,
 'question',q-'json_source'-'source_refs'-'import_key');
end;$$;

create function public.check_practice_question(p_id uuid,p_question uuid,p_selected jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;q jsonb;cid bigint;c private.practice_checks;begin
 a:=private.practice_attempt(p_id);
 if a.user_id<>auth.uid() or a.status<>'in_progress' or p_request is null then raise exception 'Lượt luyện tập không hợp lệ';end if;
 select * into c from private.practice_checks where attempt_id=p_id and request_id=p_request;
 if c.id is not null then
 if c.question_id<>p_question or c.selected<>p_selected then raise exception 'Yêu cầu kiểm tra không khớp';end if;
 return private.practice_feedback(p_id,p_question);end if;
 if exists(select 1 from private.practice_state where attempt_id=p_id and question_id=p_question and reviewing) then return private.practice_feedback(p_id,p_question);end if;
 select value into q from private.attempt_snapshots s,jsonb_array_elements(s.questions) where s.attempt_id=p_id and value->>'id'=p_question::text;
 if q is null then raise exception 'Câu không thuộc lượt luyện tập';end if;
 perform private.save_answer_before_practice(p_id,p_question,p_selected,false);
 if jsonb_array_length(p_selected)=0 or q->>'kind'='short' and btrim(coalesce(p_selected->>0,''))=''
 or q->>'kind'='boolean_group' and jsonb_array_length(p_selected)<>4 then raise exception 'Hãy trả lời đầy đủ; câu đúng/sai cần chọn đủ bốn ý';end if;
 insert into private.practice_checks(attempt_id,question_id,request_id,selected,correct,statement_correct)
 values(p_id,p_question,p_request,p_selected,private.grade_snapshot(q,p_selected)=(q->>'points')::numeric,
 case when q->>'kind'='boolean_group' then (select count(*) from jsonb_array_elements_text(q->'correct_ids') x where p_selected ? x) else 0 end) returning id into cid;
 insert into private.practice_state values(p_id,p_question,cid,true) on conflict(attempt_id,question_id) do update set latest_check=excluded.latest_check,reviewing=true;
 return private.practice_feedback(p_id,p_question);
end;$$;

create function public.retry_practice_question(p_id uuid,p_question uuid,p_check bigint) returns text language plpgsql security definer set search_path='' as $$
declare a public.attempts;begin
 a:=private.practice_attempt(p_id);
 if a.user_id<>auth.uid() or a.status<>'in_progress' then raise exception 'Lượt đã kết thúc';end if;
 -- A retry repeated after a network failure must not erase a newer answer/check.
 update private.practice_state set reviewing=false where attempt_id=p_id and question_id=p_question and latest_check=p_check and reviewing;
 if found then perform private.save_answer_before_practice(p_id,p_question,'[]',false);end if;
 return 'ready';
end;$$;

create function public.practice_history(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;begin a:=private.practice_attempt(p_id);
 return coalesce((select jsonb_agg((to_jsonb(c)-'request_id')||jsonb_build_object('section',q->'section','question_number',n,
 'selected_text',case when q->>'kind'='short' then c.selected else coalesce((select jsonb_agg((o->>'text')||case when q->>'kind'='boolean_group' then case when c.selected ? ((o->>'id')||':true') then ': Đúng' else ': Sai' end else '' end)
 from jsonb_array_elements(q->'options') o where c.selected ? (o->>'id') or c.selected ? ((o->>'id')||':true') or c.selected ? ((o->>'id')||':false')),'[]') end) order by c.id)
 from private.practice_checks c join (select q,row_number() over(partition by q->>'section' order by (q->>'position')::integer) n from private.attempt_snapshots s,jsonb_array_elements(s.questions) q where s.attempt_id=p_id) qs on q->>'id'=c.question_id::text where c.attempt_id=p_id),'[]');end;$$;

create function private.practice_summary(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 with first_checks as (select distinct on(question_id) * from private.practice_checks where attempt_id=p_id order by question_id,id),
 qs as(select q,(q->>'section')::integer part from private.attempt_snapshots s,jsonb_array_elements(s.questions) q where s.attempt_id=p_id)
 select coalesce(jsonb_agg(to_jsonb(x) order by section),'[]') from (
 select part section,count(*) question_count,count(c.id) checked,count(*) filter(where c.correct) first_correct,
 coalesce(sum(c.statement_correct),0) statement_correct,
 coalesce(sum(case when q->>'kind'='boolean_group' then 4 else 0 end),0) statement_total
 from qs left join first_checks c on c.question_id=(q->>'id')::uuid group by part) x;
$$;

create function public.finish_practice(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.attempts;begin a:=private.practice_attempt(p_id);
 if a.user_id<>auth.uid() then raise exception 'Không có quyền';end if;
 if a.status='in_progress' then update public.attempts set status='submitted',submitted_at=now() where id=p_id;end if;
 return p_id;end;$$;

alter function public.get_attempt(uuid) rename to get_attempt_before_practice;
alter function public.get_attempt_before_practice(uuid) set schema private;
create function public.get_attempt(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin r:=private.get_attempt_before_practice(p_id);
 if r->>'mode'='practice' then r:=r||jsonb_build_object('practice_checked_ids',coalesce((select jsonb_agg(distinct question_id) from private.practice_checks where attempt_id=p_id),'[]'),'practice_feedback',coalesce((select jsonb_object_agg(question_id,private.practice_feedback(p_id,question_id)) from private.practice_state where attempt_id=p_id and reviewing),'{}'));end if;
 return r;end;$$;

alter function public.attempt_result(uuid) rename to attempt_result_before_practice;
alter function public.attempt_result_before_practice(uuid) set schema private;
create function public.attempt_result(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;title text;cid uuid;begin
 a:=private.check_attempt(p_id);
 if a.mode='exam' then return private.attempt_result_before_practice(p_id);end if;
 select s.exam->>'title',e.class_id into title,cid from private.attempt_snapshots s join public.exams e on e.id=a.exam_id where s.attempt_id=p_id;
 return to_jsonb(a)||jsonb_build_object('exam_title',title,'class_id',cid,'practice_summary',private.practice_summary(p_id),'practice_history',public.practice_history(p_id));
end;$$;

alter function public.submit_attempt(uuid,integer) rename to submit_attempt_before_practice;
alter function public.submit_attempt_before_practice(uuid,integer) set schema private;
create function public.submit_attempt(p_id uuid,p_timing_revision integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.attempts;begin a:=private.check_attempt(p_id);
 if a.mode<>'exam' then raise exception 'Dùng Kết thúc luyện tập';end if;
 return private.submit_attempt_before_practice(p_id,p_timing_revision);end;$$;

-- Official reports default to real exams. Practice has no private.scores row.
alter function public.result_report_page(jsonb,integer,integer) rename to result_report_page_before_modes;
alter function public.result_report_page_before_modes(jsonb,integer,integer) set schema private;
create function public.result_report_page(p_scope jsonb default '{}',p_page integer default 1,p_size integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 if p_scope ? 'mode' and p_scope->>'mode' not in ('exam','practice') then raise exception 'Chế độ không hợp lệ';end if;
 r:=private.result_report_page_before_modes(case when p_scope->>'mode'='practice' then p_scope-'final' else p_scope end,p_page,p_size);
 return r||jsonb_build_object('rows',coalesce((select jsonb_agg(x||jsonb_build_object('mode',coalesce(p_scope->>'mode','exam'))) from jsonb_array_elements(r->'rows') x),'[]'));
end;$$;

create or replace function public.can_read_classroom_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.is_admin()
 or exists(select 1 from public.profiles p where p.id=auth.uid() and p.avatar_path=p_path)
 or (storage.foldername(p_path))[1]=auth.uid()::text and (storage.foldername(p_path))[2]='avatars'
 or exists(select 1 from public.classes c where c.cover_path=p_path and public.is_member(c.id))
 or exists(select 1 from private.attempt_snapshots s join public.attempts a on a.id=s.attempt_id join public.exams e on e.id=a.exam_id
 cross join lateral jsonb_array_elements(s.questions) q
 where a.user_id=auth.uid() and public.is_member(e.class_id)
 and (q->>'image_path'=p_path or exists(select 1 from jsonb_array_elements(q->'attachments') img where img->>'path'=p_path and
 (coalesce(img->>'purpose','illustration') in ('illustration','question') or img->>'purpose' in ('answer','solution') and ((a.mode='exam' and a.status<>'in_progress' and private.released(e.answer_release,e.closes_at)) or (a.mode='practice' and exists(select 1 from private.practice_checks pc where pc.attempt_id=a.id and pc.question_id=(q->>'id')::uuid))))))));
$$;
create or replace function public.attempt_image_manifest(p_id uuid,p_view text default 'attempt') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;e public.exams;r jsonb;
begin
 if p_view not in ('attempt','result') or p_view is null then raise exception 'Chế độ không hợp lệ';end if;
 a:=private.check_attempt(p_id);if not public.is_admin() and a.user_id<>auth.uid() then raise exception 'Không có quyền';end if;
 select * into e from public.exams where id=a.exam_id;
 if p_view='attempt' and a.status<>'in_progress' then raise exception 'Lượt làm đã đóng';end if;
 if p_view='result' and (a.status='in_progress' or (a.mode='exam' and not(public.is_admin() or private.released(e.answer_release,e.closes_at)))) then raise exception 'Đáp án chưa công bố';end if;
 select coalesce(jsonb_agg(image),'[]') into r from(
 select jsonb_build_object('key',(q->>'id')||':legacy','question_id',q->>'id','slot','legacy','path',q->>'image_path','caption','Hình minh họa','placement','below') image
 from private.attempt_snapshots s,jsonb_array_elements(s.questions) q where s.attempt_id=p_id and nullif(q->>'image_path','') is not null and public.can_read_classroom_image(q->>'image_path')
 union all
 select img.value||jsonb_build_object('key',(q->>'id')||':attachment:'||img.n,'question_id',q->>'id','slot','attachment')
 from private.attempt_snapshots s cross join lateral jsonb_array_elements(s.questions) q cross join lateral jsonb_array_elements(q->'attachments') with ordinality img(value,n)
 where s.attempt_id=p_id and public.can_read_classroom_image(img.value->>'path') and (coalesce(img.value->>'purpose','illustration') in ('illustration','question') or img.value->>'purpose' in ('answer','solution') and (p_view='result' and a.mode='exam' or a.mode='practice' and exists(select 1 from private.practice_state ps where ps.attempt_id=p_id and ps.question_id=(q->>'id')::uuid and ps.reviewing)))
 ) images;return r;
end;$$;

create or replace function private.report_rows(p_scope jsonb,p_admin boolean)
returns table(id uuid,exam_id uuid,user_id uuid,started_at timestamptz,deadline timestamptz,submitted_at timestamptz,status text,exam_title text,class_id uuid,student_name text,class_name text,score_method text,score jsonb)
language sql stable set search_path='' as $$
 select a.id,a.exam_id,a.user_id,a.started_at,a.deadline,a.submitted_at,a.status,coalesce(snap.exam->>'title',e.title),e.class_id,p.full_name,c.name,e.score_method,
 case when a.status<>'in_progress' and (p_admin or private.released(e.score_release,e.closes_at)) then
 case when p_admin or private.released(e.answer_release,e.closes_at) then to_jsonb(s) else to_jsonb(s)-'correct'-'wrong'-'unanswered'-'sections' end else null end
 from public.attempts a join public.exams e on e.id=a.exam_id join public.classes c on c.id=e.class_id join public.profiles p on p.id=a.user_id
 left join private.scores s on s.attempt_id=a.id left join private.attempt_snapshots snap on snap.attempt_id=a.id
 where a.mode=coalesce(nullif(p_scope->>'mode',''),'exam') and (p_admin or (a.user_id=auth.uid() and public.is_member(e.class_id)))
 and (nullif(p_scope->>'class_id','') is null or e.class_id=(p_scope->>'class_id')::uuid)
 and (nullif(p_scope->>'exam_id','') is null or e.id=(p_scope->>'exam_id')::uuid)
 and (nullif(p_scope->>'student','') is null or a.user_id=(p_scope->>'student')::uuid);
$$;


-- Preserve the existing schedule preview but count real-exam attempts only.
do $m$ declare body text;begin
 body:=pg_get_functiondef('public.preview_exam_schedule(uuid,integer,timestamptz,timestamptz)'::regprocedure);
 if position('where exam_id=p_id and status=' in body)=0 then raise exception 'Unexpected schedule definition';end if;
 execute replace(body,'where exam_id=p_id and status=', 'where exam_id=p_id and mode=''exam'' and status=');
end;$m$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.start_mode_attempt(uuid,text),public.save_answer(uuid,uuid,jsonb,boolean),public.get_attempt(uuid),public.attempt_result(uuid),public.submit_attempt(uuid,integer),public.result_report_page(jsonb,integer,integer),public.check_practice_question(uuid,uuid,jsonb,uuid),public.retry_practice_question(uuid,uuid,bigint),public.practice_history(uuid),public.finish_practice(uuid) from public,anon;
grant execute on function public.start_mode_attempt(uuid,text),public.save_answer(uuid,uuid,jsonb,boolean),public.get_attempt(uuid),public.attempt_result(uuid),public.submit_attempt(uuid,integer),public.result_report_page(jsonb,integer,integer),public.check_practice_question(uuid,uuid,jsonb,uuid),public.retry_practice_question(uuid,uuid,bigint),public.practice_history(uuid),public.finish_practice(uuid) to authenticated;
