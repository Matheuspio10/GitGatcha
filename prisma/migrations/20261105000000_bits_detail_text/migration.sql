-- The BITS history detail as a message key + values, translated where it is shown
ALTER TABLE "BitsTransaction" ADD COLUMN "detailText" JSONB;
