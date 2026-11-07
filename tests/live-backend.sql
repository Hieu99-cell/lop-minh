-- Chỉ chạy sau khi admin thật đã xác minh email. Toàn bộ fixture nằm trong
-- transaction và bị rollback; không gửi email hay thay đổi tài khoản thật.
begin;
create temporary table qa_context(admin_id uuid,student_id uuid,other_id uuid,class_id uuid,exam_id uuid,attempt_id uuid);
insert into qa_context(admin_id,student_id,other_id)
select id,gen_random_uuid(),gen_random_uuid() from auth.users
where lower(email)='lconghieu0108@gmail.com' and email_confirmed_at is not null;
do $$ begin
 if (select count(*) from qa_context)<>1 then raise exception 'Cần admin thật đã xác minh'; end if;
end $$;
insert into auth.users(id,email,raw_user_meta_data)
select student_id,'qa-student-'||student_id::text||'@example.invalid','{"full_name":"QA giao dịch"}'::jsonb from qa_context
union all
select other_id,'qa-other-'||other_id::text||'@example.invalid','{}'::jsonb from qa_context;
grant all on qa_context to authenticated;
select set_config('request.jwt.claim.sub',(select admin_id::text from qa_context),true);
set local role authenticated;
do $$
declare cid uuid; eid uuid;
begin
 if not public.is_admin() then raise exception 'Admin thật không có quyền'; end if;
 insert into public.classes(name,school_year) values('QA transaction - sẽ rollback','2026–2027') returning id into cid;
 eid:=public.save_exam(jsonb_build_object(
 'class_id',cid,'title','QA transaction','description','','instructions','',
 'status','published','duration_minutes',1,'opens_at',null,'closes_at',null,
 'max_attempts',2,'score_method','highest','shuffle_questions',true,'shuffle_options',true,
 'score_release','after_submit','answer_release','never'),
 '[{"content":"QA nhiều đáp án","kind":"multiple","position":1,"points":2,"options":[{"id":"a","text":"2"},{"id":"b","text":"3"},{"id":"c","text":"4"}],"correct_ids":["a","b"],"explanation":"Nội dung riêng tư"},{"content":"QA đúng sai","kind":"boolean","position":2,"points":1,"options":[{"id":"t","text":"Đúng"},{"id":"f","text":"Sai"}],"correct_ids":["t"],"explanation":"Riêng tư"}]');
 update qa_context set class_id=cid,exam_id=eid;
end $$;
reset role;
-- Chỉ fixture trong transaction: không tự xác minh email của bất kỳ user nào.
insert into public.memberships(class_id,user_id) select class_id,student_id from qa_context;
select set_config('request.jwt.claim.sub',(select student_id::text from qa_context),true);
set local role authenticated;
do $$
declare c record; aid uuid; payload jsonb; q jsonb; result jsonb;
begin
 select * into c from qa_context;
 if public.is_admin() then raise exception 'Học sinh có quyền admin'; end if;
 if (select count(*) from public.classes)<>1 then raise exception 'RLS lớp không đúng'; end if;
 aid:=public.start_attempt(c.exam_id);
 if public.start_attempt(c.exam_id)<>aid then raise exception 'Bắt đầu tạo trùng lượt'; end if;
 update qa_context set attempt_id=aid;
 payload:=public.get_attempt(aid);
 if payload::text like '%correct_ids%' or payload::text like '%explanation%' then raise exception 'Lộ đáp án'; end if;
 for q in select * from jsonb_array_elements(payload->'questions') loop
 perform public.save_answer(aid,(q->>'id')::uuid,case when q->>'kind'='multiple' then '["b","a"]'::jsonb else '["t"]'::jsonb end,true);
 end loop;
 if public.get_attempt(aid)->'question_order'<>payload->'question_order' then raise exception 'Thứ tự thay đổi'; end if;
 perform public.submit_attempt(aid);perform public.submit_attempt(aid);
 result:=public.attempt_result(aid);
 if (result->'score'->>'score')::numeric<>10 then raise exception 'Chấm điểm không đúng: %',result->'score'; end if;
 if result ? 'review' then raise exception 'Lộ lời giải chưa công bố'; end if;
 begin
 perform public.author_exam(c.exam_id);
 raise exception 'QA_ADMIN_LEAK';
 exception when others then if sqlerrm='QA_ADMIN_LEAK' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub',(select other_id::text from qa_context),true);
do $$
declare c record;
begin
 select * into c from qa_context;
 if exists(select 1 from public.classes) or exists(select 1 from public.attempts) then raise exception 'RLS làm lộ dữ liệu'; end if;
 begin
 perform public.attempt_result(c.attempt_id);raise exception 'QA_RESULT_LEAK';
 exception when others then if sqlerrm='QA_RESULT_LEAK' then raise; end if; end;
end $$;
reset role;
-- Kiểm tra hết giờ ở server, không phụ thuộc đồng hồ trình duyệt.
select set_config('request.jwt.claim.sub',(select student_id::text from qa_context),true);
set local role authenticated;
update qa_context set attempt_id=public.start_attempt(exam_id);
reset role;
update public.attempts set deadline=now()-interval '1 second'
where id=(select attempt_id from qa_context);
do $$
declare aid uuid;
begin
 select attempt_id into aid from qa_context;
 perform private.finish_attempt(aid);
 if (select status from public.attempts where id=aid)<>'expired' then raise exception 'Hết giờ không kết thúc'; end if;
 if (select submitted_at<>deadline from public.attempts where id=aid) then raise exception 'Nộp không đúng deadline'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select student_id::text from qa_context),true);
set local role authenticated;
do $$
begin
 begin
 perform public.start_attempt((select exam_id from qa_context));raise exception 'QA_LIMIT_BYPASS';
 exception when others then if sqlerrm='QA_LIMIT_BYPASS' then raise; end if; end;
end $$;
reset role;
rollback;
select 'PASS: RLS, admin thật, chấm điểm, không lộ đáp án, lưu bài, nộp trùng, hết giờ và giới hạn lượt. Fixture đã rollback.' as verification;
