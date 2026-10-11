import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { hashToken } from '@/lib/auth/session';
import { toPublicQuoteLine } from '@/lib/domain/publicQuoteDto';
import { ResponseForm } from './ResponseForm';
import styles from './quote.module.css';

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

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark}>F</span>
          <div>
            <b>Freshour</b>
            <span>ใบเสนอราคาสำหรับ {publicToken.quote.customer.name}</span>
          </div>
        </div>

        <div className={styles.lines}>
          {publicLines.map((line) => (
            <div key={line.id} className={styles.line}>
              <div>
                <p className={styles.productName}>{line.productName}</p>
                <p className={styles.unit}>{line.unit}</p>
              </div>
              <div className={styles.priceCol}>
                <p className={styles.price}>{line.price.toLocaleString('th-TH')} บาท</p>
                {line.response ? (
                  <p className={styles.respondedTag}>
                    {line.response.action === 'ACCEPT' ? 'คุณยอมรับราคานี้แล้ว' : `คุณขอเจรจาที่ ${line.response.requestedPrice?.toLocaleString('th-TH')} บาท`}
                  </p>
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
