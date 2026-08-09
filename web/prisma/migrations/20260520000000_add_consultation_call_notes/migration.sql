-- Video consultations now capture an AI transcript and post-call notes.
-- Both columns are nullable so existing bookings continue to validate.
ALTER TABLE "ConsultationBooking" ADD COLUMN "callTranscript" TEXT;
ALTER TABLE "ConsultationBooking" ADD COLUMN "callNotes" TEXT;
