-- Giữ nguyên câu hỏi/lượt cũ. Chỉ thêm metadata nguồn và RPC lưu từng ý.
alter table public.import_batches drop constraint import_batches_expected_count_check;
alter table public.import_batches add constraint import_batches_expected_count_check check(expected_count between 1 and 30);
alter table public.import_batches add column source_type text not null default 'images' check(source_type in ('images','pdf'));
alter table public.import_batches add column document_name text;
alter table public.import_batches add column document_pages integer;
alter table public.import_images drop constraint import_images_position_check;
alter table public.import_images add constraint import_images_position_check check(position between 1 and 30);
alter table public.import_images add column pdf_page integer check(pdf_page between 1 and 60);
alter table public.import_images add column pdf_text text check(length(pdf_text)<=30000);
create function public.create_document_import(p_request uuid,p_count integer,p_name text,p_pages integer) returns uuid language plpgsql security definer set search_path='' as $$
declare bid uuid;b public.import_batches;
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 if p_pages not between 1 and 60 or p_count>p_pages or length(p_name) not between 1 and 200 then raise exception 'PDF không hợp lệ';end if;
 bid:=public.create_import_batch(p_request,p_count);
 select * into b from public.import_batches where id=bid for update;
 if b.document_name is not null and (b.document_name<>p_name or b.expected_count<>p_count or b.document_pages<>p_pages) then raise exception 'Khóa lô đã dùng cho tài liệu khác';end if;
 update public.import_batches set source_type='pdf',document_name=p_name,document_pages=p_pages where id=bid;return bid;
end; $$;
create or replace function public.register_import_image(p_batch uuid,p_id uuid,p_path text,p_position integer,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare b public.import_batches;
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 select * into b from public.import_batches where id=p_batch and created_by=auth.uid() and status='review' for update;
 if b.id is null or p_path not like auth.uid()::text||'/'||p_batch::text||'/%' or length(p_name)>200 or p_position>b.expected_count then raise exception 'Lô ảnh không hợp lệ';end if;
 if not exists(select 1 from storage.objects where bucket_id='exam-imports' and name=p_path) then raise exception 'Ảnh nguồn chưa tải lên';end if;
 if exists(select 1 from public.import_images where id=p_id and batch_id=p_batch and path=p_path) then return p_id;end if;
 if (select count(*) from public.import_images where batch_id=p_batch)>=b.expected_count then raise exception 'Lô đã đủ ảnh/trang';end if;
 insert into public.import_images(id,batch_id,path,position,name) values(p_id,p_batch,p_path,p_position,p_name);return p_id;
end; $$;
create function public.register_document_page(p_batch uuid,p_id uuid,p_path text,p_position integer,p_name text,p_page integer,p_text text) returns uuid language plpgsql security definer set search_path='' as $$
declare b public.import_batches;image_id uuid;
begin
 if not public.is_admin() then raise exception 'Không có quyền';end if;
 select * into b from public.import_batches where id=p_batch and created_by=auth.uid() for update;
 if b.source_type<>'pdf' or p_page not between 1 and b.document_pages or length(p_text)>30000 then raise exception 'Trang PDF không hợp lệ';end if;
 if exists(select 1 from public.import_images where batch_id=p_batch and pdf_page=p_page and id<>p_id) then raise exception 'Trang PDF đã có trong lô';end if;
 image_id:=public.register_import_image(p_batch,p_id,p_path,p_position,p_name);
 update public.import_images set pdf_page=p_page,pdf_text=p_text where id=image_id;return image_id;
end; $$;
create function public.save_statement(p_id uuid,p_question uuid,p_statement text,p_value text,p_flagged boolean) returns text language plpgsql security definer set search_path='' as $$
declare a public.attempts;q public.questions;selected jsonb;
begin
 a:=private.check_attempt(p_id);
 if a.user_id<>auth.uid() or a.status<>'in_progress' then return 'closed';end if;
 select * into q from public.questions where id=p_question and exam_id=a.exam_id;
 if q.id is null or q.kind<>'boolean_group' or (p_value is not null and p_value not in ('true','false')) or not exists(select 1 from jsonb_array_elements(q.options) o where o->>'id'=p_statement) then raise exception 'Nhận định không hợp lệ';end if;
 select coalesce(jsonb_agg(value),'[]') into selected from jsonb_array_elements(coalesce(a.answers->q.id::text,'[]')) where value#>>'{}' not in (p_statement||':true',p_statement||':false');
 if p_value is not null then selected:=selected||jsonb_build_array(p_statement||':'||p_value);end if;
 return public.save_answer(p_id,p_question,selected,p_flagged);
end; $$;
revoke all on function public.create_document_import(uuid,integer,text,integer),public.register_document_page(uuid,uuid,text,integer,text,integer,text),public.save_statement(uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.create_document_import(uuid,integer,text,integer),public.register_document_page(uuid,uuid,text,integer,text,integer,text),public.save_statement(uuid,uuid,text,text,boolean) to authenticated;
