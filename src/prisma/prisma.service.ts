/**
 * prisma.service.ts — Servicio que expone el cliente de Prisma.
 * Se conecta a la base de datos al iniciar y desconecta al cerrar la app.
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
