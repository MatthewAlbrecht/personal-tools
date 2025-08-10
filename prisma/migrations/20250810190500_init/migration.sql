-- CreateTable
CREATE TABLE "public"."Post" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BookSearch" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "hardcover" BOOLEAN NOT NULL DEFAULT true,
    "firstEdition" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "titleNorm" TEXT NOT NULL,
    "authorNorm" TEXT NOT NULL,
    "isbn" TEXT,
    "isbnNorm" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "BookSearch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Post_name_idx" ON "public"."Post"("name");

-- CreateIndex
CREATE INDEX "BookSearch_createdAt_idx" ON "public"."BookSearch"("createdAt");

-- CreateIndex
CREATE INDEX "BookSearch_updatedAt_idx" ON "public"."BookSearch"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookSearch_titleNorm_authorNorm_isbnNorm_key" ON "public"."BookSearch"("titleNorm", "authorNorm", "isbnNorm");
