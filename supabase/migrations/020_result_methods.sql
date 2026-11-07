-- Existing exams/snapshots/scores retain the original weighted calculation.
alter table public.exams add column result_method text not null default 'legacy' check(result_method in ('legacy','thpt','counts'));
create table private.count_results(
 attempt_id uuid primary key references public.attempts on delete cascade,
 sections jsonb not null,created_at timestamptz not null default now()
);
revoke all on private.count_results from public,anon,authenticated;

create function private.result_policy(p_method text) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('version',1,'method',p_method)||case when p_method='thpt' then
 jsonb_build_object('unit','0.01','single_cents',25,'boolean_cents',jsonb_build_array(0,10,25,50,100),'short_cents',50,'section_max_cents',jsonb_build_array(300,400,300),'max_cents',1000)
 else '{}'::jsonb end;
$$;
create function private.stamp_result_policy() returns trigger language plpgsql set search_path='' as $$
begin new.exam:=new.exam||jsonb_build_object('result_policy',private.result_policy(coalesce(new.exam->>'result_method','legacy')));return new;end;$$;
create trigger stamp_result_policy before insert on private.attempt_snapshots for each row execute function private.stamp_result_policy();

create function private.thpt_structure(p_questions jsonb) returns text language plpgsql immutable set search_path='' as $$
declare part integer;n integer;needed integer;bad integer;problems text:='';begin
 for part in 1..3 loop
 needed:=case part when 1 then 12 when 2 then 4 else 6 end;
 select count(*),count(*) filter(where case part when 1 then q->>'kind'<>'single' when 2 then q->>'kind'<>'boolean_group' or jsonb_array_length(q->'options')<>4 else q->>'kind'<>'short' end)
 into n,bad from jsonb_array_elements(p_questions) q where coalesce((q->>'section')::integer,case when q->>'kind'='short' then 3 when q->>'kind'='boolean_group' then 2 else 1 end)=part;
 if n<>needed or bad>0 then problems:=problems||format('Phần %s cần %s câu %s; hiện có %s câu, %s câu sai loại/số ý. ',part,needed,case part when 1 then 'một đáp án' when 2 then 'đúng/sai đủ 4 ý' else 'trả lời ngắn' end,n,bad);end if;
 end loop;
 if jsonb_array_length(p_questions)<>22 and problems='' then problems:='Đề THPT cần đúng 22 câu trong ba phần.';end if;
 return nullif(problems,'');end;$$;

