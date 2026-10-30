# Preparación de despliegue

El hosting aún no está elegido. Esta guía permite revisar el backend independientemente del front; no acredita producción habilitada.

1. Crear PostgreSQL administrado con TLS, usuario sin privilegios globales y backups/PITR según el servicio. Guardar DATABASE_URL en el gestor de secretos. PostgreSQL no requiere pagar licencia de motor; infraestructura y operación sí tienen costo.
2. Desplegar BE-Node con Node 22: `npm ci`, `npm run build`. Ejecutar **una sola vez por release** `npm run db:deploy` en un job previo con acceso a la misma DB; iniciar con `NODE_ENV=production HOST=0.0.0.0 npm start`. No ejecutar seeds demo en producción.
3. Asignar dominio API y TLS, limitar tráfico en el proxy/hosting, programar health checks y alertar por 5xx, pagos sin conciliar y outbox pendiente. La API no necesita CORS para Next servidor → API. No exponer PostgreSQL al público.
4. Configurar Kinde issuer/audience, ADMIN_USER_ID, Mercado Pago Chile, precios reales, WEB_APP_URL HTTPS, webhook HTTPS directo a BE, Cloudinary y Resend. Ejecutar `check:env` y `check:services` desde el entorno con secretos sin imprimirlos.
5. Configurar los dos cron de README con sus cabeceras secretas. Aplicar alertas a fallos, no limitarse a que el cron exista. Para backend privado, exponer únicamente el webhook a Mercado Pago mediante el proxy y permitir conectividad desde Next/operación.
6. Desplegar FE-WEB con BACKEND_API_URL de BE y FE-React empaquetado/fijado a commit según su documentación. Mantener sesión Kinde/credenciales de cliente en FE-WEB. El backend no depende de tener ambos repos en una carpeta compartida.
7. Probar en staging público login, admin, carga, contenido premium, checkout, webhook duplicado, renovación, cancelación, reembolso/contracargo y recuperación por cron. Ensayar restauración y verificar aislamiento entre compradores. Conservar evidencia antes de cambiar a credenciales live y abrir ventas.

## Migración desde FE-WEB

Las tres migraciones originales se copiaron sin editar SQL ni checksums. No recrear ni resetear la DB; usar la misma DATABASE_URL desde BE. La app pasa a depender de la API y debe desplegarse coordinada con el backend. Primero desplegar BE y verificar salud; luego actualizar FE y URLs de Mercado Pago/cron. En un corte con tráfico, detener nuevas escrituras/cron en FE para evitar doble ejecución y mantener backup verificado.

Rollback coordinado: conservar release anterior de FE y sus variables en el gestor de secretos durante la ventana de despliegue; restaurar el enrutamiento anterior solo si no quedan productores duplicados. Esta extracción no altera el esquema. No copiar archivos de datos PostgreSQL mientras el servidor está en ejecución.

## Pendientes que no cierra esta extracción

Cuentas reales/credenciales del titular, Kinde end-to-end, habilitación de Mercado Pago, precios comerciales, archivos premium con entrega autorizada (las URLs Cloudinary públicas no bastan), herramientas Sonar/Storybook heredadas de FE-React, distribución de componentes, hosting/dominio, respaldos externos y alertas productivas. El seguimiento central continúa en FE-WEB/docs/ROADMAP.md.
