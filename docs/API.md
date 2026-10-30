# Contrato HTTP v1

JSON; fechas ISO 8601 UTC y dinero CLP entero. Respuestas no se almacenan en caché. Errores `{ "error": "mensaje seguro" }`; 401 sesión ausente/inválida, 403 permisos insuficientes, 404 recurso no disponible, 409 conflicto, 429 límite, 503 configuración incompleta y 500 fallo interno sin detalles sensibles.

La comunicación habitual es servidor Next → API. `BACKEND_API_URL` es privada del servidor y el Bearer se obtiene con `getAccessTokenRaw()` desde Kinde. No se usa una clave compartida para suplantar usuarios ni se confía en `x-user-id`. No se habilita CORS abierto ni autenticación mediante cookies en BE.

| Método y ruta | Acceso | Datos / resultado |
|---|---|---|
| GET /health/live | Público | `{status:"ok"}` |
| GET /health/ready | Público | DB + identidad configurada; 503 si no está lista |
| GET /v1/plans | Público | `[{id,name,months,amount}]`; amount null sin precio configurado |
| GET /v1/creator | Público | `{id,name,image,imageCount,videoCount,totalLikes}` o null; sin email |
| GET /v1/me | Bearer | `{id,name,email,image,isAdmin,isSubscribed}` del usuario autenticado |
| PATCH /v1/me | Bearer | `{name,image}`; no acepta cambio de ID, email, rol o suscripción |
| GET /v1/feed | Bearer | hasta 100 posts; material premium/comentarios se redaccionan antes de serializar |
| POST /v1/posts/:id/likes | Membresía vigente o admin | alterna like transaccional único |
| POST /v1/posts/:id/comments | Membresía vigente o admin | `{text}`; autor derivado de identidad |
| DELETE /v1/posts/:id | Admin | elimina post y sus relaciones |
| GET /v1/products | Bearer | hasta 100 productos no archivados |
| GET /v1/products/:id | Bearer | producto no archivado o 404 |
| POST /v1/orders/checkout | Bearer | `{productId,size,requestKey,shipping:{address,city,state,postalCode}}`; retorna `{url}`; precio leído en servidor |
| GET /v1/orders/:id | Bearer propietario | resumen con producto/despacho o false si no pertenece al usuario |
| GET /v1/billing | Bearer | `{subscription,hasAccess}`; fechas ISO |
| POST /v1/billing/checkout | Bearer | `{plan:"monthly"|"yearly"}`; `{url}` |
| POST /v1/billing/cancel | Bearer propietario | cancela renovación, conserva período ya pagado |
| POST /v1/billing/refresh | Bearer propietario | concilia membresía sin aceptar estado del navegador |
| POST /v1/uploads/sign | Bearer | `{paramsToSign}`; allowlist y carpeta/preset según permisos |
| GET /v1/admin/check | Admin | perfil autenticado |
| GET /v1/admin/products | Admin | catálogo incluido archivados |
| POST /v1/admin/products | Admin | `{name,image,price}`; CLP entero |
| POST /v1/admin/products/:id/archive | Admin | alterna archivado |
| POST /v1/admin/posts | Admin | `{text,mediaUrl?,mediaType?,isPublic}` |
| GET /v1/admin/analytics | Admin | ingresos netos CLP, ventas, membresías y actividad reciente |
| POST /webhooks/mercadopago | HMAC Mercado Pago | topics payment/subscription_preapproval/subscription_authorized_payment |
| GET /internal/cron/billing | Bearer CRON_SECRET | conciliación limitada y limpieza de límites vencidos |
| GET /internal/cron/emails | Bearer CRON_SECRET | envía hasta 25 correos pendientes con idempotencia |

Los antiguos webhooks/cron de FE-WEB devuelven 410: actualizar la configuración del proveedor, no encadenar proxies con secretos. La firma de imágenes sigue disponible en FE-WEB como adaptador autenticado para el widget; firma y reglas residen aquí.

La autorización de preapproval por sí sola no concede contenido: requiere pago aprobado y período vigente. Se conservan idempotencia, consulta de comercio/importe/moneda/modo, devoluciones y protección frente a respuestas antiguas.
