/**
 * prisma.module.ts — Módulo global de Prisma.
 * Al ser Global, todos los módulos pueden inyectar PrismaService sin importarlo.
 */

import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
