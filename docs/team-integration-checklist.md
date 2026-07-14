# Checklist de integración del equipo — GAD Cañar

## Antes de integrar

- Todos usan `origin/feature` actualizado.
- Backend ejecuta `npm.cmd run build`.
- 33/33 pruebas críticas aprobadas con `npm.cmd run test:critical`.
- Demo preflight PASS con `npm.cmd run demo:preflight`.
- Contrato API revisado en `docs/frontend-api-contract.md`.

## Autenticación

- Login desde frontend contra `/api/v1/auth/login`.
- Usar `credentials: include`.
- Cookies HttpOnly como mecanismo principal en navegador.
- Refresh con `/api/v1/auth/refresh`.
- Logout con `/api/v1/auth/logout`.
- Manejo de `401` sin asumir sesión local.

## Roles

- `ADMINISTRATOR`.
- `SECRETARY`.
- `TECHNICIAN`.
- `FINANCIAL`.
- `USER`.
- `CITIZEN`.
- Manejo de `403` para controles no autorizados.

## Solicitudes

- Crear.
- Listar.
- Detalle.
- Historial.
- Estados.
- Ownership.
- Trazabilidad consolidada.

## Documentos

- Upload con `FormData`.
- Límite 10 MB.
- Descarga Blob autenticada.
- Verificación SHA-256.
- Sin `attachment.url`.
- Sin `/uploads`.
- Mostrar errores controlados de validación documental.

## IPFS y blockchain

- CID mostrado cuando exista.
- Estado IPFS visible.
- Evidencia blockchain visible.
- Hardhat local sin enlace a Etherscan.
- Trazabilidad como vista consolidada recomendada.
- No reanclar evidencia ya anclada durante demos de solo lectura.

## Auditoría

- `audit/verify` debe devolver `valid=true` para administración.
- No mostrar `previous_hash` al usuario final.
- No borrar `AuditLogs` para limpiar una demostración.

## Errores

- `400`: validación o payload incorrecto.
- `401`: sesión faltante, expirada o inválida.
- `403`: rol u ownership insuficiente.
- `404`: recurso inexistente o inaccesible.
- `413`: archivo mayor al límite.
- `500`: defecto o incidente que debe reportarse.

## Demostración

- Ejecutar `npm.cmd run demo:preflight`.
- Ejecutar `npm.cmd run demo:start`.
- Revisar Swagger en `http://localhost:3000/api/docs`.
- Realizar flujo funcional con datos sintéticos.
- Ejecutar `npm.cmd run demo:check`.
- Ejecutar `npm.cmd run demo:stop`.

## Mensaje para frontend

El backend estable está disponible en `origin/feature`. Para integrar, revisen `docs/frontend-api-contract.md`, usen `/api/v1`, `credentials: include`, `FormData` para archivos y descargas Blob autenticadas. No utilicen `attachment.url`, `/uploads`, `previous_hash` ni rutas legacy.

## Cierre

- Sin errores `500`.
- Repositorios limpios.
- Documentación actualizada.
- Versión aprobada por equipo.
- Evidencia de presentación preparada.
- Limitaciones productivas comunicadas.
