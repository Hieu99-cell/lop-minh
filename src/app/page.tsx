import { Brand } from '@/components/ui/brand';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Check,
  GraduationCap,
  ShieldCheck,
  Timer,
  BarChart3,
} from 'lucide-react';
export default function Home() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link href="/" className="brand">
          <Brand />
        </Link>
        <nav>
          <a href="#features">Tính năng</a>
          <a href="#how">Cách hoạt động</a>
          <Link href="/auth">Đăng nhập</Link>
          <Link className="button button-primary" href="/auth">
            Vào lớp học <ArrowRight size={16} />
          </Link>
        </nav>
      </header>
      <section className="landing-hero">
        <div>
          <span className="eyebrow">
            <span className="online-dot" /> KHÔNG GIAN HỌC TẬP KẾT NỐI
          </span>
          <h1>
            Dạy nhẹ nhàng hơn.
            <br />
            Học <em>tiến bộ</em> hơn.
          </h1>
          <p>
            Một nơi cho lớp học, bài kiểm tra và từng bước trưởng thành. Để thầy cô dành nhiều thời
            gian hơn cho điều quan trọng: học sinh của mình.
          </p>
          <div className="hero-buttons">
            <Link href="/dashboard" className="button button-primary">
              Bắt đầu cùng Lớp Mình <ArrowRight size={18} />
            </Link>
            <a href="#features" className="button button-secondary">
              Khám phá tính năng
            </a>
          </div>
          <div className="hero-checks">
            <span>
              <Check size={15} /> Giao diện tiếng Việt
            </span>
            <span>
              <Check size={15} /> Học trên mọi thiết bị
            </span>
          </div>
        </div>
        <div className="learning-art" aria-label="Minh họa không gian lớp học">
          <div className="art-grid" />
          <div className="formula formula-one">y = ax² + bx + c</div>
          <div className="formula formula-two">∫ f(x) dx</div>
          <div className="art-book">
            <GraduationCap size={60} />
            <span>HÔM NAY MÌNH HỌC GÌ?</span>
            <h2>
              Thêm kiến thức.
              <br />
              Thêm tự tin.
            </h2>
            <div className="art-lines">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="float-card">
            <span className="float-icon">
              <Check />
            </span>
            <div>
              <b>Mỗi nỗ lực đều có ý nghĩa</b>
              <small>Cùng nhau tiến bộ từng ngày</small>
            </div>
          </div>
          <span className="art-spark">✦</span>
        </div>
      </section>
      <section id="features" className="feature-section">
        <span className="eyebrow">TẬP TRUNG VÀO VIỆC HỌC</span>
        <h2>Mọi điều lớp học cần, trong một nơi.</h2>
        <div className="feature-grid">
          {[
            {
              icon: BookOpen,
              title: 'Lớp học luôn kết nối',
              text: 'Tạo lớp, gửi link mời và quản lý học sinh trong một không gian chung.',
            },
            {
              icon: Timer,
              title: 'Kiểm tra thật thuận tiện',
              text: 'Đề trắc nghiệm, công thức toán, tự lưu câu trả lời và thời gian làm bài rõ ràng.',
            },
            {
              icon: BarChart3,
              title: 'Nhìn thấy từng tiến bộ',
              text: 'Chấm điểm tự động, theo dõi lịch sử và xuất bảng điểm để dễ dàng tổng kết.',
            },
            {
              icon: ShieldCheck,
              title: 'Dữ liệu được bảo vệ',
              text: 'Mỗi học sinh chỉ thấy lớp học và kết quả được phép. Đáp án mở đúng thời điểm.',
            },
          ].map((f) => (
            <article key={f.title}>
              <f.icon />
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="how" className="how-section">
        <h2>Từ lời mời đến bước tiến mới.</h2>
        <div>
          {[
            'Tạo lớp và chuẩn bị bài kiểm tra',
            'Gửi link để học sinh tham gia',
            'Làm bài, nhận kết quả và cùng tiến bộ',
          ].map((s, i) => (
            <article key={s}>
              <b>0{i + 1}</b>
              <h3>{s}</h3>
            </article>
          ))}
        </div>
        <Link href="/auth" className="button button-primary">
          Mở không gian học tập <ArrowRight size={18} />
        </Link>
      </section>
      <footer className="landing-footer">
        <div className="brand">
          <Brand />
        </div>
        <p>Học tập kết nối. Tiến bộ cùng nhau.</p>
        <span>© 2026 Lớp Mình</span>
      </footer>
    </main>
  );
}
