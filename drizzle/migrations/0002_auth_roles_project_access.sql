CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

ALTER TABLE public.people ADD COLUMN user_id uuid UNIQUE;

CREATE OR REPLACE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    JOIN public.people p ON p.id = pm.person_id
    WHERE p.user_id = _user_id AND pm.project_id = _project_id
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_project(_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin') OR (_project_id IS NOT NULL AND public.is_project_member(auth.uid(), _project_id))
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM public.people WHERE lower(email) = lower(NEW.email) AND user_id IS NULL LIMIT 1;
  IF pid IS NOT NULL THEN
    UPDATE public.people SET user_id = NEW.id WHERE id = pid;
  ELSE
    INSERT INTO public.people (name, email, user_id)
    VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1)), NEW.email, NEW.id);
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "Users view own roles, admins view all" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles update" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles delete" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Reset old policies
DROP POLICY IF EXISTS "Anyone can add tasks" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can delete tasks" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can view tasks" ON public.tasks;
DROP POLICY IF EXISTS "Public can view people" ON public.people;
DROP POLICY IF EXISTS "Public can view departments" ON public.departments;
DROP POLICY IF EXISTS "Public can view project members" ON public.project_members;
DROP POLICY IF EXISTS "Public can view projects" ON public.projects;
DROP POLICY IF EXISTS "Public can view modules" ON public.modules;
DROP POLICY IF EXISTS "Public can view roles" ON public.roles;
DROP POLICY IF EXISTS "Signed in users can view projects" ON public.projects;
DO $$
DECLARE t text; op text;
BEGIN
  FOREACH t IN ARRAY ARRAY['people','departments','project_members','projects','modules','roles'] LOOP
    FOREACH op IN ARRAY ARRAY['add','delete','update'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Signed in users can ' || op || ' ' || replace(t, '_', ' '), t);
    END LOOP;
  END LOOP;
END $$;
DROP POLICY IF EXISTS "Signed in users can view modules" ON public.modules;
DROP POLICY IF EXISTS "Signed in users can view roles" ON public.roles;

REVOKE ALL ON public.tasks, public.people, public.departments, public.project_members, public.projects, public.modules, public.roles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks, public.people, public.departments, public.project_members, public.projects, public.modules, public.roles TO authenticated;

-- Tasks: admins or project members
CREATE POLICY "Members view tasks" ON public.tasks FOR SELECT TO authenticated USING (public.can_access_project(project_id));
CREATE POLICY "Members add tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.can_access_project(project_id));
CREATE POLICY "Members update tasks" ON public.tasks FOR UPDATE TO authenticated USING (public.can_access_project(project_id)) WITH CHECK (public.can_access_project(project_id));
CREATE POLICY "Members delete tasks" ON public.tasks FOR DELETE TO authenticated USING (public.can_access_project(project_id));

-- Projects: admins or members
CREATE POLICY "Members view projects" ON public.projects FOR SELECT TO authenticated USING (public.can_access_project(id));

-- Directory reads for signed-in users
CREATE POLICY "Signed in view people" ON public.people FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Signed in view departments" ON public.departments FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Signed in view modules" ON public.modules FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Signed in view roles" ON public.roles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "View own or admin memberships" ON public.project_members FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.can_access_project(project_id));

-- Admin-only writes on setup tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['people','departments','project_members','projects','modules','roles'] LOOP
    EXECUTE format('CREATE POLICY "Admins insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "Admins update" ON public.%I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "Admins delete" ON public.%I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;