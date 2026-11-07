import { admin } from '@/lib/auth/session';
import { ClassForm } from '@/features/classes/class-form';
export default async function NewClass() {
  await admin();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Tạo lớp học</h1>
          <p>Mở một không gian mới cho thầy cô và học sinh.</p>
        </div>
      </div>
      <div className="narrow">
        <ClassForm />
      </div>
    </>
  );
}
