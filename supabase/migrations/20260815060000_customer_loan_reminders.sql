-- Customer OS reminders: SQL decides due_on and the 09:00 Asia/Kolkata
-- fire times. The app only schedules what this function returns.
-- Remote push is not used (Expo Go Android cannot receive it from SDK 53).

CREATE OR REPLACE FUNCTION public.customer_loan_reminder_schedule(
  p_as_of date DEFAULT ((timezone('Asia/Kolkata', now()))::date)
)
RETURNS TABLE (
  loan_id        uuid,
  serial_number  text,
  due_on         date,
  reminder_kind  text,
  fire_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH active_own AS (
    SELECT
      l.id AS loan_id,
      l.serial_number,
      public.loan_current_due_on(l.id) AS due_on
    FROM public.loans l
    WHERE l.customer_id = auth.uid()
      AND l.status = 'active'::public.loan_status
  ),
  slots AS (
    SELECT
      a.loan_id,
      a.serial_number,
      a.due_on,
      k.reminder_kind,
      ((a.due_on + k.day_offset) + time '09:00') AT TIME ZONE 'Asia/Kolkata' AS fire_at
    FROM active_own a
    CROSS JOIN (
      VALUES
        ('due_soon'::text, -15),
        ('due_today'::text, 0),
        ('overdue'::text, 1)
    ) AS k(reminder_kind, day_offset)
  ),
  clock AS (
    SELECT timezone('Asia/Kolkata', now()) AS local_now
  )
  SELECT s.loan_id, s.serial_number, s.due_on, s.reminder_kind, s.fire_at
  FROM slots s
  UNION ALL
  -- First overdue 09:00 already passed: schedule the next Kolkata 09:00.
  SELECT
    a.loan_id,
    a.serial_number,
    a.due_on,
    'overdue'::text,
    (
      CASE
        WHEN c.local_now < date_trunc('day', c.local_now) + interval '9 hours'
          THEN date_trunc('day', c.local_now) + interval '9 hours'
        ELSE date_trunc('day', c.local_now) + interval '1 day' + interval '9 hours'
      END
    ) AT TIME ZONE 'Asia/Kolkata'
  FROM active_own a
  CROSS JOIN clock c
  WHERE p_as_of > a.due_on
    AND ((a.due_on + 1) + time '09:00') AT TIME ZONE 'Asia/Kolkata' <= now();
$$;

GRANT EXECUTE ON FUNCTION public.customer_loan_reminder_schedule(date)
  TO authenticated, service_role;
