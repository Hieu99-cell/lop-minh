-- Chỉ bổ sung loại/cột mới; giữ nguyên nội dung, điểm và lịch sử cũ.
alter table public.questions drop constraint questions_kind_check;
alter table public.questions add constraint questions_kind_check check(kind in ('single','multiple','boolean','boolean_group','short'));
alter table public.questions add column section integer not null default 1 check(section between 1 and 3);
alter table public.questions add column scoring_mode text not null default 'per_statement' check(scoring_mode in ('per_statement','all_or_nothing'));
alter table public.questions add column attachments jsonb not null default '[]' check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=8);
alter table private.answer_keys add column short_answer jsonb;
alter table private.scores add column sections jsonb;
alter table public.exams add column creation_key uuid unique;
create table private.question_sources(question_id uuid primary key references public.questions on delete cascade,import_key text unique,source_refs jsonb not null default '[]');
revoke all on private.question_sources from public,anon,authenticated;

create function private.normalized_number(value text) returns numeric language plpgsql immutable set search_path='' as $$
declare cleaned text:=replace(regexp_replace(replace(replace(value,chr(160),' '),chr(8239),' '),'[[:space:]]','','g'),',','.');
begin
 if length(cleaned)>100 or cleaned !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$' then return null;end if;
 return cleaned::numeric;
