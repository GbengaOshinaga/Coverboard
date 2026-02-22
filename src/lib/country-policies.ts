/**
 * Statutory leave rules and public holidays by country.
 * Sources: National labour acts / employment legislation for each country.
 */

export type CountryLeaveRule = {
  leaveType: string;
  color: string;
  isPaid: boolean;
  annualAllowance: number;
  carryOverMax: number;
  note: string;
};

export type CountryHoliday = {
  name: string;
  month: number;
  day: number;
};

export type CountryPolicy = {
  code: string;
  name: string;
  flag: string;
  leaveRules: CountryLeaveRule[];
  holidays: CountryHoliday[];
};

export const COUNTRY_POLICIES: CountryPolicy[] = [
  {
    code: "NG",
    name: "Nigeria",
    flag: "🇳🇬",
    leaveRules: [
      { leaveType: "Annual Leave", color: "#3b82f6", isPaid: true, annualAllowance: 20, carryOverMax: 5, note: "Labour Act: minimum 6 days; market standard 15-20 days" },
      { leaveType: "Sick Leave", color: "#ef4444", isPaid: true, annualAllowance: 12, carryOverMax: 0, note: "Up to 12 days with medical certificate" },
      { leaveType: "Maternity Leave", color: "#8b5cf6", isPaid: true, annualAllowance: 84, carryOverMax: 0, note: "Labour Act: 12 weeks (84 days) at 50% pay" },
      { leaveType: "Compassionate Leave", color: "#f59e0b", isPaid: true, annualAllowance: 5, carryOverMax: 0, note: "Bereavement/family emergency" },
    ],
    holidays: [
      { name: "New Year's Day", month: 0, day: 1 },
      { name: "Workers' Day", month: 4, day: 1 },
      { name: "Democracy Day", month: 5, day: 12 },
      { name: "Independence Day", month: 9, day: 1 },
      { name: "Christmas Day", month: 11, day: 25 },
      { name: "Boxing Day", month: 11, day: 26 },
    ],
  },
  {
    code: "KE",
    name: "Kenya",
    flag: "🇰🇪",
    leaveRules: [
      { leaveType: "Annual Leave", color: "#3b82f6", isPaid: true, annualAllowance: 21, carryOverMax: 5, note: "Employment Act 2007: 21 working days" },
      { leaveType: "Sick Leave", color: "#ef4444", isPaid: true, annualAllowance: 14, carryOverMax: 0, note: "Employment Act: 7 days full pay + 7 days half pay" },
      { leaveType: "Maternity Leave", color: "#8b5cf6", isPaid: true, annualAllowance: 90, carryOverMax: 0, note: "Employment Act: 3 months" },
      { leaveType: "Paternity Leave", color: "#06b6d4", isPaid: true, annualAllowance: 14, carryOverMax: 0, note: "Employment Act: 2 weeks" },
      { leaveType: "Compassionate Leave", color: "#f59e0b", isPaid: true, annualAllowance: 7, carryOverMax: 0, note: "Bereavement/family emergency" },
    ],
    holidays: [
      { name: "New Year's Day", month: 0, day: 1 },
      { name: "Labour Day", month: 4, day: 1 },
      { name: "Madaraka Day", month: 5, day: 1 },
      { name: "Mashujaa Day", month: 9, day: 20 },
      { name: "Jamhuri Day", month: 11, day: 12 },
      { name: "Christmas Day", month: 11, day: 25 },
      { name: "Boxing Day", month: 11, day: 26 },
    ],
  },
  {
    code: "ZA",
    name: "South Africa",
    flag: "🇿🇦",
    leaveRules: [
      { leaveType: "Annual Leave", color: "#3b82f6", isPaid: true, annualAllowance: 15, carryOverMax: 5, note: "BCEA: 15 working days (21 consecutive days)" },
      { leaveType: "Sick Leave", color: "#ef4444", isPaid: true, annualAllowance: 10, carryOverMax: 0, note: "BCEA: 30 days per 3-year cycle (~10 per year)" },
      { leaveType: "Maternity Leave", color: "#8b5cf6", isPaid: false, annualAllowance: 120, carryOverMax: 0, note: "BCEA: 4 consecutive months (UIF covers partial pay)" },
      { leaveType: "Family Responsibility Leave", color: "#f59e0b", isPaid: true, annualAllowance: 3, carryOverMax: 0, note: "BCEA: 3 days per year" },
    ],
    holidays: [
      { name: "New Year's Day", month: 0, day: 1 },
      { name: "Human Rights Day", month: 2, day: 21 },
      { name: "Freedom Day", month: 3, day: 27 },
      { name: "Workers' Day", month: 4, day: 1 },
      { name: "Youth Day", month: 5, day: 16 },
      { name: "National Women's Day", month: 7, day: 9 },
      { name: "Heritage Day", month: 8, day: 24 },
      { name: "Day of Reconciliation", month: 11, day: 16 },
      { name: "Christmas Day", month: 11, day: 25 },
      { name: "Day of Goodwill", month: 11, day: 26 },
    ],
  },
  {
    code: "GH",
    name: "Ghana",
    flag: "🇬🇭",
    leaveRules: [
      { leaveType: "Annual Leave", color: "#3b82f6", isPaid: true, annualAllowance: 15, carryOverMax: 5, note: "Labour Act 2003: 15 working days minimum" },
      { leaveType: "Sick Leave", color: "#ef4444", isPaid: true, annualAllowance: 10, carryOverMax: 0, note: "With medical certificate" },
      { leaveType: "Maternity Leave", color: "#8b5cf6", isPaid: true, annualAllowance: 84, carryOverMax: 0, note: "Labour Act: 12 weeks" },
      { leaveType: "Compassionate Leave", color: "#f59e0b", isPaid: true, annualAllowance: 5, carryOverMax: 0, note: "Bereavement/family emergency" },
    ],
    holidays: [
      { name: "New Year's Day", month: 0, day: 1 },
      { name: "Independence Day", month: 2, day: 6 },
      { name: "May Day", month: 4, day: 1 },
      { name: "Republic Day", month: 6, day: 1 },
      { name: "Founders' Day", month: 8, day: 21 },
      { name: "Kwame Nkrumah Memorial Day", month: 8, day: 21 },
      { name: "Farmer's Day", month: 11, day: 5 },
      { name: "Christmas Day", month: 11, day: 25 },
      { name: "Boxing Day", month: 11, day: 26 },
    ],
  },
  {
    code: "BR",
    name: "Brazil",
    flag: "🇧🇷",
    leaveRules: [
      { leaveType: "Annual Leave", color: "#3b82f6", isPaid: true, annualAllowance: 30, carryOverMax: 10, note: "CLT Art. 129: 30 calendar days" },
      { leaveType: "Sick Leave", color: "#ef4444", isPaid: true, annualAllowance: 15, carryOverMax: 0, note: "CLT: employer pays first 15 days; INSS after" },
      { leaveType: "Maternity Leave", color: "#8b5cf6", isPaid: true, annualAllowance: 120, carryOverMax: 0, note: "CLT: 120 days (180 for Empresa Cidadã)" },
      { leaveType: "Paternity Leave", color: "#06b6d4", isPaid: true, annualAllowance: 5, carryOverMax: 0, note: "CLT: 5 days (20 for Empresa Cidadã)" },
      { leaveType: "Compassionate Leave", color: "#f59e0b", isPaid: true, annualAllowance: 2, carryOverMax: 0, note: "CLT: 2 days for bereavement" },
    ],
    holidays: [
      { name: "New Year's Day", month: 0, day: 1 },
      { name: "Carnival Monday", month: 1, day: 16 },
      { name: "Carnival Tuesday", month: 1, day: 17 },
      { name: "Tiradentes Day", month: 3, day: 21 },
      { name: "Labour Day", month: 4, day: 1 },
      { name: "Independence Day", month: 8, day: 7 },
      { name: "Nossa Senhora Aparecida", month: 9, day: 12 },
      { name: "All Souls' Day", month: 10, day: 2 },
      { name: "Republic Day", month: 10, day: 15 },
      { name: "Christmas Day", month: 11, day: 25 },
    ],
  },
  {
    code: "MX",
    name: "Mexico",
    flag: "🇲🇽",
    leaveRules: [
      { leaveType: "Annual Leave", color: "#3b82f6", isPaid: true, annualAllowance: 12, carryOverMax: 0, note: "Federal Labour Law: 12 days (1st year); increases with seniority" },
      { leaveType: "Sick Leave", color: "#ef4444", isPaid: true, annualAllowance: 10, carryOverMax: 0, note: "IMSS covers 60% from day 4" },
      { leaveType: "Maternity Leave", color: "#8b5cf6", isPaid: true, annualAllowance: 84, carryOverMax: 0, note: "Federal Labour Law: 12 weeks (6 before + 6 after)" },
      { leaveType: "Paternity Leave", color: "#06b6d4", isPaid: true, annualAllowance: 5, carryOverMax: 0, note: "Federal Labour Law: 5 working days" },
    ],
    holidays: [
      { name: "New Year's Day", month: 0, day: 1 },
      { name: "Constitution Day", month: 1, day: 3 },
      { name: "Benito Juárez Birthday", month: 2, day: 15 },
      { name: "Labour Day", month: 4, day: 1 },
      { name: "Independence Day", month: 8, day: 16 },
      { name: "Revolution Day", month: 10, day: 16 },
      { name: "Christmas Day", month: 11, day: 25 },
    ],
  },
  {
    code: "PH",
    name: "Philippines",
    flag: "🇵🇭",
    leaveRules: [
      { leaveType: "Annual Leave", color: "#3b82f6", isPaid: true, annualAllowance: 5, carryOverMax: 0, note: "Service Incentive Leave: 5 days (after 1 year)" },
      { leaveType: "Sick Leave", color: "#ef4444", isPaid: true, annualAllowance: 5, carryOverMax: 0, note: "Typically included in SIL or company policy" },
      { leaveType: "Maternity Leave", color: "#8b5cf6", isPaid: true, annualAllowance: 105, carryOverMax: 0, note: "Expanded Maternity Leave Act: 105 days" },
      { leaveType: "Paternity Leave", color: "#06b6d4", isPaid: true, annualAllowance: 7, carryOverMax: 0, note: "Paternity Leave Act: 7 days" },
      { leaveType: "Solo Parent Leave", color: "#f59e0b", isPaid: true, annualAllowance: 7, carryOverMax: 0, note: "Solo Parents' Welfare Act: 7 days" },
    ],
    holidays: [
      { name: "New Year's Day", month: 0, day: 1 },
      { name: "People Power Anniversary", month: 1, day: 25 },
      { name: "Araw ng Kagitingan", month: 3, day: 9 },
      { name: "Labour Day", month: 4, day: 1 },
      { name: "Independence Day", month: 5, day: 12 },
      { name: "National Heroes Day", month: 7, day: 31 },
      { name: "Bonifacio Day", month: 10, day: 30 },
      { name: "Christmas Day", month: 11, day: 25 },
      { name: "Rizal Day", month: 11, day: 30 },
    ],
  },
  {
    code: "ID",
    name: "Indonesia",
    flag: "🇮🇩",
    leaveRules: [
      { leaveType: "Annual Leave", color: "#3b82f6", isPaid: true, annualAllowance: 12, carryOverMax: 0, note: "Manpower Law: 12 working days (after 1 year)" },
      { leaveType: "Sick Leave", color: "#ef4444", isPaid: true, annualAllowance: 12, carryOverMax: 0, note: "Paid sick leave with decreasing pay over time" },
      { leaveType: "Maternity Leave", color: "#8b5cf6", isPaid: true, annualAllowance: 90, carryOverMax: 0, note: "Manpower Law: 3 months (1.5 before + 1.5 after)" },
      { leaveType: "Compassionate Leave", color: "#f59e0b", isPaid: true, annualAllowance: 2, carryOverMax: 0, note: "Bereavement: 2 days" },
    ],
    holidays: [
      { name: "New Year's Day", month: 0, day: 1 },
      { name: "Labour Day", month: 4, day: 1 },
      { name: "Pancasila Day", month: 5, day: 1 },
      { name: "Independence Day", month: 7, day: 17 },
      { name: "Christmas Day", month: 11, day: 25 },
    ],
  },
];

