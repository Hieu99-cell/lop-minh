-- Reuse Supabase Auth and the existing profile/admin policy. No new accounts,
-- identity merges, role changes, session store or auth configuration changes.
create function public.current_profile() returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;sid text:=auth.jwt()->>'session_id';
begin
 if auth.uid() is null or sid is null or sid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 then raise sqlstate 'PT401' using message='Phiên đăng nhập không hợp lệ';end if;
 if not exists(select 1 from auth.sessions where id=sid::uuid and user_id=auth.uid() and (not_after is null or not_after>now()))
 or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
 then raise sqlstate 'PT401' using message='Phiên đăng nhập đã hết hạn hoặc bị thu hồi';end if;
 select * into p from public.profiles where id=auth.uid();if p.id is null then raise exception 'Chưa có hồ sơ';end if;
 return to_jsonb(p);
end;$$;
revoke all on function public.current_profile() from public,anon;
grant execute on function public.current_profile() to authenticated;
