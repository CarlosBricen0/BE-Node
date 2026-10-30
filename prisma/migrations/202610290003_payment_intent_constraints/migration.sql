-- SQL CHECK treats NULL as unknown, so require a non-null subscription period explicitly.
ALTER TABLE "PaymentIntent" DROP CONSTRAINT "PaymentIntent_kind_months_check";
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_kind_months_check" CHECK (
  ("kind" = 'subscription' AND "months" IS NOT NULL AND "months" IN (1,12) AND "planId" IS NOT NULL AND "orderId" IS NULL)
  OR ("kind" = 'merchandise' AND "months" IS NULL AND "orderId" IS NOT NULL AND "planId" IS NULL)
);