/**
 * Get the default leave types to create for an org based on selected countries.
 * Merges leave types across countries, keeping the highest allowance as default.
 */
export function getDefaultLeaveTypes(countryCodes: string[]) {
  const policies = COUNTRY_POLICIES.filter((p) =>
    countryCodes.includes(p.code)
  );

  // Merge leave types by name, keeping the most generous allowance as the org default
  const leaveTypeMap = new Map<
    string,
    { color: string; isPaid: boolean; defaultDays: number }
  >();

  for (const policy of policies) {
    for (const rule of policy.leaveRules) {
      const existing = leaveTypeMap.get(rule.leaveType);
      if (!existing || rule.annualAllowance > existing.defaultDays) {
        leaveTypeMap.set(rule.leaveType, {
          color: rule.color,
          isPaid: rule.isPaid,
          defaultDays: rule.annualAllowance,
        });
      }
    }
  }

  return Array.from(leaveTypeMap.entries()).map(([name, data]) => ({
    name,
    ...data,
  }));
}

/**
 * Get country-specific leave policies for a set of countries and leave types.
 */
export function getCountryPolicies(countryCodes: string[]) {
  const policies = COUNTRY_POLICIES.filter((p) =>
    countryCodes.includes(p.code)
  );

  const result: {
    countryCode: string;
    leaveType: string;
    annualAllowance: number;
    carryOverMax: number;
  }[] = [];

  for (const policy of policies) {
    for (const rule of policy.leaveRules) {
      result.push({
        countryCode: policy.code,
        leaveType: rule.leaveType,
        annualAllowance: rule.annualAllowance,
        carryOverMax: rule.carryOverMax,
      });
    }
  }

  return result;
}

/**
 * Get public holidays for selected countries for a given year.
 */
export function getHolidaysForYear(countryCodes: string[], year: number) {
  const policies = COUNTRY_POLICIES.filter((p) =>
    countryCodes.includes(p.code)
  );

  const result: {
    name: string;
    date: Date;
    countryCode: string;
  }[] = [];

  for (const policy of policies) {
    for (const holiday of policy.holidays) {
      result.push({
        name: holiday.name,
        date: new Date(year, holiday.month, holiday.day),
        countryCode: policy.code,
      });
    }
  }

  return result;
}
