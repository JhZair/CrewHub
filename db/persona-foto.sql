-- Foto de la persona: le pone cara al padrón. Solo se pide a quienes
-- trabajan con nosotros (personal / colaborador); a un contacto no.
-- Vive en el mismo bucket que las imágenes de los casos.
alter table personas add column if not exists foto_url text;
