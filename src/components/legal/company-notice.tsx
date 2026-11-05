import { COMPANY, COMPANY_DISCLOSURE } from "@/config/company";

/** Copyright and the company's registered details, for every public footer. */
export function CompanyNotice({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p>
        &copy; {new Date().getFullYear()} {COMPANY.name}. All rights reserved.
      </p>
      <p className="mt-1">{COMPANY_DISCLOSURE}</p>
    </div>
  );
}
