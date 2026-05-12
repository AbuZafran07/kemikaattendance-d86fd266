CREATE OR REPLACE FUNCTION public.auto_insert_attendance_on_lupa_absen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  wh jsonb;
  ci_time text;
  co_time text;
  ci_fri text;
  co_fri text;
  fri_enabled boolean;
  d date;
  dow int;
  ci_ts timestamptz;
  co_ts timestamptz;
  exists_count int;
  reason_text text;
  custom_match text[];
  custom_ci text;
  custom_co text;
BEGIN
  IF NEW.leave_type <> 'lupa_absen' THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO wh FROM public.system_settings WHERE key = 'work_hours';
  ci_time := COALESCE(wh->>'check_in_start', '08:00');
  co_time := COALESCE(wh->>'check_out_end', '17:00');
  ci_fri := COALESCE(wh->>'check_in_start', ci_time);
  co_fri := COALESCE(wh->>'friday_check_out_end', co_time);
  fri_enabled := COALESCE((wh->>'friday_enabled')::boolean, false);

  -- Parse optional [JAM:HH:MM-HH:MM] override prefix in reason
  custom_match := regexp_match(COALESCE(NEW.reason, ''), '\[JAM:(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\]');
  IF custom_match IS NOT NULL THEN
    custom_ci := custom_match[1];
    custom_co := custom_match[2];
  END IF;

  reason_text := 'Auto-input dari pengajuan "Lupa Absen" yang disetujui. Alasan: ' || COALESCE(NEW.reason, '-');

  d := NEW.start_date;
  WHILE d <= NEW.end_date LOOP
    dow := EXTRACT(DOW FROM d)::int;
    IF dow <> 0 AND dow <> 6 THEN
      SELECT COUNT(*) INTO exists_count
      FROM public.attendance
      WHERE user_id = NEW.user_id
        AND check_in_time::date = d;

      IF exists_count = 0 THEN
        IF custom_ci IS NOT NULL AND custom_co IS NOT NULL THEN
          ci_ts := (d::text || ' ' || custom_ci || ':00')::timestamp AT TIME ZONE 'Asia/Jakarta';
          co_ts := (d::text || ' ' || custom_co || ':00')::timestamp AT TIME ZONE 'Asia/Jakarta';
        ELSIF dow = 5 AND fri_enabled THEN
          ci_ts := (d::text || ' ' || ci_fri || ':00')::timestamp AT TIME ZONE 'Asia/Jakarta';
          co_ts := (d::text || ' ' || co_fri || ':00')::timestamp AT TIME ZONE 'Asia/Jakarta';
        ELSE
          ci_ts := (d::text || ' ' || ci_time || ':00')::timestamp AT TIME ZONE 'Asia/Jakarta';
          co_ts := (d::text || ' ' || co_time || ':00')::timestamp AT TIME ZONE 'Asia/Jakarta';
        END IF;

        INSERT INTO public.attendance (
          user_id, check_in_time, check_out_time,
          check_in_latitude, check_in_longitude,
          check_out_latitude, check_out_longitude,
          status, gps_validated, face_recognition_validated,
          duration_minutes, notes
        ) VALUES (
          NEW.user_id, ci_ts, co_ts,
          0, 0, 0, 0,
          'hadir', false, false,
          EXTRACT(EPOCH FROM (co_ts - ci_ts))::int / 60,
          reason_text
        );
      END IF;
    END IF;
    d := d + 1;
  END LOOP;

  RETURN NEW;
END;
$function$;