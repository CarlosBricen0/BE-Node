# OnlyHorse · BE-Node

Backend independiente de FE-WEB. Node 22, Express 5, TypeScript y PostgreSQL 16. Prisma, pagos Mercado Pago Chile (CLP), permisos, feed, catálogo, pedidos, firma Cloudinary, correo Resend y conciliación viven aquí. FE-React mantiene los componentes/Storybook y FE-WEB mantiene Next y la sesión Kinde.

## Desarrollo

Desde esta carpeta:

```sh
nvm use
npm ci
cp .env.example .env
npm run db:local
npm run db:deploy
npm run db:seed
npm run dev
```

Si ya existe `.env`, conservarlo. `db:local` necesita PostgreSQL 16 (`brew install postgresql@16` en macOS) y usa exclusivamente la instancia privada del proyecto en 127.0.0.1:5433; no usa el servicio global de Homebrew. Bases `onlyhorse` y `onlyhorse_test`; credenciales aleatorias en archivos ignorados con modo 600. `db:seed` solo es para demostración y rechaza producción. No reiniciar migraciones ni ejecutar `prisma db push` sobre datos existentes.

API local: http://127.0.0.1:4000. FE-WEB usa `BACKEND_API_URL=http://127.0.0.1:4000` y funciona en el puerto 3001. Son procesos y repositorios independientes; no hay enlaces de código ni acceso de Next a PostgreSQL.

## Identidad y configuración

Registrar una API en Kinde con audiencia `urn:onlyhorse:api`, autorizar a la aplicación de FE-WEB para usarla y configurar **la misma** `KINDE_ISSUER_URL` y `KINDE_AUDIENCE` en ambos repos. Volver a iniciar sesión después del cambio. El backend recibe el access token del usuario, verifica RS256, JWKS, issuer, audience, sujeto y expiración; obtiene el perfil desde Kinde y exige que su identidad coincida. No acepta IDs de usuario o roles enviados por el cliente. Las claves privadas del cliente Kinde permanecen en FE-WEB; aquí no son necesarias.

Configurar en `.env` los secretos de Mercado Pago, Cloudinary y Resend, ID inmutable del administrador, precios CLP, `WEB_APP_URL` y `CRON_SECRET`. La audiencia no es un secreto. Referencias: [proteger API en Kinde](https://docs.kinde.com/developer-tools/your-apis/protect-your-api/) y [SDK Next](https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/).

```sh
npm run check:env
npm run check:services
npm run typecheck
npm test
npm run test:integration
npm run build
npm start
```

`check:env`/`check:services` devuelven código distinto de cero mientras falten cuentas; no simulan conexión. La integración usa únicamente `onlyhorse_test` local y limpia sus fixtures. Pruebas HTTP inyectan identidades solo en la fábrica de aplicación del test; el ejecutable de producción siempre usa el verificador Kinde real. No existe bandera de bypass.

## Operación

- `POST /webhooks/mercadopago`: nueva URL pública HTTPS para configurar en Mercado Pago y `MERCADOPAGO_WEBHOOK_URL`. Valida firma y consulta al proveedor antes de modificar acceso/pedidos.
- `GET /internal/cron/billing`: conciliación; ejecutar cada 5 minutos con `Authorization: Bearer CRON_SECRET`.
- `GET /internal/cron/emails`: outbox Resend; ejecutar cada minuto con el mismo mecanismo.
- `GET /health/live`: proceso vivo. `GET /health/ready`: PostgreSQL accesible y configuración de identidad presente; no acredita compras o login reales.
- `npm run db:backup:verify`: respaldo privado y ensayo de restauración local temporal. Producción requiere copias externas cifradas, retención y alertas.

Ver [contrato API](docs/API.md), [despliegue](docs/DEPLOYMENT.md) y el [seguimiento central](https://github.com/CarlosBricen0/FE-WEB/blob/feat/onlyhorse-platform/docs/ROADMAP.md).

El ejemplo anterior Express/Mongoose se retiró. Su credencial MongoDB incrustada debe revocarse en el proveedor; borrarla del código actual no la elimina del historial Git.
