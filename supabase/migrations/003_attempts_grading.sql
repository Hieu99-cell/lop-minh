-- Module chấm điểm chính thức chạy trong transaction tại PostgreSQL.
create function private.exact_match(selected jsonb, correct jsonb) returns boolean language sql immutable set search_path = '' as $$
 select jsonb_array_length(selected)>0 and jsonb_array_length(selected)=jsonb_array_length(correct) and selected @> correct and correct @> selected;
$$;
create function private.finish_attempt(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare a public.attempts; q record; chosen jsonb; earned numeric:=0; total numeric:=0; good int:=0; bad int:=0; blank int:=0;
begin
 select * into a from public.attempts where id=p_id for update;
 if a.id is null or a.status<>'in_progress' then return; end if;
 for q in select qs.*,k.correct_ids from public.questions qs join private.answer_keys k on k.question_id=qs.id where qs.exam_id=a.exam_id loop
 total:=total+q.points; chosen:=coalesce(a.answers->q.id::text,'[]');
 if jsonb_array_length(chosen)=0 then blank:=blank+1;
 elsif private.exact_match(chosen,q.correct_ids) then earned:=earned+q.points; good:=good+1;
 else bad:=bad+1; end if;
 end loop;
 insert into private.scores values(a.id,earned,total,round(earned*10/nullif(total,0),2),good,bad,blank) on conflict do nothing;
 update public.attempts set submitted_at=least(now(),deadline),status=case when now()>=deadline then 'expired' else 'submitted' end where id=a.id;
end; $$;
create function public.start_attempt(p_exam uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.exams; aid uuid; qo jsonb; oo jsonb;
begin
 if auth.uid() is null then raise exception 'Vui lòng đăng nhập'; end if;
 -- Khóa theo học sinh/đề để hai tab không vượt số lượt hoặc tạo trùng lượt.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_exam::text,0));
 select * into e from public.exams where id=p_exam for update;
 if e.id is null or not public.is_member(e.class_id) or e.status<>'published' or exists(select 1 from public.classes where id=e.class_id and archived) then raise exception 'Không được phép làm bài'; end if;
 for aid in select id from public.attempts where user_id=auth.uid() and exam_id=p_exam and status='in_progress' and deadline<=now() loop perform private.finish_attempt(aid); end loop;
 select id into aid from public.attempts where user_id=auth.uid() and exam_id=p_exam and status='in_progress';
 if aid is not null then return aid; end if;
 if (e.opens_at is not null and now()<e.opens_at) or (e.closes_at is not null and now()>=e.closes_at) then raise exception 'Bài chưa mở hoặc đã đóng'; end if;
 if (select count(*) from public.attempts where exam_id=p_exam and user_id=auth.uid())>=e.max_attempts then raise exception 'Đã hết số lượt làm'; end if;
 if not exists(select 1 from public.questions where exam_id=p_exam) then raise exception 'Đề chưa có câu hỏi'; end if;
 select jsonb_agg(id order by ord) into qo from (select id,case when e.shuffle_questions then random() else position::float end ord from public.questions where exam_id=p_exam) s;
 select jsonb_object_agg(id,opts) into oo from (select q.id,(select jsonb_agg(o->>'id' order by case when e.shuffle_options then random() else n::float end) from jsonb_array_elements(q.options) with ordinality x(o,n)) opts from public.questions q where exam_id=p_exam) s;
 insert into public.attempts(exam_id,user_id,deadline,question_order,option_order) values(p_exam,auth.uid(),least(now()+make_interval(mins=>e.duration_minutes),coalesce(e.closes_at,'infinity'::timestamptz)),qo,oo) returning id into aid;
 return aid;
end; $$;
create function private.check_attempt(p_id uuid) returns public.attempts language plpgsql security definer set search_path = '' as $$
declare a public.attempts;
begin
 select * into a from public.attempts where id=p_id for update;
 if a.id is null or not (public.is_admin() or (a.user_id=auth.uid() and exists(select 1 from public.exams where id=a.exam_id and public.is_member(class_id)))) then raise exception 'Không có quyền xem lượt làm'; end if;
 if a.status='in_progress' and now()>=a.deadline then perform private.finish_attempt(a.id); select * into a from public.attempts where id=p_id; end if;
 return a;
