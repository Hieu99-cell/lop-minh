-- Freeze content, answer keys, provenance and scoring for every attempt.
-- Existing questions, answers, submission timestamps and scores are not changed.
alter table public.exams alter column duration_minutes drop not null;
alter table public.attempts alter column deadline drop not null;
alter table public.attempts add column exam_version integer not null default 1;
alter table public.attempts add column timing_revision integer not null default 0;
update public.attempts a set exam_version=e.version from public.exams e where e.id=a.exam_id;
create table private.attempt_snapshots(
 attempt_id uuid primary key references public.attempts on delete cascade,
 exam jsonb not null, questions jsonb not null check(jsonb_typeof(questions)='array'),
 created_at timestamptz not null default now()
);
revoke all on private.attempt_snapshots from public,anon,authenticated;
create function private.snapshot_questions(p_exam uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('correct_ids',k.correct_ids,'explanation',k.explanation,'short_answer',k.short_answer,
 'source_refs',coalesce(src.source_refs,'[]'),'import_key',src.import_key,
 'json_source',case when j.question_id is null then null else jsonb_build_object('package_id',j.package_id,'question_id',j.external_id,'answer_origin',j.answer_origin,'confirmed',j.confirmed) end)
 order by q.section,q.position),'[]') from public.questions q join private.answer_keys k on k.question_id=q.id
 left join private.json_question_sources j on j.question_id=q.id left join private.question_sources src on src.question_id=q.id where q.exam_id=p_exam;
$$;
insert into private.attempt_snapshots(attempt_id,exam,questions)
select a.id,to_jsonb(e),private.snapshot_questions(e.id) from public.attempts a join public.exams e on e.id=a.exam_id;
create function private.immutable_attempt_snapshot() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Snapshot lượt làm bất biến';end;$$;
create trigger immutable_attempt_snapshot before update on private.attempt_snapshots for each row execute function private.immutable_attempt_snapshot();

create function private.attempt_deadline(p_started timestamptz,p_duration integer,p_close timestamptz)
returns timestamptz language sql immutable set search_path='' as $$
 select case when p_duration is null then p_close when p_close is null then p_started+make_interval(mins=>p_duration)
 else least(p_started+make_interval(mins=>p_duration),p_close) end;
