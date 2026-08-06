-- ============================================================
-- CONTACTOS DECLARADOS EN UNA POSTULACIÓN
--
-- El formulario de DAFO pide teléfono móvil, teléfono fijo y hasta dos correos
-- «vinculados a la postulación», y avisa en rojo que es responsabilidad del
-- postulante mantenerlos habilitados. Son datos DEL EXPEDIENTE, no de la
-- empresa: en PO-012 el correo 2 es PEDIWILFREDO@gmail.com, que no figura en
-- ninguna credencial de la Asociación Pichiuchallay. Guardarlos como dato de
-- la empresa los daría por comunes a todas sus postulaciones, y no lo son.
--
-- Una postulación NO tiene credenciales de acceso —entrar a la plataforma le
-- corresponde a la empresa postulante— así que no se le cuelga una fila de
-- `credenciales` vacía de usuario y contraseña solo para poder colgarle datos.
-- Se le cuelgan los datos directamente.
--
-- Se reusa `credencial_datos` (etiqueta + valor + verificado_en) en vez de una
-- tabla gemela: es exactamente la forma que hace falta, y ya la lee la
-- pantalla de Llaves —así un número declarado en un expediente aparece en la
-- búsqueda inversa sin escribir una línea más—.
-- El nombre de la tabla se queda corto a partir de hoy (ya no todo dato cuelga
-- de una credencial). Renombrarla costaría más de lo que aclara; queda dicho
-- aquí y en el comment de la tabla.
--
-- Dueño único, como en `comentarios`: o credencial, o postulación.
--
-- ⚠ SIN transacción (lección pgBouncer). Idempotente por IF NOT EXISTS.
-- ============================================================

alter table credencial_datos
  add column if not exists postulacion_id uuid references postulaciones(id) on delete cascade;

alter table credencial_datos alter column credencial_id drop not null;

alter table credencial_datos drop constraint if exists credencial_datos_dueno_chk;
alter table credencial_datos add constraint credencial_datos_dueno_chk check (
  (credencial_id is not null)::int + (postulacion_id is not null)::int = 1
);

create index if not exists idx_credencial_datos_post
  on credencial_datos(postulacion_id);

comment on table credencial_datos is
  'Datos verificables (etiqueta + valor + verificado_en) de una credencial o '
  'de una postulación. El nombre quedó corto: desde db/postulacion-contactos.sql '
  'también cuelga de postulaciones, que no tienen credencial de acceso.';
comment on column credencial_datos.postulacion_id is
  'Contactos declarados en el formulario de la postulación (móvil, fijo, '
  'correo 1 y 2). Son del expediente, no de la empresa.';

-- Verificación
select
  (select count(*) from information_schema.columns
    where table_name = 'credencial_datos' and column_name = 'postulacion_id')  as columna,
  (select is_nullable from information_schema.columns
    where table_name = 'credencial_datos' and column_name = 'credencial_id')   as cred_nullable,
  (select count(*) from pg_constraint
    where conname = 'credencial_datos_dueno_chk')                              as constraint_dueno;
