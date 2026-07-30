-- Relación del proyecto: nuestro (propia), de un aliado, o externo.
-- Igual que en empresas, distingue lo que es de la casa de lo ajeno.
-- Idempotente: se puede correr varias veces sin romper nada.
alter table proyectos
  add column if not exists relacion text default 'propia';

-- Los proyectos ya existentes se asumen propios (es una casa productora que
-- lleva sus propias obras); lo que sea aliado/externo se corrige a mano.
update proyectos set relacion = 'propia' where relacion is null;