end; $$;
create function public.get_attempt(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.attempts;
begin
 a:=private.check_attempt(p_id);
 return to_jsonb(a)||jsonb_build_object('server_now',now(),'exam',(select jsonb_build_object('title',title,'instructions',instructions) from public.exams where id=a.exam_id),'questions',(select jsonb_agg(to_jsonb(q)) from public.questions q where q.exam_id=a.exam_id));
end; $$;
create function public.save_answer(p_id uuid,p_question uuid,p_selected jsonb,p_flagged boolean) returns text language plpgsql security definer set search_path = '' as $$
declare a public.attempts; q public.questions;
begin
 a:=private.check_attempt(p_id);
 if a.user_id<>auth.uid() or a.status<>'in_progress' then return 'closed'; end if;
 select * into q from public.questions where id=p_question and exam_id=a.exam_id;
 if q.id is null or jsonb_typeof(p_selected)<>'array' then raise exception 'Câu trả lời không hợp lệ'; end if;
 if jsonb_array_length(p_selected)>jsonb_array_length(q.options) or (q.kind<>'multiple' and jsonb_array_length(p_selected)>1) or (select count(distinct x) from jsonb_array_elements_text(p_selected) x)<>jsonb_array_length(p_selected) or exists(select 1 from jsonb_array_elements_text(p_selected) x where not exists(select 1 from jsonb_array_elements(q.options) o where o->>'id'=x)) then raise exception 'Lựa chọn không hợp lệ'; end if;
 update public.attempts set answers=jsonb_set(answers,array[p_question::text],p_selected),flagged=case when p_flagged then (flagged-p_question::text)||jsonb_build_array(p_question::text) else flagged-p_question::text end where id=p_id;
 return 'saved';
end; $$;
create function public.submit_attempt(p_id uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.attempts;
begin a:=private.check_attempt(p_id); if a.user_id<>auth.uid() and not public.is_admin() then raise exception 'Không có quyền'; end if; perform private.finish_attempt(p_id); return p_id; end; $$;
create function private.released(mode text,close_time timestamptz) returns boolean language sql stable set search_path = '' as $$ select mode='after_submit' or (mode='after_close' and close_time is not null and now()>=close_time); $$;
create function public.attempt_result(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.attempts; e public.exams; r jsonb;
begin
 a:=private.check_attempt(p_id); select * into e from public.exams where id=a.exam_id;
 r:=to_jsonb(a)||jsonb_build_object('exam_title',e.title,'class_id',e.class_id);
 if a.status='in_progress' then return r; end if;
 if public.is_admin() or private.released(e.score_release,e.closes_at) then r:=r||jsonb_build_object('score',(select to_jsonb(s) from private.scores s where attempt_id=a.id)); end if;
 if public.is_admin() or private.released(e.answer_release,e.closes_at) then r:=r||jsonb_build_object('review',(select jsonb_agg(to_jsonb(q)||jsonb_build_object('correct_ids',k.correct_ids,'explanation',k.explanation) order by q.position) from public.questions q join private.answer_keys k on k.question_id=q.id where exam_id=e.id)); end if;
 return r;
end; $$;
-- Cron độc lập trình duyệt; truy cập lượt làm cũng tự xử lý hết hạn.
create function private.expire_attempts() returns void language plpgsql security definer set search_path = '' as $$
declare aid uuid;
begin for aid in select id from public.attempts where status='in_progress' and deadline<=now() order by deadline limit 500 for update skip locked loop perform private.finish_attempt(aid); end loop; end; $$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke execute on all functions in schema public from public,anon;
grant execute on function public.is_admin(),public.is_member(uuid),public.update_profile(text,text),public.manage_invite(uuid,text,timestamptz),public.join_class(text),public.save_exam(jsonb,jsonb,uuid),public.author_exam(uuid),public.exam_action(uuid,text),public.start_attempt(uuid),public.get_attempt(uuid),public.save_answer(uuid,uuid,jsonb,boolean),public.submit_attempt(uuid),public.attempt_result(uuid) to authenticated;
