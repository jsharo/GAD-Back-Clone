# Cierre técnico del backend — GAD Cañar

## 1. Resumen ejecutivo

El backend del sistema GAD Cañar queda funcional para demostración local e integración con el frontend sobre la rama `origin/feature`. La versión validada incluye autenticación con cookies HttpOnly, control de roles, gestión de trámites, adjuntos protegidos, verificación SHA-256, carga local a IPFS, anclaje en blockchain local Hardhat, auditoría con hash chain y reporte consolidado de trazabilidad.

Este cierre no representa un despliegue productivo. La ejecución validada usa PostgreSQL local, Kubo local, Hardhat local y datos sintéticos. Antes de producción se requiere infraestructura institucional, endurecimiento operativo, aceptación formal y políticas legales de conservación documental.

## 2. Estado de la versión

- Rama base validada: `origin/feature`.
- Último merge validado: `051a7bd`, correspondiente al Avance 31.
- Commit de ambiente reproducible integrado: `2ef6202`.
- Estado técnico: backend demostrable localmente, con build correcto, 33 pruebas críticas aprobadas y `demo:preflight`, `demo:start`, `demo:check` y `demo:stop` operativos.
- Recomendación documental de versión: `v0.9.0-demo`.

La etiqueta `v0.9.0-demo` no debe crearse todavía. Debe aprobarse primero por Scrum Master y equipo, y debe apuntar al commit final mergeado en `origin/feature`.

## 3. Arquitectura implementada

La arquitectura actual es un backend NestJS modular con Prisma para persistencia, PostgreSQL local, servicios de autenticación, usuarios, roles, trámites, auditoría, IPFS, blockchain y correo. La API expone Swagger en entorno no productivo y usa el prefijo local `/api/v1`.

El flujo principal de trazabilidad es:

```text
Solicitud -> Adjunto -> SHA-256 -> IPFS local -> Blockchain Hardhat -> Auditoría -> Trazabilidad
```

## 4. Tecnologías

- Node.js y npm.
- NestJS.
- Prisma ORM.
- PostgreSQL.
- JWT y cookies HttpOnly.
- bcrypt para hashes de credenciales y códigos.
- Kubo/IPFS local.
- Hardhat local con `chainId` 31337.
- Solidity para `DocumentEvidenceRegistry`.
- Jest y `node --test` para suite crítica.
- PowerShell para automatización reproducible local.

## 5. Módulos disponibles

El repositorio contiene 11 módulos NestJS:

- `AppModule`
- `AuditModule`
- `AuthModule`
- `BlockchainModule`
- `EmailModule`
- `IpfsModule`
- `PrismaModule`
- `RequestModule`
- `RolesModule`
- `UsersModule`
- `VerificationModule`

Se verificaron 6 controladores y 49 endpoints actuales.

## 6. Autenticación y sesiones

El backend usa login con cookies HttpOnly para navegador, refresh con rotación de sesión y logout con revocación. El access token tiene vida corta y el refresh token se guarda como hash en servidor. El frontend debe usar `credentials: include` y no almacenar tokens en `localStorage`.

Los endpoints principales son:

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /verification/verify-email`

## 7. Roles y permisos

Roles activos verificados:

- `ADMINISTRATOR`
- `SECRETARY`
- `TECHNICIAN`
- `FINANCIAL`
- `USER`
- `CITIZEN`

El servidor conserva la autoridad final de autorización. El frontend puede ocultar controles, pero siempre debe manejar respuestas `401` y `403`.

El rol legado `GUEST`, si aparece en documentación, datos históricos o integraciones externas, debe revisarse en una fase futura; no forma parte del enum activo verificado.

## 8. Gestión de trámites

El módulo de solicitudes permite crear, listar, consultar detalle, revisar, agendar inspecciones, registrar informes, resolver, consultar historial operativo y obtener trazabilidad consolidada. Las reglas de ownership separan ciudadanos, profesionales y roles institucionales.

El estado sintético de demostración puede incluir solicitudes creadas durante smoke tests. Esa evidencia se conserva cuando ya fue anclada para no romper la trazabilidad local.

## 9. Seguridad documental

La política documental valida tipo, extensión, tamaño y contenido real del archivo. Los adjuntos se almacenan en carpetas de expediente y no se expone una URL directa de almacenamiento. El frontend no debe usar `/uploads` ni `attachment.url`; debe usar endpoints autenticados de descarga.

Límites y comportamiento relevantes:

- Tamaño máximo de documento: 10 MB.
- Upload mediante `multipart/form-data`.
- Descarga como Blob autenticado.
- Nombres de archivo sanitizados.
- Control de ownership antes de resolver archivos.

## 10. Integridad SHA-256

Cada adjunto almacena hash SHA-256. El endpoint de verificación recalcula la integridad desde el archivo físico y devuelve si el documento sigue siendo válido. Los adjuntos legacy sin hash se distinguen explícitamente.

## 11. IPFS

La integración validada usa Kubo local. IPFS se habilita para demostración con variables de proceso gestionadas por `demo:start`, sin modificar `.env`.

Condiciones:

- API local: puerto 5001.
- Gateway local: puerto 8080.
- El CID se conserva como evidencia técnica.
- Kubo local no equivale a almacenamiento institucional persistente.

## 12. Blockchain

El contrato local es `DocumentEvidenceRegistry`. La demostración usa Hardhat local con `chainId` 31337. El contrato se despliega durante `demo:start` y su dirección se guarda en el estado temporal de la demo.

Hardhat pierde estado al reiniciarse; por tanto, esta evidencia local sirve para demostración y trazabilidad técnica, no para certificación productiva.

## 13. Auditoría y Hash Chain

El backend mantiene eventos de auditoría con cadena de hashes. `GET /audit/verify` valida la cadena y reporta logs legacy cuando corresponde. El frontend no debe mostrar `previous_hash` como dato de usuario final.

## 14. Trazabilidad consolidada

El endpoint de trazabilidad consolida datos de solicitud, historial, adjuntos, SHA-256, IPFS, blockchain y auditoría relacionada. Es la vista recomendada para presentar el recorrido técnico de un expediente.

## 15. Base de datos y migraciones

Estado verificado:

- 17 modelos Prisma.
- 5 enums Prisma.
- 11 migraciones.
- `prisma migrate status`: esquema actualizado.

Modelos principales: usuarios, sesiones, roles, permisos, solicitudes, predios, adjuntos, historial, inspecciones, resoluciones, auditoría, decisiones de secretaría y reglas de tasa.

## 16. Pruebas

La suite crítica contiene 33 pruebas aprobadas. Cubre:

- autenticación y rotación de sesiones;
- autorización y ownership;
- contratos de solicitudes y trazabilidad;
- seguridad documental;
- SHA-256;
- limpieza de archivos;
- auditoría hash chain;
- precondiciones IPFS/blockchain con mocks.

La suite crítica no reemplaza una prueba E2E productiva, carga, seguridad externa ni aceptación formal.

## 17. Ambiente reproducible

Los comandos disponibles son:

```powershell
npm.cmd run demo:preflight
npm.cmd run demo:start
npm.cmd run demo:check
npm.cmd run demo:stop
```

`demo:start` levanta únicamente servicios faltantes, despliega contrato local, inicia backend con configuración temporal y guarda estado/logs en `%TEMP%\gad-canar-demo`. `demo:stop` detiene solo procesos iniciados por la demo y no administra PostgreSQL.

## 18. Contrato API

El contrato para frontend está en `docs/frontend-api-contract.md`. El frontend debe usar base local `http://localhost:3000/api/v1`, `credentials: include`, `FormData` para archivos y descargas Blob autenticadas.

