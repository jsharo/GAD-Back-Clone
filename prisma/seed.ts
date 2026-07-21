import { PrismaClient, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Matches Prisma enum ProfessionalStatus */
type ProfessionalStatusValue = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

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
  SECRETARY: ['users.read', 'requests.read', 'requests.review'],
  TECHNICIAN: ['requests.read', 'requests.review'],
  USER: ['requests.read', 'requests.write'],
  CITIZEN: ['requests.read', 'requests.write'],
  FINANCIAL: ['requests.read', 'requests.review'],
};

type DemoUser = {
  role: string;
  email: string;
  password: string;
  name: string;
  lastname: string;
  cedula: string;
  senescytCode?: string;
  professionalStatus?: ProfessionalStatusValue;
};

const DEMO_USERS: DemoUser[] = [
  {
    role: 'ADMINISTRATOR',
    email: 'admin@gadcanar.gob.ec',
    password: 'Admin123*',
    name: 'System',
    lastname: 'Administrator',
    cedula: '0000000000',
  },
  {
    role: 'SECRETARY',
    email: 'secretaria@gadcanar.gob.ec',
    password: 'Demo1234!',
    name: 'Secretaria',
    lastname: 'Demo',
    cedula: '0100000001',
  },
  {
    role: 'TECHNICIAN',
    email: 'tecnico.urbano@gadcanar.gob.ec',
    password: 'Demo1234!',
    name: 'Tecnico',
    lastname: 'Urbano',
    cedula: '0100000002',
  },
  {
    role: 'FINANCIAL',
    email: 'financiero@gadcanar.gob.ec',
    password: 'Demo1234!',
    name: 'Financiero',
    lastname: 'Demo',
    cedula: '0100000003',
  },
  {
    role: 'USER',
    email: 'arquitecto@gadcanar.gob.ec',
    password: 'Demo1234!',
    name: 'Arquitecto',
    lastname: 'Demo',
    cedula: '0100000004',
    senescytCode: '650211A01',
    professionalStatus: 'VERIFIED',
  },
  {
    role: 'CITIZEN',
    email: 'ciudadano@correo.ec',
    password: 'Demo1234!',
    name: 'Ciudadano',
    lastname: 'Demo',
    cedula: '0100000005',
  },
];

async function seedPermissions() {
  console.log('Seeding permissions...');

  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: { description: permission.description },
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
      where: { name: role.name },
      update: { description: role.description },
      create: {
        name: role.name,
        description: role.description,
      },
    });
  }
}

async function seedRolePermissions() {
  console.log('Seeding role permissions...');

  for (const [roleName, permissionNames] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) continue;

    for (const permissionName of permissionNames) {
      const permission = await prisma.permission.findUnique({
        where: { name: permissionName },
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

async function seedDemoUsers() {
  console.log('Seeding demo users...');

  for (const demoUser of DEMO_USERS) {
    const role = await prisma.role.findUnique({
      where: { name: demoUser.role },
    });

    if (!role) {
      throw new Error(`${demoUser.role} role not found`);
    }

    const passwordHash = await bcrypt.hash(demoUser.password, 10);
    const professionalStatus: ProfessionalStatusValue =
      demoUser.professionalStatus ?? 'UNVERIFIED';

    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      update: {
        name: demoUser.name,
        lastname: demoUser.lastname,
        password: passwordHash,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        verificationCode: null,
        verificationExpiry: null,
        senescytCode: demoUser.senescytCode ?? null,
        professionalStatus,
      },
      create: {
        name: demoUser.name,
        lastname: demoUser.lastname,
        email: demoUser.email,
        cedula: demoUser.cedula,
        password: passwordHash,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        senescytCode: demoUser.senescytCode ?? null,
        professionalStatus,
      },
    });

    await prisma.userRole.upsert({
      where: { userId: user.id },
      update: { roleId: role.id },
      create: {
        userId: user.id,
        roleId: role.id,
      },
    });

    const existingAssignment = await prisma.roleAssignment.findFirst({
      where: {
        userId: user.id,
        roleId: role.id,
      },
    });

    if (!existingAssignment) {
      await prisma.roleAssignment.create({
        data: {
          userId: user.id,
          roleId: role.id,
          assignedById: user.id,
        },
      });
    }
  }
}

async function main() {
  await seedPermissions();
  await seedRoles();
  await seedRolePermissions();
  await seedDemoUsers();
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
