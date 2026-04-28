# Guía: iOS Shortcut para enviar a Flowy

Esta guía te muestra cómo crear un **Atajo de iOS** que publica contenido al endpoint de ingestión de Flowy (`POST /api/ingest`) desde el share sheet. Cubre los tres casos principales:

- **Posts de Instagram** (URLs tipo `instagram.com/p/...` o `instagram.com/tv/...`).
- **Posts de Reddit** (URLs tipo `reddit.com/r/*/comments/...`, `reddit.com/r/*/s/...`, `redd.it/...`).
- **Screenshots** (cualquier imagen compartida desde Fotos o desde el preview del screenshot).

El servidor detecta automáticamente Instagram y Reddit a partir de la URL (ver `apps/web/app/api/ingest/route.ts:130-138`), así que no necesitas setear `type: "instagram"` o `type: "reddit"` — basta con `type: "url"` y el backend rutea al procesador correcto.

---

## Pre-requisitos

1. **iPhone o iPad con iOS 15+** y la app **Atajos** instalada (viene por defecto).
2. Cuenta Flowy con **email + password**. Si iniciaste sesión solo con Apple o Google, entra a `https://tryflowy.app`, ve a tu perfil y define un password (la app usa PocketBase y ese endpoint de auth necesita `identity + password`).
3. **URL pública de PocketBase** — es el valor de la variable `NEXT_PUBLIC_PB_URL` del deployment (típicamente algo como `https://flowy-pb.up.railway.app`). Pídesela al admin del deployment o revísala en Railway. **No es** `https://tryflowy.app`, es un dominio distinto.
4. **URL de la app**: `https://tryflowy.app`.

---

## Contrato de la API (referencia rápida)

### Login contra PocketBase

```
POST {PB_URL}/api/collections/users/auth-with-password
Content-Type: application/json

{ "identity": "<email>", "password": "<password>" }
```

Respuesta: `{ "token": "...", "record": { ... } }`.

### Ingest

```
POST https://tryflowy.app/api/ingest
Authorization: Bearer <pb_token>
Content-Type: application/json
```

Body para URLs (Instagram, Reddit, genérica):

```json
{ "type": "url", "raw_url": "https://..." }
```

Body para screenshots:

```json
{ "type": "screenshot", "raw_images": ["<base64 jpeg>"] }
```

Respuesta OK (`201`): `{ "data": { "id": "...", "status": "pending" } }`.

Errores típicos: `401 UNAUTHORIZED`, `400 MISSING_URL`, `400 MISSING_IMAGE`, `400 INVALID_TYPE`.

---

## Construcción del Shortcut paso a paso

Abre la app **Atajos**, pulsa el botón **+** para crear uno nuevo y añade las acciones en este orden.

### Config inicial — variables

1. **Text** → escribe `https://tryflowy.app` → **Set Variable** `APP_URL`.
2. **Text** → escribe tu URL de PocketBase (ej. `https://flowy-pb.up.railway.app`) → **Set Variable** `PB_URL`.
3. **Text** → tu email → **Set Variable** `EMAIL`.
4. **Text** → tu password → **Set Variable** `PASSWORD`.

> **Nota de seguridad**: el password queda en claro dentro del Shortcut. Es aceptable para uso personal en tu dispositivo. Si prefieres que te lo pida cada vez, reemplaza el paso 4 por **Ask for Input** (tipo "Password") y guarda el resultado en `PASSWORD`.

### Paso A — Login para obtener el token

5. **Dictionary** con dos claves:
   - `identity` → valor: variable `EMAIL`.
   - `password` → valor: variable `PASSWORD`.
6. **Text** → `PB_URL` concatenada con `/api/collections/users/auth-with-password` (inserta la variable `PB_URL` dentro del campo). Guarda opcional en variable `LOGIN_URL`.
7. **Get Contents of URL**:
   - URL: `LOGIN_URL` (o el Text del paso 6).
   - Method: **POST**.
   - Headers: añade `Content-Type` = `application/json`.
   - Request Body: **JSON** → selecciona el Dictionary del paso 5.
