# Politica de nomenclatura

## Objetivo

Esta politica establece nombres consistentes para el codigo del sistema GAD Canar. Busca facilitar la lectura, el mantenimiento y la integracion entre backend, frontend, base de datos y contratos, sin romper contratos publicos ni datos existentes.

## Reglas solicitadas

| Elemento | Regla | Ejemplo |
| --- | --- | --- |
| Elementos tecnicos | Ingles | `request`, `attachment`, `user` |
| Clases | PascalCase | `AuthService`, `DocumentPanel` |
| Funciones y metodos | camelCase | `validateCredentials()`, `verifyAttachmentIntegrity()` |
| Variables solicitadas | snake_case | `user_id`, `request_id`, `ipfs_cid` |
| Clases e ids HTML/CSS | kebab-case | `login-form`, `document-panel` |
| Carpetas | kebab-case | `request-history`, `document-panel` |
| Archivos | Segmentos separados por punto | `user.service.ts`, `auth.controller.ts` |

## Aplicacion real en el proyecto

### Backend NestJS

- Los controladores, servicios, modulos, guards, strategies y DTOs usan nombres tecnicos en ingles.
- Las clases NestJS se mantienen en PascalCase.
- Las funciones y metodos TypeScript se mantienen en camelCase.
- Los archivos siguen el patron por responsabilidad, por ejemplo `request.service.ts` y `audit.controller.ts`.
- Los endpoints nuevos deben usar recursos en ingles, por ejemplo `/requests` y `/attachments`.

### Frontend React

- Los componentes React usan PascalCase.
- Hooks, funciones y handlers usan camelCase.
- Los ids y clases CSS propias usan kebab-case.
- Los archivos existentes usan segmentos por punto cuando expresan responsabilidad o pantalla, por ejemplo `admin.applications.tsx`.
- Los textos visibles pueden permanecer en espanol porque forman parte de la experiencia del usuario.

### Prisma y PostgreSQL

- Los modelos Prisma usan PascalCase.
- El codigo puede usar campos camelCase cuando Prisma los mapea con `@map` hacia columnas snake_case.
- Los campos, DTOs y contratos persistidos existentes no deben renombrarse solo por estilo; requieren migracion y validacion de compatibilidad.

### Solidity

- Los contratos pueden usar PascalCase, por ejemplo `DocumentEvidenceRegistry`.
- Funciones y variables del contrato siguen las convenciones de Solidity y deben conservar compatibilidad con su ABI.

## Excepciones justificadas

1. TypeScript conserva camelCase en variables y parametros. Cambiar todo a snake_case contradice la convencion del ecosistema y produciria un refactor de alto riesgo.
2. React usa PascalCase para componentes para distinguirlos de elementos HTML.
3. Decoradores NestJS como `Roles` y `CurrentUser` pueden mantenerse en PascalCase.
4. Prisma puede mantener propiedades camelCase con `@map` hacia columnas snake_case.
5. Los textos visibles al usuario pueden estar en espanol.
6. Solidity puede usar PascalCase cuando el nombre corresponde a un contrato.
7. Nombres heredados que formen parte de rutas, payloads, DTOs o datos persistidos se corrigen solo mediante una tarea de compatibilidad dedicada.

## Tabla de cumplimiento

| Area | Convencion objetivo | Estado actual | Accion |
| --- | --- | --- | --- |
| Clases backend | PascalCase | Cumple en general | Mantener |
| Funciones backend | camelCase | Cumple en general | Mantener |
| Archivos backend | Segmentos por punto | Cumple en modulos principales | Revisar archivos nuevos |
| Componentes React | PascalCase | Cumple en general | Traducir nombres tecnicos locales cuando sea seguro |
| Variables TypeScript | camelCase por convencion | Convencion real del proyecto | Documentar excepcion |
| HTML/CSS propio | kebab-case | Cumplimiento parcial | Corregir ids y clases locales de bajo riesgo |
| Endpoints activos | Ingles | Conviven rutas actuales y legacy | Migrar con pruebas de contrato |
| Prisma/PostgreSQL | Mapeo explicito | Conviven camelCase y snake_case | No cambiar sin migracion |
| Textos de interfaz | Espanol permitido | Cumple | Mantener |

## Recomendaciones futuras

1. Aplicar esta politica a todo archivo nuevo durante la revision de codigo.
2. Crear una tarea separada para retirar rutas legacy en espanol, con pruebas backend-frontend por cada flujo.
3. Evitar renombrar DTOs, campos Prisma o propiedades de respuestas sin una estrategia de compatibilidad.
4. Revisar ids y clases CSS propias de forma incremental.
5. Preferir nombres tecnicos en ingles y textos de interfaz en espanol.
6. Registrar excepciones nuevas en este documento antes de introducir convenciones alternativas.
