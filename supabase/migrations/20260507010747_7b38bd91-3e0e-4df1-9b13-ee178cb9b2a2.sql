-- Allow admins and HR to insert leave requests for any employee
CREATE POLICY "Admins can insert leave requests"
ON public.leave_requests FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "HR can insert leave requests"
ON public.leave_requests FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'hr'::app_role));

-- Same for overtime
CREATE POLICY "Admins can insert overtime requests"
ON public.overtime_requests FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "HR can insert overtime requests"
ON public.overtime_requests FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'hr'::app_role));

-- Same for business travel
CREATE POLICY "Admins can insert business travel requests"
ON public.business_travel_requests FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "HR can insert business travel requests"
ON public.business_travel_requests FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'hr'::app_role));