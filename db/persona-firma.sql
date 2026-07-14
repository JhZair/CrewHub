-- Link a la firma escaneada de la persona (imagen/PDF en Drive),
-- para usarla en documentos, actas y recibos internos.
alter table personas add column if not exists firma_url text;
