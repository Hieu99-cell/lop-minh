import { session } from '@/lib/auth/session';
import { ProfileForm } from '@/features/profile/profile-form';
import { imageUrl } from '@/lib/supabase/server';
import { signOut } from '@/features/auth/actions';
export default async function Profile() {
  const { profile, user } = await session();
  const avatar = await imageUrl(profile.avatar_path);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TÀI KHOẢN CỦA BẠN</span>
          <h1>Hồ sơ cá nhân</h1>
          <p>Cập nhật thông tin để mọi người dễ nhận ra bạn.</p>
        </div>
        {avatar && (
          <div
            role="img"
            aria-label="Ảnh đại diện"
            className="profile-photo"
            style={{ backgroundImage: `url("${avatar}")` }}
          />
        )}
      </div>
      <ProfileForm profile={profile} email={user.email || ''} />
      <form action={signOut} className="profile-signout">
        <button className="button button-secondary">Đăng xuất tài khoản</button>
      </form>
    </>
  );
}
