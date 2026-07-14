-- ============================================================
-- Renombrar oficialmente la cuenta del bot: "Qhaway" → "Bot Qhaway".
-- (Nombre corto de marca: BQ — se deriva solo en el avatar.)
-- Correr en Supabase → SQL Editor.
-- ============================================================
update perfiles set nombre = 'Bot Qhaway' where nombre = 'Qhaway';
