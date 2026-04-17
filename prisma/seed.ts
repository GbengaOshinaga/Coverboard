import {
  PrismaClient,
  Role,
  MemberType,
  LeaveStatus,
  EmploymentType,
  LeaveCategory,
  BankHolidayRegion,
  DataResidency,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clean existing data
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveCarryOverBalance.deleteMany();
  await prisma.userWeeklyHours.deleteMany();
  await prisma.bankHoliday.deleteMany();
  await prisma.jiraUserMapping.deleteMany();
  await prisma.jiraIntegration.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.leavePolicy.deleteMany();
  await prisma.publicHoliday.deleteMany();
  await prisma.user.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.organization.deleteMany();

  // Create organization
  const org = await prisma.organization.create({
    data: {
      name: "Acme Global",
      slug: "acme-global",
      onboardingCompleted: true,
    },
  });

  // Hash password for demo users
  const passwordHash = await bcrypt.hash("password123", 10);

  // Create users across 3 countries
  const [ade, wanjiku, chidi, fatima, pedro, amina] = await Promise.all([
    prisma.user.create({
      data: {
        email: "ade@acme.com",
        name: "Ade Okonkwo",
        passwordHash,
        role: Role.ADMIN,
        memberType: MemberType.EMPLOYEE,
        countryCode: "NG",
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "wanjiku@acme.com",
        name: "Wanjiku Maina",
        passwordHash,
        role: Role.MANAGER,
        memberType: MemberType.EMPLOYEE,
        countryCode: "KE",
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "chidi@acme.com",
        name: "Chidi Eze",
        passwordHash,
        role: Role.MEMBER,
        memberType: MemberType.EMPLOYEE,
        countryCode: "NG",
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "fatima@acme.com",
        name: "Fatima Bello",
        passwordHash,
        role: Role.MEMBER,
        memberType: MemberType.CONTRACTOR,
        countryCode: "NG",
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "pedro@acme.com",
        name: "Pedro Silva",
        passwordHash,
        role: Role.MEMBER,
        memberType: MemberType.FREELANCER,
        countryCode: "BR",
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "amina@acme.com",
        name: "Amina Osei",
        passwordHash,
        role: Role.MEMBER,
        memberType: MemberType.EMPLOYEE,
        countryCode: "KE",
        organizationId: org.id,
      },
    }),
  ]);

  // Create leave types
  const [annual, sick, parental, compassionate] = await Promise.all([
    prisma.leaveType.create({
      data: {
        name: "Annual Leave",
        color: "#3b82f6",
        isPaid: true,
        defaultDays: 20,
        organizationId: org.id,
      },
    }),
    prisma.leaveType.create({
      data: {
        name: "Sick Leave",
        color: "#ef4444",
        isPaid: true,
        defaultDays: 10,
        organizationId: org.id,
      },
    }),
    prisma.leaveType.create({
      data: {
        name: "Parental Leave",
        color: "#8b5cf6",
        isPaid: true,
        defaultDays: 90,
        organizationId: org.id,
      },
    }),
    prisma.leaveType.create({
      data: {
        name: "Compassionate Leave",
        color: "#f59e0b",
        isPaid: true,
        defaultDays: 5,
        organizationId: org.id,
      },
    }),
  ]);

  // Create leave policies per country
  await Promise.all([
    // Nigeria
    prisma.leavePolicy.create({ data: { countryCode: "NG", annualAllowance: 20, carryOverMax: 5, leaveTypeId: annual.id } }),
    prisma.leavePolicy.create({ data: { countryCode: "NG", annualAllowance: 10, carryOverMax: 0, leaveTypeId: sick.id } }),
    // Kenya
    prisma.leavePolicy.create({ data: { countryCode: "KE", annualAllowance: 21, carryOverMax: 5, leaveTypeId: annual.id } }),
    prisma.leavePolicy.create({ data: { countryCode: "KE", annualAllowance: 14, carryOverMax: 0, leaveTypeId: sick.id } }),
    // Brazil
    prisma.leavePolicy.create({ data: { countryCode: "BR", annualAllowance: 30, carryOverMax: 10, leaveTypeId: annual.id } }),
    prisma.leavePolicy.create({ data: { countryCode: "BR", annualAllowance: 15, carryOverMax: 0, leaveTypeId: sick.id } }),
  ]);

  // Create sample leave requests
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  await Promise.all([
    // Chidi is out today (annual leave)
    prisma.leaveRequest.create({
      data: {
        startDate: new Date(year, month, now.getDate() - 1),
        endDate: new Date(year, month, now.getDate() + 2),
        status: LeaveStatus.APPROVED,
        note: "Family vacation",
        userId: chidi.id,
        leaveTypeId: annual.id,
        reviewedById: wanjiku.id,
        reviewedAt: new Date(year, month, now.getDate() - 3),
      },
    }),
    // Fatima is out today (sick)
    prisma.leaveRequest.create({
      data: {
        startDate: new Date(year, month, now.getDate()),
        endDate: new Date(year, month, now.getDate()),
        status: LeaveStatus.APPROVED,
        note: "Not feeling well",
        userId: fatima.id,
        leaveTypeId: sick.id,
        reviewedById: ade.id,
        reviewedAt: new Date(year, month, now.getDate()),
      },
    }),
    // Pedro has upcoming leave next week
    prisma.leaveRequest.create({
      data: {
        startDate: new Date(year, month, now.getDate() + 5),
        endDate: new Date(year, month, now.getDate() + 9),
        status: LeaveStatus.APPROVED,
        note: "Carnival",
        userId: pedro.id,
        leaveTypeId: annual.id,
        reviewedById: wanjiku.id,
        reviewedAt: new Date(year, month, now.getDate() - 7),
      },
    }),
    // Amina has a pending request
    prisma.leaveRequest.create({
      data: {
        startDate: new Date(year, month, now.getDate() + 10),
        endDate: new Date(year, month, now.getDate() + 12),
        status: LeaveStatus.PENDING,
        note: "Wedding",
        userId: amina.id,
        leaveTypeId: compassionate.id,
      },
    }),
  ]);

  // Public holidays - Nigeria 2026
  const ngHolidays = [
    { name: "New Year's Day", date: new Date(2026, 0, 1) },
    { name: "Workers' Day", date: new Date(2026, 4, 1) },
    { name: "Democracy Day", date: new Date(2026, 5, 12) },
    { name: "Independence Day", date: new Date(2026, 9, 1) },
    { name: "Christmas Day", date: new Date(2026, 11, 25) },
    { name: "Boxing Day", date: new Date(2026, 11, 26) },
  ];

  // Public holidays - Kenya 2026
  const keHolidays = [
    { name: "New Year's Day", date: new Date(2026, 0, 1) },
    { name: "Labour Day", date: new Date(2026, 4, 1) },
    { name: "Madaraka Day", date: new Date(2026, 5, 1) },
    { name: "Mashujaa Day", date: new Date(2026, 9, 20) },
    { name: "Jamhuri Day", date: new Date(2026, 11, 12) },
    { name: "Christmas Day", date: new Date(2026, 11, 25) },
  ];

  // Public holidays - Brazil 2026
  const brHolidays = [
    { name: "New Year's Day", date: new Date(2026, 0, 1) },
    { name: "Carnival", date: new Date(2026, 1, 16) },
    { name: "Carnival", date: new Date(2026, 1, 17) },
    { name: "Tiradentes Day", date: new Date(2026, 3, 21) },
    { name: "Labour Day", date: new Date(2026, 4, 1) },
    { name: "Independence Day", date: new Date(2026, 8, 7) },
    { name: "Christmas Day", date: new Date(2026, 11, 25) },
  ];

  // South Africa 2026
  const zaHolidays = [
    { name: "New Year's Day", date: new Date(2026, 0, 1) },
    { name: "Human Rights Day", date: new Date(2026, 2, 21) },
    { name: "Freedom Day", date: new Date(2026, 3, 27) },
    { name: "Workers' Day", date: new Date(2026, 4, 1) },
    { name: "Youth Day", date: new Date(2026, 5, 16) },
    { name: "Heritage Day", date: new Date(2026, 8, 24) },
    { name: "Day of Reconciliation", date: new Date(2026, 11, 16) },
    { name: "Christmas Day", date: new Date(2026, 11, 25) },
  ];

  const allHolidays = [
    ...ngHolidays.map((h) => ({ ...h, countryCode: "NG" })),
    ...keHolidays.map((h) => ({ ...h, countryCode: "KE" })),
    ...brHolidays.map((h) => ({ ...h, countryCode: "BR" })),
    ...zaHolidays.map((h) => ({ ...h, countryCode: "ZA" })),
  ];

  await Promise.all(
    allHolidays.map((h) =>
      prisma.publicHoliday.create({
        data: {
          name: h.name,
          date: h.date,
          countryCode: h.countryCode,
          organizationId: org.id,
        },
      })
    )
  );

  // ----------------------------
  // UK demo organization
  // ----------------------------
  const ukOrg = await prisma.organization.create({
    data: {
      name: "Britannia Health Ltd",
      slug: "britannia-health",
      onboardingCompleted: true,
      ukBankHolidayInclusive: false,
      ukBankHolidayRegion: BankHolidayRegion.ENGLAND_WALES,
      ukCarryOverEnabled: true,
      ukCarryOverMax: 8,
      ukCarryOverExpiryMonth: 3,
      ukCarryOverExpiryDay: 31,
      dataResidency: DataResidency.UK,
      maxAdminUsers: 2,
      plan: "SCALE",
    },
  });

  const [olivia, james, sophie, liam, emma] = await Promise.all([
    prisma.user.create({
      data: {
        email: "olivia@britanniahealth.co.uk",
        name: "Olivia Clarke",
        passwordHash,
        role: Role.ADMIN,
        memberType: MemberType.EMPLOYEE,
        employmentType: EmploymentType.FULL_TIME,
        daysWorkedPerWeek: 5,
        fteRatio: 1,
        rightToWorkVerified: true,
        department: "Operations",
        countryCode: "GB",
        organizationId: ukOrg.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "james@britanniahealth.co.uk",
        name: "James Patel",
        passwordHash,
        role: Role.MANAGER,
        memberType: MemberType.EMPLOYEE,
        employmentType: EmploymentType.FULL_TIME,
        daysWorkedPerWeek: 5,
        fteRatio: 1,
        rightToWorkVerified: true,
        department: "Engineering",
        countryCode: "GB",
        organizationId: ukOrg.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "sophie@britanniahealth.co.uk",
        name: "Sophie Williams",
        passwordHash,
        role: Role.MEMBER,
        memberType: MemberType.EMPLOYEE,
        employmentType: EmploymentType.PART_TIME,
        daysWorkedPerWeek: 3,
        fteRatio: 0.6,
        rightToWorkVerified: true,
        department: "People",
        countryCode: "GB",
        organizationId: ukOrg.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "liam@britanniahealth.co.uk",
        name: "Liam O'Connor",
        passwordHash,
        role: Role.MEMBER,
        memberType: MemberType.EMPLOYEE,
        employmentType: EmploymentType.VARIABLE_HOURS,
        daysWorkedPerWeek: 4,
        fteRatio: 0.8,
        rightToWorkVerified: false,
        department: "Support",
        countryCode: "GB",
        organizationId: ukOrg.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "emma@britanniahealth.co.uk",
        name: "Emma Hughes",
        passwordHash,
        role: Role.MEMBER,
        memberType: MemberType.EMPLOYEE,
        employmentType: EmploymentType.FULL_TIME,
        daysWorkedPerWeek: 5,
        fteRatio: 1,
        rightToWorkVerified: null,
        department: "Finance",
        countryCode: "GB",
        organizationId: ukOrg.id,
      },
    }),
  ]);

  // Variable-hours history (rolling 52-week calculations)
  await Promise.all(
    Array.from({ length: 12 }).map((_, index) =>
      prisma.userWeeklyHours.create({
        data: {
          userId: liam.id,
          weekStartDate: new Date(2026, 0, 5 + index * 7),
          hoursWorked: 28 + (index % 4),
        },
      })
    )
  );

  const ukLeaveTypes = await Promise.all([
    prisma.leaveType.create({
      data: {
        name: "Annual Leave",
        color: "#3b82f6",
        isPaid: true,
        category: LeaveCategory.STATUTORY,
        defaultDays: 28,
        requiresEvidence: false,
        minNoticeDays: 0,
        durationLogic:
          "28 days minimum; company setting controls bank holiday inclusive/exclusive mode",
        countryCode: "GB",
        organizationId: ukOrg.id,
      },
    }),
    prisma.leaveType.create({
      data: {
        name: "Statutory Sick Pay (SSP)",
        color: "#ef4444",
        isPaid: true,
        category: LeaveCategory.STATUTORY,
        defaultDays: 0,
        requiresEvidence: true,
        minNoticeDays: 0,
        durationLogic:
          "Payable after 3 waiting days from day 4 of a period of incapacity",
        countryCode: "GB",
        organizationId: ukOrg.id,
      },
    }),
    prisma.leaveType.create({
      data: {
        name: "Statutory Maternity Leave",
        color: "#8b5cf6",
        isPaid: true,
        category: LeaveCategory.STATUTORY,
        defaultDays: 365,
        requiresEvidence: true,
        minNoticeDays: 28,
        durationLogic: "52 weeks total; SMP logic in UK rules utility",
        countryCode: "GB",
        organizationId: ukOrg.id,
      },
    }),
    prisma.leaveType.create({
      data: {
        name: "Statutory Paternity Leave",
        color: "#06b6d4",
        isPaid: true,
        category: LeaveCategory.STATUTORY,
        defaultDays: 14,
        requiresEvidence: true,
        minNoticeDays: 15,
        durationLogic:
          "1 or 2 consecutive weeks within 56 days of birth/adoption",
        countryCode: "GB",
        organizationId: ukOrg.id,
      },
    }),
    prisma.leaveType.create({
      data: {
        name: "Shared Parental Leave (SPL)",
        color: "#7c3aed",
        isPaid: true,
        category: LeaveCategory.STATUTORY,
        defaultDays: 350,
        requiresEvidence: true,
        minNoticeDays: 56,
        durationLogic: "Up to 50 weeks shareable after curtailment",
        countryCode: "GB",
        organizationId: ukOrg.id,
      },
    }),
    prisma.leaveType.create({
      data: {
        name: "Adoption Leave",
        color: "#14b8a6",
        isPaid: true,
        category: LeaveCategory.STATUTORY,
        defaultDays: 365,
        requiresEvidence: true,
        minNoticeDays: 28,
        durationLogic: "Mirrors maternity entitlement",
        countryCode: "GB",
        organizationId: ukOrg.id,
      },
    }),
    prisma.leaveType.create({
      data: {
        name: "Parental Bereavement Leave",
        color: "#f59e0b",
        isPaid: true,
        category: LeaveCategory.STATUTORY,
        defaultDays: 14,
        requiresEvidence: true,
        minNoticeDays: 0,
        durationLogic: "2 weeks for eligible child loss/stillbirth criteria",
        countryCode: "GB",
        organizationId: ukOrg.id,
      },
    }),
    prisma.leaveType.create({
      data: {
        name: "Unpaid Parental Leave",
        color: "#6b7280",
        isPaid: false,
        category: LeaveCategory.UNPAID,
        defaultDays: 18,
        requiresEvidence: false,
        minNoticeDays: 21,
        durationLogic: "18 weeks per child, max 4 weeks per year",
        countryCode: "GB",
        organizationId: ukOrg.id,
      },
    }),
  ]);

  await Promise.all(
    ukLeaveTypes.map((lt) =>
      prisma.leavePolicy.create({
        data: {
          countryCode: "GB",
          annualAllowance: lt.defaultDays,
          carryOverMax: lt.name === "Annual Leave" ? 8 : 0,
          leaveTypeId: lt.id,
        },
      })
    )
  );

  const ukAnnual = ukLeaveTypes.find((lt) => lt.name === "Annual Leave")!;
  const ukSsp = ukLeaveTypes.find((lt) => lt.name === "Statutory Sick Pay (SSP)")!;
  const ukSpl = ukLeaveTypes.find((lt) => lt.name === "Shared Parental Leave (SPL)")!;

  await Promise.all([
    prisma.leaveRequest.create({
      data: {
        startDate: new Date(2026, 6, 14),
        endDate: new Date(2026, 6, 18),
        status: LeaveStatus.APPROVED,
        note: "Summer holiday",
        userId: sophie.id,
        leaveTypeId: ukAnnual.id,
        reviewedById: james.id,
        reviewedAt: new Date(2026, 5, 20),
      },
    }),
    prisma.leaveRequest.create({
      data: {
        startDate: new Date(2026, 8, 7),
        endDate: new Date(2026, 8, 11),
        status: LeaveStatus.APPROVED,
        note: "Flu recovery",
        userId: liam.id,
        leaveTypeId: ukSsp.id,
        evidenceProvided: true,
        reviewedById: olivia.id,
        reviewedAt: new Date(2026, 8, 6),
      },
    }),
    prisma.leaveRequest.create({
      data: {
        startDate: new Date(2026, 10, 2),
        endDate: new Date(2026, 10, 13),
        status: LeaveStatus.PENDING,
        note: "Family care period",
        userId: emma.id,
        leaveTypeId: ukSpl.id,
        kitDaysUsed: 3,
      },
    }),
  ]);

  await prisma.leaveCarryOverBalance.create({
    data: {
      userId: sophie.id,
      leaveTypeId: ukAnnual.id,
      leaveYear: 2026,
      daysCarried: 4,
      daysRemaining: 2,
      expiresAt: new Date(2027, 2, 31),
    },
  });

  const ukBankHolidaysByRegion: Record<
    BankHolidayRegion,
    { name: string; date: Date }[]
  > = {
    ENGLAND_WALES: [
      { name: "New Year's Day", date: new Date(2026, 0, 1) },
      { name: "Good Friday", date: new Date(2026, 3, 3) },
      { name: "Easter Monday", date: new Date(2026, 3, 6) },
      { name: "Early May bank holiday", date: new Date(2026, 4, 4) },
      { name: "Spring bank holiday", date: new Date(2026, 4, 25) },
      { name: "Summer bank holiday", date: new Date(2026, 7, 31) },
      { name: "Christmas Day", date: new Date(2026, 11, 25) },
      { name: "Boxing Day (substitute)", date: new Date(2026, 11, 28) },
    ],
    SCOTLAND: [
      { name: "New Year's Day", date: new Date(2026, 0, 1) },
      { name: "2nd January", date: new Date(2026, 0, 2) },
      { name: "Good Friday", date: new Date(2026, 3, 3) },
      { name: "Early May bank holiday", date: new Date(2026, 4, 4) },
      { name: "Spring bank holiday", date: new Date(2026, 4, 25) },
      { name: "Summer bank holiday", date: new Date(2026, 7, 3) },
      { name: "St Andrew's Day", date: new Date(2026, 10, 30) },
      { name: "Christmas Day", date: new Date(2026, 11, 25) },
      { name: "Boxing Day (substitute)", date: new Date(2026, 11, 28) },
    ],
    NORTHERN_IRELAND: [
      { name: "New Year's Day", date: new Date(2026, 0, 1) },
      { name: "St Patrick's Day", date: new Date(2026, 2, 17) },
      { name: "Good Friday", date: new Date(2026, 3, 3) },
      { name: "Easter Monday", date: new Date(2026, 3, 6) },
      { name: "Early May bank holiday", date: new Date(2026, 4, 4) },
      { name: "Spring bank holiday", date: new Date(2026, 4, 25) },
      {
        name: "Battle of the Boyne (Orangemen's Day) (substitute)",
        date: new Date(2026, 6, 13),
      },
      { name: "Summer bank holiday", date: new Date(2026, 7, 31) },
      { name: "Christmas Day", date: new Date(2026, 11, 25) },
      { name: "Boxing Day (substitute)", date: new Date(2026, 11, 28) },
    ],
  };

  await Promise.all(
    Object.entries(ukBankHolidaysByRegion).flatMap(([region, holidays]) =>
      holidays.map((holiday) =>
        prisma.bankHoliday.create({
          data: {
            name: holiday.name,
            date: holiday.date,
            region: region as BankHolidayRegion,
            countryCode: "GB",
            organizationId: ukOrg.id,
          },
        })
      )
    )
  );

  console.log("Seeding complete!");
  console.log(`  Organizations: ${org.name}, ${ukOrg.name}`);
  console.log(`  Global users: 6 (across NG, KE, BR)`);
  console.log(`  UK users: 5 (all GB)`);
  console.log(`  Global leave types: 4`);
  console.log(`  UK leave types: ${ukLeaveTypes.length}`);
  console.log(`  Global leave policies: 6`);
  console.log(`  UK leave policies: ${ukLeaveTypes.length}`);
  console.log(`  Global leave requests: 4`);
  console.log(`  UK leave requests: 3`);
  console.log(`  Global public holidays: ${allHolidays.length}`);
  console.log(
    `  UK bank holidays: ${
      ukBankHolidaysByRegion.ENGLAND_WALES.length +
      ukBankHolidaysByRegion.SCOTLAND.length +
      ukBankHolidaysByRegion.NORTHERN_IRELAND.length
    }`
  );
  console.log("");
  console.log("Demo login: ade@acme.com / password123 (admin)");
  console.log("UK demo login: olivia@britanniahealth.co.uk / password123 (admin)");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
