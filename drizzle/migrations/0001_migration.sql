DROP POLICY IF EXISTS "Public can view projects" ON public.projects;
DROP POLICY IF EXISTS "Public can view modules" ON public.modules;
DROP POLICY IF EXISTS "Public can view roles" ON public.roles;
REVOKE SELECT ON public.projects, public.modules, public.roles FROM anon;
CREATE POLICY "Signed in users can view projects" ON public.projects FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Signed in users can view modules" ON public.modules FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Signed in users can view roles" ON public.roles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);