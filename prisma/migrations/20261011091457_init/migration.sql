-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EXECUTIVE', 'PRICING', 'SALES', 'ADMIN');

-- CreateEnum
CREATE TYPE "DataOrigin" AS ENUM ('REAL_SOURCE', 'DEV_FIXTURE');

-- CreateEnum
CREATE TYPE "MarginCategory" AS ENUM ('COMPETITIVE', 'POPULAR', 'OFFAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MappingStatus" AS ENUM ('UNRESOLVED', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('STAGED', 'VALIDATED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MarketSourceStatus" AS ENUM ('CONNECTED', 'DEGRADED', 'BLOCKED', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "PricingRoundStatus" AS ENUM ('OPEN', 'CENTRAL_APPROVED', 'CUSTOMER_APPROVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PricingGoal" AS ENUM ('COMPETITIVE', 'HOLD', 'TARGET', 'PROTECT');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'CUSTOMER_RESPONDED', 'NEGOTIATING', 'ACCEPTED', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ResponseAction" AS ENUM ('ACCEPT', 'NEGOTIATE');

-- CreateEnum
CREATE TYPE "NegotiationStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('PENDING', 'RECONCILED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('STAGED', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('OPEN', 'ASSIGNED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'DEGRADED', 'BLOCKED', 'NOT_CONFIGURED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "defaultUnit" TEXT NOT NULL,
    "category" "MarginCategory" NOT NULL DEFAULT 'OTHER',
    "catalogSegment" TEXT NOT NULL DEFAULT 'bulk',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dataOrigin" "DataOrigin" NOT NULL DEFAULT 'REAL_SOURCE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAlias" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMappingQueue" (
    "id" TEXT NOT NULL,
    "sourceRowRef" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "specification" TEXT,
    "unit" TEXT,
    "suggestedProductId" TEXT,
    "resolvedProductId" TEXT,
    "status" "MappingStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductMappingQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourcePeriodLabel" TEXT NOT NULL,
    "effectivePeriodStart" TIMESTAMP(3) NOT NULL,
    "effectivePeriodEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostImportBatch" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'STAGED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "CostImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostRawRow" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "sourcePage" INTEGER NOT NULL,
    "sourceRowNo" INTEGER NOT NULL,
    "sourceTable" TEXT NOT NULL,
    "rowType" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "specification" TEXT,
    "packQuantity" DOUBLE PRECISION,
    "unit" TEXT,
    "previousCost" DOUBLE PRECISION,
    "currentCost" DOUBLE PRECISION,
    "costDelta" DOUBLE PRECISION,
    "retailAri" DOUBLE PRECISION,
    "wholesale2kg" DOUBLE PRECISION,
    "wholesale5kgOr4kg" DOUBLE PRECISION,
    "wholesale10kg" DOUBLE PRECISION,
    "customerPrice" DOUBLE PRECISION,
    "catalogSegment" TEXT NOT NULL,
    "extractionStatus" TEXT NOT NULL,
    "reviewNotes" TEXT,
    "rawPayload" JSONB NOT NULL,
    "matchedProductId" TEXT,

    CONSTRAINT "CostRawRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostSnapshot" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "effectivePeriodStart" TIMESTAMP(3) NOT NULL,
    "effectivePeriodEnd" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataOrigin" "DataOrigin" NOT NULL DEFAULT 'REAL_SOURCE',

    CONSTRAINT "CostSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostSnapshotLine" (
    "id" TEXT NOT NULL,
    "costSnapshotId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "previousCost" DOUBLE PRECISION,
    "currentCost" DOUBLE PRECISION NOT NULL,
    "costDelta" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "sourceRowNo" INTEGER NOT NULL,
    "sourcePage" INTEGER NOT NULL,

    CONSTRAINT "CostSnapshotLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcePriceSnapshot" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataOrigin" "DataOrigin" NOT NULL DEFAULT 'REAL_SOURCE',

    CONSTRAINT "SourcePriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcePriceSnapshotLine" (
    "id" TEXT NOT NULL,
    "sourcePriceSnapshotId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "retailAri" DOUBLE PRECISION,
    "wholesale2kg" DOUBLE PRECISION,
    "wholesale5kgOr4kg" DOUBLE PRECISION,
    "wholesale10kg" DOUBLE PRECISION,
    "customerPrice" DOUBLE PRECISION,
    "sourcePage" INTEGER NOT NULL,
    "sourceRowNo" INTEGER NOT NULL,

    CONSTRAINT "SourcePriceSnapshotLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "MarketSourceStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "MarketSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketRawObservation" (
    "id" TEXT NOT NULL,
    "marketSourceId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "competitorName" TEXT NOT NULL,
    "productLabel" TEXT NOT NULL,
    "observedPrice" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION,
    "rawPayload" JSONB NOT NULL,

    CONSTRAINT "MarketRawObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketMatchReview" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "productId" TEXT,
    "status" "MappingStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "MarketMatchReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "marketSourceId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarginPolicyVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "globalFloorPct" DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "MarginPolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarginCategoryRule" (
    "id" TEXT NOT NULL,
    "marginPolicyVersionId" TEXT NOT NULL,
    "category" "MarginCategory" NOT NULL,
    "targetPct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MarginCategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuCategoryOverride" (
    "id" TEXT NOT NULL,
    "marginPolicyVersionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "targetPct" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkuCategoryOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRound" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "PricingRoundStatus" NOT NULL DEFAULT 'OPEN',
    "costSnapshotId" TEXT NOT NULL,
    "marginPolicyVersionId" TEXT NOT NULL,
    "marketSnapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "PricingRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentralPriceLine" (
    "id" TEXT NOT NULL,
    "pricingRoundId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "previousApprovedPrice" DOUBLE PRECISION,
    "suggestedPrice" DOUBLE PRECISION NOT NULL,
    "pricingGoal" "PricingGoal" NOT NULL DEFAULT 'TARGET',
    "approvedPrice" DOUBLE PRECISION,
    "resultingMarginPct" DOUBLE PRECISION,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'SUGGESTED',
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "exceptionReason" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentralPriceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "channel" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProductCondition" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "note" TEXT,
    "minMarginPct" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProductCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPriceSheet" (
    "id" TEXT NOT NULL,
    "pricingRoundId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'SUGGESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPriceSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPriceLine" (
    "id" TEXT NOT NULL,
    "customerPriceSheetId" TEXT NOT NULL,
    "centralPriceLineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "previousCustomerPrice" DOUBLE PRECISION,
    "suggestedPrice" DOUBLE PRECISION NOT NULL,
    "approvedPrice" DOUBLE PRECISION,
    "resultingMarginPct" DOUBLE PRECISION,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'SUGGESTED',
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPriceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingSalesHandoff" (
    "id" TEXT NOT NULL,
    "customerPriceSheetId" TEXT NOT NULL,
    "handedOffAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "PricingSalesHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRevision" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "QuoteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteRevisionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerPriceLineId" TEXT NOT NULL,
    "offeredPrice" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicQuoteToken" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PublicQuoteToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteResponse" (
    "id" TEXT NOT NULL,
    "quoteRevisionId" TEXT NOT NULL,
    "quoteLineId" TEXT NOT NULL,
    "publicTokenId" TEXT NOT NULL,
    "action" "ResponseAction" NOT NULL,
    "requestedPrice" DOUBLE PRECISION,
    "reason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "QuoteResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegotiationCase" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quoteResponseId" TEXT NOT NULL,
    "originalApprovedPrice" DOUBLE PRECISION NOT NULL,
    "requestedPrice" DOUBLE PRECISION NOT NULL,
    "status" "NegotiationStatus" NOT NULL DEFAULT 'OPEN',
    "finalPrice" DOUBLE PRECISION,
    "supplierMaxCostTarget" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "NegotiationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegotiationEvent" (
    "id" TEXT NOT NULL,
    "negotiationCaseId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NegotiationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierNegotiation" (
    "id" TEXT NOT NULL,
    "negotiationCaseId" TEXT NOT NULL,
    "targetCost" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierNegotiation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosedDeal" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClosedDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosedDealLine" (
    "id" TEXT NOT NULL,
    "closedDealId" TEXT NOT NULL,
    "quoteLineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "frozenPrice" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "ClosedDealLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialHandoff" (
    "id" TEXT NOT NULL,
    "closedDealId" TEXT NOT NULL,
    "status" "HandoffStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceImportBatch" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceRawRow" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "duplicateOfId" TEXT,
    "matchedProductId" TEXT,
    "matchedCustomerId" TEXT,

    CONSTRAINT "InvoiceRawRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'STAGED',
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "netSales" DOUBLE PRECISION NOT NULL,
    "recognizedCost" DOUBLE PRECISION,
    "grossProfit" DOUBLE PRECISION,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationException" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "financialHandoffId" TEXT,
    "kind" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveDecision" (
    "id" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "businessImpact" TEXT NOT NULL,
    "recordRef" TEXT,
    "source" TEXT NOT NULL,
    "sourceTimestamp" TIMESTAMP(3) NOT NULL,
    "severity" TEXT NOT NULL,
    "status" "DecisionStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "decisionNote" TEXT,
    "followUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ExecutiveDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "fallbackAvailable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationRun" (
    "id" TEXT NOT NULL,
    "integrationConfigId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "outcome" TEXT NOT NULL,
    "detail" TEXT,

    CONSTRAINT "IntegrationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "detail" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrityCheckResult" (
    "id" TEXT NOT NULL,
    "checkName" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "detail" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrityCheckResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Product_canonicalName_idx" ON "Product"("canonicalName");

-- CreateIndex
CREATE INDEX "ProductAlias_productId_idx" ON "ProductAlias"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAlias_alias_source_key" ON "ProductAlias"("alias", "source");

-- CreateIndex
CREATE INDEX "ProductMappingQueue_status_idx" ON "ProductMappingQueue"("status");

-- CreateIndex
CREATE INDEX "SourceDocument_documentType_idx" ON "SourceDocument"("documentType");

-- CreateIndex
CREATE INDEX "CostRawRow_importBatchId_idx" ON "CostRawRow"("importBatchId");

-- CreateIndex
CREATE INDEX "CostRawRow_extractionStatus_idx" ON "CostRawRow"("extractionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "CostSnapshot_importBatchId_key" ON "CostSnapshot"("importBatchId");

-- CreateIndex
CREATE INDEX "CostSnapshotLine_productId_idx" ON "CostSnapshotLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CostSnapshotLine_costSnapshotId_productId_key" ON "CostSnapshotLine"("costSnapshotId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePriceSnapshot_importBatchId_key" ON "SourcePriceSnapshot"("importBatchId");

-- CreateIndex
CREATE INDEX "SourcePriceSnapshotLine_productId_idx" ON "SourcePriceSnapshotLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePriceSnapshotLine_sourcePriceSnapshotId_productId_key" ON "SourcePriceSnapshotLine"("sourcePriceSnapshotId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketMatchReview_observationId_key" ON "MarketMatchReview"("observationId");

-- CreateIndex
CREATE INDEX "MarketMatchReview_status_idx" ON "MarketMatchReview"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MarginPolicyVersion_version_key" ON "MarginPolicyVersion"("version");

-- CreateIndex
CREATE INDEX "MarginPolicyVersion_effectiveFrom_idx" ON "MarginPolicyVersion"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "MarginCategoryRule_marginPolicyVersionId_category_key" ON "MarginCategoryRule"("marginPolicyVersionId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "SkuCategoryOverride_productId_key" ON "SkuCategoryOverride"("productId");

-- CreateIndex
CREATE INDEX "PricingRound_status_idx" ON "PricingRound"("status");

-- CreateIndex
CREATE INDEX "CentralPriceLine_status_idx" ON "CentralPriceLine"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CentralPriceLine_pricingRoundId_productId_key" ON "CentralPriceLine"("pricingRoundId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProductCondition_customerId_productId_key" ON "CustomerProductCondition"("customerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPriceSheet_pricingRoundId_customerId_key" ON "CustomerPriceSheet"("pricingRoundId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPriceLine_customerPriceSheetId_productId_key" ON "CustomerPriceLine"("customerPriceSheetId", "productId");

-- CreateIndex
CREATE INDEX "PricingSalesHandoff_customerPriceSheetId_idx" ON "PricingSalesHandoff"("customerPriceSheetId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRevision_quoteId_revision_key" ON "QuoteRevision"("quoteId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "PublicQuoteToken_tokenHash_key" ON "PublicQuoteToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PublicQuoteToken_quoteId_idx" ON "PublicQuoteToken"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteResponse_quoteRevisionId_idx" ON "QuoteResponse"("quoteRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteResponse_quoteLineId_key" ON "QuoteResponse"("quoteLineId");

-- CreateIndex
CREATE UNIQUE INDEX "NegotiationCase_quoteResponseId_key" ON "NegotiationCase"("quoteResponseId");

-- CreateIndex
CREATE INDEX "NegotiationCase_status_idx" ON "NegotiationCase"("status");

-- CreateIndex
CREATE INDEX "NegotiationEvent_negotiationCaseId_idx" ON "NegotiationEvent"("negotiationCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ClosedDeal_quoteId_key" ON "ClosedDeal"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialHandoff_closedDealId_key" ON "FinancialHandoff"("closedDealId");

-- CreateIndex
CREATE INDEX "InvoiceRawRow_importBatchId_idx" ON "InvoiceRawRow"("importBatchId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_invoiceId_key" ON "PaymentAllocation"("paymentId", "invoiceId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_key_key" ON "IntegrationConfig"("key");

-- CreateIndex
CREATE INDEX "JobRun_jobName_idx" ON "JobRun"("jobName");

-- CreateIndex
CREATE INDEX "IntegrityCheckResult_checkName_idx" ON "IntegrityCheckResult"("checkName");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAlias" ADD CONSTRAINT "ProductAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMappingQueue" ADD CONSTRAINT "ProductMappingQueue_resolvedProductId_fkey" FOREIGN KEY ("resolvedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMappingQueue" ADD CONSTRAINT "ProductMappingQueue_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostImportBatch" ADD CONSTRAINT "CostImportBatch_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostRawRow" ADD CONSTRAINT "CostRawRow_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "CostImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSnapshot" ADD CONSTRAINT "CostSnapshot_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "CostImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSnapshotLine" ADD CONSTRAINT "CostSnapshotLine_costSnapshotId_fkey" FOREIGN KEY ("costSnapshotId") REFERENCES "CostSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSnapshotLine" ADD CONSTRAINT "CostSnapshotLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePriceSnapshot" ADD CONSTRAINT "SourcePriceSnapshot_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "CostImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePriceSnapshotLine" ADD CONSTRAINT "SourcePriceSnapshotLine_sourcePriceSnapshotId_fkey" FOREIGN KEY ("sourcePriceSnapshotId") REFERENCES "SourcePriceSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePriceSnapshotLine" ADD CONSTRAINT "SourcePriceSnapshotLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketRawObservation" ADD CONSTRAINT "MarketRawObservation_marketSourceId_fkey" FOREIGN KEY ("marketSourceId") REFERENCES "MarketSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketMatchReview" ADD CONSTRAINT "MarketMatchReview_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "MarketRawObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketMatchReview" ADD CONSTRAINT "MarketMatchReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_marketSourceId_fkey" FOREIGN KEY ("marketSourceId") REFERENCES "MarketSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarginCategoryRule" ADD CONSTRAINT "MarginCategoryRule_marginPolicyVersionId_fkey" FOREIGN KEY ("marginPolicyVersionId") REFERENCES "MarginPolicyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuCategoryOverride" ADD CONSTRAINT "SkuCategoryOverride_marginPolicyVersionId_fkey" FOREIGN KEY ("marginPolicyVersionId") REFERENCES "MarginPolicyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuCategoryOverride" ADD CONSTRAINT "SkuCategoryOverride_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRound" ADD CONSTRAINT "PricingRound_costSnapshotId_fkey" FOREIGN KEY ("costSnapshotId") REFERENCES "CostSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRound" ADD CONSTRAINT "PricingRound_marginPolicyVersionId_fkey" FOREIGN KEY ("marginPolicyVersionId") REFERENCES "MarginPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRound" ADD CONSTRAINT "PricingRound_marketSnapshotId_fkey" FOREIGN KEY ("marketSnapshotId") REFERENCES "MarketSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentralPriceLine" ADD CONSTRAINT "CentralPriceLine_pricingRoundId_fkey" FOREIGN KEY ("pricingRoundId") REFERENCES "PricingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentralPriceLine" ADD CONSTRAINT "CentralPriceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentralPriceLine" ADD CONSTRAINT "CentralPriceLine_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProductCondition" ADD CONSTRAINT "CustomerProductCondition_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProductCondition" ADD CONSTRAINT "CustomerProductCondition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceSheet" ADD CONSTRAINT "CustomerPriceSheet_pricingRoundId_fkey" FOREIGN KEY ("pricingRoundId") REFERENCES "PricingRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceSheet" ADD CONSTRAINT "CustomerPriceSheet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceLine" ADD CONSTRAINT "CustomerPriceLine_customerPriceSheetId_fkey" FOREIGN KEY ("customerPriceSheetId") REFERENCES "CustomerPriceSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceLine" ADD CONSTRAINT "CustomerPriceLine_centralPriceLineId_fkey" FOREIGN KEY ("centralPriceLineId") REFERENCES "CentralPriceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceLine" ADD CONSTRAINT "CustomerPriceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceLine" ADD CONSTRAINT "CustomerPriceLine_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingSalesHandoff" ADD CONSTRAINT "PricingSalesHandoff_customerPriceSheetId_fkey" FOREIGN KEY ("customerPriceSheetId") REFERENCES "CustomerPriceSheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteRevisionId_fkey" FOREIGN KEY ("quoteRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_customerPriceLineId_fkey" FOREIGN KEY ("customerPriceLineId") REFERENCES "CustomerPriceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicQuoteToken" ADD CONSTRAINT "PublicQuoteToken_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteResponse" ADD CONSTRAINT "QuoteResponse_quoteRevisionId_fkey" FOREIGN KEY ("quoteRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteResponse" ADD CONSTRAINT "QuoteResponse_quoteLineId_fkey" FOREIGN KEY ("quoteLineId") REFERENCES "QuoteLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteResponse" ADD CONSTRAINT "QuoteResponse_publicTokenId_fkey" FOREIGN KEY ("publicTokenId") REFERENCES "PublicQuoteToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationCase" ADD CONSTRAINT "NegotiationCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationCase" ADD CONSTRAINT "NegotiationCase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationCase" ADD CONSTRAINT "NegotiationCase_quoteResponseId_fkey" FOREIGN KEY ("quoteResponseId") REFERENCES "QuoteResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationEvent" ADD CONSTRAINT "NegotiationEvent_negotiationCaseId_fkey" FOREIGN KEY ("negotiationCaseId") REFERENCES "NegotiationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationEvent" ADD CONSTRAINT "NegotiationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierNegotiation" ADD CONSTRAINT "SupplierNegotiation_negotiationCaseId_fkey" FOREIGN KEY ("negotiationCaseId") REFERENCES "NegotiationCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosedDeal" ADD CONSTRAINT "ClosedDeal_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosedDeal" ADD CONSTRAINT "ClosedDeal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosedDeal" ADD CONSTRAINT "ClosedDeal_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosedDealLine" ADD CONSTRAINT "ClosedDealLine_closedDealId_fkey" FOREIGN KEY ("closedDealId") REFERENCES "ClosedDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosedDealLine" ADD CONSTRAINT "ClosedDealLine_quoteLineId_fkey" FOREIGN KEY ("quoteLineId") REFERENCES "QuoteLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosedDealLine" ADD CONSTRAINT "ClosedDealLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialHandoff" ADD CONSTRAINT "FinancialHandoff_closedDealId_fkey" FOREIGN KEY ("closedDealId") REFERENCES "ClosedDeal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRawRow" ADD CONSTRAINT "InvoiceRawRow_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "InvoiceImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "InvoiceImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_financialHandoffId_fkey" FOREIGN KEY ("financialHandoffId") REFERENCES "FinancialHandoff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveDecision" ADD CONSTRAINT "ExecutiveDecision_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRun" ADD CONSTRAINT "IntegrationRun_integrationConfigId_fkey" FOREIGN KEY ("integrationConfigId") REFERENCES "IntegrationConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

