-- Report projection excludes answers, ordering, questions and answer keys.
create function private.report_rows(p_scope jsonb, p_admin boolean)
returns table(id uuid, exam_id uuid, user_id uuid, started_at timestamptz,
 deadline timestamptz, submitted_at timestamptz, status text, exam_title text,
 class_id uuid, student_name text, class_name text, score_method text, score jsonb)
language sql stable set search_path='' as $$
 select a.id,a.exam_id,a.user_id,a.started_at,a.deadline,a.submitted_at,a.status,
 e.title,e.class_id,p.full_name,c.name,e.score_method,
 case when a.status<>'in_progress' and (p_admin or private.released(e.score_release,e.closes_at)) then to_jsonb(s) else null end
 from public.attempts a join public.exams e on e.id=a.exam_id
 join public.classes c on c.id=e.class_id join public.profiles p on p.id=a.user_id
 left join private.scores s on s.attempt_id=a.id
 where (p_admin or (a.user_id=auth.uid() and public.is_member(e.class_id)))
 and (nullif(p_scope->>'class_id','') is null or e.class_id=(p_scope->>'class_id')::uuid)
 and (nullif(p_scope->>'exam_id','') is null or e.id=(p_scope->>'exam_id')::uuid)
 and (nullif(p_scope->>'student','') is null or a.user_id=(p_scope->>'student')::uuid);
$$;
revoke all on function private.report_rows(jsonb,boolean) from public,anon,authenticated;

create function public.result_report_page(p_scope jsonb default '{}',p_page integer default 1,p_size integer default 10)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_admin boolean:=public.is_admin(); aid uuid; result jsonb; cid uuid;
begin
 if auth.uid() is null then raise exception 'Vui lòng đăng nhập';end if;
 if p_page<1 or p_size<1 or p_size>500 then raise exception 'Phân trang không hợp lệ';end if;
 -- Finalize only expired, authorized attempts; never submit a live attempt.
 for aid in select a.id from public.attempts a join public.exams e on e.id=a.exam_id
 where a.status='in_progress' and a.deadline<=now()
 and (v_admin or (a.user_id=auth.uid() and public.is_member(e.class_id)))
 and (nullif(p_scope->>'class_id','') is null or e.class_id=(p_scope->>'class_id')::uuid)
 and (nullif(p_scope->>'exam_id','') is null or e.id=(p_scope->>'exam_id')::uuid)
 and (nullif(p_scope->>'student','') is null or a.user_id=(p_scope->>'student')::uuid)
 loop perform private.finish_attempt(aid);end loop;

 with base as materialized (select * from private.report_rows(p_scope,v_admin)),
 filtered as materialized (select * from base where
 position(lower(coalesce(p_scope->>'q','')) in lower(concat_ws(' ',student_name,exam_title,class_name)))>0),
 ranked as (select id,row_number() over(partition by user_id,exam_id order by
 case when score_method='highest' then (score->>'score')::numeric end desc nulls last,
 started_at desc,id desc) rn from filtered where score is not null and status<>'in_progress'),
 finals as materialized (select f.* from filtered f join ranked r using(id) where rn=1),
 selected as materialized (select * from filtered f where coalesce(p_scope->>'final','false')<>'true'
 or exists(select 1 from finals x where x.id=f.id)),
 paged as (select * from selected order by
 case when p_scope->>'sort'='score' then (score->>'score')::numeric end desc nulls last,
 started_at desc,id desc limit p_size offset (p_page::bigint-1)*p_size),
 options as materialized (select * from private.report_rows('{}',v_admin))
 select jsonb_build_object(
 'rows',coalesce((select jsonb_agg((to_jsonb(x)-'score') || case when x.score is null then '{}'::jsonb else jsonb_build_object('score',x.score) end) from paged x),'[]'),
 'total',(select count(*) from selected),
 'students',(select count(distinct user_id) from selected where status<>'in_progress'),
 'mean',(select avg((score->>'score')::numeric) from finals),
 'distribution',jsonb_build_array(
  (select count(*) from finals where (score->>'score')::numeric<5),
  (select count(*) from finals where (score->>'score')::numeric>=5 and (score->>'score')::numeric<7),
  (select count(*) from finals where (score->>'score')::numeric>=7 and (score->>'score')::numeric<9),
  (select count(*) from finals where (score->>'score')::numeric>=9)),
 'classes',coalesce((select jsonb_agg(x order by x.name) from(select distinct class_id id,class_name name from options)x),'[]'),
 'exams',coalesce((select jsonb_agg(x order by x.name) from(select distinct exam_id id,exam_title name from options)x),'[]')
 ) into result;
 if v_admin then
 cid:=nullif(p_scope->>'class_id','')::uuid;
 if cid is null and nullif(p_scope->>'exam_id','') is not null then select class_id into cid from public.exams where id=(p_scope->>'exam_id')::uuid;end if;
 if cid is not null then result:=result||jsonb_build_object('memberCount',(select count(*) from public.memberships where class_id=cid));end if;
 end if;
 return result;
end;$$;
revoke all on function public.result_report_page(jsonb,integer,integer) from public,anon;
grant execute on function public.result_report_page(jsonb,integer,integer) to authenticated;

create or replace function public.result_report() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:='[]';batch jsonb;page integer:=1;
begin
 loop
 batch:=public.result_report_page('{}',page,500);
 result:=result||(batch->'rows');
 exit when page*500 >= (batch->>'total')::bigint;
 page:=page+1;
 end loop;
 return result;
end;$$;
