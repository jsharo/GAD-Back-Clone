import { PrismaClient, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PERMISSIONS = [
  { name: 'users.read', description: 'View users' },
  { name: 'users.write', description: 'Create and update users' },

  { name: 'requests.read', description: 'View requests' },
  { name: 'requests.write', description: 'Create and update requests' },
  { name: 'requests.review', description: 'Review requests' },

  { name: 'audit.read', description: 'View audit logs' },
];

const ROLES = [
  { name: 'ADMINISTRATOR', description: 'System administrator' },
  { name: 'SECRETARY', description: 'Secretary user' },
  { name: 'TECHNICIAN', description: 'Technical reviewer' },
  { name: 'USER', description: 'Licensed professional (architect/engineer)' },
  { name: 'CITIZEN', description: 'Citizen / property owner' },
  { name: 'FINANCIAL', description: 'Financial officer' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMINISTRATOR: [
    'users.read',
    'users.write',
    'requests.read',
    'requests.write',
    'requests.review',
    'audit.read',
  ],

  SECRETARY: [
    'users.read',
    'requests.read',
    'requests.review',
  ],

  TECHNICIAN: [
    'requests.read',
    'requests.review',
  ],

  USER: ['requests.read', 'requests.write'],

  CITIZEN: ['requests.read', 'requests.write'],
  FINANCIAL: ['requests.read', 'requests.review'],
};

async function seedPermissions() {
  console.log('Seeding permissions...');

  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: {
        name: permission.name,
      },
      update: {
        description: permission.description,
      },
      create: {
        name: permission.name,
        description: permission.description,
      },
    });
  }
}

async function seedRoles() {
  console.log('Seeding roles...');

  for (const role of ROLES) {
    await prisma.role.upsert({
      where: {
        name: role.name,
      },
      update: {
        description: role.description,
      },
      create: {
        name: role.name,
        description: role.description,
      },
    });
  }
}

async function seedRolePermissions() {
  console.log('Seeding role permissions...');

  for (const [roleName, permissionNames] of Object.entries(
    ROLE_PERMISSIONS,
  )) {
    const role = await prisma.role.findUnique({
      where: {
        name: roleName,
      },
    });

    if (!role) continue;

    for (const permissionName of permissionNames) {
      const permission = await prisma.permission.findUnique({
        where: {
          name: permissionName,
        },
      });

      if (!permission) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }
}

async function seedAdminUser() {
  console.log('Seeding administrator user...');

  const adminRole = await prisma.role.findUnique({
    where: {
      name: 'ADMINISTRATOR',
    },
  });

  if (!adminRole) {
    throw new Error('ADMINISTRATOR role not found');
  }

  const passwordHash = await bcrypt.hash('Admin123*', 10);

  const adminUser = await prisma.user.upsert({
    where: {
      email: 'admin@gadcanar.gob.ec',
    },
    update: {},
    create: {
      name: 'System',
      lastname: 'Administrator',
      email: 'admin@gadcanar.gob.ec',
      cedula: '0000000000',
      password: passwordHash,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId: adminUser.id,
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  const existingAssignment = await prisma.roleAssignment.findFirst({
    where: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  if (!existingAssignment) {
    await prisma.roleAssignment.create({
      data: {
        userId: adminUser.id,
        roleId: adminRole.id,
        assignedById: adminUser.id,
      },
    });
  }
}

async function main() {
  await seedPermissions();

  await seedRoles();

  await seedRolePermissions();

  await seedAdminUser();

  console.log('Seed completed successfully');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });