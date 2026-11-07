-- QA có rollback: không xác minh thay user thật, không giữ dữ liệu thử.
begin;
create temporary table qa_extended(admin_id uuid,student_id uuid,class_id uuid,exam_id uuid,attempt_id uuid);
insert into qa_extended(admin_id,student_id) select id,gen_random_uuid() from auth.users where lower(email)='lconghieu0108@gmail.com' and email_confirmed_at is not null;
do $$ begin if (select count(*) from qa_extended)<>1 then raise exception 'Cần admin đã xác minh';end if;end; $$;
insert into auth.users(id,email,raw_user_meta_data) select student_id,'qa-extended-'||student_id::text||'@example.invalid','{}'::jsonb from qa_extended;
grant all on qa_extended to authenticated;
select set_config('request.jwt.claim.sub',(select admin_id::text from qa_extended),true);
set local role authenticated;
do $$ declare cid uuid;eid uuid;begin
 insert into public.classes(name,school_year) values('QA 3 phần - rollback','QA') returning id into cid;
 eid:=public.save_exam(jsonb_build_object('class_id',cid,'title','QA 3 phần','description','','instructions','','status','published','duration_minutes',30,'opens_at',null,'closes_at',null,'max_attempts',1,'score_method','highest','shuffle_questions',true,'shuffle_options',true,'score_release','after_submit','answer_release','never'),
 '[{"kind":"boolean_group","section":2,"scoring_mode":"per_statement","content":"Các nhận định","points":4,"options":[{"id":"a","text":"a"},{"id":"b","text":"b"},{"id":"c","text":"c"},{"id":"d","text":"d"}],"correct_ids":["a:true","b:false","c:true","d:false"]},{"kind":"short","section":3,"content":"Số âm","points":2,"options":[],"correct_ids":[],"short_answer":{"mode":"numeric","accepted":["-1.25"],"tolerance":"0","case_sensitive":false}},{"kind":"short","section":3,"content":"Thành phố","points":2,"options":[],"correct_ids":[],"short_answer":{"mode":"text","accepted":["Hà Nội"],"tolerance":"0","case_sensitive":false}}]');
 update qa_extended set class_id=cid,exam_id=eid;
end; $$;
reset role;
insert into public.memberships(class_id,user_id) select class_id,student_id from qa_extended;
select set_config('request.jwt.claim.sub',(select student_id::text from qa_extended),true);
set local role authenticated;
do $$ declare aid uuid;payload jsonb;q jsonb;answer jsonb;r jsonb;begin
 aid:=public.start_attempt((select exam_id from qa_extended));payload:=public.get_attempt(aid);
 if payload::text like '%short_answer%' or payload::text like '%correct_ids%' or payload::text like '%source_refs%' then raise exception 'Lộ dữ liệu private';end if;
 for q in select * from jsonb_array_elements(payload->'questions') loop
 answer:=case when q->>'kind'='boolean_group' then '["a:true","b:true","c:true","d:false"]'::jsonb when q->>'response_mode'='numeric' then '[" - 1,2500 "]'::jsonb else '["  HÀ   NỘI  "]'::jsonb end;
 perform public.save_answer(aid,(q->>'id')::uuid,answer,false);
 end loop;
 perform public.submit_attempt(aid);r:=public.attempt_result(aid);
 if (r->'score'->>'earned')::numeric<>7 or (r->'score'->>'score')::numeric<>8.75 or jsonb_array_length(r->'score'->'sections')<>2 then raise exception 'Chấm ba phần không đúng: %',r->'score';end if;
 if r ? 'review' then raise exception 'Lộ lời giải chưa công bố';end if;
end; $$;
reset role;
rollback;
select 'PASS: nhóm đúng/sai, số âm/phẩy thập phân, văn bản tiếng Việt, điểm phần và bảo vệ đáp án trên Supabase thật; đã rollback.' as verification;
