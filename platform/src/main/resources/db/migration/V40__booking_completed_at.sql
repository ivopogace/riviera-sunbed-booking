-- Check-in (#583): when the stay was delivered — stamped by the guarded CONFIRMED -> COMPLETED
-- transition, mirroring confirmed_at / cancelled_at / accepted_at. NULL until (and unless) staff
-- check the guest in; the status CHECK has admitted COMPLETED since V5 (re-stated V19/V37).
ALTER TABLE booking ADD COLUMN completed_at TIMESTAMPTZ;
