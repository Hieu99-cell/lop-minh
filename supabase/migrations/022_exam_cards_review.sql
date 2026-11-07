-- Read-only snapshot review and bounded, batched card metadata. No historical
-- answers, snapshots, scores or release policies are rewritten.
create function public.exam_card_counts(p_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(cardinality(p_ids),0)>100 then raise exception 'Danh sách đề không hợp lệ';end if;
 return coalesce((select jsonb_object_agg(id,n) from (
 select e.id,(select count(*) from public.questions q where q.exam_id=e.id) n from public.exams e
 where e.id=any(p_ids) and (public.is_admin() or e.status='published' and public.is_member(e.class_id))) x),'{}');
end;$$;

create function public.attempt_review(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;e public.exams;s private.attempt_snapshots;r jsonb;qs jsonb:='[]';q jsonb;safe jsonb;chosen jsonb;allowed boolean;good integer;correct boolean;
begin
 a:=private.check_attempt(p_id);r:=public.attempt_result(p_id);
 if a.status='in_progress' then return r;end if;
 select * into e from public.exams where id=a.exam_id;select * into s from private.attempt_snapshots where attempt_id=p_id;
 -- Only the immutable snapshot is used, even if it is incomplete or absent.
 for q in select value from jsonb_array_elements(coalesce(s.questions,'[]')) loop
 allowed:=public.is_admin() or (a.mode='exam' and private.released(e.answer_release,e.closes_at))
 or (a.mode='practice' and exists(select 1 from private.practice_checks where attempt_id=p_id and question_id=(q->>'id')::uuid));
 safe:=q-'json_source'-'source_refs'-'import_key'-'correct_ids'-'short_answer'-'explanation';
 safe:=safe||jsonb_build_object('attachments',coalesce((select jsonb_agg(img) from jsonb_array_elements(q->'attachments') img where coalesce(img->>'purpose','illustration') in ('illustration','question') or allowed),'[]'));
 if allowed then
 chosen:=coalesce(a.answers->(q->>'id'),'[]');
 if q->>'kind'='boolean_group' then
 select count(*) into good from jsonb_array_elements_text(q->'correct_ids') token where chosen ? token;
 correct:=good=jsonb_array_length(q->'options') and jsonb_array_length(chosen)=jsonb_array_length(q->'options');
 elsif q->>'kind'='short' then correct:=private.match_short(chosen,q->'short_answer');
 else correct:=private.exact_match(chosen,q->'correct_ids');end if;
 safe:=safe||jsonb_build_object('correct_ids',q->'correct_ids','short_answer',q->'short_answer','explanation',q->'explanation',
 'review_status',case when jsonb_array_length(chosen)=0 or q->>'kind'='short' and btrim(coalesce(chosen->>0,''))='' then 'blank' when correct then 'correct' else 'wrong' end);
 if q->>'kind'='boolean_group' then safe:=safe||jsonb_build_object('statement_correct',good);end if;
 end if;
 qs:=qs||jsonb_build_array(safe);
 end loop;
 return (r-'review')||jsonb_build_object('review_questions',qs,'snapshot_missing',s.attempt_id is null);
end;$$;

create function public.exam_attempt_history(p_exam uuid,p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare aid uuid;r jsonb;rows jsonb:='[]';n integer;begin
 if auth.uid() is null or p_page<1 or p_page>100000 then raise exception 'Không có quyền';end if;
 select count(*) into n from public.attempts where exam_id=p_exam and user_id=auth.uid() and public.is_member(class_id);
 for aid in select id from public.attempts where exam_id=p_exam and user_id=auth.uid() and public.is_member(class_id) order by started_at desc,id limit 10 offset (p_page-1)*10 loop
 r:=public.attempt_result(aid);
 rows:=rows||jsonb_build_array(r-'answers'-'flagged'-'question_order'-'option_order'-'review'-'practice_history');
 end loop;
 return jsonb_build_object('rows',rows,'total',n);
end;$$;

-- Result view may show ordinary figures before answer release. Storage RLS
-- still independently checks each snapshot path, owner, origin class and purpose.
create or replace function public.attempt_image_manifest(p_id uuid,p_view text default 'attempt') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;e public.exams;r jsonb;begin
 if p_view is null or p_view not in ('attempt','result') then raise exception 'Chế độ không hợp lệ';end if;
 a:=private.check_attempt(p_id);select * into e from public.exams where id=a.exam_id;
 if p_view='attempt' and a.status<>'in_progress' or p_view='result' and a.status='in_progress' then raise exception 'Trạng thái lượt không phù hợp';end if;
 select coalesce(jsonb_agg(image),'[]') into r from(
 select jsonb_build_object('key',(q->>'id')||':legacy','question_id',q->>'id','slot','legacy','path',q->>'image_path','caption','Hình minh họa','placement','below') image
 from private.attempt_snapshots s,jsonb_array_elements(s.questions) q where s.attempt_id=p_id and nullif(q->>'image_path','') is not null and public.can_read_classroom_image(q->>'image_path')
 union all
 select img.value||jsonb_build_object('key',(q->>'id')||':attachment:'||img.n,'question_id',q->>'id','slot','attachment')
 from private.attempt_snapshots s cross join lateral jsonb_array_elements(s.questions) q cross join lateral jsonb_array_elements(q->'attachments') with ordinality img(value,n)
 where s.attempt_id=p_id and public.can_read_classroom_image(img.value->>'path') and
 (coalesce(img.value->>'purpose','illustration') in ('illustration','question') or
 (public.is_admin() or a.mode='exam' and p_view='result' and private.released(e.answer_release,e.closes_at) or a.mode='practice' and
 (p_view='result' and exists(select 1 from private.practice_checks pc where pc.attempt_id=p_id and pc.question_id=(q->>'id')::uuid) or p_view='attempt' and exists(select 1 from private.practice_state ps where ps.attempt_id=p_id and ps.question_id=(q->>'id')::uuid and ps.reviewing))))
 ) images;return r;
end;$$;
revoke all on function public.exam_card_counts(uuid[]),public.attempt_review(uuid),public.exam_attempt_history(uuid,integer) from public,anon;
grant execute on function public.exam_card_counts(uuid[]),public.attempt_review(uuid),public.exam_attempt_history(uuid,integer) to authenticated;