8. **Get Dictionary Value** → Get Value for `token` in `Contents of URL` → **Set Variable** `PB_TOKEN`.
9. **If** `PB_TOKEN` **has any value** → continúa. **Otherwise** → **Show Alert** "Login falló — revisa email/password/PB_URL" → **Stop Shortcut**.

### Paso B — Aceptar input desde el share sheet

10. En el panel inferior del Shortcut pulsa el ⓘ y activa **"Mostrar en hoja de compartir"**. En **"Tipos de hoja de compartir"** deja activados solo **URLs** e **Imágenes**.
11. Añade la acción **Get Type of Shortcut Input** (o usa un **If — Shortcut Input is URL**). Lo usaremos para decidir qué rama ejecutar.

### Paso C — Rama URL (Instagram, Reddit, cualquier URL)

12. **If Shortcut Input is URL**:
13. Dentro del If, **Dictionary** con:
    - `type` → `url`.
    - `raw_url` → variable `Shortcut Input`.
14. **Text** → `APP_URL` + `/api/ingest` → variable `INGEST_URL`.
15. **Text** → `Bearer ` (con espacio al final) + variable `PB_TOKEN` → variable `AUTH_HEADER`.
16. **Get Contents of URL**:
    - URL: `INGEST_URL`.
    - Method: **POST**.
    - Headers:
      - `Authorization` = `AUTH_HEADER`.
      - `Content-Type` = `application/json`.
    - Request Body: **JSON** → Dictionary del paso 13.
17. **Get Dictionary Value** → `data.id` del resultado.
18. **If** `data.id` **has any value** → **Show Notification** "Enviado a Flowy". **Otherwise** → **Show Result** con el body completo para debug.

### Paso D — Rama imagen / screenshot

19. Añade un **Otherwise** al If del paso 12 (o un If separado que dispare cuando el input sea una imagen).
20. **Base64 Encode** → input: `Shortcut Input` → modo: Encode → output: texto base64.
21. **List** (acción "List") con **un solo item**: el resultado del paso 20. Importante: debe ser una List, no un Text, porque el backend espera un array en `raw_images`.
22. **Dictionary** con:
    - `type` → `screenshot`.
    - `raw_images` → la List del paso 21.
23. **Get Contents of URL** (misma config que paso 16, pero con el Dictionary del paso 22 como body).
24. Mismo parseo de respuesta que el paso 17–18.

### Paso E — Probar y nombrar

25. Nombra el Shortcut **"Send to Flowy"** (o lo que prefieras).
26. Pulsa ▶ con un input de prueba (pega una URL de Instagram en el campo de test) para verificar que funciona antes de usarlo desde el share sheet.

---

## Verificación end-to-end

Haz estas pruebas manuales una vez creado el Shortcut. En cada caso abre `https://tryflowy.app/inbox` después y confirma que aparece el item.

1. **Instagram**: abre la app de Instagram → entra a un post → botón de compartir → **Send to Flowy**. Espera la notificación "Enviado a Flowy". En la inbox debe aparecer con `type = instagram`.
2. **Reddit**: desde la app oficial de Reddit (o Apollo / Narwhal) → compartir un post → **Send to Flowy**. Tipo esperado: `reddit`.
3. **Screenshot**: toma un screenshot (botones laterales) → toca el preview abajo a la izquierda → botón de compartir → **Send to Flowy**. Tipo esperado: `screenshot`.
4. **URL genérica**: Safari → cualquier artículo → botón de compartir → **Send to Flowy**. Tipo esperado: `url`.

### Debug rápido con curl

Si el Shortcut falla, confirma primero que tus credenciales y `PB_URL` funcionan contra la API directamente:

