create function public.exam_summary(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.exams;
begin
 select * into e from public.exams where id=p_id;
 if e.id is null or not (public.is_admin() or (public.is_member(e.class_id) and e.status='published')) then raise exception 'Không có quyền'; end if;
 return jsonb_build_object('question_count',(select count(*) from public.questions where exam_id=p_id),'total_points',(select sum(points) from public.questions where exam_id=p_id));
end; $$;
create function public.result_report() returns jsonb language plpgsql security definer set search_path = '' as $$
declare aid uuid; result jsonb:='[]'; r jsonb;
begin
 if auth.uid() is null then raise exception 'Vui lòng đăng nhập'; end if;
 for aid in select a.id from public.attempts a join public.exams e on e.id=a.exam_id where public.is_admin() or (a.user_id=auth.uid() and public.is_member(e.class_id)) order by a.started_at desc loop
 r:=public.attempt_result(aid);
 r:=r||jsonb_build_object('student_name',(select full_name from public.profiles where id=(r->>'user_id')::uuid),'class_name',(select name from public.classes where id=(r->>'class_id')::uuid),'score_method',(select score_method from public.exams where id=(r->>'exam_id')::uuid));
 result:=result||jsonb_build_array(r-'review'-'answers'-'question_order'-'option_order'-'flagged');
 end loop;
 return result;
end; $$;
revoke execute on function public.exam_summary(uuid),public.result_report() from public,anon;
grant execute on function public.exam_summary(uuid),public.result_report() to authenticated;
