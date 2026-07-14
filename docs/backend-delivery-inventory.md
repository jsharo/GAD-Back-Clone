# Inventario de entrega del backend — GAD Cañar

## 1. Repositorio y rama estable

- Repositorio: `gadca-ar_backend`.
- Rama estable de integración: `origin/feature`.
- Último merge validado para cierre: `051a7bd`.
- Avance 31 integrado: `2ef6202`.

## 2. Documentos principales

- `docs/frontend-api-contract.md`
- `docs/reproducible-demo-environment.md`
- `docs/local-traceability-demo.md`
- `docs/critical-backend-tests.md`
- `docs/database-schema.dbml`
- `docs/database-er-summary.md`
- `docs/database-er-diagram.mmd`
- `docs/naming-conventions.md`
- `docs/backend-technical-closure.md`
- `docs/team-integration-checklist.md`
- `docs/backend-delivery-inventory.md`

## 3. Scripts npm

- `build`
- `start`
- `start:dev`
- `start:debug`
- `db:migrate`
- `db:generate`
- `db:studio`
- `db:seed`
- `lint`
- `test`
- `test:critical`
- `demo:preflight`
- `demo:start`
- `demo:check`
- `demo:stop`

## 4. Scripts de demo

- `scripts/demo/common.ps1`
- `scripts/demo/preflight.ps1`
- `scripts/demo/start-demo.ps1`
- `scripts/demo/check-demo.ps1`
- `scripts/demo/stop-demo.ps1`

Estos scripts calculan la raíz desde `PSScriptRoot`, validan la raíz Git con `git -C`, usan TEMP para estado/logs y no modifican `.env`.

## 5. Endpoints

Inventario verificado:

- 6 controladores.
- 49 endpoints.

Controladores:

- `AuditController`
- `AuthController`
- `RequestController`
- `RolesController`
- `UsersController`
- `VerificationController`

Áreas expuestas:

- autenticación;
- verificación de correo;
- usuarios;
- roles y permisos;
- solicitudes;
- adjuntos;
- SHA-256;
- IPFS;
- blockchain;
- auditoría;
- trazabilidad.

## 6. Roles

- `ADMINISTRATOR`
- `SECRETARY`
- `TECHNICIAN`
- `FINANCIAL`
- `USER`
- `CITIZEN`

## 7. Base de datos

- Motor local validado: PostgreSQL.
- ORM: Prisma.
- Modelos Prisma verificados: 17.
- Enums Prisma verificados: 5.

Modelos:

- `User`
- `Session`
- `Permission`
- `Role`
- `UserPermission`
- `RolePermission`
- `UserRole`
- `RoleAssignment`
- `Request`
- `Property`
- `Attachment`
- `RequestHistory`
- `Inspection`
- `Resolution`
- `AuditLog`
- `SecretaryDecision`
- `FeeRule`

## 8. Migraciones

Migraciones verificadas: 11.

- `20260616040626_init`
- `20260616135603_add_attachment_hash`
- `20260618022545_add_audit_hash_chain`
- `20260618120000_user_rbac_and_schema_sync`
- `20260618224922_usuarios`
- `20260619120000_optional_cedula`
- `20260619184120_normalize_role_names`
- `20260629122602_add_attachment_ipfs_metadata`
- `20260701184019_add_attachment_blockchain_metadata`
- `20260707234619_rename_refresh_token_to_session`
- `20260708004612_session_redesign`

## 9. Contrato Solidity

- `contracts/DocumentEvidenceRegistry.sol`

Uso validado en Hardhat local con `chainId` 31337. No representa una red productiva.

## 10. Suite de pruebas

- Suite crítica: 33 pruebas.
- Archivos principales:
  - `test/document-security.test.js`
  - `test/critical/critical-backend.test.js`
  - `test/critical/helpers/fixtures.js`
  - `test/DocumentEvidenceRegistry.test.js`

La suite crítica se ejecuta con:

```powershell
npm.cmd run test:critical
```

## 11. Servicios externos locales

- PostgreSQL local.
- Kubo/IPFS local.
- Hardhat local.
- Servicio de correo sujeto a configuración externa.

## 12. Puertos

- Backend y Swagger: 3000.
- IPFS API: 5001.
- IPFS Gateway: 8080.
- Hardhat: 8545.
- PostgreSQL: 5432 o el puerto definido localmente.

## 13. Evidencia sintética conservada

Existe evidencia sintética local de demostración generada en verificaciones previas. Incluye una solicitud de prueba, adjunto con SHA-256, CID local y anclaje Hardhat local. Debe conservarse si ya fue anclada para no romper la trazabilidad local.

No contiene documentos ciudadanos reales y no debe tratarse como evidencia productiva.

## 14. Archivos no versionados

No deben versionarse:

- `.env`
- respaldos locales;
- logs temporales;
- `node_modules`;
- `dist`;
- `uploads` operativos;
- estados temporales de demo;
- credenciales;
- tokens;
- cookies;
- claves privadas.

## 15. Responsables

- Backend: equipo de desarrollo backend.
- Frontend: equipo de integración frontend.
- Validación funcional: equipo del proyecto.
- Aprobación de versión demo: Scrum Master y equipo.
- Producción institucional: requiere responsables técnicos y legales del GAD.
