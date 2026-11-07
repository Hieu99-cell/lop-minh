create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 full_name text not null default '', avatar_path text,
 role text not null default 'student' check (role in ('student','admin'))
);
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=auth.uid() and p.role='admin' and u.email_confirmed_at is not null);
$$;
create function private.sync_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,full_name,role) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),case when lower(new.email)='lconghieu0108@gmail.com' and new.email_confirmed_at is not null then 'admin' else 'student' end)
 on conflict(id) do update set role=case when lower(new.email)='lconghieu0108@gmail.com' and new.email_confirmed_at is not null then 'admin' else 'student' end;
 return new;
end; $$;
create trigger sync_profile after insert or update of email,email_confirmed_at on auth.users for each row execute function private.sync_profile();
insert into public.profiles(id,full_name,role) select id,coalesce(raw_user_meta_data->>'full_name',''),case when lower(email)='lconghieu0108@gmail.com' and email_confirmed_at is not null then 'admin' else 'student' end from auth.users on conflict(id) do nothing;

create table public.classes (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120), description text not null default '', school_year text not null,
 cover_path text, archived boolean not null default false, created_at timestamptz not null default now()
);
create table public.memberships (
 class_id uuid references public.classes on delete cascade, user_id uuid references public.profiles on delete cascade,
 joined_at timestamptz not null default now(), primary key(class_id,user_id)
);
create index memberships_user_idx on public.memberships(user_id);
create function public.is_member(cid uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.memberships where class_id=cid and user_id=auth.uid());
$$;
create table private.invites (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.classes on delete cascade,
 token text not null unique default encode(extensions.gen_random_bytes(24),'hex'), expires_at timestamptz, revoked boolean not null default false
);
create table public.exams (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.classes,
 title text not null check(length(title) between 1 and 200), description text not null default '', instructions text not null default '',
 status text not null default 'draft' check(status in ('draft','published','archived')),
 duration_minutes integer not null check(duration_minutes between 1 and 360), opens_at timestamptz, closes_at timestamptz,
 max_attempts integer not null default 1 check(max_attempts between 1 and 20), score_method text not null default 'highest' check(score_method in ('highest','latest')),
 shuffle_questions boolean not null default false, shuffle_options boolean not null default false,
 score_release text not null default 'after_submit' check(score_release in ('after_submit','after_close','never')),
 answer_release text not null default 'after_close' check(answer_release in ('after_submit','after_close','never')),
 version integer not null default 1, source_id uuid references public.exams, created_at timestamptz not null default now(),
 check (closes_at is null or opens_at is null or closes_at>opens_at)
);
create index exams_class_idx on public.exams(class_id);
create table public.questions (
 id uuid primary key default gen_random_uuid(), exam_id uuid not null references public.exams on delete cascade,
 position integer not null, kind text not null check(kind in ('single','multiple','boolean')),
 content text not null, image_path text, options jsonb not null, points numeric not null check(points>0 and points<=100)
);
create index questions_exam_idx on public.questions(exam_id);
create table private.answer_keys (
 question_id uuid primary key references public.questions on delete cascade, correct_ids jsonb not null, explanation text not null default ''
);
create table public.attempts (
 id uuid primary key default gen_random_uuid(), exam_id uuid not null references public.exams,
 user_id uuid not null references public.profiles, started_at timestamptz not null default now(), deadline timestamptz not null,
 submitted_at timestamptz, status text not null default 'in_progress' check(status in ('in_progress','submitted','expired')),
 question_order jsonb not null, option_order jsonb not null, answers jsonb not null default '{}', flagged jsonb not null default '[]'
);
create unique index one_active_attempt on public.attempts(exam_id,user_id) where status='in_progress';
create index attempts_user_exam_idx on public.attempts(user_id,exam_id);
create index attempts_deadline_idx on public.attempts(deadline) where status='in_progress';
create table private.scores (
 attempt_id uuid primary key references public.attempts, earned numeric not null, total numeric not null,
 score numeric not null, correct integer not null, wrong integer not null, unanswered integer not null
);

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.memberships enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy class_read on public.classes for select to authenticated using(public.is_admin() or public.is_member(id));
create policy class_admin on public.classes for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy member_read on public.memberships for select to authenticated using(public.is_admin() or user_id=auth.uid());
create policy member_delete on public.memberships for delete to authenticated using(public.is_admin());
create policy exam_read on public.exams for select to authenticated using(public.is_admin() or (status='published' and public.is_member(class_id)));
-- Nội dung câu hỏi chỉ được trả qua RPC sau khi bắt đầu bài; đáp án nằm trong schema riêng.
create policy question_admin on public.questions for select to authenticated using(public.is_admin());
create policy attempt_read on public.attempts for select to authenticated using(public.is_admin() or (user_id=auth.uid() and exists(select 1 from public.exams e where e.id=exam_id and public.is_member(e.class_id))));
revoke all on public.profiles,public.memberships,public.exams,public.questions,public.attempts from anon,authenticated;
grant select on public.profiles,public.memberships,public.exams,public.questions,public.attempts to authenticated;
grant delete on public.memberships to authenticated;
grant select,insert,update,delete on public.classes to authenticated;
revoke all on all tables in schema private from public,anon,authenticated;

create function public.update_profile(p_name text,p_avatar text default null) returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or length(trim(p_name)) not between 1 and 120 then raise exception 'Tên không hợp lệ'; end if;
 if p_avatar is not null and p_avatar not like auth.uid()::text || '/%' then raise exception 'Ảnh không hợp lệ'; end if;
 update public.profiles set full_name=trim(p_name),avatar_path=p_avatar where id=auth.uid();
end; $$;
create function public.manage_invite(p_class uuid,p_action text,p_expiry timestamptz default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.invites;
begin
 if not public.is_admin() then raise exception 'Không có quyền'; end if;
 perform 1 from public.classes where id=p_class for update;
 if not found then raise exception 'Không tìm thấy lớp'; end if;
 if p_action='revoke' then update private.invites set revoked=true where class_id=p_class; return '{}'::jsonb; end if;
 if p_action='create' then
 update private.invites set revoked=true where class_id=p_class;
 insert into private.invites(class_id,expires_at) values(p_class,p_expiry) returning * into r;
 return to_jsonb(r); end if;
 select * into r from private.invites where class_id=p_class and not revoked order by expires_at desc nulls first limit 1;
 return to_jsonb(r);
end; $$;
create function public.join_class(p_token text) returns uuid language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Vui lòng xác minh email'; end if;
 select i.class_id into cid from private.invites i join public.classes c on c.id=i.class_id where token=p_token and not revoked and not c.archived and (expires_at is null or expires_at>now()) for update of i;
 if cid is null then raise exception 'Link mời không hợp lệ hoặc đã hết hạn'; end if;
 insert into public.memberships(class_id,user_id) values(cid,auth.uid()) on conflict do nothing;
 return cid;
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('classroom','classroom',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy upload_images on storage.objects for insert to authenticated with check(bucket_id='classroom' and (storage.foldername(name))[1]=auth.uid()::text and (public.is_admin() or (storage.foldername(name))[2]='avatars'));
create policy read_images on storage.objects for select to authenticated using(bucket_id='classroom' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin() or exists(select 1 from public.classes c where c.cover_path=name and public.is_member(c.id)) or exists(select 1 from public.questions q join public.exams e on e.id=q.exam_id where q.image_path=name and public.is_member(e.class_id) and e.status='published') or exists(select 1 from public.profiles p where p.id=auth.uid() and p.avatar_path=name)));
