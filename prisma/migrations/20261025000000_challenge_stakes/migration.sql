-- Friend challenges: BITS stake and open (link) challenges (additive)
ALTER TABLE "Battle" ADD COLUMN "stake" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Battle" ADD COLUMN "isOpen" BOOLEAN NOT NULL DEFAULT false;