```bash
# 1. Login → extrae el token
TOKEN=$(curl -s -X POST "$PB_URL/api/collections/users/auth-with-password" \
  -H "Content-Type: application/json" \
  -d '{"identity":"tu@email.com","password":"TU_PASSWORD"}' | jq -r .token)
echo "$TOKEN"

# 2. Ingest de prueba con una URL cualquiera
curl -X POST https://tryflowy.app/api/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"url","raw_url":"https://example.com"}'
# Esperado: {"data":{"id":"...","status":"pending"}}
```

Si este curl funciona pero el Shortcut no, el problema está en cómo el Shortcut construye el request (headers, body, variable mal pasada).

---

## Troubleshooting

| Síntoma | Causa probable | Cómo arreglarlo |
|---|---|---|
| `401 UNAUTHORIZED` al llamar `/api/ingest` | Token inválido, expirado o mal pegado | Revisa que `AUTH_HEADER` empiece con `Bearer ` (con espacio) y que `PB_TOKEN` no esté vacío. Vuelve a probar el login manual con curl. |
| Login falla con `400` o `"Failed to authenticate"` | Usuario sin password (solo SIWA/Google), o `PB_URL` incorrecta | Entra a la web y crea password. Verifica que `PB_URL` **no** sea `tryflowy.app`, sino el dominio de PocketBase del deployment. |
| `400 MISSING_URL` | El input no se reconoció como URL | En el paso 11, en lugar de `Get Type`, usa **If Shortcut Input has URL** y extrae la URL primero con **Get URLs from Input**. |
| `400 MISSING_IMAGE` | `raw_images` se envió como string en vez de array | Confirma que el paso 21 usa **List** (no un simple Text). El backend exige `raw_images: string[]` (`apps/web/app/api/ingest/route.ts:142-147`). |
| Timeout / cuelgue en screenshots | Imagen muy grande (>5 MB en base64) | Añade **Resize Image** antes del **Base64 Encode**, target 1600px de ancho. Después **Convert Image** a JPEG calidad 0.85 (coincide con lo que hace el Share Extension nativo). |
| Instagram comparte texto en vez de URL | Instagram a veces comparte una cadena de texto con la URL embebida | Añade una rama adicional: si el input es **Text**, usa **Get URLs from Input** para extraer la URL y pásala a la rama C. |
| `400 INVALID_TYPE` | El JSON del body está mal formado | En **Get Contents of URL**, asegúrate de que **Request Body** está en modo **JSON**, no **Form**. |

---

## Extensiones opcionales

No las implementa esta guía, pero son mejoras naturales:

- **Cachear el token** en un archivo de iCloud Drive (`Save File` + `Get File`) y saltar el login si aún es válido. Refrescar cuando devuelva 401.
- **Soporte para múltiples screenshots** a la vez: cuando compartes varias fotos desde la app Fotos, `Shortcut Input` llega como una lista. Reemplaza el paso 20 por un **Repeat with Each** que haga Base64 Encode de cada imagen y acumúlalas en la List del paso 21. Máximo 10 por request (`MAX_IMAGES` en el backend).
- **Soporte para screen recordings** (`type: "screen_recording"`, campos `raw_video` + `video_mime`). Mismo patrón que screenshots pero con **Base64 Encode** del video y timeout alto. Ver `apps/ios/Shared/IngestClient.swift:39-46`.
- **Automation**: en vez de ejecutarlo manualmente, crea una **Personal Automation** tipo "Cuando tomo un screenshot" → ejecuta el Shortcut con el screenshot como input.

---

## Referencias de código

Si algo no funciona y necesitas inspeccionar el contrato real:

- `apps/web/app/api/ingest/route.ts` — endpoint `/api/ingest` completo (validación, auth, errores).
- `apps/ios/Shared/IngestClient.swift` — cliente nativo de referencia (URL, screenshot, screen_recording).
- `apps/ios/ShareExtension/ShareViewController.swift` — prioridad de tipos (URL > video > imagen > texto).
- `REDDIT_SETUP.md` — ejemplo curl oficial.
- `tests/e2e/smoke.spec.ts` — flujo completo auth + ingest + polling.
