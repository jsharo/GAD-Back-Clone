# Modelo de base de datos - GAD Canar

Fuente: `prisma/schema.prisma`.

Este documento resume el modelo PostgreSQL administrado por Prisma. No describe datos reales ni agrega tablas que no existan en el esquema.

## Modelos

| Modelo Prisma | Tabla PostgreSQL | Descripcion |
| --- | --- | --- |
| `User` | `user` | Cuenta de usuario, perfil, estado, verificacion de correo y borrado logico. |
| `RefreshToken` | `refresh_token` | Refresh tokens hasheados, vigencia y revocacion de sesiones. |
| `Permission` | `permission` | Catalogo de permisos disponibles. |
| `Role` | `role` | Catalogo de roles del sistema. |
| `UserPermission` | `user_permission` | Tabla puente de permisos asignados directamente a usuarios. |
| `RolePermission` | `role_permission` | Tabla puente de permisos incluidos en roles. |
| `UserRole` | `user_role` | Tabla puente entre usuarios y roles; `userId` es unico, por lo que un usuario tiene como maximo un rol activo en esta tabla. |
| `RoleAssignment` | `role_assignments` | Historial de asignacion de un rol a un usuario por otro usuario. |
| `Request` | `requests` | Expediente o solicitud municipal, con ciudadano, profesional opcional, predio y estado. |
| `Property` | `properties` | Predio asociado de forma exclusiva a una solicitud. |
| `Attachment` | `attachments` | Documento adjunto y sus metadatos locales, SHA-256, IPFS y blockchain. |
| `RequestHistory` | `request_histories` | Historial de transiciones de estado de una solicitud. |
| `Inspection` | `inspections` | Inspeccion tecnica unica por solicitud, con comentarios y rutas de fotos. |
| `Resolution` | `resolutions` | Resolucion unica por solicitud, valores de pago y detalle de calculo. |
| `AuditLog` | `audit_logs` | Eventos de auditoria enlazados mediante `previous_hash` y `current_hash`. |
| `SecretaryDecision` | `secretary_decisions` | Decision unica de secretaria sobre una solicitud y validacion de firma. |
| `FeeRule` | `fee_rules` | Regla tarifaria unica por combinacion de tipo de solicitud y zona. |

## Relaciones principales

### Usuarios, roles y permisos

- `User` 1:N `RefreshToken`.
- `User` N:M `Permission` mediante `UserPermission`.
- `Role` N:M `Permission` mediante `RolePermission`.
- `User` N:M `Role` mediante `UserRole`, aunque `@@unique([userId])` limita a cada usuario a un solo rol dentro de esa tabla.
- `RoleAssignment` referencia al usuario que recibe el rol, al rol asignado y al usuario que realiza la asignacion.

### Solicitudes y tramites

- Cada `Request` pertenece obligatoriamente a un ciudadano (`citizen_id`).
- Un `Request` puede tener un profesional o arquitecto opcional (`architect_id`).
- Cada `Request` tiene un `Property`; `property_id` es unico, formando una relacion 1:1.
- Un `Request` puede tener muchos `Attachment` y muchos `RequestHistory`.
- Un `Request` puede tener como maximo un `Inspection`, una `Resolution` y una `SecretaryDecision`, porque sus respectivos `request_id` son unicos.
- Cada `SecretaryDecision` pertenece al usuario que actua como secretario.

### Auditoria y Hash Chain

- `AuditLog.user_id` es opcional y referencia a `User` con `onDelete: SetNull`.
- `user_email` conserva la identidad textual asociada al evento.
- `previous_hash` enlaza logicamente cada evento con el hash anterior.
- `current_hash` almacena el SHA-256 calculado para el evento actual.
- La cadena de hashes es logica; no existe una tabla blockchain separada para auditoria.

### Documentos e integridad

`Attachment` pertenece a un `Request` y contiene:

- `url`: ubicacion del archivo en almacenamiento local.
- `hash`: SHA-256 del contenido para verificar integridad.
- `name`, `type`, `size` y `folder`: metadatos documentales.
- Eliminacion en cascada cuando se elimina el expediente relacionado.

### IPFS

Los metadatos IPFS se guardan directamente en `Attachment`:

- `ipfs_cid`: identificador de contenido.
- `ipfs_status`: estado del proceso, con valor inicial `PENDING`.
- `ipfs_uploaded_at`: fecha de subida.
- `ipfs_provider`: proveedor o nodo utilizado.

El esquema no crea una tabla IPFS independiente.

### Blockchain

La evidencia blockchain tambien se almacena en `Attachment`:

- `blockchain_status`: estado del anclaje, inicialmente `PENDING`.
- `blockchain_tx_hash`: hash de la transaccion.
- `blockchain_anchored_at`: fecha de confirmacion.
- `blockchain_network`: red utilizada.
- `blockchain_contract_address`: direccion del contrato.
- `blockchain_evidence_id`: identificador de la evidencia en el contrato.

El archivo completo no se modela como contenido on-chain y no existe una tabla blockchain independiente.

## Modelos sin relacion directa

`FeeRule` no tiene una clave foranea hacia `Request`. La regla se selecciona por la combinacion de `request_type` y `zone`, protegida por `@@unique([request_type, zone])`.

## Enumeraciones

- `UserStatus`: `ACTIVE`, `INACTIVE`.
- `RefreshTokenStatus`: `ACTIVE`, `REVOKED`.
- `PropertyZone`: `URBAN`, `RURAL`.
- `RequestType`: `CONSTRUCTION_PERMIT`, `BUILDING_LINE`, `PLAN_APPROVAL`.
- `RequestStatus`: `DRAFT`, `PENDING_SECRETARY`, `OBSERVED`, `PENDING_TECHNICIAN`, `INSPECTION`, `PENDING_PAYMENT`, `PAID`, `APPROVED`, `REJECTED`.

## Archivos relacionados

- Diagrama Mermaid: `docs/database-er-diagram.mmd`.
- Esquema fuente: `prisma/schema.prisma`.
