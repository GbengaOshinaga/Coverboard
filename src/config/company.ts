/**
 * The company behind Coverboard, as registered at Companies House. A
 * company's website, emails and documents must show its registered name,
 * number, registered office and where it's registered (Company, Limited
 * Liability Partnership and Business (Names and Trading Disclosures)
 * Regulations 2015, Part 6). Everything that shows them reads from here.
 */
export const COMPANY = {
  name: "Coverboard Ltd",
  number: "17561599",
  registeredIn: "England and Wales",
  registeredOffice: "128 City Road, London, EC1V 2NX",
} as const;

/** One line with all the required details, for footers. */
export const COMPANY_DISCLOSURE = `${COMPANY.name} is registered in ${COMPANY.registeredIn}, company number ${COMPANY.number}. Registered office: ${COMPANY.registeredOffice}.`;
