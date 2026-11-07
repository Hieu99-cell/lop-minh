-- Tra quyền ảnh qua hàm có phạm vi hẹp, không phụ thuộc RLS chỉ-admin của questions.
create function public.can_read_classroom_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
 public.is_admin()
 or exists(select 1 from public.profiles p where p.id=auth.uid() and p.avatar_path=p_path)
 or (storage.foldername(p_path))[1]=auth.uid()::text and (storage.foldername(p_path))[2]='avatars'
 or exists(select 1 from public.classes c where c.cover_path=p_path and public.is_member(c.id))
 or exists(
 select 1 from public.questions q join public.exams e on e.id=q.exam_id
 join public.attempts a on a.exam_id=e.id and a.user_id=auth.uid()
 where e.status in ('published','archived') and public.is_member(e.class_id)
 and (q.image_path=p_path or exists(select 1 from jsonb_array_elements(q.attachments) img where img->>'path'=p_path and (
 coalesce(img->>'purpose','illustration') in ('illustration','question')
 or img->>'purpose' in ('answer','solution') and a.status<>'in_progress' and private.released(e.answer_release,e.closes_at)
 )))
 ));
$$;
revoke all on function public.can_read_classroom_image(text) from public,anon;
grant execute on function public.can_read_classroom_image(text) to authenticated;
drop policy read_images on storage.objects;
create policy read_images on storage.objects for select to authenticated using(bucket_id='classroom' and public.can_read_classroom_image(name));

create function public.attempt_image_manifest(p_id uuid,p_view text default 'attempt') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;e public.exams;r jsonb;
begin
 if p_view not in ('attempt','result') or p_view is null then raise exception 'Chế độ không hợp lệ';end if;
 a:=private.check_attempt(p_id);
 if not public.is_admin() and a.user_id<>auth.uid() then raise exception 'Không có quyền';end if;
 select * into e from public.exams where id=a.exam_id;
 if e.status='draft' and not public.is_admin() then raise exception 'Đề chưa công bố';end if;
 if p_view='attempt' and a.status<>'in_progress' then raise exception 'Lượt làm đã đóng';end if;
 if p_view='result' and (a.status='in_progress' or not(public.is_admin() or private.released(e.answer_release,e.closes_at))) then raise exception 'Đáp án chưa công bố';end if;
 select coalesce(jsonb_agg(image),'[]') into r from (
 select jsonb_build_object('key',q.id::text||':legacy','question_id',q.id,'slot','legacy','path',q.image_path,'caption','Hình minh họa','placement','below') image
 from public.questions q where q.exam_id=a.exam_id and nullif(q.image_path,'') is not null and public.can_read_classroom_image(q.image_path)
 union all
 select img.value||jsonb_build_object('key',q.id::text||':attachment:'||img.n,'question_id',q.id,'slot','attachment')
 from public.questions q cross join lateral jsonb_array_elements(q.attachments) with ordinality img(value,n)
 where q.exam_id=a.exam_id and public.can_read_classroom_image(img.value->>'path')
 and (coalesce(img.value->>'purpose','illustration') in ('illustration','question') or p_view='result' and img.value->>'purpose' in ('answer','solution'))
 ) allowed;return r;
end; $$;
revoke all on function public.attempt_image_manifest(uuid,text) from public,anon;
grant execute on function public.attempt_image_manifest(uuid,text) to authenticated;
-- Không đưa metadata ảnh đáp án/lời giải vào payload đang làm bài.
alter function public.get_attempt(uuid) rename to get_attempt_before_images;
alter function public.get_attempt_before_images(uuid) set schema private;
revoke all on function private.get_attempt_before_images(uuid) from public,anon,authenticated;
create function public.get_attempt(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;qs jsonb;
begin
 result:=private.get_attempt_before_images(p_id);
 select coalesce(jsonb_agg(q.value||jsonb_build_object('attachments',coalesce((select jsonb_agg(img) from jsonb_array_elements(q.value->'attachments') img where coalesce(img->>'purpose','illustration') in ('illustration','question')),'[]')) order by q.n),'[]') into qs
 from jsonb_array_elements(result->'questions') with ordinality q(value,n);
 return result||jsonb_build_object('questions',qs);
end; $$;
revoke all on function public.get_attempt(uuid) from public,anon;
grant execute on function public.get_attempt(uuid) to authenticated;
