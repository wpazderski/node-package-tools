export type SpdxLicenseOperator = "AND" | "OR";

export class SpdxLicense {
    static fromString(spdxLicenseString: string): SpdxLicense {
        if (!spdxLicenseString.startsWith("(") || !spdxLicenseString.endsWith(")")) {
            return new SpdxLicense("AND", [spdxLicenseString]);
        }

        const innerStr = spdxLicenseString.slice(1, -1);
        const isAnd = innerStr.includes(" AND ");
        const isOr = innerStr.includes(" OR ");
        if (isAnd && isOr) {
            throw new Error(`Unsupported license string: "${spdxLicenseString}"`);
        }

        const operator: SpdxLicenseOperator = isAnd ? "AND" : "OR";
        const licenseNames = innerStr.split(` ${operator} `);
        return new SpdxLicense(
            operator,
            licenseNames.map((name) => name.trim()),
        );
    }

    readonly operator: SpdxLicenseOperator;
    readonly licenses: string[];

    constructor(operator: SpdxLicenseOperator, licenses: string[]) {
        this.operator = operator;
        this.licenses = licenses;
    }

    isAllowed(allowedLicenses: string[]): boolean {
        if (this.operator === "AND") {
            return this.licenses.every((licenseName) => allowedLicenses.includes(licenseName));
        } else {
            return this.licenses.some((licenseName) => allowedLicenses.includes(licenseName));
        }
    }
}
