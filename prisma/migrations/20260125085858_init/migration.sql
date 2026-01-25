-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "id_post" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "workType" TEXT NOT NULL,
    "payment" TEXT NOT NULL,
    "deadline" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "channelUrl" TEXT NOT NULL,
    "scrapedAt" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
