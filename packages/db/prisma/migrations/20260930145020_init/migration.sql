-- CreateTable
CREATE TABLE "GuildConfig" (
    "guildId" TEXT NOT NULL,
    "planSeconds" INTEGER NOT NULL DEFAULT 30,
    "gifEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rarityBudget" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordName" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "position" TEXT NOT NULL,
    "foot" TEXT NOT NULL,
    "tokenColor" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "attrPoints" INTEGER NOT NULL DEFAULT 0,
    "lineagePoints" INTEGER NOT NULL DEFAULT 0,
    "velocidade" INTEGER NOT NULL DEFAULT 3,
    "drible" INTEGER NOT NULL DEFAULT 3,
    "passe" INTEGER NOT NULL DEFAULT 3,
    "chute" INTEGER NOT NULL DEFAULT 3,
    "fisico" INTEGER NOT NULL DEFAULT 3,
    "visao" INTEGER NOT NULL DEFAULT 3,
    "defesa" INTEGER NOT NULL DEFAULT 3,
    "tokVelocidade" INTEGER NOT NULL DEFAULT 0,
    "tokDrible" INTEGER NOT NULL DEFAULT 0,
    "tokPasse" INTEGER NOT NULL DEFAULT 0,
    "tokChute" INTEGER NOT NULL DEFAULT 0,
    "tokFisico" INTEGER NOT NULL DEFAULT 0,
    "tokVisao" INTEGER NOT NULL DEFAULT 0,
    "tokDefesa" INTEGER NOT NULL DEFAULT 0,
    "ienes" INTEGER NOT NULL DEFAULT 500,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "marketValue" INTEGER NOT NULL DEFAULT 1000000,
    "lineageId" TEXT,
    "freeSpin" BOOLEAN NOT NULL DEFAULT true,
    "pityLegendary" INTEGER NOT NULL DEFAULT 0,
    "pityMythic" INTEGER NOT NULL DEFAULT 0,
    "titleId" TEXT,
    "frameId" TEXT,
    "trailId" TEXT,
    "portraitPath" TEXT,
    "energy" INTEGER NOT NULL DEFAULT 6,
    "energyUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttrResetAt" TIMESTAMP(3),
    "lastTreeResetAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "matches" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "dribblesWon" INTEGER NOT NULL DEFAULT 0,
    "readsCorrect" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "tackles" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineageProgress" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "nodes" TEXT[],
    "loadoutActive" TEXT[],
    "loadoutFlow" TEXT,
    "builds" JSONB NOT NULL DEFAULT '[]',
    "obtainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineageProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillMastery" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SkillMastery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "obtainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CosmeticOwned" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "cosmeticId" TEXT NOT NULL,
    "obtainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CosmeticOwned_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionProgress" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MissionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectionProgress" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "firstClearAt" TIMESTAMP(3),

    CONSTRAINT "SelectionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" JSONB,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "mmr" INTEGER NOT NULL DEFAULT 1000,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GachaLog" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "roll" DOUBLE PRECISION NOT NULL,
    "rarity" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "pityLegendaryBefore" INTEGER NOT NULL,
    "pityMythicBefore" INTEGER NOT NULL,
    "forcedBy" TEXT,
    "rates" JSONB NOT NULL,
    "cost" INTEGER NOT NULL,
    "free" BOOLEAN NOT NULL DEFAULT false,
    "decision" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GachaLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "mode" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "stageId" TEXT,
    "setup" JSONB NOT NULL,
    "snapshot" JSONB,
    "turns" JSONB NOT NULL DEFAULT '[]',
    "result" JSONB,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "characterId" TEXT,
    "slotId" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "isKeeper" BOOLEAN NOT NULL DEFAULT false,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "activeTurns" INTEGER NOT NULL DEFAULT 0,
    "totalTurns" INTEGER NOT NULL DEFAULT 0,
    "stats" JSONB,
    "rewards" JSONB,
    "mmrDelta" INTEGER,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCounter" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "matches" INTEGER NOT NULL DEFAULT 0,
    "trainings" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Character_discordId_key" ON "Character"("discordId");

-- CreateIndex
CREATE INDEX "Character_guildId_idx" ON "Character"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "LineageProgress_characterId_lineageId_key" ON "LineageProgress"("characterId", "lineageId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillMastery_characterId_skillId_key" ON "SkillMastery"("characterId", "skillId");

-- CreateIndex
CREATE INDEX "InventoryItem_characterId_idx" ON "InventoryItem"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CosmeticOwned_characterId_cosmeticId_key" ON "CosmeticOwned"("characterId", "cosmeticId");

-- CreateIndex
CREATE INDEX "MissionProgress_characterId_periodKey_idx" ON "MissionProgress"("characterId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "MissionProgress_characterId_missionId_periodKey_key" ON "MissionProgress"("characterId", "missionId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "SelectionProgress_characterId_stageId_key" ON "SelectionProgress"("characterId", "stageId");

-- CreateIndex
CREATE INDEX "Rating_seasonId_group_mmr_idx" ON "Rating"("seasonId", "group", "mmr");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_characterId_seasonId_group_key" ON "Rating"("characterId", "seasonId", "group");

-- CreateIndex
CREATE INDEX "GachaLog_characterId_createdAt_idx" ON "GachaLog"("characterId", "createdAt");

-- CreateIndex
CREATE INDEX "Match_guildId_status_idx" ON "Match"("guildId", "status");

-- CreateIndex
CREATE INDEX "Match_createdAt_idx" ON "Match"("createdAt");

-- CreateIndex
CREATE INDEX "MatchParticipant_characterId_idx" ON "MatchParticipant"("characterId");

-- CreateIndex
CREATE INDEX "MatchParticipant_matchId_idx" ON "MatchParticipant"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCounter_characterId_dayKey_key" ON "DailyCounter"("characterId", "dayKey");

-- AddForeignKey
ALTER TABLE "LineageProgress" ADD CONSTRAINT "LineageProgress_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillMastery" ADD CONSTRAINT "SkillMastery_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosmeticOwned" ADD CONSTRAINT "CosmeticOwned_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionProgress" ADD CONSTRAINT "MissionProgress_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionProgress" ADD CONSTRAINT "SelectionProgress_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GachaLog" ADD CONSTRAINT "GachaLog_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCounter" ADD CONSTRAINT "DailyCounter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
