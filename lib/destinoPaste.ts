/* Semáforo del Ctrl+V de imágenes: cuando el mouse está sobre un destino
   específico (la foto de la persona), ese destino "reclama" el pegado y
   el oyente general de la página (el banner) le cede el paso.
   Módulo singleton: ambos componentes ven la misma bandera. */
export const destinoPaste = { reclamado: false };
