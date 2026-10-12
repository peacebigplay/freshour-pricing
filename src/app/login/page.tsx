import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { LoginForm } from './LoginForm';

const ROLE_HOME: Record<string, string> = {
  EXECUTIVE: '/exec',
  PRICING: '/pricing',
  SALES: '/sales',
  ADMIN: '/admin',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(ROLE_HOME[user.role] ?? '/');

  const { next } = await searchParams;

  return (
    <div className="lgw" style={{ margin: -22 }}>
      <div className="lgc">
        <div className="lgl">
          <div className="brand">
            <span className="mk">F</span>
            <span>
              <b>Freshour</b>
              <span>ระบบตั้งราคาและออกราคา</span>
            </span>
          </div>
          <h1>
            ตั้งราคาทั้งสัปดาห์
            <br />
            จากที่เดียว
          </h1>
          <p>ทุน ราคาตลาด สัญญาลูกค้า และกำไรที่เหลือจริง — อยู่ในกระดานเดียวกัน ทุกตัวเลขบอกได้ว่ามาจากไหน</p>
          <ul className="lgf">
            <li>
              <i>📦</i>
              <span>
                <b>อังคาร</b> โรงงานส่งทุน
              </span>
            </li>
            <li>
              <i>🧮</i>
              <span>
                <b>พุธ</b> จบราคาทีละเจ้า
              </span>
            </li>
            <li>
              <i>📢</i>
              <span>
                <b>พฤหัส</b> ประกาศ + ออกใบราคา
              </span>
            </li>
          </ul>
        </div>

        <div className="lgr">
          <div className="lgh">
            <b>เข้าสู่ระบบ</b>
            <span>ใส่อีเมลและรหัสผ่านของคุณ</span>
          </div>
          <LoginForm next={next} />
          <p className="lgn">ลืมรหัส — ให้ผู้ดูแลตั้งใหม่ให้ ระบบไม่เก็บรหัสไว้ให้ดู · ใส่ผิดจะถูกบันทึกว่าใครใส่เมื่อไร</p>
        </div>
      </div>
    </div>
  );
}
