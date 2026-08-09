-- Order-creation routes used to write a single order's cart summary
-- ("Cart order (N items): ... (Colour / Size) — $X") into the SHARED
-- Product.description. Because the Product row is reused by name for every
-- order of that item, its description was frozen to the first buyer's
-- variant, so all later orders displayed the wrong colour/size.
--
-- Reset those polluted descriptions back to the product name. Per-order
-- variant details remain correct in ConsultationBooking/Order.customNotes.
UPDATE "Product" SET "description" = "name" WHERE "description" LIKE 'Cart order (%';
