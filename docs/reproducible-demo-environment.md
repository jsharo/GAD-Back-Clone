# Ambiente reproducible de demostracion - Backend GAD Canar

## Objetivo

Preparar y detener de forma controlada el entorno local para demostrar solicitudes, adjuntos, SHA-256, IPFS local, blockchain Hardhat, auditoria y trazabilidad. Esta guia es para desarrollo local, no para produccion.

## Arquitectura local

El backend usa PostgreSQL local, Kubo/IPFS, una red Hardhat con `chainId` 31337 y el contrato `DocumentEvidenceRegistry`. Los scripts mantienen su estado y logs fuera del repositorio, en `%TEMP%\gad-canar-demo`.

## Requisitos

- Node.js, npm y dependencias ya instaladas con el lockfile del proyecto.
- PostgreSQL local disponible y un archivo `.env` local valido. No copiar ni subir ese archivo.
- Kubo disponible mediante `ipfs` en PATH, `-IpfsPath`, o como fallback en `C:\Tools\kubo\kubo\ipfs.exe`.
- Hardhat y el contrato incluidos en este repositorio.

## Puertos

| Servicio | Puerto |
| --- | --- |
| Backend y Swagger | 3000 |
| Kubo API | 5001 |
| Gateway IPFS | 8080 |
| Hardhat local | 8545 |
| PostgreSQL local | 5432 o el configurado localmente |

## Preparacion inicial

Actualice su rama, instale dependencias segun el lockfile cuando corresponda y confirme que `.env` existe localmente. Los scripts no modifican `.env`, Prisma schema, migraciones, contratos ni frontend.

## Variables requeridas

El `.env` local debe tener los nombres de configuracion del backend para base de datos y JWT. Durante `demo:start`, IPFS y blockchain se habilitan solo como variables de proceso del backend. La clave de desarrollo de Hardhat se obtiene en memoria y nunca se guarda en `state.json` ni en la documentacion.

## Preflight

```powershell
npm.cmd run demo:preflight
```

Comprueba herramientas, `.env` por nombre de variables, PostgreSQL, migraciones, Kubo, Hardhat, contrato, puertos, build y pruebas criticas. Use `-IpfsPath` al ejecutar directamente el script si Kubo no esta en PATH.

## Inicio del entorno

```powershell
npm.cmd run demo:start
```

El inicio ejecuta seed demo, build, inicia solo los procesos que no estaban activos, despliega `DocumentEvidenceRegistry`, inicia el backend con configuracion temporal y espera Swagger. No inicia un segundo servicio si Kubo, Hardhat o el backend ya responden; tampoco detiene procesos preexistentes.

## Verificacion

```powershell
npm.cmd run demo:check
```

Comprueba PostgreSQL, backend, Swagger, IPFS API y gateway, Hardhat, contrato desplegado, pruebas criticas y limpieza de Git. Puede omitir la repeticion de pruebas criticas al invocar `scripts/demo/check-demo.ps1 -SkipCriticalTests` directamente.

## Flujo minimo para la demostracion

1. Ejecute preflight, start y check.
2. Abra `http://localhost:3000/api/docs`.
3. Inicie sesion con una cuenta institucional preparada localmente. Las credenciales no se incluyen en esta guia.
4. Consulte solicitudes y use un PDF sintetico no sensible.
5. Cargue el adjunto, verifique SHA-256, envie a IPFS y ancle en blockchain.
6. Consulte trazabilidad y `GET /api/v1/audit/verify`.
7. No elimine un adjunto ya anclado si eso rompe la evidencia local.

## Detencion segura

```powershell
npm.cmd run demo:stop
```

Detiene solo PIDs guardados por `demo:start`, nunca PostgreSQL ni procesos detectados solo por puerto. El estado se elimina. Los logs en TEMP se conservan por defecto; use `scripts/demo/stop-demo.ps1 -CleanLogs` para eliminarlos.

## Logs

Los logs se mantienen fuera del repositorio. Las lineas de claves privadas de desarrollo de Hardhat se redactan antes de conservar el log. No copie logs que puedan contener datos operativos a Git.

## Solucion de problemas

- **Kubo no encontrado:** agregue `ipfs` al PATH o use `-IpfsPath` con la ruta del ejecutable.
- **Kubo no inicializado:** inicialice su repositorio Kubo manualmente antes de usar la demo.
- **Puerto ocupado:** el script no mata el proceso. Libere el puerto o use el servicio local compatible ya activo.
- **Hardhat ya activo:** debe ser `chainId` 31337. Para iniciar un backend nuevo contra esa red, proporcione la clave local solo en la terminal actual; no la guarde.
- **Swagger no responde:** revise los logs en `%TEMP%\gad-canar-demo\logs` y ejecute `demo:stop` antes de reintentar.

## Seguridad

Use solo archivos sinteticos, no documentos ciudadanos. No suba `.env`, estados, logs, tokens, contrasenas, claves privadas ni respaldos. No use redes publicas, mainnet o proveedores IPFS publicos para esta demostracion.

## Que no automatiza

No controla PostgreSQL, frontend, correos reales, navegadores, cuentas externas, redes publicas ni el flujo funcional completo. La limpieza de evidencia blockchain se decide manualmente porque una transaccion local puede seguir referenciando un adjunto.

## Inicio opcional del frontend

El equipo frontend debe usar [el contrato API](frontend-api-contract.md), configurar la base URL local `http://localhost:3000/api/v1`, enviar `credentials: include` e iniciar su repositorio segun su propio README. El frontend no forma parte de `demo:start`.

## Checklist previo a exponer

- [ ] `demo:preflight`, `demo:start` y `demo:check` terminaron correctamente.
- [ ] Swagger responde y se usa un archivo sintetico.
- [ ] No hay secretos en pantalla, terminal o materiales de la demostracion.

## Checklist posterior a exponer

- [ ] Ejecutar `npm.cmd run demo:stop`.
- [ ] Confirmar que PostgreSQL sigue disponible y los procesos iniciados por la demo ya no estan activos.
- [ ] Conservar o eliminar logs locales segun la necesidad del equipo.
