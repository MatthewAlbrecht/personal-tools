-- CreateTable
CREATE TABLE "public"."FolioSocietyRelease" (
    "id" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "visibility" JSONB NOT NULL,
    "image" TEXT,
    "price" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FolioSocietyRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FolioSocietyConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "startId" INTEGER NOT NULL DEFAULT 5130,
    "endId" INTEGER NOT NULL DEFAULT 5300,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FolioSocietyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FolioSocietyRelease_firstSeenAt_idx" ON "public"."FolioSocietyRelease"("firstSeenAt");

-- CreateIndex
CREATE INDEX "FolioSocietyRelease_lastSeenAt_idx" ON "public"."FolioSocietyRelease"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "FolioSocietyRelease_id_key" ON "public"."FolioSocietyRelease"("id");