alter function public.save_exam(jsonb,jsonb,uuid) rename to save_exam_before_result_methods;
alter function public.save_exam_before_result_methods(jsonb,jsonb,uuid) set schema private;
create function public.save_exam(p_exam jsonb,p_questions jsonb,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare method text;eid uuid;problem text;key uuid:=nullif(p_exam->>'request_id','')::uuid;begin
 if not public.is_admin() then raise exception 'Không có quyền quản trị';end if;
 if p_id is not null then perform 1 from public.exams where id=p_id for update;end if;
 method:=coalesce(p_exam->>'result_method',(select result_method from public.exams where id=p_id),'legacy');
 if method not in ('legacy','thpt','counts') then raise exception 'Cách tính kết quả không hợp lệ';end if;
 if method='thpt' and p_exam->>'status'='published' then problem:=private.thpt_structure(p_questions);if problem is not null then raise exception '%',problem;end if;end if;
 -- The old core owns version/idempotency locks. Never alter a completed request.
 if key is not null and p_id is not null and exists(select 1 from private.exam_edits where exam_id=p_id and request_id=key) then return p_id;end if;
 if key is not null and p_id is null then perform pg_advisory_xact_lock(hashtextextended('exam:'||key::text,0));select id into eid from public.exams where creation_key=key;if eid is not null then return eid;end if;end if;
 eid:=private.save_exam_before_result_methods(p_exam,p_questions,p_id);
 update public.exams set result_method=method where id=eid;
 return eid;end;$$;

alter function public.exam_action(uuid,text) rename to exam_action_before_result_methods;
alter function public.exam_action_before_result_methods(uuid,text) set schema private;
create function public.exam_action(p_id uuid,p_action text) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.exams;problem text;begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 select * into e from public.exams where id=p_id for update;
 if p_action='published' and e.result_method='thpt' then problem:=private.thpt_structure(private.snapshot_questions(p_id));if problem is not null then raise exception '%',problem;end if;end if;
 return private.exam_action_before_result_methods(p_id,p_action);end;$$;

create function private.question_correct(q jsonb,chosen jsonb) returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_array_length(chosen)=0 then false
 when q->>'kind'='short' then private.match_short(chosen,q->'short_answer')
 when q->>'kind'='boolean_group' then jsonb_array_length(q->'options')=4 and (select count(*) from jsonb_array_elements_text(q->'correct_ids') x where chosen ? x)=4
 else private.exact_match(chosen,q->'correct_ids') end;
$$;
create function private.question_result_cents(q jsonb,chosen jsonb,policy jsonb) returns integer language sql immutable set search_path='' as $$
 select case (q->>'section')::integer
 when 1 then case when private.question_correct(q,chosen) then (policy->>'single_cents')::integer else 0 end
 when 2 then (policy->'boolean_cents'->>(select count(*)::integer from jsonb_array_elements_text(q->'correct_ids') x where chosen ? x))::integer
 when 3 then case when private.question_correct(q,chosen) then (policy->>'short_cents')::integer else 0 end end;
$$;
create function private.evaluate_result(p_id uuid,p_first boolean default false) returns jsonb language plpgsql stable set search_path='' as $$
declare s private.attempt_snapshots;a public.attempts;q jsonb;chosen jsonb;part integer;parts jsonb:='[]';counts jsonb:='[]';policy jsonb;
 n integer;good integer;blank integer;sg integer;st integer;checked integer;cents integer;part_cents integer;total_cents integer:=0;begin
 select * into s from private.attempt_snapshots where attempt_id=p_id;select * into a from public.attempts where id=p_id;
 policy:=coalesce(s.exam->'result_policy',private.result_policy(coalesce(s.exam->>'result_method','legacy')));
 for part in 1..3 loop
 n:=0;good:=0;blank:=0;sg:=0;st:=0;checked:=0;part_cents:=0;
 for q in select value from jsonb_array_elements(s.questions) where (value->>'section')::integer=part loop
 n:=n+1;
 if p_first then
 select selected into chosen from private.practice_checks where attempt_id=p_id and question_id=(q->>'id')::uuid order by id limit 1;
 if chosen is not null then checked:=checked+1;end if;chosen:=coalesce(chosen,'[]');
 else chosen:=coalesce(a.answers->(q->>'id'),'[]');end if;
 if private.question_correct(q,chosen) then good:=good+1;end if;
 if jsonb_array_length(chosen)=0 or q->>'kind'='short' and btrim(coalesce(chosen->>0,''))='' then blank:=blank+1;end if;
 if q->>'kind'='boolean_group' then st:=st+jsonb_array_length(q->'options');sg:=sg+(select count(*) from jsonb_array_elements_text(q->'correct_ids') x where chosen ? x);end if;
 if policy->>'method'='thpt' then cents:=private.question_result_cents(q,chosen,policy);part_cents:=part_cents+cents;end if;
 end loop;
 if n>0 then
 counts:=counts||jsonb_build_array(jsonb_build_object('section',part,'correct',good,'question_count',n,'statement_correct',sg,'statement_total',st,'checked',checked));
 if policy->>'method'='thpt' then parts:=parts||jsonb_build_array(jsonb_build_object('section',part,'earned',part_cents::numeric/100,'total',(policy->'section_max_cents'->>(part-1))::numeric/100,'correct',good,'wrong',n-good-blank,'unanswered',blank));end if;
 end if;total_cents:=total_cents+part_cents;
 end loop;
 return jsonb_build_object('sections',counts)||case when policy->>'method'='thpt' then jsonb_build_object('score',jsonb_build_object('earned',total_cents::numeric/100,'total',10,'score',total_cents::numeric/100,'sections',parts,
 'correct',(select sum((x->>'correct')::integer) from jsonb_array_elements(counts) x),'wrong',(select sum((x->>'wrong')::integer) from jsonb_array_elements(parts) x),'unanswered',(select sum((x->>'unanswered')::integer) from jsonb_array_elements(parts) x))) else '{}'::jsonb end;
end;$$;

alter function private.finish_attempt(uuid) rename to finish_attempt_before_result_methods;
create function private.finish_attempt(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.attempts;method text;r jsonb;score jsonb;begin
 select * into a from public.attempts where id=p_id for update;if a.id is null or a.status<>'in_progress' then return;end if;
 if a.mode<>'exam' then raise exception 'Dùng Kết thúc luyện tập';end if;
 select coalesce(exam->>'result_method','legacy') into method from private.attempt_snapshots where attempt_id=p_id;
 if method='legacy' then perform private.finish_attempt_before_result_methods(p_id);return;end if;
 if method is null then raise exception 'Thiếu snapshot lượt làm';end if;
 r:=private.evaluate_result(p_id);
 if method='counts' then insert into private.count_results(attempt_id,sections) values(p_id,r->'sections') on conflict do nothing;
 else score:=r->'score';insert into private.scores(attempt_id,earned,total,score,correct,wrong,unanswered,sections)
 values(p_id,(score->>'earned')::numeric,10,(score->>'score')::numeric,(score->>'correct')::integer,(score->>'wrong')::integer,(score->>'unanswered')::integer,score->'sections') on conflict do nothing;end if;
 update public.attempts set submitted_at=case when deadline is null then now() else least(now(),deadline) end,status=case when deadline is not null and now()>=deadline then 'expired' else 'submitted' end where id=p_id;
end;$$;

alter function public.get_attempt(uuid) rename to get_attempt_before_result_methods;
alter function public.get_attempt_before_result_methods(uuid) set schema private;
create function public.get_attempt(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;method text;begin r:=private.get_attempt_before_result_methods(p_id);
 select coalesce(exam->>'result_method','legacy') into method from private.attempt_snapshots where attempt_id=p_id;
 return jsonb_set(r,'{exam}',(r->'exam')||jsonb_build_object('result_method',method));end;$$;

alter function public.attempt_result(uuid) rename to attempt_result_before_result_methods;
alter function public.attempt_result_before_result_methods(uuid) set schema private;
create function public.attempt_result(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;a public.attempts;e public.exams;method text;available boolean;v jsonb;begin
 r:=private.attempt_result_before_result_methods(p_id);select * into a from public.attempts where id=p_id;
 select * into e from public.exams where id=a.exam_id;select coalesce(exam->>'result_method','legacy') into method from private.attempt_snapshots where attempt_id=p_id;
 available:=a.status<>'in_progress' and (public.is_admin() or a.mode='practice' or private.released(e.score_release,e.closes_at));
 r:=r||jsonb_build_object('result_method',method,'result_available',available);
 if method='legacy' then return r;end if;
 if a.mode='practice' then
 if available then v:=private.evaluate_result(p_id,true);r:=r||jsonb_build_object('section_summary',v->'sections');if method='thpt' then r:=r||jsonb_build_object('score',v->'score');end if;end if;
 else
 if method='counts' then r:=r-'score'-'section_summary';if available then r:=r||jsonb_build_object('section_summary',(select sections from private.count_results where attempt_id=p_id));end if;
 elsif available then r:=r||jsonb_build_object('section_scores',(select jsonb_agg(jsonb_build_object('section',x->'section','score',x->'earned','max_score',x->'total')) from private.scores s,jsonb_array_elements(s.sections) x where s.attempt_id=p_id));end if;
 end if;
 return r;end;$$;

-- Each report row carries its snapshot method and permitted result, never
-- attributes a count-only attempt to the current exam's later grading rule.
alter function public.result_report_page(jsonb,integer,integer) rename to result_report_page_before_result_methods;
alter function public.result_report_page_before_result_methods(jsonb,integer,integer) set schema private;
create function public.result_report_page(p_scope jsonb default '{}',p_page integer default 1,p_size integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 if p_scope ? 'result_method' and p_scope->>'result_method' not in ('legacy','thpt','counts','') then raise exception 'Cách tính kết quả không hợp lệ';end if;
 r:=private.result_report_page_before_result_methods(case when p_scope->>'result_method'='counts' then p_scope-'final' else p_scope end,p_page,p_size);
 return r||jsonb_build_object('rows',coalesce((select jsonb_agg(x||jsonb_build_object('result_method',coalesce(snap.exam->>'result_method','legacy'),'result_available',a.status<>'in_progress' and (public.is_admin() or a.mode='practice' or private.released(e.score_release,e.closes_at)))||
 case when a.mode='exam' and a.status<>'in_progress' and (public.is_admin() or private.released(e.score_release,e.closes_at)) and snap.exam->>'result_method'='counts' then jsonb_build_object('section_summary',cr.sections) else '{}'::jsonb end||
 case when a.mode='practice' then jsonb_build_object('practice_summary',private.practice_summary(a.id))||case when a.status<>'in_progress' and snap.exam->>'result_method'='thpt' then jsonb_build_object('score',private.evaluate_result(a.id,true)->'score') else '{}'::jsonb end else '{}'::jsonb end)
 from jsonb_array_elements(r->'rows') x join public.attempts a on a.id=(x->>'id')::uuid join public.exams e on e.id=a.exam_id
 left join private.attempt_snapshots snap on snap.attempt_id=a.id left join private.count_results cr on cr.attempt_id=a.id),'[]'));
end;$$;

revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.save_exam(jsonb,jsonb,uuid),public.exam_action(uuid,text),public.get_attempt(uuid),public.attempt_result(uuid),public.result_report_page(jsonb,integer,integer) from public,anon;
grant execute on function public.save_exam(jsonb,jsonb,uuid),public.exam_action(uuid,text),public.get_attempt(uuid),public.attempt_result(uuid),public.result_report_page(jsonb,integer,integer) to authenticated;

create or replace function private.report_rows(p_scope jsonb,p_admin boolean)
returns table(id uuid,exam_id uuid,user_id uuid,started_at timestamptz,deadline timestamptz,submitted_at timestamptz,status text,exam_title text,class_id uuid,student_name text,class_name text,score_method text,score jsonb)
language sql stable set search_path='' as $$
 select a.id,a.exam_id,a.user_id,a.started_at,a.deadline,a.submitted_at,a.status,coalesce(snap.exam->>'title',e.title),e.class_id,p.full_name,c.name,e.score_method,
 case when a.status<>'in_progress' and (p_admin or private.released(e.score_release,e.closes_at)) then
 case when p_admin or private.released(e.answer_release,e.closes_at) then to_jsonb(s) else to_jsonb(s)-'correct'-'wrong'-'unanswered'-'sections' end else null end
 from public.attempts a join public.exams e on e.id=a.exam_id join public.classes c on c.id=e.class_id join public.profiles p on p.id=a.user_id
 left join private.scores s on s.attempt_id=a.id left join private.attempt_snapshots snap on snap.attempt_id=a.id
 where (nullif(p_scope->>'result_method','') is null or coalesce(snap.exam->>'result_method','legacy')=p_scope->>'result_method') and a.mode=coalesce(nullif(p_scope->>'mode',''),'exam') and (p_admin or (a.user_id=auth.uid() and public.is_member(e.class_id)))
 and (nullif(p_scope->>'class_id','') is null or e.class_id=(p_scope->>'class_id')::uuid)
 and (nullif(p_scope->>'exam_id','') is null or e.id=(p_scope->>'exam_id')::uuid)
 and (nullif(p_scope->>'student','') is null or a.user_id=(p_scope->>'student')::uuid);
$$;
revoke all on function private.report_rows(jsonb,boolean) from public,anon,authenticated;
