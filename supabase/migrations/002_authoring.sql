create function public.save_exam(p_exam jsonb,p_questions jsonb,p_id uuid default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare eid uuid; item jsonb; qid uuid; opt jsonb; correct jsonb; n integer:=0;
begin
 if not public.is_admin() then raise exception 'Không có quyền quản trị'; end if;
 if jsonb_array_length(p_questions) not between 1 and 200 then raise exception 'Đề cần từ 1 đến 200 câu'; end if;
 if p_id is not null then
 perform 1 from public.exams where id=p_id for update;
 if exists(select 1 from public.attempts where exam_id=p_id) then raise exception 'Đề đã có lượt làm. Hãy sao chép đề để tạo phiên bản mới.'; end if;
 update public.exams set title=p_exam->>'title',description=coalesce(p_exam->>'description',''),instructions=coalesce(p_exam->>'instructions',''),status=p_exam->>'status',duration_minutes=(p_exam->>'duration_minutes')::int,opens_at=(p_exam->>'opens_at')::timestamptz,closes_at=(p_exam->>'closes_at')::timestamptz,max_attempts=(p_exam->>'max_attempts')::int,score_method=p_exam->>'score_method',shuffle_questions=(p_exam->>'shuffle_questions')::boolean,shuffle_options=(p_exam->>'shuffle_options')::boolean,score_release=p_exam->>'score_release',answer_release=p_exam->>'answer_release' where id=p_id returning id into eid;
 if eid is null then raise exception 'Không tìm thấy đề'; end if;
 delete from public.questions where exam_id=eid;
 else
 insert into public.exams(class_id,title,description,instructions,status,duration_minutes,opens_at,closes_at,max_attempts,score_method,shuffle_questions,shuffle_options,score_release,answer_release)
 values((p_exam->>'class_id')::uuid,p_exam->>'title',coalesce(p_exam->>'description',''),coalesce(p_exam->>'instructions',''),p_exam->>'status',(p_exam->>'duration_minutes')::int,(p_exam->>'opens_at')::timestamptz,(p_exam->>'closes_at')::timestamptz,(p_exam->>'max_attempts')::int,p_exam->>'score_method',(p_exam->>'shuffle_questions')::boolean,(p_exam->>'shuffle_options')::boolean,p_exam->>'score_release',p_exam->>'answer_release') returning id into eid;
 end if;
 for item in select * from jsonb_array_elements(p_questions) loop
 n:=n+1; opt:=item->'options'; correct:=item->'correct_ids';
 if length(trim(item->>'content'))=0 or jsonb_array_length(opt) not between 2 and 8 or jsonb_array_length(correct)<1 then raise exception 'Nội dung, lựa chọn hoặc đáp án không hợp lệ ở câu %',n; end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(opt) x)<>jsonb_array_length(opt) or exists(select 1 from jsonb_array_elements(opt) x where coalesce(length(trim(x->>'text')),0)=0) then raise exception 'Lựa chọn không hợp lệ'; end if;
 if exists(select 1 from jsonb_array_elements_text(correct) c where not exists(select 1 from jsonb_array_elements(opt) o where o->>'id'=c)) or (select count(distinct x) from jsonb_array_elements_text(correct) x)<>jsonb_array_length(correct) then raise exception 'Đáp án không hợp lệ'; end if;
 if item->>'kind'<>'multiple' and jsonb_array_length(correct)<>1 then raise exception 'Câu một đáp án cần chọn đúng một lựa chọn'; end if;
 if item->>'kind'='boolean' and jsonb_array_length(opt)<>2 then raise exception 'Đúng/sai cần hai lựa chọn'; end if;
 insert into public.questions(exam_id,position,kind,content,image_path,options,points) values(eid,n,item->>'kind',item->>'content',nullif(item->>'image_path',''),opt,(item->>'points')::numeric) returning id into qid;
 insert into private.answer_keys values(qid,correct,coalesce(item->>'explanation',''));
 end loop;
 return eid;
end; $$;
create function public.author_exam(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Không có quyền'; end if;
 return (select to_jsonb(e)||jsonb_build_object('locked',exists(select 1 from public.attempts where exam_id=e.id),'questions',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('correct_ids',k.correct_ids,'explanation',k.explanation) order by q.position) from public.questions q join private.answer_keys k on k.question_id=q.id where q.exam_id=e.id),'[]'::jsonb)) from public.exams e where e.id=p_id);
end; $$;
create function public.exam_action(p_id uuid,p_action text) returns uuid language plpgsql security definer set search_path = '' as $$
declare eid uuid; q record; qid uuid; e public.exams;
begin
 if not public.is_admin() then raise exception 'Không có quyền'; end if;
 select * into e from public.exams where id=p_id for update;
 if e.id is null then raise exception 'Không tìm thấy đề'; end if;
 if p_action in ('published','archived') then update public.exams set status=p_action where id=p_id; return p_id; end if;
 if p_action<>'copy' then raise exception 'Thao tác không hợp lệ'; end if;
 eid:=gen_random_uuid(); e.id:=eid; e.title:=e.title||' (bản sao)'; e.status:='draft'; e.source_id:=p_id; e.version:=e.version+1; e.created_at:=now();
 insert into public.exams select e.*;
 for q in select * from public.questions where exam_id=p_id loop
 qid:=gen_random_uuid(); insert into public.questions values(qid,eid,q.position,q.kind,q.content,q.image_path,q.options,q.points);
 insert into private.answer_keys select qid,correct_ids,explanation from private.answer_keys where question_id=q.id;
 end loop;
 return eid;
end; $$;
