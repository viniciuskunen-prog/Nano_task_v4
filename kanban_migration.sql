-- Criar tabela de colunas
CREATE TABLE IF NOT EXISTS public.task_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.task_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own columns"
ON public.task_columns
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own columns"
ON public.task_columns
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own columns"
ON public.task_columns
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own columns"
ON public.task_columns
FOR DELETE
USING (auth.uid() = user_id);

-- adicionar coluna na tabela tasks
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS column_id UUID REFERENCES public.task_columns(id) ON DELETE SET NULL;

-- posição do card dentro da coluna
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- índice para performance
CREATE INDEX IF NOT EXISTS idx_tasks_column_id
ON public.tasks(column_id);

-- função para criar colunas padrão
CREATE OR REPLACE FUNCTION public.handle_new_user_columns()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.task_columns (user_id, name, position)
    VALUES 
        (NEW.id, 'Backlog', 0),
        (NEW.id, 'Em andamento', 1),
        (NEW.id, 'Concluído', 2);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- trigger
DROP TRIGGER IF EXISTS on_profile_created_create_columns ON public.profiles;

CREATE TRIGGER on_profile_created_create_columns
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_columns();

-- ──────────────────────────────────────────────────────────────
-- TRIGGER PARA CRIAR PERFIL BASE QUANDO USUÁRIO SE REGISTRA
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        full_name,
        xp_total,
        accent_color,
        trial_ends_at
    ) VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuário'),
        0,
        '#351cd4',
        NOW() + INTERVAL '30 days'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger que executa a função acima quando novo usuário é criado
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile();