$$;
create function private.grade_snapshot(q jsonb,chosen jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare good integer;total integer:=jsonb_array_length(q->'options');points numeric:=(q->>'points')::numeric;
begin
 if q->>'kind'='short' then return case when private.match_short(chosen,q->'short_answer') then points else 0 end;end if;
 if q->>'kind'='boolean_group' then
 select count(*) into good from jsonb_array_elements_text(q->'correct_ids') x where chosen ? x;
 if q->>'scoring_mode'='all_or_nothing' then return case when good=total then points else 0 end;end if;
 return points*good/nullif(total,0);end if;
 return case when private.exact_match(chosen,q->'correct_ids') then points else 0 end;
end;$$;
create function private.snapshot_summary(p_id uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare a public.attempts;q jsonb;chosen jsonb;part integer;good integer;n integer;sg integer;st integer;result jsonb:='[]';
begin
 select * into a from public.attempts where id=p_id;
 for part in 1..3 loop
 good:=0;n:=0;sg:=0;st:=0;
 for q in select value from private.attempt_snapshots s,jsonb_array_elements(s.questions) where s.attempt_id=p_id and (value->>'section')::integer=part loop
 n:=n+1;chosen:=coalesce(a.answers->(q->>'id'),'[]');
 if private.grade_snapshot(q,chosen)=(q->>'points')::numeric then good:=good+1;end if;
 if q->>'kind'='boolean_group' then
 st:=st+jsonb_array_length(q->'options');
 sg:=sg+(select count(*) from jsonb_array_elements_text(q->'correct_ids') x where chosen ? x);
 end if;end loop;
 if n>0 then result:=result||jsonb_build_array(jsonb_build_object('section',part,'correct',good,'question_count',n,'statement_correct',sg,'statement_total',st));end if;
 end loop;return result;
end;$$;
create or replace function private.finish_attempt(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.attempts;q jsonb;chosen jsonb;earned numeric:=0;total numeric:=0;good int:=0;bad int:=0;blank int:=0;value numeric;parts jsonb:='[]';part int;pe numeric;pt numeric;pg int;pb int;pu int;
begin
 select * into a from public.attempts where id=p_id for update;
 if a.id is null or a.status<>'in_progress' then return;end if;
 if not exists(select 1 from private.attempt_snapshots where attempt_id=a.id) then raise exception 'Thiếu snapshot lượt làm';end if;
 for part in 1..3 loop
 pe:=0;pt:=0;pg:=0;pb:=0;pu:=0;
 for q in select x.value from private.attempt_snapshots s,jsonb_array_elements(s.questions) x where s.attempt_id=p_id and (x.value->>'section')::int=part loop
 chosen:=coalesce(a.answers->(q->>'id'),'[]');value:=private.grade_snapshot(q,chosen);
 pe:=pe+value;pt:=pt+(q->>'points')::numeric;
 if jsonb_array_length(chosen)=0 or (q->>'kind'='short' and trim(coalesce(chosen->>0,''))='') then pu:=pu+1;
 elsif value=(q->>'points')::numeric then pg:=pg+1;else pb:=pb+1;end if;end loop;
 earned:=earned+pe;total:=total+pt;good:=good+pg;bad:=bad+pb;blank:=blank+pu;
 if pt>0 then parts:=parts||jsonb_build_array(jsonb_build_object('section',part,'earned',pe,'total',pt,'correct',pg,'wrong',pb,'unanswered',pu));end if;end loop;
 insert into private.scores(attempt_id,earned,total,score,correct,wrong,unanswered,sections) values(a.id,earned,total,round(earned*10/nullif(total,0),2),good,bad,blank,parts) on conflict do nothing;
 update public.attempts set submitted_at=case when deadline is null then now() else least(now(),deadline) end,
 status=case when deadline is not null and now()>=deadline then 'expired' else 'submitted' end where id=a.id;
end;$$;

create or replace function public.start_attempt(p_exam uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.exams;aid uuid;qo jsonb;oo jsonb;started timestamptz;
begin
 if auth.uid() is null then raise exception 'Vui lòng đăng nhập';end if;
 -- Lock order: exam, then attempts. Editing schedules uses this same order.
 select * into e from public.exams where id=p_exam for update;
 if e.id is null or not public.is_member(e.class_id) or exists(select 1 from public.classes where id=e.class_id and archived) then raise exception 'Không được phép làm bài';end if;
 for aid in select id from public.attempts where exam_id=p_exam and user_id=auth.uid() and status='in_progress' and deadline is not null and deadline<=now() loop perform private.finish_attempt(aid);end loop;
 select id into aid from public.attempts where exam_id=p_exam and user_id=auth.uid() and status='in_progress';
 if aid is not null then return aid;end if;
 if e.status<>'published' or (e.opens_at is not null and now()<e.opens_at) or (e.closes_at is not null and now()>=e.closes_at) then raise exception 'Bài chưa mở hoặc đã đóng';end if;
 if (select count(*) from public.attempts where exam_id=p_exam and user_id=auth.uid())>=e.max_attempts then raise exception 'Đã hết số lượt làm';end if;
 if not exists(select 1 from public.questions where exam_id=p_exam) then raise exception 'Đề chưa có câu hỏi';end if;
 select jsonb_agg(id order by section,ord) into qo from(select id,section,case when e.shuffle_questions then random() else position::float end ord from public.questions where exam_id=p_exam) x;
 select jsonb_object_agg(q.id,(select jsonb_agg(o->>'id' order by case when e.shuffle_options and q.kind not in ('boolean_group','boolean') then random() else n::float end) from jsonb_array_elements(q.options) with ordinality x(o,n))) into oo from public.questions q where exam_id=p_exam;
 started:=now();
 insert into public.attempts(exam_id,user_id,started_at,deadline,question_order,option_order,exam_version)
 values(p_exam,auth.uid(),started,private.attempt_deadline(started,e.duration_minutes,e.closes_at),qo,oo,e.version) returning id into aid;
 insert into private.attempt_snapshots(attempt_id,exam,questions) values(aid,to_jsonb(e),private.snapshot_questions(p_exam));return aid;
end;$$;
create or replace function public.get_attempt(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;s private.attempt_snapshots;qs jsonb;
begin
 a:=private.check_attempt(p_id);select * into s from private.attempt_snapshots where attempt_id=p_id;
 select coalesce(jsonb_agg((q-'correct_ids'-'explanation'-'short_answer'-'json_source'-'source_refs'-'import_key')||jsonb_build_object('attachments',coalesce((select jsonb_agg(img) from jsonb_array_elements(q->'attachments') img where coalesce(img->>'purpose','illustration') in ('illustration','question')),'[]'))),'[]') into qs from jsonb_array_elements(s.questions) q;
 return to_jsonb(a)||jsonb_build_object('server_now',now(),'exam',jsonb_build_object('title',s.exam->'title','instructions',s.exam->'instructions','version',a.exam_version,'duration_minutes',s.exam->'duration_minutes'),'questions',qs);
end;$$;
create or replace function public.save_answer(p_id uuid,p_question uuid,p_selected jsonb,p_flagged boolean) returns text language plpgsql security definer set search_path='' as $$
declare a public.attempts;q jsonb;item text;
begin
 a:=private.check_attempt(p_id);if a.user_id<>auth.uid() or a.status<>'in_progress' then return 'closed';end if;
 select value into q from private.attempt_snapshots s,jsonb_array_elements(s.questions) where s.attempt_id=p_id and value->>'id'=p_question::text;
 if q is null or p_selected is null or jsonb_typeof(p_selected)<>'array' or exists(select 1 from jsonb_array_elements(p_selected) x where jsonb_typeof(x)<>'string') then raise exception 'Câu trả lời không hợp lệ';end if;
 if q->>'kind'='short' then
 if jsonb_array_length(p_selected)>1 or length(coalesce(p_selected->>0,''))>500 then raise exception 'Trả lời ngắn quá dài';end if;
 elsif q->>'kind'='boolean_group' then
 if jsonb_array_length(p_selected)>jsonb_array_length(q->'options') then raise exception 'Lựa chọn không hợp lệ';end if;
 for item in select * from jsonb_array_elements_text(p_selected) loop
 if not exists(select 1 from jsonb_array_elements(q->'options') o where item in ((o->>'id')||':true',(o->>'id')||':false')) or (select count(*) from jsonb_array_elements_text(p_selected) x where split_part(x,':',1)=split_part(item,':',1))<>1 then raise exception 'Mỗi nhận định chỉ được chọn một giá trị';end if;end loop;
 else
 if jsonb_array_length(p_selected)>jsonb_array_length(q->'options') or (q->>'kind'<>'multiple' and jsonb_array_length(p_selected)>1) or (select count(distinct x) from jsonb_array_elements_text(p_selected) x)<>jsonb_array_length(p_selected) or exists(select 1 from jsonb_array_elements_text(p_selected) x where not exists(select 1 from jsonb_array_elements(q->'options') o where o->>'id'=x)) then raise exception 'Lựa chọn không hợp lệ';end if;
 end if;
 update public.attempts set answers=jsonb_set(answers,array[p_question::text],p_selected),flagged=case when p_flagged then (flagged-p_question::text)||jsonb_build_array(p_question::text) else flagged-p_question::text end where id=p_id;return 'saved';
end;$$;
create or replace function public.save_statement(p_id uuid,p_question uuid,p_statement text,p_value text,p_flagged boolean) returns text language plpgsql security definer set search_path='' as $$
declare a public.attempts;q jsonb;selected jsonb;
begin
 a:=private.check_attempt(p_id);if a.user_id<>auth.uid() or a.status<>'in_progress' then return 'closed';end if;
 select value into q from private.attempt_snapshots s,jsonb_array_elements(s.questions) where s.attempt_id=p_id and value->>'id'=p_question::text;
 if q is null or q->>'kind'<>'boolean_group' or (p_value is not null and p_value not in ('true','false')) or not exists(select 1 from jsonb_array_elements(q->'options') o where o->>'id'=p_statement) then raise exception 'Nhận định không hợp lệ';end if;
 select coalesce(jsonb_agg(value),'[]') into selected from jsonb_array_elements(coalesce(a.answers->p_question::text,'[]')) where value#>>'{}' not in (p_statement||':true',p_statement||':false');
 if p_value is not null then selected:=selected||jsonb_build_array(p_statement||':'||p_value);end if;
 return public.save_answer(p_id,p_question,selected,p_flagged);
end;$$;
create function public.attempt_clock(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;begin a:=private.check_attempt(p_id);
 return jsonb_build_object('deadline',a.deadline,'server_now',now(),'status',a.status,'timing_revision',a.timing_revision);end;$$;
-- Legacy tabs cannot auto-submit an extended attempt using an old deadline.
drop function public.submit_attempt(uuid);
create function public.submit_attempt(p_id uuid,p_timing_revision integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.attempts;begin
 a:=private.check_attempt(p_id);
 if a.status<>'in_progress' then return a.id;end if;
 if a.timing_revision>0 and p_timing_revision is distinct from a.timing_revision
 or p_timing_revision is not null and p_timing_revision<>a.timing_revision
 then raise exception 'Lịch làm bài đã thay đổi. Đồng bộ lịch trước khi nộp';end if;
 perform private.finish_attempt(p_id);return p_id;end;$$;
revoke all on function public.submit_attempt(uuid,integer) from public,anon;
grant execute on function public.submit_attempt(uuid,integer) to authenticated;
create or replace function public.attempt_result(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;e public.exams;s private.attempt_snapshots;r jsonb;score jsonb;released boolean;teacher boolean:=public.is_admin();
begin
 a:=private.check_attempt(p_id);select * into e from public.exams where id=a.exam_id;select * into s from private.attempt_snapshots where attempt_id=p_id;
 r:=to_jsonb(a)||jsonb_build_object('exam_title',s.exam->>'title','class_id',e.class_id);
 if a.status='in_progress' then return r;end if;
 released:=teacher or (private.released(e.score_release,e.closes_at) and private.released(e.answer_release,e.closes_at));
 if teacher or private.released(e.score_release,e.closes_at) then
 select to_jsonb(x) into score from private.scores x where attempt_id=a.id;
 if not released then score:=score-'correct'-'wrong'-'unanswered'-'sections';end if;
 r:=r||jsonb_build_object('score',score);end if;
 if released then r:=r||jsonb_build_object('section_summary',private.snapshot_summary(a.id));end if;
 if teacher or private.released(e.answer_release,e.closes_at) then
 r:=r||jsonb_build_object('review',(select jsonb_agg(q-'json_source'-'source_refs'-'import_key') from jsonb_array_elements(s.questions) q));end if;
 return r;
end;$$;
create or replace function private.expire_attempts() returns void language plpgsql security definer set search_path='' as $$
declare aid uuid;begin for aid in select id from public.attempts where status='in_progress' and deadline is not null and deadline<=now() order by deadline limit 500 for update skip locked loop perform private.finish_attempt(aid);end loop;end;$$;

-- Images must also use the attempt's version, never the latest authoring rows.
create or replace function public.can_read_classroom_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.is_admin()
 or exists(select 1 from public.profiles p where p.id=auth.uid() and p.avatar_path=p_path)
 or (storage.foldername(p_path))[1]=auth.uid()::text and (storage.foldername(p_path))[2]='avatars'
 or exists(select 1 from public.classes c where c.cover_path=p_path and public.is_member(c.id))
 or exists(select 1 from private.attempt_snapshots s join public.attempts a on a.id=s.attempt_id join public.exams e on e.id=a.exam_id
 cross join lateral jsonb_array_elements(s.questions) q
 where a.user_id=auth.uid() and public.is_member(e.class_id)
 and (q->>'image_path'=p_path or exists(select 1 from jsonb_array_elements(q->'attachments') img where img->>'path'=p_path and
 (coalesce(img->>'purpose','illustration') in ('illustration','question') or img->>'purpose' in ('answer','solution') and a.status<>'in_progress' and private.released(e.answer_release,e.closes_at))))));
$$;
create or replace function public.attempt_image_manifest(p_id uuid,p_view text default 'attempt') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;e public.exams;r jsonb;
begin
 if p_view not in ('attempt','result') or p_view is null then raise exception 'Chế độ không hợp lệ';end if;
 a:=private.check_attempt(p_id);if not public.is_admin() and a.user_id<>auth.uid() then raise exception 'Không có quyền';end if;
 select * into e from public.exams where id=a.exam_id;
 if p_view='attempt' and a.status<>'in_progress' then raise exception 'Lượt làm đã đóng';end if;
 if p_view='result' and (a.status='in_progress' or not(public.is_admin() or private.released(e.answer_release,e.closes_at))) then raise exception 'Đáp án chưa công bố';end if;
 select coalesce(jsonb_agg(image),'[]') into r from(
 select jsonb_build_object('key',(q->>'id')||':legacy','question_id',q->>'id','slot','legacy','path',q->>'image_path','caption','Hình minh họa','placement','below') image
 from private.attempt_snapshots s,jsonb_array_elements(s.questions) q where s.attempt_id=p_id and nullif(q->>'image_path','') is not null and public.can_read_classroom_image(q->>'image_path')
 union all
 select img.value||jsonb_build_object('key',(q->>'id')||':attachment:'||img.n,'question_id',q->>'id','slot','attachment')
 from private.attempt_snapshots s cross join lateral jsonb_array_elements(s.questions) q cross join lateral jsonb_array_elements(q->'attachments') with ordinality img(value,n)
 where s.attempt_id=p_id and public.can_read_classroom_image(img.value->>'path') and (coalesce(img.value->>'purpose','illustration') in ('illustration','question') or p_view='result' and img.value->>'purpose' in ('answer','solution'))
 ) images;return r;
end;$$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.attempt_clock(uuid) from public,anon;
grant execute on function public.attempt_clock(uuid) to authenticated;