## 19. Seguridad

Reglas de entrega:

- No versionar `.env`.
- No publicar secretos, cookies, tokens ni claves.
- No usar llaves reales para Hardhat local.
- No usar documentos ciudadanos en demos locales.
- No exponer `/uploads`.
- No copiar logs con datos operativos a Git.

## 20. Limitaciones conocidas

Estas limitaciones no son defectos del prototipo; son condiciones pendientes para producción:

- No hay infraestructura productiva del GAD.
- No existe todavía acceso a base institucional.
- Hardhat pierde estado al reiniciarse.
- Kubo local no es almacenamiento institucional persistente.
- Falta HTTPS y dominio institucional.
- Falta backup institucional.
- Falta monitoreo.
- Falta análisis antivirus profundo.
- Falta auditoría externa.
- Falta prueba de carga.
- Falta aceptación formal del GAD.
- Falta política legal de conservación documental.
- Correo institucional depende de configuración externa.
- El rol `GUEST` legado debe revisarse en una fase futura si sigue existiendo en fuentes externas.

## 21. Requisitos para producción

Antes de producción se requiere:

- infraestructura de despliegue y observabilidad;
- base PostgreSQL institucional con backup y restauración probada;
- configuración segura de dominios, HTTPS y CORS;
- proveedor persistente para documentos y evidencia;
- estrategia institucional para IPFS o almacenamiento equivalente;
- red blockchain o mecanismo de certificación aprobado;
- gestión segura de secretos;
- antivirus o análisis profundo de archivos;
- auditoría externa;
- pruebas de carga;
- plan de soporte, monitoreo y respuesta a incidentes;
- aceptación formal funcional, legal y técnica.

## 22. Procedimiento de entrega

1. Actualizar rama de integración.
2. Ejecutar `npm.cmd run build`.
3. Ejecutar `npm.cmd run test:critical`.
4. Ejecutar `npm.cmd run demo:preflight`.
5. Ejecutar `npm.cmd run demo:start`.
6. Validar Swagger y flujo de demostración con datos sintéticos.
7. Ejecutar `npm.cmd run demo:check`.
8. Ejecutar `npm.cmd run demo:stop`.
9. Confirmar repositorio limpio.
10. Entregar documentación al equipo frontend y al Scrum Master.

## 23. Checklist de aceptación

- [ ] Build correcto.
- [ ] 33/33 pruebas críticas aprobadas.
- [ ] `demo:preflight` PASS.
- [ ] `demo:start` PASS.
- [ ] `demo:check` PASS.
- [ ] `demo:stop` ejecutado.
- [ ] PostgreSQL no detenido por los scripts.
- [ ] Trazabilidad demostrada con evidencia sintética.
- [ ] `audit/verify` devuelve `valid=true`.
- [ ] Documentación frontend revisada.
- [ ] Limitaciones de producción comunicadas.
- [ ] No hay secretos en documentación o commits.

## 24. Conclusión

El backend queda cerrado técnicamente como versión de demostración estable. Está listo para integración frontend, documentación en Notion y presentación controlada local. No debe declararse como producción hasta completar los requisitos institucionales, legales y operativos pendientes.
