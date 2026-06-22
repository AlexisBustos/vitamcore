# Almacenamiento de documentos — estado y pendientes

## Estado actual (Sprint 2)

El módulo **Documentos** gestiona **metadatos** del documento (título, tipo, estado, cliente,
etiquetas, proyecto asociado y un campo `aiSummary` preparado para IA). El modelo ya incluye los
campos necesarios para el archivo físico:

- `fileName` — nombre del archivo.
- `fileUrl` — URL/clave del objeto en el almacenamiento.
- `fileType` — MIME type.
- `fileSize` — tamaño en bytes.

Hoy estos campos se ingresan manualmente; **todavía no hay carga real de archivos**.

## Qué falta para habilitar almacenamiento real (S3 / Cloudflare R2)

1. **Aprovisionar el bucket** (S3 o R2) y credenciales (access key / secret).
2. **Variables de entorno** en `backend/.env`:
   - `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`
   - `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`
   - Añadirlas a la validación Zod en `src/config/env.ts`.
3. **Backend**:
   - Añadir el SDK (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`; R2 es compatible con la API S3).
   - Endpoint `POST /api/documents/:id/upload-url` que devuelva una **URL prefirmada** de subida.
   - Al confirmar la subida, guardar `fileName`, `fileUrl` (clave), `fileType`, `fileSize`.
   - Endpoint para generar URL prefirmada de **descarga** temporal.
4. **Frontend**:
   - En `DocumentForm`, reemplazar los inputs manuales de archivo por un `<input type="file">`.
   - Flujo: pedir URL prefirmada → subir el archivo directo al bucket → confirmar metadatos.
   - Mostrar enlace de descarga cuando `fileUrl` exista.
5. **Seguridad**: validar tipo/tamaño, expiración corta de las URLs prefirmadas, y no exponer
   credenciales del bucket al cliente (todo a través de URLs prefirmadas).

> El campo `aiSummary` ya está listo para que, en el Sprint 3, un proceso de IA lea el archivo
> (texto extraído) y complete automáticamente el resumen.