exception when others then return null;end; $$;
create function private.match_short(selected jsonb,config jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare answer text;accepted text;actual numeric;target numeric;tolerance numeric;
begin
 if config is null or jsonb_typeof(selected)<>'array' or jsonb_array_length(selected)<>1 then return false;end if;
 answer:=selected->>0;
 if config->>'mode'='numeric' then
 actual:=private.normalized_number(answer);tolerance:=private.normalized_number(coalesce(config->>'tolerance','0'));
 if actual is null or tolerance is null or tolerance<0 then return false;end if;
 for accepted in select jsonb_array_elements_text(config->'accepted') loop
 target:=private.normalized_number(accepted);if target is not null and abs(actual-target)<=tolerance then return true;end if;
 end loop;
 elsif config->>'mode'='text' then
 answer:=btrim(regexp_replace(replace(replace(answer,chr(160),' '),chr(8239),' '),'[[:space:]]+',' ','g'));
 for accepted in select jsonb_array_elements_text(config->'accepted') loop
 accepted:=btrim(regexp_replace(replace(replace(accepted,chr(160),' '),chr(8239),' '),'[[:space:]]+',' ','g'));
 if (case when coalesce((config->>'case_sensitive')::boolean,false) then answer=accepted else lower(answer)=lower(accepted) end) then return true;end if;
 end loop;
 end if;return false;
end; $$;
create function private.question_ready(qid uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare q public.questions;k private.answer_keys;statement jsonb;
begin
 select * into q from public.questions where id=qid;select * into k from private.answer_keys where question_id=qid;
 if q.id is null or length(trim(q.content))=0 or k.question_id is null then return false;end if;
 if q.kind='short' then
 if k.short_answer is null or coalesce(k.short_answer->>'mode','') not in ('numeric','text') or coalesce(jsonb_typeof(k.short_answer->'accepted'),'')<>'array' or jsonb_array_length(k.short_answer->'accepted')=0 then return false;end if;
 if exists(select 1 from jsonb_array_elements_text(k.short_answer->'accepted') x where trim(x)='') then return false;end if;
 if k.short_answer->>'mode'='numeric' and (private.normalized_number(coalesce(k.short_answer->>'tolerance','0')) is null or private.normalized_number(coalesce(k.short_answer->>'tolerance','0'))<0 or exists(select 1 from jsonb_array_elements_text(k.short_answer->'accepted') x where private.normalized_number(x) is null)) then return false;end if;
 return true;end if;
 if jsonb_array_length(q.options)<2 or exists(select 1 from jsonb_array_elements(q.options) x where coalesce(length(trim(x->>'text')),0)=0) then return false;end if;
 if q.kind='boolean_group' then
 if jsonb_array_length(k.correct_ids)<>jsonb_array_length(q.options) then return false;end if;
 for statement in select * from jsonb_array_elements(q.options) loop
 if (select count(*) from jsonb_array_elements_text(k.correct_ids) x where x in ((statement->>'id')||':true',(statement->>'id')||':false'))<>1 then return false;end if;
 end loop;return true;end if;
 if q.kind<>'multiple' and jsonb_array_length(k.correct_ids)<>1 then return false;end if;
 return jsonb_array_length(k.correct_ids)>0 and not exists(select 1 from jsonb_array_elements_text(k.correct_ids) c where not exists(select 1 from jsonb_array_elements(q.options) o where o->>'id'=c));
end; $$;
create function private.grade_question(qid uuid,chosen jsonb) returns numeric language plpgsql stable security definer set search_path='' as $$
declare q public.questions;k private.answer_keys;correct_count integer;
begin
 select * into q from public.questions where id=qid;select * into k from private.answer_keys where question_id=qid;
 if q.kind='short' then return case when private.match_short(chosen,k.short_answer) then q.points else 0 end;end if;
 if q.kind='boolean_group' then
 select count(*) into correct_count from jsonb_array_elements_text(k.correct_ids) x where chosen ? x;
 if q.scoring_mode='all_or_nothing' then return case when correct_count=jsonb_array_length(q.options) then q.points else 0 end;end if;
 return q.points*correct_count/nullif(jsonb_array_length(q.options),0);end if;
 return case when private.exact_match(chosen,k.correct_ids) then q.points else 0 end;
end; $$;
create or replace function private.finish_attempt(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.attempts;q record;chosen jsonb;earned numeric:=0;total numeric:=0;good int:=0;bad int:=0;blank int:=0;value numeric;parts jsonb:='[]';part int;pe numeric;pt numeric;pg int;pb int;pu int;
begin
 select * into a from public.attempts where id=p_id for update;
 if a.id is null or a.status<>'in_progress' then return;end if;
 for part in 1..3 loop
 pe:=0;pt:=0;pg:=0;pb:=0;pu:=0;
 for q in select * from public.questions where exam_id=a.exam_id and section=part loop
 chosen:=coalesce(a.answers->q.id::text,'[]');value:=private.grade_question(q.id,chosen);
 pe:=pe+value;pt:=pt+q.points;
 if jsonb_array_length(chosen)=0 or (q.kind='short' and trim(coalesce(chosen->>0,''))='') then pu:=pu+1;
 elsif value=q.points then pg:=pg+1;else pb:=pb+1;end if;
 end loop;
 earned:=earned+pe;total:=total+pt;good:=good+pg;bad:=bad+pb;blank:=blank+pu;
 if pt>0 then parts:=parts||jsonb_build_array(jsonb_build_object('section',part,'earned',pe,'total',pt,'correct',pg,'wrong',pb,'unanswered',pu));end if;
 end loop;
 insert into private.scores(attempt_id,earned,total,score,correct,wrong,unanswered,sections) values(a.id,earned,total,round(earned*10/nullif(total,0),2),good,bad,blank,parts) on conflict do nothing;
 update public.attempts set submitted_at=least(now(),deadline),status=case when now()>=deadline then 'expired' else 'submitted' end where id=a.id;
end; $$;
create or replace function public.save_answer(p_id uuid,p_question uuid,p_selected jsonb,p_flagged boolean) returns text language plpgsql security definer set search_path='' as $$
declare a public.attempts;q public.questions;item text;
begin
 a:=private.check_attempt(p_id);if a.user_id<>auth.uid() or a.status<>'in_progress' then return 'closed';end if;
 select * into q from public.questions where id=p_question and exam_id=a.exam_id;
 if q.id is null or p_selected is null or jsonb_typeof(p_selected)<>'array' or exists(select 1 from jsonb_array_elements(p_selected) x where jsonb_typeof(x)<>'string') then raise exception 'Câu trả lời không hợp lệ';end if;
 if q.kind='short' then
 if jsonb_array_length(p_selected)>1 or length(coalesce(p_selected->>0,''))>500 then raise exception 'Trả lời ngắn quá dài';end if;
 elsif q.kind='boolean_group' then
 if jsonb_array_length(p_selected)>jsonb_array_length(q.options) then raise exception 'Lựa chọn không hợp lệ';end if;
 for item in select * from jsonb_array_elements_text(p_selected) loop
 if not exists(select 1 from jsonb_array_elements(q.options) o where item in ((o->>'id')||':true',(o->>'id')||':false')) or (select count(*) from jsonb_array_elements_text(p_selected) x where split_part(x,':',1)=split_part(item,':',1))<>1 then raise exception 'Mỗi nhận định chỉ được chọn một giá trị';end if;
 end loop;
 else
 if jsonb_array_length(p_selected)>jsonb_array_length(q.options) or (q.kind<>'multiple' and jsonb_array_length(p_selected)>1) or (select count(distinct x) from jsonb_array_elements_text(p_selected) x)<>jsonb_array_length(p_selected) or exists(select 1 from jsonb_array_elements_text(p_selected) x where not exists(select 1 from jsonb_array_elements(q.options) o where o->>'id'=x)) then raise exception 'Lựa chọn không hợp lệ';end if;
 end if;
 update public.attempts set answers=jsonb_set(answers,array[p_question::text],p_selected),flagged=case when p_flagged then (flagged-p_question::text)||jsonb_build_array(p_question::text) else flagged-p_question::text end where id=p_id;return 'saved';
end; $$;
create or replace function public.attempt_result(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;e public.exams;r jsonb;
begin
 a:=private.check_attempt(p_id);select * into e from public.exams where id=a.exam_id;
 r:=to_jsonb(a)||jsonb_build_object('exam_title',e.title,'class_id',e.class_id);
 if a.status='in_progress' then return r;end if;
 if public.is_admin() or private.released(e.score_release,e.closes_at) then r:=r||jsonb_build_object('score',(select to_jsonb(s) from private.scores s where attempt_id=a.id));end if;
 if public.is_admin() or private.released(e.answer_release,e.closes_at) then r:=r||jsonb_build_object('review',(select jsonb_agg(to_jsonb(q)||jsonb_build_object('correct_ids',k.correct_ids,'explanation',k.explanation,'short_answer',k.short_answer) order by q.section,q.position) from public.questions q join private.answer_keys k on k.question_id=q.id where exam_id=e.id));end if;
 return r;
end; $$;
drop policy read_images on storage.objects;
create policy read_images on storage.objects for select to authenticated using(bucket_id='classroom' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin() or exists(select 1 from public.classes c where c.cover_path=name and public.is_member(c.id)) or exists(select 1 from public.questions q join public.exams e on e.id=q.exam_id where (q.image_path=name or exists(select 1 from jsonb_array_elements(q.attachments) a where a->>'path'=name)) and public.is_member(e.class_id) and e.status='published') or exists(select 1 from public.profiles p where p.id=auth.uid() and p.avatar_path=name)));
revoke all on all functions in schema private from public,anon,authenticated;

