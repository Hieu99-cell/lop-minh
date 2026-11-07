create table public.import_batches(
 id uuid primary key default gen_random_uuid(),created_by uuid not null references public.profiles,
 request_key uuid not null,expected_count integer not null check(expected_count between 1 and 12),status text not null default 'review' check(status in ('review','confirmed')),
 review jsonb,confirmed jsonb,created_at timestamptz not null default now(),unique(created_by,request_key)
);
create table public.import_images(
 id uuid primary key,batch_id uuid not null references public.import_batches on delete cascade,
 path text not null,position integer not null check(position between 1 and 12),name text not null,
 status text not null default 'uploaded' check(status in ('uploaded','processing','completed','error')),
 attempts integer not null default 0,lease_token uuid,lease_until timestamptz,last_error text,extracted jsonb,
 created_at timestamptz not null default now(),unique(batch_id,position),unique(batch_id,path)
);
create index import_images_batch_idx on public.import_images(batch_id);
create table private.ocr_calls(user_id uuid not null references public.profiles,called_at timestamptz not null default now());
create index ocr_calls_user_time_idx on private.ocr_calls(user_id,called_at);
alter table public.import_batches enable row level security;
alter table public.import_images enable row level security;
revoke all on public.import_batches,public.import_images from public,anon,authenticated;
grant select on public.import_batches,public.import_images to authenticated;
revoke all on private.ocr_calls from public,anon,authenticated;
create policy import_admin on public.import_batches for select to authenticated using(public.is_admin() and created_by=auth.uid());
create policy import_images_admin on public.import_images for select to authenticated using(public.is_admin() and exists(select 1 from public.import_batches b where b.id=batch_id and b.created_by=auth.uid()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('exam-imports','exam-imports',false,3145728,array['image/jpeg','image/png','image/webp']);
create policy import_source_upload on storage.objects for insert to authenticated with check(bucket_id='exam-imports' and public.is_admin() and (storage.foldername(name))[1]=auth.uid()::text);
create policy import_source_read on storage.objects for select to authenticated using(bucket_id='exam-imports' and public.is_admin() and (storage.foldername(name))[1]=auth.uid()::text);
create function public.create_import_batch(p_request uuid,p_count integer) returns uuid language plpgsql security definer set search_path='' as $$
declare bid uuid;
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 perform pg_advisory_xact_lock(hashtextextended('import-create:'||auth.uid()::text,0));
 select id into bid from public.import_batches where created_by=auth.uid() and request_key=p_request;
 if bid is not null then return bid;end if;
 if (select count(*) from public.import_batches where created_by=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Tối đa 20 lô mỗi giờ';end if;
 insert into public.import_batches(created_by,request_key,expected_count) values(auth.uid(),p_request,p_count) on conflict(created_by,request_key) do update set request_key=excluded.request_key returning id into bid;return bid;
end; $$;
create function public.register_import_image(p_batch uuid,p_id uuid,p_path text,p_position integer,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare bid uuid;
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 select id into bid from public.import_batches where id=p_batch and created_by=auth.uid() and status='review' for update;
 if bid is null or p_path not like auth.uid()::text||'/'||p_batch::text||'/%' or length(p_name)>200 then raise exception 'Lô ảnh không hợp lệ';end if;
 if not exists(select 1 from storage.objects where bucket_id='exam-imports' and name=p_path) then raise exception 'Ảnh nguồn chưa tải lên';end if;
 if exists(select 1 from public.import_images where id=p_id and batch_id=p_batch and path=p_path) then return p_id;end if;
 if (select count(*) from public.import_images where batch_id=p_batch)>=12 then raise exception 'Tối đa 12 ảnh mỗi lô';end if;
 insert into public.import_images(id,batch_id,path,position,name) values(p_id,p_batch,p_path,p_position,p_name);return p_id;
end; $$;
create function public.claim_import_image(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.import_images;uid uuid:=auth.uid();token uuid;
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 perform pg_advisory_xact_lock(hashtextextended('ocr:'||uid::text,0));
 select x.* into i from public.import_images x join public.import_batches b on b.id=x.batch_id where x.id=p_id and b.created_by=uid and b.status='review' for update of x;
 if i.id is null then raise exception 'Không tìm thấy ảnh';end if;
 if i.status='completed' then return to_jsonb(i);end if;
 if i.lease_until>now() then raise exception 'Ảnh đang được xử lý';end if;
 if i.attempts>=3 then raise exception 'Ảnh đã thử tối đa 3 lần';end if;
 if (select count(*) from public.import_images x join public.import_batches b on b.id=x.batch_id where b.created_by=uid and x.lease_until>now() and x.status='processing')>=2 then raise exception 'Tối đa 2 ảnh xử lý đồng thời';end if;
 if (select count(*) from private.ocr_calls where user_id=uid and called_at>now()-interval '1 hour')>=30 then raise exception 'Đã đạt giới hạn 30 lần nhận diện/giờ';end if;
 token:=gen_random_uuid();insert into private.ocr_calls(user_id) values(uid);
 update public.import_images set status='processing',attempts=attempts+1,lease_token=token,lease_until=now()+interval '90 seconds',last_error=null where id=i.id returning * into i;
 return to_jsonb(i);
end; $$;
create function public.finish_import_image(p_id uuid,p_lease uuid,p_result jsonb,p_error text default null) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 if p_result is not null and octet_length(p_result::text)>500000 then raise exception 'Kết quả quá lớn';end if;
 update public.import_images x set status=case when p_error is null then 'completed' else 'error' end,extracted=p_result,last_error=left(p_error,200),lease_until=null
 where x.id=p_id and x.lease_token=p_lease and exists(select 1 from public.import_batches b where b.id=x.batch_id and b.created_by=auth.uid() and b.status='review');
 return found;
end; $$;
create function public.save_import_review(p_batch uuid,p_review jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 if p_review is null or octet_length(p_review::text)>2000000 then raise exception 'Bản duyệt không hợp lệ';end if;
 update public.import_batches set review=p_review where id=p_batch and created_by=auth.uid() and status='review';
 if not found then raise exception 'Lô ảnh đã xác nhận hoặc không tồn tại';end if;
end; $$;
create function public.confirm_import(p_batch uuid,p_questions jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.import_batches;q jsonb;ref jsonb;
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 select * into b from public.import_batches where id=p_batch and created_by=auth.uid() for update;
 if b.id is null then raise exception 'Không tìm thấy lô ảnh';end if;
 if b.status='confirmed' then return b.confirmed;end if;
 if p_questions is null or jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions) not between 1 and 200 then raise exception 'Chọn từ 1 đến 200 câu';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_questions) x)<>jsonb_array_length(p_questions) then raise exception 'ID câu hỏi trùng';end if;
 for q in select * from jsonb_array_elements(p_questions) loop
 if coalesce(q->>'import_key','')<>p_batch::text||'/'||coalesce(q->>'id','') then raise exception 'Khóa nhập không hợp lệ';end if;
 for ref in select * from jsonb_array_elements(q->'source_refs') loop
 if not exists(select 1 from public.import_images where id=(ref->>'image_id')::uuid and batch_id=p_batch) then raise exception 'Ảnh nguồn không thuộc lô';end if;
 end loop;
 end loop;
 update public.import_batches set status='confirmed',confirmed=p_questions where id=p_batch;return p_questions;
end; $$;
create function private.import_key_valid(key text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.import_batches b,jsonb_array_elements(b.confirmed) q where b.created_by=auth.uid() and b.status='confirmed' and q->>'import_key'=key);
$$;
revoke all on function public.create_import_batch(uuid,integer),public.register_import_image(uuid,uuid,text,integer,text),public.claim_import_image(uuid),public.finish_import_image(uuid,uuid,jsonb,text),public.save_import_review(uuid,jsonb),public.confirm_import(uuid,jsonb) from public,anon;
grant execute on function public.create_import_batch(uuid,integer),public.register_import_image(uuid,uuid,text,integer,text),public.claim_import_image(uuid),public.finish_import_image(uuid,uuid,jsonb,text),public.save_import_review(uuid,jsonb),public.confirm_import(uuid,jsonb) to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
