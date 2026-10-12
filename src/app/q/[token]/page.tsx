import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { hashToken } from '@/lib/auth/session';
import { toPublicQuoteLine } from '@/lib/domain/publicQuoteDto';
import { ResponseForm } from './ResponseForm';

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const publicToken = await prisma.publicQuoteToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      quote: {
        include: {
          customer: true,
          revisions: {
            orderBy: { revision: 'desc' },
            take: 1,
            include: { lines: { include: { product: true }, orderBy: { id: 'asc' } }, responses: true },
          },
        },
      },
    },
  });

  if (!publicToken || publicToken.revokedAt || publicToken.expiresAt < new Date()) {
    notFound();
  }

  const revision = publicToken.quote.revisions[0];
  const responseByLineId = new Map(revision?.responses.map((r) => [r.quoteLineId, r]) ?? []);

  // Only ever assemble the customer-facing payload through the single DTO
  // choke point — never hand-build a public response elsewhere.
  const publicLines = (revision?.lines ?? []).map((l) => ({
    id: l.id,
    ...toPublicQuoteLine({
      productId: l.productId,
      productName: l.product.canonicalName,
      unit: l.unit,
      offeredPrice: l.offeredPrice,
      currentCost: 0,
      marginPct: 0,
      targetMarginPct: 0,
      marginFloorPct: 0,
    }),
    response: responseByLineId.get(l.id) ?? null,
  }));

  const allResponded = publicLines.length > 0 && publicLines.every((l) => l.response);

  return (
    <div style={{ background: '#F5F7FB', minHeight: '100vh', padding: '28px 20px 48px' }}>
      <div className="publicwrap">
        <div className="publicbrand">
          <span className="pmk">F</span>
          <div>
            <b>Freshour</b>
            <span>ใบเสนอราคาสำหรับ {publicToken.quote.customer.name}</span>
          </div>
        </div>

        <div className="publichero">
          <h1>ใบเสนอราคา #{publicToken.quote.id.slice(0, 8).toUpperCase()}</h1>
          <p>กรุณาตรวจสอบรายการและราคาด้านล่าง — กดยอมรับ หรือขอเจรจาราคาเป็นรายสินค้า</p>
          <div className="publicmeta">
            <div>
              <em>ลูกค้า</em>
              <b>{publicToken.quote.customer.name}</b>
            </div>
            <div>
              <em>จำนวนสินค้า</em>
              <b>{publicLines.length} รายการ</b>
            </div>
            <div>
              <em>หมดอายุ</em>
              <b>{publicToken.expiresAt.toLocaleDateString('th-TH')}</b>
            </div>
          </div>
        </div>

        <div className="pubactions">
          <span className="grow" />
          <span className="pubnote">ลิงก์นี้ใช้ได้เฉพาะคุณเท่านั้น กรุณาอย่าส่งต่อ</span>
        </div>

        {allResponded && <div className="pubcomplete">✓ คุณได้ตอบกลับทุกรายการแล้ว ทีมขายจะติดต่อกลับเร็วๆ นี้</div>}

        <div className="pubtable">
          <div className="pubrow head">
            <span>สินค้า</span>
            <span>หน่วย</span>
            <span>ราคา (บาท)</span>
            <span>สถานะ</span>
            <span>การตอบกลับ</span>
          </div>
          {publicLines.map((line) => (
            <div key={line.id} className="pubrow">
              <span className="pn">{line.productName}</span>
              <span className="num">{line.unit}</span>
              <span className="num">{line.price.toLocaleString('th-TH')}</span>
              <span className="num">
                {line.response ? (line.response.action === 'ACCEPT' ? '✓' : '⋯') : '—'}
              </span>
              <div className="resp">
                {line.response ? (
                  line.response.action === 'ACCEPT' ? (
                    <span className="accepted">ยอมรับแล้ว</span>
                  ) : (
                    <span className="negotiated">ขอ {line.response.requestedPrice?.toLocaleString('th-TH')} บาท</span>
                  )
                ) : (
                  <ResponseForm token={token} quoteLineId={line.id} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
