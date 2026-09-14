CREATE TABLE "ConversationLog" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sessionId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "messageType" TEXT NOT NULL,
  "text" TEXT,
  "location" JSONB,
  "detectedIntent" TEXT NOT NULL,
  "sortCriterion" TEXT NOT NULL,
  "stateSummary" JSONB NOT NULL,
  "latencyMs" INTEGER,
  "error" TEXT,
  CONSTRAINT "ConversationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConversationLog_sessionId_createdAt_idx" ON "ConversationLog"("sessionId", "createdAt");
CREATE INDEX "ConversationLog_createdAt_idx" ON "ConversationLog"("createdAt");
