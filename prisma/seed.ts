// Production seed/bootstrap — Freshour Master Prompt v2, Section 33.
// Creates: dev-only login fixtures (DATA_ORIGIN = DEV_FIXTURE, clearly
// labeled), the initial Margin Policy (versioned business rule, NOT derived
// from the PDF), and — if a verified extraction file exists under
// data/imports/ — imports the real source data and opens the first
// Pricing Round. Does not insert any fake market price, invoice, or AR data.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';
import { DEFAULT_CATEGORY_TARGETS, DEFAULT_GLOBAL_FLOOR_PCT } from '../src/lib/domain/margin';

const prisma = new PrismaClient();

async function seedUsers() {
  const fixtures = [
    { email: 'exec@freshour.dev', name: 'สมชาย (Executive)', role: 'EXECUTIVE' as const },
    { email: 'pricing@freshour.dev', name: 'สมหญิง (Pricing)', role: 'PRICING' as const },
    { email: 'sales@freshour.dev', name: 'สมศักดิ์ (Sales)', role: 'SALES' as const },
    { email: 'admin@freshour.dev', name: 'แอดมิน (Admin)', role: 'ADMIN' as const },
  ];

  for (const f of fixtures) {
    const passwordHash = await hashPassword('Freshour2026!');
    await prisma.user.upsert({
      where: { email: f.email },
      update: {},
      create: { email: f.email, name: f.name, role: f.role, passwordHash },
    });
  }
  console.log(`Seeded ${fixtures.length} DEV_FIXTURE login accounts (password: Freshour2026!).`);
}

async function seedMarginPolicy() {
  const existing = await prisma.marginPolicyVersion.findFirst({ where: { effectiveTo: null } });
  if (existing) return existing;

  const policy = await prisma.marginPolicyVersion.create({
    data: {
      version: 1,
      globalFloorPct: DEFAULT_GLOBAL_FLOOR_PCT,
      categoryRules: {
        create: Object.entries(DEFAULT_CATEGORY_TARGETS).map(([category, targetPct]) => ({
          category: category as keyof typeof DEFAULT_CATEGORY_TARGETS,
          targetPct,
        })),
      },
    },
  });
  console.log(`Seeded Margin Policy v${policy.version} (global floor ${policy.globalFloorPct}%).`);
  return policy;
}

async function seedIntegrationStatuses() {
  const configs = [
    { key: 'market_connector', displayName: 'Market / Competitor Price Connector' },
    { key: 'e_today', displayName: 'e-Today Accounting' },
    { key: 'payment_gateway', displayName: 'Payment Gateway' },
  ];
  for (const c of configs) {
    await prisma.integrationConfig.upsert({
      where: { key: c.key },
      update: {},
      create: { key: c.key, displayName: c.displayName, status: 'NOT_CONFIGURED' },
    });
  }
  await prisma.marketSource.upsert({
    where: { id: 'placeholder-market-source' },
    update: {},
    create: {
      id: 'placeholder-market-source',
      name: 'Competitor store-check (manual)',
      kind: 'store_check',
      status: 'NOT_CONFIGURED',
    },
  }).catch(async () => {
    const already = await prisma.marketSource.findFirst();
    if (!already) {
      await prisma.marketSource.create({
        data: { name: 'Competitor store-check (manual)', kind: 'store_check', status: 'NOT_CONFIGURED' },
      });
    }
  });
  console.log('Seeded integration/market connector status rows (all NOT_CONFIGURED — no fake data).');
}

async function importRealSourceDataIfPresent() {
  const importsDir = join(__dirname, '..', 'data', 'imports');
  if (!existsSync(importsDir)) {
    console.log('No data/imports directory found — skipping real source import.');
    return;
  }
  const files = readdirSync(importsDir).filter((f) => f.endsWith('.source.json'));
  if (files.length === 0) {
    console.log('No *.source.json files found under data/imports — skipping real source import.');
    return;
  }

  const existingBatch = await prisma.costImportBatch.findFirst();
  if (existingBatch) {
    console.log('A CostImportBatch already exists — skipping re-import to avoid duplicates.');
    return;
  }

  for (const file of files) {
    const fullPath = join(importsDir, file);
    console.log(`Importing real source data from ${fullPath} ...`);
    execFileSync('npx', ['tsx', join(__dirname, 'importSourceData.ts'), fullPath], { stdio: 'inherit' });
  }
}

async function openInitialPricingRound() {
  const existingRound = await prisma.pricingRound.findFirst();
  if (existingRound) return;

  const costSnapshot = await prisma.costSnapshot.findFirst({ orderBy: { publishedAt: 'desc' } });
  const policy = await prisma.marginPolicyVersion.findFirst({ where: { effectiveTo: null } });
  if (!costSnapshot || !policy) {
    console.log('No published Cost Snapshot yet — skipping initial Pricing Round.');
    return;
  }

  const round = await prisma.pricingRound.create({
    data: {
      label: `${costSnapshot.effectivePeriodStart.getFullYear()}-W${isoWeek(costSnapshot.effectivePeriodStart)}`,
      status: 'OPEN',
      costSnapshotId: costSnapshot.id,
      marginPolicyVersionId: policy.id,
    },
  });

  const lines = await prisma.costSnapshotLine.findMany({ where: { costSnapshotId: costSnapshot.id } });
  for (const line of lines) {
    // Suggested price seeds at the floor guard price; Pricing refines via Goals in the UI.
    const suggested = Math.ceil(line.currentCost / (1 - policy.globalFloorPct / 100));
    await prisma.centralPriceLine.create({
      data: {
        pricingRoundId: round.id,
        productId: line.productId,
        suggestedPrice: suggested,
        status: 'SUGGESTED',
      },
    });
  }
  console.log(`Opened Pricing Round ${round.label} with ${lines.length} Central Pricing lines.`);
}

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

async function main() {
  await seedUsers();
  await seedMarginPolicy();
  await seedIntegrationStatuses();
  await importRealSourceDataIfPresent();
  await openInitialPricingRound();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
